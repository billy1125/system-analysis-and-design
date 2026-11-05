-- Warehouse stocktaking system: 5 tables (spec 5.2)

CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no        TEXT    NOT NULL UNIQUE,      -- login ID
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    role          INTEGER NOT NULL DEFAULT 1,   -- 0 manager, 1 warehouse staff
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL
);

CREATE TABLE items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    item_no    TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    spec       TEXT,
    unit       TEXT    NOT NULL,
    location   TEXT    NOT NULL,
    book_qty   INTEGER NOT NULL DEFAULT 0,      -- changed only by stock_moves
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL,
    updated_at TEXT
);

CREATE TABLE counts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    count_no   TEXT    NOT NULL UNIQUE,         -- IC-YYMM-NN
    name       TEXT    NOT NULL,
    count_type TEXT    NOT NULL,                -- 全盤 / 抽盤
    counter_id INTEGER NOT NULL REFERENCES users(id),
    status     TEXT    NOT NULL DEFAULT '盤點中', -- 盤點中 / 已結案
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT    NOT NULL,
    closed_by  INTEGER REFERENCES users(id),
    closed_at  TEXT
);

CREATE TABLE count_lines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id    INTEGER NOT NULL REFERENCES counts(id),
    item_id     INTEGER NOT NULL REFERENCES items(id),
    counted_qty INTEGER,                        -- NULL = not counted yet
    remark      TEXT,
    counted_by  INTEGER REFERENCES users(id),
    counted_at  TEXT,
    UNIQUE (count_id, item_id)
);

CREATE TABLE stock_moves (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id    INTEGER NOT NULL REFERENCES items(id),
    move_type  TEXT    NOT NULL,                -- 入庫 / 出庫 / 盤點調整
    qty_change INTEGER NOT NULL,                -- + adds to book_qty, - takes away
    note       TEXT,
    count_id   INTEGER REFERENCES counts(id),   -- set only for 盤點調整
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT    NOT NULL
);
