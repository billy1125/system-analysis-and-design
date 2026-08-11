from datetime import datetime

from flask import Blueprint, flash, redirect, render_template, request, session, url_for

import db
from utils import _is_usable, login_required

events_bp = Blueprint('events', __name__, url_prefix='/events')

_PAGE_SIZE = 5  # 規格要求每頁 5 筆

MEAL_LABELS = {0: '不用餐', 1: '葷食', 2: '素食'}

STATUS_LABELS = {
    'available': '可報名',
    'full':      '名額已滿',
    'closed':    '報名已截止',
    'not_open':  '尚未開放',
    'ended':     '活動已結束',
}

# 報名狀態與活動狀態是兩組不同的字彙，刻意分成兩個 dict。
# waiting 與 rejected 目前沒有任何路由會產生，見規格書 KI-14。
REG_STATUS_LABELS = {
    'registered': '已報名',
    'cancelled':  '已取消',
    'waiting':    '候補中',
    'rejected':   '管理者取消',
}

_STATUS_FLASH = {
    'ended':    '活動已結束',
    'closed':   '報名已截止',
    'not_open': '尚未開放報名',
    'full':     '活動名額已滿',
}

_EVENT_FIELDS = (
    'event_title', 'event_datetime', 'event_place', 'capacity',
    'registration_start_at', 'registration_end_at',
    'event_note', 'event_target', 'event_contact', 'event_notice',
)

