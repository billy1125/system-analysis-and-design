from datetime import date, timedelta

from flask import (Blueprint, flash, redirect, render_template,
                   request, session, url_for)

import db
from utils import _is_usable, login_required

meal_bp = Blueprint('meal', __name__, url_prefix='/meal')

_PAGE_SIZE = 10

# 單張訂單的總份數上限。純業務規則，與資料表無關——刻意寫成常數而非硬編在
# 驗證函式裡，讓「這是可以調整的政策」與「這是資料完整性」在閱讀上可區分。
_MAX_ITEMS_PER_ORDER = 20

# 可預訂的天數範圍：今天起算 _ADVANCE_DAYS 天內（含今天）。
_ADVANCE_DAYS = 7

CATEGORY_LABELS = {
    'main':  '主餐',
    'side':  '附餐',
    'drink': '飲料',
}

MEAL_STATUS_LABELS = {
    'available':   '供應中',
    'sold_out':    '今日售完',
    'unavailable': '停售',
}

ORDER_STATUS_LABELS = {
    'pending':   '待確認',
    'confirmed': '已確認',
    'completed': '已取餐',
    'cancelled': '已取消',
    'rejected':  '已拒絕',
}

SLOT_LABELS = {
    'lunch':  '午餐',
    'dinner': '晚餐',
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _current_user():
    """從 session 取得目前登入且帳號有效的使用者，否則回傳 None。

    停用或已刪除的帳號一律視為 None，避免持有舊 session 的失效帳號繼續下單。
    菜單頁（index）把 None 當成合法的訪客狀態繼續渲染；其餘路由收到 None 時
    須清除 session 並導向登入頁。

    不把 session.clear() 塞進這個 helper——訪客與失效帳號在它眼中都是 None，
    但只有後者需要清 session。
    """
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None


def _is_admin(user):
    """role == 0 為管理員。"""
    return user is not None and user['role'] == 0


def _today():
    """今天的日期字串（YYYY-MM-DD）。"""
    return date.today().isoformat()


def _last_orderable_date():
    """可預訂的最後一天（YYYY-MM-DD）。"""
    return (date.today() + timedelta(days=_ADVANCE_DAYS - 1)).isoformat()


# ── 菜單主頁 ──────────────────────────────────────────────────────────────────

@meal_bp.route('/', strict_slashes=False)
def index():
    """菜單主頁：左側餐點清單（分頁 + 分類篩選）+ 右側依 ?meal_id 顯示餐點詳細。

    開放訪客瀏覽。訪客看得到菜單與價格，但看不到「我要訂餐」入口。
    """
    page     = request.args.get('page', 1, type=int) or 1
    meal_id  = request.args.get('meal_id', type=int)
    category = request.args.get('category', '')
    if category not in db.MEAL_CATEGORIES:
        category = ''

    meals, total = db.list_meals(page=page, page_size=_PAGE_SIZE,
                                category=category or None)
    total_pages  = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    selected = None
    if meal_id:
        m = db.get_meal(meal_id)
        if m and not m['is_deleted']:
            selected = m

    return render_template(
        'meal/index.html',
        meals=meals,
        total=total,
        page=page,
        total_pages=total_pages,
        category=category,
        selected=selected,
        user=_current_user(),
        CATEGORY_LABELS=CATEGORY_LABELS,
        MEAL_STATUS_LABELS=MEAL_STATUS_LABELS,
    )


# ── 餐點管理（管理員）─────────────────────────────────────────────────────────

@meal_bp.route('/new', methods=['GET', 'POST'])
@login_required
def new_meal():
    """新增餐點：GET 顯示表單，POST 建立 meals 一筆。"""
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    form = {
        'meal_code': '', 'meal_name': '', 'meal_description': '',
        'category': 'main', 'price': '', 'daily_quantity': '',
        'remaining_quantity': '', 'meal_status': 'available',
    }
    error = None

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in form}
        error = _validate_meal_form(form)
        if not error:
            meal_id = db.create_meal(
                code          = form['meal_code'],
                name          = form['meal_name'],
                description   = form['meal_description'] or None,
                category      = form['category'],
                price         = int(form['price']),
                daily_qty     = int(form['daily_quantity']),
                remaining_qty = int(form['remaining_quantity']),
                status        = form['meal_status'],
            )
            flash('餐點已新增', 'success')
            return redirect(url_for('meal.index', meal_id=meal_id))

    return render_template(
        'meal/meal_form.html',
        form_title='新增餐點',
        form=form,
        error=error,
        user=user,
        back_url=url_for('meal.index'),
        CATEGORY_LABELS=CATEGORY_LABELS,
        MEAL_STATUS_LABELS=MEAL_STATUS_LABELS,
    )


