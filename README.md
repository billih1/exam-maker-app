# ExamForge Local — Offline Exam Paper Maker

ExamForge Local is a 100% offline, local-first web application for creating, managing, and printing board-standard A4 exam papers.

## Features

- **Class & Subject Hierarchy**: Manage academic levels (One through 10th, 1st Year, 2nd Year) and subjects with chapter breakdown.
- **Question Bank**: Manage MCQs (with multiple choice options & answer keys), Short Questions, Long Questions, and Urdu/Arabic RTL script Translation Paragraphs.
- **Visual Exam Maker**:
  - Interactive block-based question selection and manual total marks assignment.
  - Multi-column layout with real-time WYSIWYG A4 print preview.
  - Invisible metadata header table (Name, Roll No, Class, Subject, Total Marks, Obtained Marks, Time Allowed, Date).
  - Code A / Code B seeded question shuffling for multi-version papers.
  - Automated teacher answer key generation.
- **Print & PDF Ready**: Tailored A4 print CSS with minimal page margins (5mm), avoiding orphaned headers, and ensuring board-standard formatting.
- **Backup & Restore**: Full SQLite database backup and one-click restore.

## Installation & Setup

### Prerequisites
- Python 3.8+
- pip

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Run the Application
On Windows:
Double-click `run_app.bat` or run:
```bash
python app.py
```

Open your browser and navigate to:
```
http://127.0.0.1:5000
```

## Tech Stack
- **Backend**: Python / Flask (Zero external dependencies beyond Flask)
- **Database**: SQLite3 (auto-initialized with foreign keys)
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (no external CDNs needed; 100% offline capable)
