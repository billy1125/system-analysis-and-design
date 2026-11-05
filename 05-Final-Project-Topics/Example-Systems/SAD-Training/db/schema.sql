-- Employee training record system: schema (4 tables)

CREATE TABLE employees (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no        TEXT    NOT NULL UNIQUE,      -- login ID
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    department    TEXT    NOT NULL,
    job_title     TEXT    NOT NULL,
    hire_date     TEXT    NOT NULL,
    role          INTEGER NOT NULL DEFAULT 1,   -- 0 HR, 1 employee
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL
);

CREATE TABLE courses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_no   TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL,               -- 法規 / 客戶要求 / 內部
    hours       REAL    NOT NULL,
    description TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id    INTEGER NOT NULL REFERENCES courses(id),
    session_date TEXT    NOT NULL,
    start_time   TEXT    NOT NULL,
    end_time     TEXT    NOT NULL,
    location     TEXT    NOT NULL,
    instructor   TEXT    NOT NULL,
    capacity     INTEGER NOT NULL,
    status       TEXT    NOT NULL DEFAULT '開放報名',  -- 開放報名 / 截止報名 / 已取消
    created_by   INTEGER NOT NULL REFERENCES employees(id),
    created_at   TEXT    NOT NULL,
    updated_at   TEXT
);

CREATE TABLE enrollments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES sessions(id),
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    status      TEXT    NOT NULL DEFAULT '已報名',     -- 已報名 / 已完成 / 未完成
    enrolled_at TEXT    NOT NULL,
    enrolled_by INTEGER NOT NULL REFERENCES employees(id),
    note        TEXT,
    result_by   INTEGER REFERENCES employees(id),     -- NULL until result is recorded
    result_at   TEXT,
    UNIQUE (session_id, employee_id)
);
