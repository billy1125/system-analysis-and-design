-- Factory visitor check-in system: schema (5 tables)

CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    role          INTEGER NOT NULL DEFAULT 1,   -- 0 admin, 1 receptionist
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL
);

CREATE TABLE employees (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no     TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    department TEXT    NOT NULL,                -- free text
    extension  TEXT,
    is_active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE visitors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    company    TEXT NOT NULL,
    phone      TEXT NOT NULL,                   -- not unique
    id_number  TEXT NOT NULL,                   -- full national ID, not unique
    created_at TEXT NOT NULL,
    updated_at TEXT
);

CREATE TABLE visitor_passes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    pass_no   TEXT    NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    note      TEXT
);

CREATE TABLE visits (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id   INTEGER NOT NULL REFERENCES visitors(id),
    employee_id  INTEGER NOT NULL REFERENCES employees(id),
    purpose      TEXT    NOT NULL,
    companions   INTEGER NOT NULL DEFAULT 0,
    plate_no     TEXT,
    pass_id      INTEGER NOT NULL REFERENCES visitor_passes(id),
    check_in_at  TEXT    NOT NULL,
    check_out_at TEXT,                          -- NULL means still on site
    checkin_by   INTEGER NOT NULL REFERENCES users(id),
    checkout_by  INTEGER REFERENCES users(id),
    note         TEXT,
    updated_at   TEXT                           -- last edit time, NULL if never edited
);
