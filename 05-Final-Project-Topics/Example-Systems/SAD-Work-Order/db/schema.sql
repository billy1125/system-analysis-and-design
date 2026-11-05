CREATE TABLE work_centers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL,
    updated_at TEXT
);

CREATE TABLE users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no         TEXT    NOT NULL UNIQUE,     -- login ID
    password_hash  TEXT    NOT NULL,
    name           TEXT    NOT NULL,
    title          TEXT    NOT NULL,
    role           INTEGER NOT NULL DEFAULT 1,  -- 0 production control, 1 team leader
    work_center_id INTEGER REFERENCES work_centers(id),  -- team leaders only
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT    NOT NULL
);

CREATE TABLE products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    part_no    TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL,
    updated_at TEXT
);

CREATE TABLE work_orders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    wo_no          TEXT    NOT NULL UNIQUE,     -- WO-YYMMDD-NN
    so_no          TEXT,                        -- customer order number, free text
    product_id     INTEGER NOT NULL REFERENCES products(id),
    qty            INTEGER NOT NULL,
    due_date       TEXT    NOT NULL,
    note           TEXT,
    status         TEXT    NOT NULL DEFAULT '待派工', -- 待派工 / 已派工 / 生產中 / 已完工 / 已取消
    work_center_id INTEGER REFERENCES work_centers(id),  -- latest dispatch only
    plan_date      TEXT,
    dispatched_by  INTEGER REFERENCES users(id),
    dispatched_at  TEXT,
    started_by     INTEGER REFERENCES users(id),
    started_at     TEXT,
    good_qty       INTEGER,
    ng_qty         INTEGER,
    close_note     TEXT,                        -- finish note, or reason when cancelled
    closed_by      INTEGER REFERENCES users(id),
    closed_at      TEXT,
    created_by     INTEGER NOT NULL REFERENCES users(id),
    created_at     TEXT    NOT NULL,
    updated_at     TEXT
);
