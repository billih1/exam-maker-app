# database.py - SQLite initialization, tables, and CRUD operations

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exam_bank.db')


def get_db():
    """Get a database connection with foreign keys enabled and row factory set."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def row_to_dict(row):
    """Convert a sqlite3.Row to a plain dict."""
    if row is None:
        return None
    return dict(row)


def rows_to_dicts(rows):
    """Convert a list of sqlite3.Row objects to a list of dicts."""
    return [dict(r) for r in rows]


def init_db():
    """Create all tables and seed default data."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
            UNIQUE(class_id, name)
        );

        CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER NOT NULL,
            chapter_no INTEGER NOT NULL,
            title TEXT NOT NULL,
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS question_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chapter_id INTEGER NOT NULL,
            item_type TEXT NOT NULL,
            statement TEXT NOT NULL,
            option_a TEXT,
            option_b TEXT,
            option_c TEXT,
            option_d TEXT,
            correct_option TEXT,
            default_marks REAL DEFAULT 1.0,
            is_urdu_script BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS saved_exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER NOT NULL,
            exam_title TEXT NOT NULL,
            institute_name TEXT NOT NULL,
            time_allowed TEXT NOT NULL,
            total_marks REAL NOT NULL,
            config_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    """)

    # Seed default academic classes with sort order
    default_classes = [
        ('One', 1),
        ('Two', 2),
        ('Three', 3),
        ('Four', 4),
        ('5th', 5),
        ('6th', 6),
        ('7th', 7),
        ('8th', 8),
        ('9th', 9),
        ('10th', 10),
        ('1st Year', 11),
        ('2nd Year', 12),
    ]
    for cls_name, order in default_classes:
        cursor.execute(
            "INSERT OR IGNORE INTO classes (name, sort_order) VALUES (?, ?)",
            (cls_name, order)
        )

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Classes CRUD
# ---------------------------------------------------------------------------

def add_class(name, sort_order=None):
    """Add a new class. Returns the new class id."""
    conn = get_db()
    cursor = conn.cursor()
    if sort_order is None:
        max_order = cursor.execute("SELECT COALESCE(MAX(sort_order), 0) FROM classes").fetchone()[0]
        sort_order = max_order + 1
    cursor.execute("INSERT INTO classes (name, sort_order) VALUES (?, ?)", (name, sort_order))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def get_classes():
    """Return all classes as a list of dicts."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM classes ORDER BY sort_order, id").fetchall()
    conn.close()
    return rows_to_dicts(rows)


# ---------------------------------------------------------------------------
# Subjects CRUD
# ---------------------------------------------------------------------------

def add_subject(class_id, name):
    """Add a subject under a class. Returns the new subject id."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO subjects (class_id, name) VALUES (?, ?)",
        (class_id, name)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def get_subjects(class_id):
    """Return all subjects for a given class as a list of dicts."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM subjects WHERE class_id = ? ORDER BY name",
        (class_id,)
    ).fetchall()
    conn.close()
    return rows_to_dicts(rows)


# ---------------------------------------------------------------------------
# Chapters CRUD
# ---------------------------------------------------------------------------

def add_chapter(subject_id, chapter_no, title):
    """Add a chapter under a subject. Returns the new chapter id."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO chapters (subject_id, chapter_no, title) VALUES (?, ?, ?)",
        (subject_id, chapter_no, title)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def get_chapters(subject_id):
    """Return all chapters for a given subject, ordered by chapter_no."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM chapters WHERE subject_id = ? ORDER BY chapter_no",
        (subject_id,)
    ).fetchall()
    conn.close()
    return rows_to_dicts(rows)


def update_chapter(id, chapter_no, title):
    """Update chapter number and title."""
    conn = get_db()
    conn.execute(
        "UPDATE chapters SET chapter_no = ?, title = ? WHERE id = ?",
        (chapter_no, title, id)
    )
    conn.commit()
    conn.close()


def delete_chapter(id):
    """Delete a chapter and cascade-delete its questions."""
    conn = get_db()
    conn.execute("DELETE FROM chapters WHERE id = ?", (id,))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Question Items CRUD
# ---------------------------------------------------------------------------

def add_question(chapter_id, item_type, statement, option_a=None,
                 option_b=None, option_c=None, option_d=None,
                 correct_option=None, default_marks=1.0, is_urdu_script=0):
    """Add a question to the bank. Returns the new question id."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO question_items
           (chapter_id, item_type, statement, option_a, option_b,
            option_c, option_d, correct_option, default_marks, is_urdu_script)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (chapter_id, item_type, statement, option_a, option_b,
         option_c, option_d, correct_option, default_marks, is_urdu_script)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def get_questions(chapter_id, item_type=None):
    """Return questions for a chapter, optionally filtered by item_type."""
    conn = get_db()
    if item_type:
        rows = conn.execute(
            """SELECT * FROM question_items
               WHERE chapter_id = ? AND item_type = ?
               ORDER BY id""",
            (chapter_id, item_type)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM question_items WHERE chapter_id = ? ORDER BY id",
            (chapter_id,)
        ).fetchall()
    conn.close()
    return rows_to_dicts(rows)


def get_questions_by_subject(subject_id, item_type=None):
    """Return all questions across all chapters of a subject."""
    conn = get_db()
    if item_type:
        rows = conn.execute(
            """SELECT qi.*, c.chapter_no, c.title as chapter_title
               FROM question_items qi
               JOIN chapters c ON qi.chapter_id = c.id
               WHERE c.subject_id = ? AND qi.item_type = ?
               ORDER BY c.chapter_no, qi.id""",
            (subject_id, item_type)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT qi.*, c.chapter_no, c.title as chapter_title
               FROM question_items qi
               JOIN chapters c ON qi.chapter_id = c.id
               WHERE c.subject_id = ?
               ORDER BY c.chapter_no, qi.id""",
            (subject_id,)
        ).fetchall()
    conn.close()
    return rows_to_dicts(rows)