@meal_bp.route('/edit/<int:meal_id>', methods=['GET', 'POST'])
@login_required
def edit_meal(meal_id):
    """修改餐點：GET 顯示表單（帶入現值），POST 更新。"""
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    meal = db.get_meal(meal_id)
    if not meal or meal['is_deleted']:
        flash('餐點不存在或已下架', 'error')
        return redirect(url_for('meal.index'))

    error = None
    form = {
        'meal_code':          meal['meal_code'],
        'meal_name':          meal['meal_name'],
        'meal_description':   meal['meal_description'] or '',
        'category':           meal['category'],
        'price':              str(meal['price']),
        'daily_quantity':     str(meal['daily_quantity']),
        'remaining_quantity': str(meal['remaining_quantity']),
        'meal_status':        meal['meal_status'],
    }

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in form}
        error = _validate_meal_form(form)
        if not error:
            db.update_meal(
                meal_id       = meal_id,
                code          = form['meal_code'],
                name          = form['meal_name'],
                description   = form['meal_description'] or None,
                category      = form['category'],
                price         = int(form['price']),
                daily_qty     = int(form['daily_quantity']),
                remaining_qty = int(form['remaining_quantity']),
                status        = form['meal_status'],
            )
            flash('餐點已更新', 'success')
            return redirect(url_for('meal.index', meal_id=meal_id))

    return render_template(
        'meal/meal_form.html',
        form_title='修改餐點',
        form=form,
        error=error,
        user=user,
        back_url=url_for('meal.index', meal_id=meal_id),
        CATEGORY_LABELS=CATEGORY_LABELS,
        MEAL_STATUS_LABELS=MEAL_STATUS_LABELS,
    )


@meal_bp.route('/delete/<int:meal_id>', methods=['POST'])
@login_required
def delete_meal(meal_id):
    """下架餐點（軟刪除）。既有訂單明細不受影響。"""
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    meal = db.get_meal(meal_id)
    if not meal or meal['is_deleted']:
        flash('餐點不存在或已下架', 'error')
        return redirect(url_for('meal.index'))

    db.soft_delete_meal(meal_id)
    flash('餐點已下架', 'success')
    return redirect(url_for('meal.index'))


# ── 訂餐 ──────────────────────────────────────────────────────────────────────

@meal_bp.route('/order/new', methods=['GET', 'POST'])
@login_required
def new_order():
    """訂餐：GET 顯示可訂餐點與數量欄位，POST 建立訂單主檔 + 明細。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    orderable = db.list_orderable_meals()
    error     = None
    form = {
        'pickup_date':     _today(),
        'pickup_slot':     'lunch',
        'pickup_location': '',
        'order_note':      '',
    }
    quantities = {}

    if request.method == 'POST':
        form = {k: request.form.get(k, '').strip() for k in form}
        quantities, items, error = _collect_items(request.form)
        if not error:
            error = _validate_order_form(form, items)
        if not error:
            order_id = db.create_meal_order(
                orderer_id      = user['id'],
                pickup_date     = form['pickup_date'],
                pickup_slot     = form['pickup_slot'],
                pickup_location = form['pickup_location'],
                order_note      = form['order_note'] or None,
                items           = items,
            )
            flash('訂單已送出，等待管理員確認', 'success')
            return redirect(url_for('meal.order_detail', order_id=order_id))

    return render_template(
        'meal/order_form.html',
        form_title='我要訂餐',
        form=form,
        quantities=quantities,
        meals=orderable,
        error=error,
        user=user,
        back_url=url_for('meal.index'),
        min_date=_today(),
        max_date=_last_orderable_date(),
        max_items=_MAX_ITEMS_PER_ORDER,
        CATEGORY_LABELS=CATEGORY_LABELS,
        SLOT_LABELS=SLOT_LABELS,
    )


@meal_bp.route('/my-orders', strict_slashes=False)
@login_required
def my_orders():
    """我的訂單：分頁列出本人的所有訂單。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    page          = request.args.get('page', 1, type=int) or 1
    orders, total = db.list_my_orders(user['id'], page=page, page_size=_PAGE_SIZE)
    total_pages   = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    return render_template(
        'meal/my_orders.html',
        orders=orders,
        total=total,
        page=page,
        total_pages=total_pages,
        user=user,
        ORDER_STATUS_LABELS=ORDER_STATUS_LABELS,
        SLOT_LABELS=SLOT_LABELS,
    )