_REGISTRATION_FIELDS = (
    'participant_name', 'participant_phone', 'participant_email',
    'meal_type', 'registration_note',
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _current_user():
    """從 session 取得目前登入且帳號有效的使用者，否則回傳 None。

    停用或已刪除的帳號一律視為 None，避免持有舊 session 的失效帳號繼續
    建立活動或報名。index 以外的路由收到 None 時須清除 session 並導向登入頁；
    index 則把 None 當成合法的訪客狀態繼續渲染。
    """
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None


def _is_admin(user):
    """role == 0 為管理員。"""
    return user is not None and user['role'] == 0


def _is_organizer_or_admin(user, event):
    """活動發起者或管理員。"""
    return user is not None and (user['id'] == event['user_id'] or _is_admin(user))


def _parse_dt(s):
    """把資料庫或表單中的日期時間字串轉為 datetime，失敗時回傳 None。"""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _event_status(event, now):
    """計算活動報名狀態：ended / closed / not_open / full / available。

    五種狀態互斥，判斷順序即為優先序，**不可調換**：
    活動已結束的事實蓋過報名期間，報名期間又蓋過名額。
    """
    event_dt = _parse_dt(event['event_datetime'])
    if event_dt and now > event_dt:
        return 'ended'

    reg_end = _parse_dt(event['registration_end_at'])
    if reg_end and now > reg_end:
        return 'closed'

    reg_start = _parse_dt(event['registration_start_at'])
    if reg_start and now < reg_start:
        return 'not_open'

    if event['registered_count'] >= event['capacity']:
        return 'full'

    return 'available'


def _normalize_dt(s):
    """把表單的 datetime-local 字串正規化為 'YYYY-MM-DD HH:MM:SS'，供 SQLite 儲存。"""
    dt = _parse_dt(s)
    return dt.strftime('%Y-%m-%d %H:%M:%S') if dt else None


def _fmt_dt_for_input(s):
    """把資料庫中的日期時間字串轉為 datetime-local input 所需的 'YYYY-MM-DDTHH:MM'。"""
    if not s:
        return ''
    return s[:16].replace(' ', 'T')


def _status_flash(status):
    """依活動狀態發出對應的 flash 錯誤訊息。"""
    flash(_STATUS_FLASH.get(status, '無法報名'), 'error')


def _validate_event_form(form, current_registered=0):
    """驗證活動表單，回傳錯誤訊息字串或 None。"""
    if not form['event_title']:
        return '請輸入活動標題'
    if not form['event_datetime']:
        return '請輸入活動日期時間'
    if not form['event_place']:
        return '請輸入活動地點'
    if len(form['event_place']) > 100:
        return '活動地點不可超過 100 字元'
    if not form['event_note']:
        return '請輸入活動內容'

    try:
        capacity = int(form['capacity'])
    except ValueError:
        return '請輸入正確活動名額'
    if capacity <= 0:
        return '請輸入正確活動名額（必須大於 0）'
    if capacity < current_registered:
        return f'名額不可低於目前有效報名人數（{current_registered} 人）'

    event_dt = _parse_dt(form['event_datetime'])
    if event_dt is None:
        return '活動日期時間格式不正確'

    reg_start_str = form['registration_start_at']
    reg_end_str   = form['registration_end_at']
    reg_start = _parse_dt(reg_start_str)
    reg_end   = _parse_dt(reg_end_str)
    if (reg_start_str and reg_start is None) or (reg_end_str and reg_end is None):
        return '報名時間格式不正確'

    if reg_end and reg_end > event_dt:
        return '報名截止時間不可晚於活動開始時間'
    if reg_start and reg_end and reg_start > reg_end:
        return '報名開始時間不可晚於報名截止時間'

    return None


def _validate_registration_form(form):
    """驗證報名表單，回傳錯誤訊息字串或 None。"""
    try:
        meal_type = int(form['meal_type'] or 0)
    except ValueError:
        return '請選擇正確的用餐選項'
    if meal_type not in MEAL_LABELS:
        return '請選擇正確的用餐選項'
    return None


# ── 瀏覽活動列表與活動細節 ────────────────────────────────────────────────────

@events_bp.route('/', strict_slashes=False)
def index():
    """活動主頁：左側活動清單（分頁）+ 右側依 ?event_id 顯示細節與報名者。"""
    page     = request.args.get('page', 1, type=int) or 1
    event_id = request.args.get('event_id', type=int)
    user     = _current_user()

    events, total = db.list_events(page=page, page_size=_PAGE_SIZE)
    total_pages   = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    now            = datetime.now()
    event_statuses = {e['id']: _event_status(e, now) for e in events}

    selected_event    = None
    selected_status   = None
    registrations     = []
    all_registrations = []
    user_registration = None

    if event_id:
        ev = db.get_event(event_id)
        if ev and not ev['is_deleted']:
            selected_event  = ev
            selected_status = _event_status(ev, now)
            registrations   = db.list_registrations(event_id)
            if _is_organizer_or_admin(user, ev):
                all_registrations = db.list_all_registrations(event_id)
            if user:
                user_registration = db.get_registration(event_id, user['id'])

    return render_template(
        'events/index.html',
        events=events,
        total=total,
        page=page,
        total_pages=total_pages,
        event_statuses=event_statuses,
        selected_event=selected_event,
        selected_status=selected_status,
        registrations=registrations,
        all_registrations=all_registrations,
        user_registration=user_registration,
        user=user,
        STATUS_LABELS=STATUS_LABELS,
        REG_STATUS_LABELS=REG_STATUS_LABELS,
        MEAL_LABELS=MEAL_LABELS,
    )


# ── 新增活動 ──────────────────────────────────────────────────────────────────

@events_bp.route('/new', methods=['GET', 'POST'])
@login_required
def new_event():
    """新增活動：GET 顯示表單，POST 同時建立 events 與 event_details。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    error = None
    form  = {k: '' for k in _EVENT_FIELDS}

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in _EVENT_FIELDS}
        error = _validate_event_form(form)

        if not error:
            event_id = db.create_event(
                event_title           = form['event_title'],
                event_datetime        = _normalize_dt(form['event_datetime']),
                event_place           = form['event_place'],
                capacity              = int(form['capacity']),
                registration_start_at = _normalize_dt(form['registration_start_at']),
                registration_end_at   = _normalize_dt(form['registration_end_at']),
                event_note            = form['event_note'],
                event_target          = form['event_target'] or None,
                event_contact         = form['event_contact'] or None,
                event_notice          = form['event_notice'] or None,
                user_id               = user['id'],
            )
            flash('活動已建立', 'success')
            return redirect(url_for('events.index', event_id=event_id))

    return render_template(
        'events/event_form.html',
        user=user, form=form, error=error,
        mode='new', event=None, current_registered=0,
    )


# ── 修改活動 ──────────────────────────────────────────────────────────────────

@events_bp.route('/edit/<int:event_id>', methods=['GET', 'POST'])
@login_required
def edit_event(event_id):
    """修改活動：限活動發起者或管理員。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    event, detail = db.get_event_for_edit(event_id)

    if not event or event['is_deleted']:
        flash('活動不存在或已刪除', 'error')
        return redirect(url_for('events.index'))
    if not _is_organizer_or_admin(user, event):
        flash('無權限修改此活動', 'error')
        return redirect(url_for('events.index', event_id=event_id))

    current_registered = db.count_registered(event_id)
    error = None

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in _EVENT_FIELDS}
        error = _validate_event_form(form, current_registered=current_registered)

        if not error:
            db.update_event(
                event_id              = event_id,
                event_title           = form['event_title'],
                event_datetime        = _normalize_dt(form['event_datetime']),
                event_place           = form['event_place'],
                capacity              = int(form['capacity']),
                registration_start_at = _normalize_dt(form['registration_start_at']),
                registration_end_at   = _normalize_dt(form['registration_end_at']),
                event_note            = form['event_note'],
                event_target          = form['event_target'] or None,
                event_contact         = form['event_contact'] or None,
                event_notice          = form['event_notice'] or None,
            )
            flash('活動已更新', 'success')
            return redirect(url_for('events.index', event_id=event_id))
    else:
        # GET：以現有資料預填表單
        form = {
            'event_title':           event['event_title'],
            'event_datetime':        _fmt_dt_for_input(event['event_datetime']),
            'event_place':           event['event_place'],
            'capacity':              str(event['capacity']),
            'registration_start_at': _fmt_dt_for_input(event['registration_start_at']),
            'registration_end_at':   _fmt_dt_for_input(event['registration_end_at']),
            'event_note':    (detail['event_note']    if detail else '') or '',
            'event_target':  (detail['event_target']  if detail else '') or '',
            'event_contact': (detail['event_contact'] if detail else '') or '',
            'event_notice':  (detail['event_notice']  if detail else '') or '',
        }

    return render_template(
        'events/event_form.html',
        user=user, form=form, error=error,
        mode='edit', event=event, current_registered=current_registered,
    )