def update_question(id, **kwargs):
    """Update specific fields of a question item."""
    if not kwargs:
        return
    allowed = {
        'chapter_id', 'item_type', 'statement', 'option_a', 'option_b',
        'option_c', 'option_d', 'correct_option', 'default_marks',
        'is_urdu_script'
    }
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [id]
    conn = get_db()
    conn.execute(f"UPDATE question_items SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()


def delete_question(id):
    """Delete a question by id."""
    conn = get_db()
    conn.execute("DELETE FROM question_items WHERE id = ?", (id,))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Saved Exams CRUD
# ---------------------------------------------------------------------------

def save_exam(subject_id, exam_title, institute_name, time_allowed,
              total_marks, config_json):
    """Save a generated exam paper config. Returns the new exam id."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO saved_exams
           (subject_id, exam_title, institute_name, time_allowed,
            total_marks, config_json)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (subject_id, exam_title, institute_name, time_allowed,
         total_marks, config_json)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def get_saved_exams():
    """Return all saved exams with subject and class info."""
    conn = get_db()
    rows = conn.execute(
        """SELECT se.*, s.name as subject_name, c.name as class_name
           FROM saved_exams se
           JOIN subjects s ON se.subject_id = s.id
           JOIN classes c ON s.class_id = c.id
           ORDER BY se.created_at DESC"""
    ).fetchall()
    conn.close()
    return rows_to_dicts(rows)


def get_exam_by_id(id):
    """Return a single saved exam by id, or None."""
    conn = get_db()
    row = conn.execute(
        """SELECT se.*, s.name as subject_name, c.name as class_name
           FROM saved_exams se
           JOIN subjects s ON se.subject_id = s.id
           JOIN classes c ON s.class_id = c.id
           WHERE se.id = ?""",
        (id,)
    ).fetchone()
    conn.close()
    return row_to_dict(row)


def delete_exam(id):
    """Delete a saved exam by id."""
    conn = get_db()
    conn.execute("DELETE FROM saved_exams WHERE id = ?", (id,))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Settings CRUD
# ---------------------------------------------------------------------------

def get_setting(key, default=None):
    """Get a setting value by key, or return the default."""
    conn = get_db()
    row = conn.execute(
        "SELECT value FROM settings WHERE key = ?", (key,)
    ).fetchone()
    conn.close()
    if row is None:
        return default
    return row['value']


def set_setting(key, value):
    """Set a setting value (insert or update)."""
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (key, str(value))
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Stats helpers (for dashboard)
# ---------------------------------------------------------------------------

def get_stats():
    """Return quick stats for the dashboard."""
    conn = get_db()
    total_questions = conn.execute(
        "SELECT COUNT(*) as cnt FROM question_items"
    ).fetchone()['cnt']
    total_subjects = conn.execute(
        "SELECT COUNT(*) as cnt FROM subjects"
    ).fetchone()['cnt']
    total_chapters = conn.execute(
        "SELECT COUNT(*) as cnt FROM chapters"
    ).fetchone()['cnt']
    total_exams = conn.execute(
        "SELECT COUNT(*) as cnt FROM saved_exams"
    ).fetchone()['cnt']
    recent_exams = conn.execute(
        """SELECT se.*, s.name as subject_name, c.name as class_name
           FROM saved_exams se
           JOIN subjects s ON se.subject_id = s.id
           JOIN classes c ON s.class_id = c.id
           ORDER BY se.created_at DESC LIMIT 5"""
    ).fetchall()
    conn.close()
    return {
        'total_questions': total_questions,
        'total_subjects': total_subjects,
        'total_chapters': total_chapters,
        'total_exams': total_exams,
        'recent_exams': rows_to_dicts(recent_exams)
    }


def get_question_by_id(id):
    """Return a single question by id, or None."""
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM question_items WHERE id = ?", (id,)
    ).fetchone()
    conn.close()
    return row_to_dict(row)


def get_questions_by_ids(ids):
    """Return questions matching a list of ids, preserving order."""
    if not ids:
        return []
    conn = get_db()
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"""SELECT qi.*, c.chapter_no, c.title as chapter_title
            FROM question_items qi
            JOIN chapters c ON qi.chapter_id = c.id
            WHERE qi.id IN ({placeholders})""",
        ids
    ).fetchall()
    conn.close()
    result_map = {r['id']: dict(r) for r in rows}
    return [result_map[i] for i in ids if i in result_map]


# Auto-initialize database when module is imported
if __name__ == '__main__':
    init_db()
    print("Database initialized successfully.")