@meal_bp.route('/orders/<int:order_id>')
@login_required
def order_detail(order_id):
    """訂單明細：本人或管理員可看。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    order = db.get_meal_order(order_id)
    if not order or order['is_deleted']:
        flash('訂單不存在', 'error')
        return redirect(url_for('meal.my_orders'))

    if order['orderer_id'] != user['id'] and not _is_admin(user):
        flash('無權限查看此訂單', 'error')
        return redirect(url_for('meal.my_orders'))

    items = db.list_order_items(order_id)
    return render_template(
        'meal/order_detail.html',
        order=order,
        items=items,
        user=user,
        is_admin=_is_admin(user),
        ORDER_STATUS_LABELS=ORDER_STATUS_LABELS,
        SLOT_LABELS=SLOT_LABELS,
        CATEGORY_LABELS=CATEGORY_LABELS,
    )


@meal_bp.route('/orders/<int:order_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_order(order_id):
    """修改訂單：限本人、限 pending 狀態。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    order = db.get_meal_order(order_id)
    if not order or order['is_deleted']:
        flash('訂單不存在', 'error')
        return redirect(url_for('meal.my_orders'))
    if order['orderer_id'] != user['id']:
        flash('無權限修改此訂單', 'error')
        return redirect(url_for('meal.my_orders'))
    if order['order_status'] != 'pending':
        flash('只有待確認的訂單可以修改', 'error')
        return redirect(url_for('meal.order_detail', order_id=order_id))

    # 表單列出「目前可訂的餐點」聯集「這張訂單已經點的餐點」。後者可能已經
    # 售完或停售——不列出來的話，使用者會在毫不知情的狀況下把它從訂單中刪掉。
    # 列出來之後，只要份數仍大於 0 就會被驗證擋下，使用者必須自己改成 0。
    current_items = db.list_order_items(order_id)
    orderable     = list(db.list_orderable_meals())
    known_ids     = {m['id'] for m in orderable}
    for item in current_items:
        if item['meal_id'] not in known_ids:
            extra = db.get_meal(item['meal_id'])
            if extra is not None:
                orderable.append(extra)
                known_ids.add(extra['id'])
    orderable.sort(key=lambda m: m['meal_code'])

    error      = None
    form       = {
        'pickup_date':     order['pickup_date'],
        'pickup_slot':     order['pickup_slot'],
        'pickup_location': order['pickup_location'],
        'order_note':      order['order_note'] or '',
    }
    quantities = {item['meal_id']: item['quantity'] for item in current_items}

    if request.method == 'POST':
        form = {k: request.form.get(k, '').strip() for k in form}
        quantities, items, error = _collect_items(request.form)
        if not error:
            error = _validate_order_form(form, items)
        if not error:
            ok = db.update_meal_order(
                order_id        = order_id,
                user_id         = user['id'],
                pickup_date     = form['pickup_date'],
                pickup_slot     = form['pickup_slot'],
                pickup_location = form['pickup_location'],
                order_note      = form['order_note'] or None,
                items           = items,
            )
            if ok:
                flash('訂單已更新', 'success')
            else:
                flash('訂單狀態已變更，無法修改', 'error')
            return redirect(url_for('meal.order_detail', order_id=order_id))

    return render_template(
        'meal/order_form.html',
        form_title=f'修改訂單 #{order_id}',
        form=form,
        quantities=quantities,
        meals=orderable,
        error=error,
        user=user,
        back_url=url_for('meal.order_detail', order_id=order_id),
        min_date=_today(),
        max_date=_last_orderable_date(),
        max_items=_MAX_ITEMS_PER_ORDER,
        CATEGORY_LABELS=CATEGORY_LABELS,
        SLOT_LABELS=SLOT_LABELS,
    )


