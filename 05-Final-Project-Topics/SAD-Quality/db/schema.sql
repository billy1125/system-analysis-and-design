CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no        TEXT    NOT NULL UNIQUE,      -- login ID
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    role          INTEGER NOT NULL DEFAULT 1,   -- 0 manager, 1 QC staff
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL
);

CREATE TABLE products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    part_no    TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    customer   TEXT,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL,
    updated_at TEXT
);

CREATE TABLE departments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    contact    TEXT    NOT NULL,                -- contact person, free text
    ext        TEXT    NOT NULL,                -- 4-digit extension
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL,
    updated_at TEXT
);

CREATE TABLE defect_types (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL,
    updated_at TEXT
);

CREATE TABLE issues (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_no       TEXT    NOT NULL UNIQUE,     -- QI-YYMM-NNN
    found_at       TEXT    NOT NULL,
    reporter       TEXT    NOT NULL,            -- free text, reporter does not log in
    line           TEXT    NOT NULL,            -- free text
    station        TEXT,
    product_id     INTEGER NOT NULL REFERENCES products(id),
    lot_no         TEXT,
    defect_type_id INTEGER NOT NULL REFERENCES defect_types(id),
    description    TEXT    NOT NULL,
    qty            INTEGER NOT NULL,
    status         TEXT    NOT NULL DEFAULT '待處理', -- 待處理 / 處理中 / 已結案 / 不成立
    dept_id        INTEGER REFERENCES departments(id),  -- latest assignment only
    assigned_by    INTEGER REFERENCES users(id),
    assigned_at    TEXT,
    resolution     TEXT,                        -- countermeasure, or reason when 不成立
    closed_by      INTEGER REFERENCES users(id),
    closed_at      TEXT,
    created_by     INTEGER NOT NULL REFERENCES users(id),
    created_at     TEXT    NOT NULL,
    updated_at     TEXT
);