# ── 刪除活動 ──────────────────────────────────────────────────────────────────

@events_bp.route('/delete/<int:event_id>', methods=['POST'])
@login_required
def delete_event(event_id):
    """刪除活動（邏輯刪除）：限活動發起者或管理員。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    event, _ = db.get_event_for_edit(event_id)

    if not event or event['is_deleted']:
        flash('活動不存在或已刪除', 'error')
        return redirect(url_for('events.index'))
    if not _is_organizer_or_admin(user, event):
        flash('無權限刪除此活動', 'error')
        return redirect(url_for('events.index', event_id=event_id))

    db.soft_delete_event(event_id)
    flash('活動已刪除', 'success')
    return redirect(url_for('events.index'))


# ── 報名活動 ──────────────────────────────────────────────────────────────────

@events_bp.route('/<int:event_id>/register', methods=['GET', 'POST'])
@login_required
def register(event_id):
    """報名活動：需登入且帳號有效，且活動狀態為 available。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    ev = db.get_event(event_id)
    if not ev or ev['is_deleted']:
        flash('活動不存在或已刪除', 'error')
        return redirect(url_for('events.index'))

    existing = db.get_registration(event_id, user['id'])
    if existing and existing['registration_status'] != 'cancelled':
        flash('您已報名此活動', 'error')
        return redirect(url_for('events.index', event_id=event_id))

    status = _event_status(ev, datetime.now())
    if status != 'available':
        _status_flash(status)
        return redirect(url_for('events.index', event_id=event_id))

    error = None
    form  = {k: '' for k in _REGISTRATION_FIELDS}
    form['meal_type'] = '0'

    if request.method == 'POST':
        form = {k: request.form.get(k, '').strip() for k in _REGISTRATION_FIELDS}

        # 表單填寫期間名額可能被填滿、報名期間可能已截止，送出時重新判定一次。
        ev     = db.get_event(event_id)
        status = _event_status(ev, datetime.now())
        if status != 'available':
            _status_flash(status)
            return redirect(url_for('events.index', event_id=event_id))

        error = _validate_registration_form(form)
        if not error:
            result = db.create_or_restore_registration(
                event_id          = event_id,
                user_id           = user['id'],
                meal_type         = int(form['meal_type'] or 0),
                participant_name  = form['participant_name'] or None,
                participant_phone = form['participant_phone'] or None,
                participant_email = form['participant_email'] or None,
                registration_note = form['registration_note'] or None,
            )
            if result == 'duplicate':
                flash('您已報名此活動', 'error')
            else:
                flash('報名成功', 'success')
            return redirect(url_for('events.index', event_id=event_id))

    return render_template(
        'events/registration_form.html',
        user=user, event=ev, form=form, error=error, mode='register',
    )