@meal_bp.route('/orders/<int:order_id>/cancel', methods=['POST'])
@login_required
def cancel_order(order_id):
    """取消訂單：限本人、限 pending 或 confirmed。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    ok = db.cancel_meal_order(order_id, user['id'])
    if ok:
        flash('訂單已取消', 'success')
    else:
        flash('無法取消此訂單', 'error')
    return redirect(url_for('meal.order_detail', order_id=order_id))


# ── 訂單管理（管理員）─────────────────────────────────────────────────────────

@meal_bp.route('/admin/orders', strict_slashes=False)
@login_required
def admin_orders():
    """所有訂單清單：?status= ?page= 可組合。"""
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    status = request.args.get('status', '')
    if status not in db.ORDER_STATUSES:
        status = ''
    page = request.args.get('page', 1, type=int) or 1

    orders, total = db.list_all_orders(page=page, page_size=_PAGE_SIZE,
                                       status=status or None)
    total_pages   = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    return render_template(
        'meal/admin_orders.html',
        orders=orders,
        total=total,
        page=page,
        total_pages=total_pages,
        status=status,
        user=user,
        ORDER_STATUS_LABELS=ORDER_STATUS_LABELS,
        SLOT_LABELS=SLOT_LABELS,
    )


@meal_bp.route('/admin/orders/<int:order_id>/confirm', methods=['POST'])
@login_required
def admin_confirm(order_id):
    """確認訂單並扣減庫存。限 pending。"""
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    note = request.form.get('review_note', '').strip() or None
    ok   = db.confirm_meal_order(order_id, user['id'], note)
    if ok:
        flash('訂單已確認', 'success')
    else:
        flash('確認失敗（餐點份數不足、已停售，或訂單狀態不符）', 'error')
    return redirect(url_for('meal.admin_orders'))


@meal_bp.route('/admin/orders/<int:order_id>/reject', methods=['POST'])
@login_required
def admin_reject(order_id):
    """拒絕訂單。限 pending。"""
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    note = request.form.get('review_note', '').strip() or None
    ok   = db.reject_meal_order(order_id, user['id'], note)
    if ok:
        flash('訂單已拒絕', 'success')
    else:
        flash('拒絕失敗（訂單狀態不符）', 'error')
    return redirect(url_for('meal.admin_orders'))


@meal_bp.route('/admin/orders/<int:order_id>/complete', methods=['POST'])
@login_required
def admin_complete(order_id):
    """登記取餐完成。限 confirmed，不回補庫存。"""
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    ok = db.complete_meal_order(order_id)
    if ok:
        flash('已登記取餐', 'success')
    else:
        flash('登記取餐失敗（訂單狀態不符）', 'error')
    return redirect(url_for('meal.admin_orders'))


@meal_bp.route('/admin/orders/<int:order_id>/cancel', methods=['POST'])
@login_required
def admin_cancel(order_id):
    """管理員取消訂單。限 pending 或 confirmed；若為 confirmed 則回補庫存。"""
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    ok = db.admin_cancel_meal_order(order_id)
    if ok:
        flash('訂單已取消', 'success')
    else:
        flash('無法取消此訂單', 'error')
    return redirect(url_for('meal.admin_orders'))


# ── 表單驗證 ──────────────────────────────────────────────────────────────────

def _validate_meal_form(form):
    """驗證餐點表單，通過回傳 None，否則回傳錯誤訊息字串。"""
    if not form.get('meal_code'):
        return '請輸入餐點編號'
    if not form.get('meal_name'):
        return '請輸入餐點名稱'
    if form.get('category') not in db.MEAL_CATEGORIES:
        return '餐點分類不正確'
    if form.get('meal_status') not in db.MEAL_STATUSES:
        return '餐點狀態不正確'
    try:
        price = int(form.get('price', ''))
    except ValueError:
        return '價格格式不正確'
    if price < 0:
        return '價格不可小於 0'
    try:
        daily = int(form.get('daily_quantity', ''))
    except ValueError:
        return '每日供應份數格式不正確'
    if daily < 0:
        return '每日供應份數不可小於 0'
    try:
        remaining = int(form.get('remaining_quantity', ''))
    except ValueError:
        return '剩餘份數格式不正確'
    if remaining < 0:
        return '剩餘份數不可小於 0'
    if remaining > daily:
        return '剩餘份數不可大於每日供應份數'
    return None


def _collect_items(form):
    """從表單收集訂購項目。

    回傳 (quantities, items, error)：
      - quantities: {meal_id: 數量} — 供表單重新渲染時回填
      - items: [(meal_id, quantity, unit_price), ...] — 只含數量大於 0 的項目
      - error: 錯誤訊息字串或 None

    表單以 `meal_id[]` 與 `quantity[]` 兩組平行欄位傳遞，順序對應。這個做法
    沿用 Course-SAD-Sample-System 器材借用的既有慣例。它的弱點是依賴瀏覽器
    保證兩個列表等長且同序，記錄為 KI-M3。

    每一項的價格都從資料庫重新查詢，**不信任表單傳來的價格**——否則使用者
    可以竄改隱藏欄位把便當改成 1 元。
    """
    meal_ids = form.getlist('meal_id[]')
    quantity = form.getlist('quantity[]')

    if len(meal_ids) != len(quantity):
        return {}, [], '表單資料不完整，請重新送出'

    quantities = {}
    items      = []

    for meal_id_str, qty_str in zip(meal_ids, quantity):
        try:
            meal_id = int(meal_id_str)
        except ValueError:
            return {}, [], '餐點編號格式不正確'
        try:
            qty = int(qty_str or '0')
        except ValueError:
            return {}, [], '訂購份數格式不正確'
        if qty < 0:
            return {}, [], '訂購份數不可小於 0'

        quantities[meal_id] = qty
        if qty == 0:
            continue

        meal = db.get_meal(meal_id)
        if not meal or meal['is_deleted']:
            return quantities, [], '所選餐點不存在或已下架'
        if meal['meal_status'] != 'available':
            return quantities, [], f'「{meal["meal_name"]}」目前無法訂購'
        if qty > meal['remaining_quantity']:
            return quantities, [], (
                f'「{meal["meal_name"]}」剩餘份數不足'
                f'（目前剩餘 {meal["remaining_quantity"]} 份）'
            )
        items.append((meal_id, qty, meal['price']))

    return quantities, items, None


def _validate_order_form(form, items):
    """驗證訂單表單的抬頭欄位與總份數，通過回傳 None。"""
    pickup_date = form.get('pickup_date', '')
    if not pickup_date:
        return '請選擇取餐日期'
    try:
        picked = date.fromisoformat(pickup_date)
    except ValueError:
        return '取餐日期格式不正確'
    if picked < date.today():
        return '取餐日期不可早於今天'
    if picked > date.today() + timedelta(days=_ADVANCE_DAYS - 1):
        return f'最多只能預訂 {_ADVANCE_DAYS} 天內的餐點'

    if form.get('pickup_slot') not in SLOT_LABELS:
        return '取餐時段不正確'
    if not form.get('pickup_location'):
        return '請輸入取餐地點'
    if not items:
        return '請至少訂購一項餐點'

    total_qty = sum(qty for _, qty, _ in items)
    if total_qty > _MAX_ITEMS_PER_ORDER:
        return f'單張訂單最多 {_MAX_ITEMS_PER_ORDER} 份，目前為 {total_qty} 份'

    return None
