-- Factory visitor check-in system, revised (CR-01, CR-02, CR-03): schema (7 tables)

CREATE TABLE employees (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no     TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    department TEXT    NOT NULL,                -- free text
    extension  TEXT,
    is_active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    role          INTEGER NOT NULL DEFAULT 1,   -- 0 admin, 1 receptionist, 2 host employee (CR-01)
    employee_id   INTEGER UNIQUE REFERENCES employees(id), -- required when role = 2 (CR-01)
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL
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

-- CR-01: visit appointments made by host employees
CREATE TABLE appointments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    visitor_name    TEXT    NOT NULL,
    visitor_company TEXT    NOT NULL,
    visitor_phone   TEXT    NOT NULL,
    visit_date      TEXT    NOT NULL,           -- YYYY-MM-DD
    expected_time   TEXT    NOT NULL,           -- HH:MM
    purpose         TEXT    NOT NULL,
    note            TEXT,
    status          INTEGER NOT NULL DEFAULT 0, -- 0 booked, 1 checked in, 2 cancelled; "no-show" is derived
    created_by      INTEGER NOT NULL REFERENCES users(id),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT
);

CREATE TABLE visits (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id           INTEGER NOT NULL REFERENCES visitors(id),
    employee_id          INTEGER NOT NULL REFERENCES employees(id),
    purpose              TEXT    NOT NULL,
    companions           INTEGER NOT NULL DEFAULT 0, -- count of visit_companions; old rows keep the number only
    plate_no             TEXT,
    pass_id              INTEGER NOT NULL REFERENCES visitor_passes(id),
    appointment_id       INTEGER UNIQUE REFERENCES appointments(id), -- NULL for walk-in (CR-01)
    check_in_at          TEXT    NOT NULL,
    check_out_at         TEXT,                       -- actual leave time; NULL means still on site
    checkin_by           INTEGER NOT NULL REFERENCES users(id),
    checkout_by          INTEGER REFERENCES users(id),
    checkout_recorded_at TEXT,                       -- when check-out was entered (CR-02)
    checkout_reason      TEXT,                       -- set only for late check-out (CR-02)
    note                 TEXT,
    updated_at           TEXT                        -- last edit time, NULL if never edited
);

-- CR-03: names of people who came with the visitor
CREATE TABLE visit_companions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id INTEGER NOT NULL REFERENCES visits(id),
    name     TEXT    NOT NULL
);