# ── 取消報名 ──────────────────────────────────────────────────────────────────

@events_bp.route('/<int:event_id>/cancel', methods=['POST'])
@login_required
def cancel(event_id):
    """取消自己的報名。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    ev = db.get_event(event_id)
    if not ev or ev['is_deleted']:
        flash('活動不存在或已刪除', 'error')
        return redirect(url_for('events.index'))

    reg = db.get_registration(event_id, user['id'])
    if not reg or reg['registration_status'] not in ('registered', 'waiting'):
        flash('您沒有有效的報名紀錄', 'error')
        return redirect(url_for('events.index', event_id=event_id))

    db.cancel_registration(event_id, user['id'])
    flash('已取消報名', 'success')
    return redirect(url_for('events.index', event_id=event_id))


# ── 修改報名資訊 ──────────────────────────────────────────────────────────────

@events_bp.route('/<int:event_id>/edit_registration', methods=['GET', 'POST'])
@login_required
def edit_registration(event_id):
    """修改自己的報名資訊（不含報名狀態）。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    ev = db.get_event(event_id)
    if not ev or ev['is_deleted']:
        flash('活動不存在或已刪除', 'error')
        return redirect(url_for('events.index'))

    reg = db.get_registration(event_id, user['id'])
    if not reg or reg['registration_status'] not in ('registered', 'waiting'):
        flash('您沒有有效的報名紀錄', 'error')
        return redirect(url_for('events.index', event_id=event_id))

    error = None
    form  = {
        'participant_name':  reg['participant_name']  or '',
        'participant_phone': reg['participant_phone'] or '',
        'participant_email': reg['participant_email'] or '',
        'meal_type':         str(reg['meal_type']),
        'registration_note': reg['registration_note'] or '',
    }

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in _REGISTRATION_FIELDS}
        error = _validate_registration_form(form)
        if not error:
            db.update_registration(
                event_id          = event_id,
                user_id           = user['id'],
                meal_type         = int(form['meal_type'] or 0),
                participant_name  = form['participant_name'] or None,
                participant_phone = form['participant_phone'] or None,
                participant_email = form['participant_email'] or None,
                registration_note = form['registration_note'] or None,
            )
            flash('報名資訊已更新', 'success')
            return redirect(url_for('events.index', event_id=event_id))

    return render_template(
        'events/registration_form.html',
        user=user, event=ev, form=form, error=error, mode='edit',
    )


# ── 我的報名紀錄 ──────────────────────────────────────────────────────────────

@events_bp.route('/my', strict_slashes=False)
@login_required
def my_registrations():
    """查詢登入使用者自己的所有報名紀錄。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    return render_template(
        'events/my_registrations.html',
        user=user,
        registrations=db.list_my_registrations(user['id']),
        REG_STATUS_LABELS=REG_STATUS_LABELS,
        MEAL_LABELS=MEAL_LABELS,
    )
