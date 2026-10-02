"""
app.py - Core Flask server & REST routes for Offline Exam Paper Maker.
Serves HTML views and JSON API endpoints. Zero external dependencies beyond Flask.
"""

import json
import os
import shutil
from datetime import datetime

from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    send_file,
    abort,
)

from database import (
    DB_PATH,
    init_db,
    get_db,
    add_class,
    get_classes,
    add_subject,
    get_subjects,
    add_chapter,
    get_chapters,
    update_chapter,
    delete_chapter,
    add_question,
    get_questions,
    get_question_by_id,
    update_question,
    delete_question,
    save_exam,
    get_saved_exams,
    get_exam_by_id,
    delete_exam,
    get_setting,
    set_setting,
)

app = Flask(
    __name__,
    static_folder="static",
    template_folder="templates",
)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.config["TEMPLATES_AUTO_RELOAD"] = True


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ---------------------------------------------------------------------------
# HTML View Routes
# ---------------------------------------------------------------------------

@app.route("/")
def dashboard():
    return render_template("dashboard.html")


@app.route("/question-bank")
def question_bank():
    return render_template("question_bank.html")


@app.route("/exam-maker")
def exam_maker():
    return render_template("exam_maker.html")


@app.route("/saved-papers")
def saved_papers():
    return render_template("saved_papers.html")


@app.route("/settings")
def settings_page():
    return render_template("settings.html")


@app.route("/print-paper/<int:exam_id>")
def print_paper(exam_id):
    exam = get_exam_by_id(exam_id)
    if exam is None:
        abort(404)

    # Parse the saved configuration
    try:
        config = json.loads(exam["config_json"])
    except (json.JSONDecodeError, TypeError):
        config = {}

    # Resolve every referenced question id into its full row.
    all_questions = []
    seen_ids = set()
    db = get_db()
    try:
        # NEW FORMAT: blocks → subParts → questionIds
        blocks = config.get("blocks", [])
        if blocks:
            for block in blocks:
                for sp in block.get("subParts", []):
                    q_ids = sp.get("questionIds") or sp.get("question_ids") or []
                    for qid in q_ids:
                        if qid in seen_ids:
                            continue
                        row = db.execute(
                            "SELECT * FROM question_items WHERE id = ?", (qid,)
                        ).fetchone()
                        if row:
                            all_questions.append(dict(row))
                            seen_ids.add(qid)

        # LEGACY FORMAT: flat sections
        sections = config.get("sections", [])
        for section in sections:
            q_ids = section.get("questionIds") or section.get("question_ids") or []
            resolved = []
            for qid in q_ids:
                row = db.execute(
                    "SELECT * FROM question_items WHERE id = ?", (qid,)
                ).fetchone()
                if row:
                    d = dict(row)
                    resolved.append(d)
                    if qid not in seen_ids:
                        all_questions.append(d)
                        seen_ids.add(qid)
            section["questions"] = resolved
    finally:
        db.close()

    # Derive subject/class names — prefer DB JOIN fields, fall back to config
    subject_name = exam.get("subject_name") or config.get("subjectName", "")
    class_name = exam.get("class_name") or config.get("className", "")

    return render_template(
        "paper_print.html",
        exam=exam,
        questions=all_questions,
        subject_name=subject_name,
        class_name=class_name,
    )


# ---------------------------------------------------------------------------
# REST API — Classes
# ---------------------------------------------------------------------------

@app.route("/api/classes", methods=["GET"])
def api_get_classes():
    try:
        return jsonify(get_classes())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/classes", methods=["POST"])
