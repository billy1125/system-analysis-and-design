import sqlite3


def _get_conn():
    """SQLite 連線。DB_PATH 從 db 套件頂層讀取，支援測試時動態替換。"""
    from db import DB_PATH
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn
