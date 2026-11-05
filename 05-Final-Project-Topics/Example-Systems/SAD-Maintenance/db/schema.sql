CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no        TEXT    NOT NULL UNIQUE,      -- login ID
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    role          INTEGER NOT NULL DEFAULT 1,   -- 0 manager, 1 technician
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL
);

CREATE TABLE equipment (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    equip_no   TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    model      TEXT,
    maker      TEXT,
    line       TEXT    NOT NULL,                -- free text
    location   TEXT    NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL,
    updated_at TEXT
);

CREATE TABLE pm_plans (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id   INTEGER NOT NULL REFERENCES equipment(id),
    plan_type      TEXT    NOT NULL,            -- 月保養 / 季保養 / 半年保養 / 年度保養
    cycle_days     INTEGER NOT NULL,
    items          TEXT    NOT NULL,            -- one item per line
    owner_id       INTEGER NOT NULL REFERENCES users(id),
    first_due_date TEXT    NOT NULL,            -- used only before the first record
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT,
    UNIQUE (equipment_id, plan_type)
);

CREATE TABLE pm_records (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id    INTEGER NOT NULL REFERENCES pm_plans(id),
    done_date  TEXT    NOT NULL,
    done_by    INTEGER NOT NULL REFERENCES users(id),
    note       TEXT,
    created_at TEXT    NOT NULL,
    updated_at TEXT
);

CREATE TABLE pm_record_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL REFERENCES pm_records(id),
    seq       INTEGER NOT NULL,                 -- 1, 2, 3 ...
    item      TEXT    NOT NULL,                 -- copied from pm_plans.items
    result    TEXT    NOT NULL,                 -- 正常 / 異常 / 未執行
    remark    TEXT,
    UNIQUE (record_id, seq)
);