def api_add_class():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Class name is required"}), 400
    try:
        new_id = add_class(name)
        return jsonify({"id": new_id, "name": name}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# REST API — Subjects
# ---------------------------------------------------------------------------

@app.route("/api/subjects", methods=["GET"])
def api_get_subjects():
    class_id = request.args.get("class_id", type=int)
    if class_id is None:
        return jsonify({"error": "class_id query parameter is required"}), 400
    try:
        return jsonify(get_subjects(class_id))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/subjects", methods=["POST"])
def api_add_subject():
    data = request.get_json(silent=True) or {}
    class_id = data.get("class_id")
    name = (data.get("name") or "").strip()
    if not class_id or not name:
        return jsonify({"error": "class_id and name are required"}), 400
    try:
        new_id = add_subject(class_id, name)
        return jsonify({"id": new_id, "class_id": class_id, "name": name}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/subjects/<int:subject_id>", methods=["DELETE"])
def api_delete_subject(subject_id):
    try:
        db = get_db()
        db.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
        db.commit()
        db.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# REST API — Chapters
# ---------------------------------------------------------------------------

@app.route("/api/chapters", methods=["GET"])
def api_get_chapters():
    subject_id = request.args.get("subject_id", type=int)
    if subject_id is None:
        return jsonify({"error": "subject_id query parameter is required"}), 400
    try:
        return jsonify(get_chapters(subject_id))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/chapters", methods=["POST"])
def api_add_chapter():
    data = request.get_json(silent=True) or {}
    subject_id = data.get("subject_id")
    chapter_no = data.get("chapter_no")
    title = (data.get("title") or "").strip()
    if not subject_id or chapter_no is None or not title:
        return jsonify({"error": "subject_id, chapter_no, and title are required"}), 400
    try:
        new_id = add_chapter(subject_id, chapter_no, title)
        return jsonify({"id": new_id, "subject_id": subject_id, "chapter_no": chapter_no, "title": title}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/chapters/<int:chapter_id>", methods=["PUT"])
def api_update_chapter(chapter_id):
    data = request.get_json(silent=True) or {}
    chapter_no = data.get("chapter_no")
    title = (data.get("title") or "").strip()
    if chapter_no is None or not title:
        return jsonify({"error": "chapter_no and title are required"}), 400
    try:
        update_chapter(chapter_id, chapter_no, title)
        return jsonify({"id": chapter_id, "chapter_no": chapter_no, "title": title})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/chapters/<int:chapter_id>", methods=["DELETE"])
def api_delete_chapter(chapter_id):
    try:
        delete_chapter(chapter_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# REST API — Questions
# ---------------------------------------------------------------------------

@app.route("/api/questions", methods=["GET"])
def api_get_questions():
    chapter_id = request.args.get("chapter_id", type=int)
    item_type = request.args.get("item_type")
    if chapter_id is None:
        return jsonify({"error": "chapter_id query parameter is required"}), 400
    try:
        return jsonify(get_questions(chapter_id, item_type))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/questions/<int:question_id>", methods=["GET"])
def api_get_question(question_id):
    try:
        q = get_question_by_id(question_id)
        if q is None:
            return jsonify({"error": "Question not found"}), 404
        return jsonify(q)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/questions", methods=["POST"])
def api_add_question():
    data = request.get_json(silent=True) or {}
    chapter_id = data.get("chapter_id")
    item_type = (data.get("item_type") or "").strip()
    statement = (data.get("statement") or "").strip()
    if not chapter_id or not item_type or not statement:
        return jsonify({"error": "chapter_id, item_type, and statement are required"}), 400
    try:
        new_id = add_question(
            chapter_id=chapter_id,
            item_type=item_type,
            statement=statement,
            option_a=(data.get("option_a") or "").strip() or None,
            option_b=(data.get("option_b") or "").strip() or None,
            option_c=(data.get("option_c") or "").strip() or None,
            option_d=(data.get("option_d") or "").strip() or None,
            correct_option=(data.get("correct_option") or "").strip() or None,
            default_marks=data.get("default_marks", 1.0),
            is_urdu_script=data.get("is_urdu_script", 0),
        )
        return jsonify({"id": new_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/questions/<int:question_id>", methods=["PUT"])
def api_update_question(question_id):
    data = request.get_json(silent=True) or {}
    allowed = [
        "chapter_id", "item_type", "statement",
        "option_a", "option_b", "option_c", "option_d",
        "correct_option", "default_marks", "is_urdu_script",
    ]
    updates = {k: data[k] for k in allowed if k in data}
    if not updates:
        return jsonify({"error": "No valid fields to update"}), 400
    try:
        update_question(question_id, **updates)
        return jsonify({"id": question_id, "updated": list(updates.keys())})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/questions/<int:question_id>", methods=["DELETE"])
def api_delete_question(question_id):
    try:
        delete_question(question_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# REST API — Saved Exams
# ---------------------------------------------------------------------------

@app.route("/api/save-exam", methods=["POST"])
def api_save_exam():
    data = request.get_json(silent=True) or {}
    if not data.get("subject_id") or not data.get("exam_title") or not data.get("config_json"):
        return jsonify({"error": "subject_id, exam_title, and config_json are required"}), 400
    try:
        # config_json may arrive as dict or string
        cfg = data["config_json"]
        if isinstance(cfg, dict) or isinstance(cfg, list):
            cfg = json.dumps(cfg)
        new_id = save_exam(
            subject_id=data["subject_id"],
            exam_title=data["exam_title"],
            institute_name=data.get("institute_name", "") or "",
            time_allowed=data.get("time_allowed", "") or "",
            total_marks=data.get("total_marks", 0) or 0,
            config_json=cfg,
        )
        return jsonify({"id": new_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/saved-exams", methods=["GET"])
def api_get_saved_exams():
    try:
        return jsonify(get_saved_exams())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/saved-exams/<int:exam_id>", methods=["GET"])
def api_get_saved_exam(exam_id):
    try:
        exam = get_exam_by_id(exam_id)
        if exam is None:
            return jsonify({"error": "Exam not found"}), 404
        return jsonify(exam)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/saved-exams/<int:exam_id>", methods=["DELETE"])
def api_delete_saved_exam(exam_id):
    try:
        delete_exam(exam_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# REST API — Settings
# ---------------------------------------------------------------------------

@app.route("/api/settings/<key>", methods=["GET"])
def api_get_setting(key):
    try:
        value = get_setting(key)
        return jsonify({"key": key, "value": value})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/settings", methods=["POST"])
def api_set_setting():
    data = request.get_json(silent=True) or {}
    key = (data.get("key") or "").strip()
    value = data.get("value", "")
    if not key:
        return jsonify({"error": "key is required"}), 400
    try:
        set_setting(key, str(value))
        return jsonify({"key": key, "value": value})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# REST API — Logo Upload
# ---------------------------------------------------------------------------

@app.route("/api/upload-logo", methods=["POST"])
def api_upload_logo():
    """Accept an image file upload, save to static/uploads/, return the URL."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"error": "No file selected"}), 400

    # Validate it's an image
    allowed_ext = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'}
    ext = os.path.splitext(uploaded.filename)[1].lower()
    if ext not in allowed_ext:
        return jsonify({"error": "Only image files are accepted"}), 400

    # Ensure uploads directory exists
    upload_dir = os.path.join(app.static_folder, "uploads")
    os.makedirs(upload_dir, exist_ok=True)

    # Save with timestamp to avoid conflicts
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = f"logo_{timestamp}{ext}"
    filepath = os.path.join(upload_dir, safe_name)
    uploaded.save(filepath)

    return jsonify({
        "success": True,
        "url": f"/static/uploads/{safe_name}",
        "filename": safe_name,
    })


# ---------------------------------------------------------------------------
# REST API — Database Backup & Restore
# ---------------------------------------------------------------------------

@app.route("/api/backup", methods=["GET"])
def api_backup():
    if not os.path.exists(DB_PATH):
        return jsonify({"error": "Database file not found"}), 404
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"exam_bank_backup_{timestamp}.db"
    return send_file(
        DB_PATH,
        as_attachment=True,
        download_name=filename,
        mimetype="application/x-sqlite3",
    )


@app.route("/api/restore", methods=["POST"])
def api_restore():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    uploaded = request.files["file"]
    if not uploaded.filename.endswith(".db"):
        return jsonify({"error": "Only .db files are accepted"}), 400
    try:
        # Save to a temp path first to validate
        temp_path = DB_PATH + ".uploading"
        uploaded.save(temp_path)

        # Quick sanity check — try opening as SQLite
        test_conn = None
        try:
            import sqlite3
            test_conn = sqlite3.connect(temp_path)
            test_conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        except Exception:
            os.remove(temp_path)
            return jsonify({"error": "Uploaded file is not a valid SQLite database"}), 400
        finally:
            if test_conn:
                test_conn.close()

        # Replace the live database
        shutil.move(temp_path, DB_PATH)

        # Re-initialise so any missing tables are created
        init_db()
        return jsonify({"success": True, "message": "Database restored successfully"})
    except Exception as e:
        # Clean up temp file on failure
        if os.path.exists(DB_PATH + ".uploading"):
            os.remove(DB_PATH + ".uploading")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Dashboard Stats API (used by dashboard.html)
# ---------------------------------------------------------------------------

@app.route("/api/stats", methods=["GET"])
def api_stats():
    try:
        db = get_db()
        total_questions = db.execute("SELECT COUNT(*) FROM question_items").fetchone()[0]
        total_subjects = db.execute("SELECT COUNT(*) FROM subjects").fetchone()[0]
        total_chapters = db.execute("SELECT COUNT(*) FROM chapters").fetchone()[0]
        total_papers = db.execute("SELECT COUNT(*) FROM saved_exams").fetchone()[0]
        total_classes = db.execute("SELECT COUNT(*) FROM classes").fetchone()[0]
        mcq_count = db.execute(
            "SELECT COUNT(*) FROM question_items WHERE item_type = 'mcq'"
        ).fetchone()[0]
        short_count = db.execute(
            "SELECT COUNT(*) FROM question_items WHERE item_type = 'short_q'"
        ).fetchone()[0]
        long_count = db.execute(
            "SELECT COUNT(*) FROM question_items WHERE item_type IN ('long_q','letter','story')"
        ).fetchone()[0]
        para_count = db.execute(
            "SELECT COUNT(*) FROM question_items WHERE item_type = 'translation_para'"
        ).fetchone()[0]
        recent_papers = [
            dict(r)
            for r in db.execute(
                "SELECT id, exam_title, created_at FROM saved_exams ORDER BY created_at DESC LIMIT 5"
            ).fetchall()
        ]
        db.close()
        return jsonify({
            "total_questions": total_questions,
            "total_subjects": total_subjects,
            "total_chapters": total_chapters,
            "total_papers": total_papers,
            "total_classes": total_classes,
            "mcq_count": mcq_count,
            "short_count": short_count,
            "long_count": long_count,
            "para_count": para_count,
            "recent_papers": recent_papers,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5000, debug=False)
