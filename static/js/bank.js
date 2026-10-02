// bank.js — Question Bank: cascading dropdowns, CRUD, rapid entry
'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const classSelect   = document.getElementById('class-select');
    const subjectSelect = document.getElementById('subject-select');
    const chapterSelect = document.getElementById('chapter-select');
    const addSubjectBtn = document.getElementById('add-subject-btn');
    const addChapterBtn = document.getElementById('add-chapter-btn');
    const tbody         = document.getElementById('questions-tbody');
    const emptyState    = document.getElementById('questions-empty');
    const table         = document.getElementById('questions-table');

    let activeType = 'mcq';

    // ── Helpers ──────────────────────────────────────────────────────────

    function populateSelect(sel, items, valueKey, textKey, placeholder) {
        sel.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = placeholder || '— Select —';
        sel.appendChild(opt);
        items.forEach(item => {
            const o = document.createElement('option');
            o.value = item[valueKey];
            o.textContent = item[textKey];
            sel.appendChild(o);
        });
    }

    function clearSelect(sel, placeholder) {
        sel.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = placeholder || '— Select —';
        sel.appendChild(opt);
    }

    function truncateText(text, maxLen) {
        if (!text) return '';
        return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
    }

    function typeLabel(t) {
        const map = { mcq: 'MCQ', short_q: 'Short Q', translation_para: 'Translation', long_q: 'Long Q', letter: 'Letter', story: 'Story' };
        return map[t] || t;
    }

    function openModal(id) { document.getElementById(id).style.display = 'flex'; }

    // Global — used by inline onclick in the template
    window.closeModal = function(id) { document.getElementById(id).style.display = 'none'; };

    async function apiFetch(url, opts) {
        try {
            const res = await fetch(url, opts);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Request failed');
            return data;
        } catch (err) {
            showToast(err.message, 'error');
            throw err;
        }
    }

    // ── Load Classes ────────────────────────────────────────────────────

    async function loadClasses() {
        try {
            const classes = await apiFetch('/api/classes');
            populateSelect(classSelect, classes, 'id', 'name', '— Select Class —');
        } catch (_) { /* toast already shown */ }
    }

    loadClasses();

    // ── Cascading Dropdowns ─────────────────────────────────────────────

    classSelect.addEventListener('change', async () => {
        const classId = classSelect.value;
        clearSelect(chapterSelect, '— Select Chapter —');
        chapterSelect.disabled = true;
        addChapterBtn.disabled = true;
        clearQuestions();

        if (!classId) {
            clearSelect(subjectSelect, '— Select Subject —');
            subjectSelect.disabled = true;
            addSubjectBtn.disabled = true;
            return;
        }
        addSubjectBtn.disabled = false;
        try {
            const subjects = await apiFetch(`/api/subjects?class_id=${classId}`);
            populateSelect(subjectSelect, subjects, 'id', 'name', '— Select Subject —');
            subjectSelect.disabled = false;
        } catch (_) {}
    });

    subjectSelect.addEventListener('change', async () => {
        const subjectId = subjectSelect.value;
        clearQuestions();

        if (!subjectId) {
            clearSelect(chapterSelect, '— Select Chapter —');
            chapterSelect.disabled = true;
            addChapterBtn.disabled = true;
            return;
        }
        addChapterBtn.disabled = false;
        try {
            const chapters = await apiFetch(`/api/chapters?subject_id=${subjectId}`);
            const items = chapters.map(c => ({ id: c.id, name: `Ch ${c.chapter_no}: ${c.title}` }));
            populateSelect(chapterSelect, items, 'id', 'name', '— Select Chapter —');
            chapterSelect.disabled = false;
        } catch (_) {}
    });

    chapterSelect.addEventListener('change', () => {
        loadQuestions();
    });

    // ── Tab Switching ───────────────────────────────────────────────────

    const tabs = document.querySelectorAll('#category-tabs .tab');
    const forms = {
        mcq: document.getElementById('mcq-form'),
        short_q: document.getElementById('short-form'),
        translation_para: document.getElementById('translation-form'),
        long_q: document.getElementById('long-form'),
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeType = tab.dataset.type;

            Object.values(forms).forEach(f => f.style.display = 'none');
            if (forms[activeType]) forms[activeType].style.display = '';

            loadQuestions();
        });
    });

    // ── Load & Render Questions ─────────────────────────────────────────

    function clearQuestions() {
        tbody.innerHTML = '';
        table.style.display = 'none';
        emptyState.style.display = '';
    }

    async function loadQuestions() {
        const chapterId = chapterSelect.value;
        if (!chapterId) { clearQuestions(); return; }

        // For long_q tab, fetch long_q + letter + story
        let url;
        if (activeType === 'long_q') {
            url = `/api/questions?chapter_id=${chapterId}`;
        } else {
            url = `/api/questions?chapter_id=${chapterId}&item_type=${activeType}`;
        }

        try {
            let questions = await apiFetch(url);

            // Filter for long_q tab to include long_q, letter, story only
            if (activeType === 'long_q') {
                questions = questions.filter(q => ['long_q', 'letter', 'story'].includes(q.item_type));
            }

            if (questions.length === 0) {
                clearQuestions();
                return;
            }

            emptyState.style.display = 'none';
            table.style.display = '';
            tbody.innerHTML = '';

            questions.forEach((q, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${idx + 1}</td>
                    <td title="${escapeHtml(q.statement)}">${escapeHtml(truncateText(q.statement, 80))}</td>
                    <td><span class="badge">${typeLabel(q.item_type)}</span></td>
                    <td class="action-buttons">
                        <button class="btn btn-sm" onclick="editQuestion(${q.id})">✏ Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${q.id})">🗑</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (_) { clearQuestions(); }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // ── MCQ Save ────────────────────────────────────────────────────────

    const mcqSaveBtn  = document.getElementById('mcq-save-btn');
    const mcqStmt     = document.getElementById('mcq-statement');
    const mcqOptA     = document.getElementById('mcq-opt-a');
    const mcqOptB     = document.getElementById('mcq-opt-b');
    const mcqOptC     = document.getElementById('mcq-opt-c');
    const mcqOptD     = document.getElementById('mcq-opt-d');
    const mcqCorrect  = document.getElementById('mcq-correct');

    async function saveMCQ() {
        const chapterId = chapterSelect.value;
        if (!chapterId) { showToast('Please select a chapter first', 'error'); return; }
        const statement = mcqStmt.value.trim();
        if (!statement) { showToast('Question statement is required', 'error'); mcqStmt.focus(); return; }

        const body = {
            chapter_id: parseInt(chapterId),
            item_type: 'mcq',
            statement,
            option_a: mcqOptA.value.trim(),
            option_b: mcqOptB.value.trim(),
            option_c: mcqOptC.value.trim(),
            option_d: mcqOptD.value.trim(),
            correct_option: mcqCorrect.value,
            default_marks: 0,
            is_urdu_script: 0,
        };

        try {
            await apiFetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            showToast('MCQ saved successfully');
            mcqStmt.value = '';
            mcqOptA.value = '';
            mcqOptB.value = '';
            mcqOptC.value = '';
            mcqOptD.value = '';
            mcqCorrect.value = '';
            mcqStmt.focus();
            loadQuestions();
        } catch (_) {}
    }

    mcqSaveBtn.addEventListener('click', saveMCQ);

    // Enter on Option D triggers save
    mcqOptD.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveMCQ(); }
    });

    // ── Short Question Save ─────────────────────────────────────────────

    const shortSaveBtn = document.getElementById('short-save-btn');
    const shortStmt    = document.getElementById('short-statement');

    async function saveShort() {
        const chapterId = chapterSelect.value;
        if (!chapterId) { showToast('Please select a chapter first', 'error'); return; }
        const statement = shortStmt.value.trim();
        if (!statement) { showToast('Question statement is required', 'error'); shortStmt.focus(); return; }

        const body = {
            chapter_id: parseInt(chapterId),
            item_type: 'short_q',
            statement,
            default_marks: 0,
            is_urdu_script: 0,
        };

        try {
            await apiFetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            showToast('Short question saved');
            shortStmt.value = '';
            shortStmt.focus();
            loadQuestions();
        } catch (_) {}
    }

    shortSaveBtn.addEventListener('click', saveShort);

    // ── Translation Para Save ───────────────────────────────────────────

    const transSaveBtn = document.getElementById('trans-save-btn');
    const transStmt    = document.getElementById('trans-statement');
    const transRef     = document.getElementById('trans-ref');
    const transUrdu    = document.getElementById('trans-urdu');

    async function saveTrans() {
        const chapterId = chapterSelect.value;
        if (!chapterId) { showToast('Please select a chapter first', 'error'); return; }
        let statement = transStmt.value.trim();
        if (!statement) { showToast('Paragraph text is required', 'error'); transStmt.focus(); return; }

        const ref = transRef.value.trim();
        if (ref) statement = `[${ref}] ${statement}`;

        const body = {
            chapter_id: parseInt(chapterId),
            item_type: 'translation_para',
            statement,
            default_marks: 0,
            is_urdu_script: transUrdu.checked ? 1 : 0,
        };

        try {
            await apiFetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            showToast('Translation paragraph saved');
            transStmt.value = '';
            transRef.value = '';
            transUrdu.checked = false;
            transStmt.focus();
            loadQuestions();
        } catch (_) {}
    }

    transSaveBtn.addEventListener('click', saveTrans);

    // ── Long Q / Letter / Story Save ────────────────────────────────────

    const longSaveBtn  = document.getElementById('long-save-btn');
    const longSubtype  = document.getElementById('long-subtype');
    const longStmt     = document.getElementById('long-statement');

    async function saveLong() {
        const chapterId = chapterSelect.value;
        if (!chapterId) { showToast('Please select a chapter first', 'error'); return; }
        const statement = longStmt.value.trim();
        if (!statement) { showToast('Statement is required', 'error'); longStmt.focus(); return; }

        const body = {
            chapter_id: parseInt(chapterId),
            item_type: longSubtype.value,
            statement,
            default_marks: 0,
            is_urdu_script: 0,
        };

        try {
            await apiFetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            showToast(`${typeLabel(longSubtype.value)} saved`);
            longStmt.value = '';
            longStmt.focus();
            loadQuestions();
        } catch (_) {}
    }

    longSaveBtn.addEventListener('click', saveLong);

    // ── Delete Question ─────────────────────────────────────────────────

    window.deleteQuestion = async function(id) {
        if (!confirm('Delete this question? This cannot be undone.')) return;
        try {
            await apiFetch(`/api/questions/${id}`, { method: 'DELETE' });
            showToast('Question deleted');
            loadQuestions();
        } catch (_) {}
    };

    // ── Edit Question ───────────────────────────────────────────────────

    window.editQuestion = async function(id) {
        try {
            const q = await apiFetch(`/api/questions/${id}`);
            document.getElementById('edit-id').value = q.id;
            document.getElementById('edit-type').value = q.item_type;
            document.getElementById('edit-statement').value = q.statement || '';
            document.getElementById('edit-urdu').checked = !!q.is_urdu_script;

            const mcqFields = document.getElementById('edit-mcq-fields');
            if (q.item_type === 'mcq') {
                mcqFields.style.display = '';
                document.getElementById('edit-opt-a').value = q.option_a || '';
                document.getElementById('edit-opt-b').value = q.option_b || '';
                document.getElementById('edit-opt-c').value = q.option_c || '';
                document.getElementById('edit-opt-d').value = q.option_d || '';
                document.getElementById('edit-correct').value = q.correct_option || '';
            } else {
                mcqFields.style.display = 'none';
            }

            openModal('edit-modal');
        } catch (_) {}
    };

    document.getElementById('edit-save-btn').addEventListener('click', async () => {
        const id = document.getElementById('edit-id').value;
        const itemType = document.getElementById('edit-type').value;

        const body = {
            statement: document.getElementById('edit-statement').value.trim(),
            default_marks: 0,
            is_urdu_script: document.getElementById('edit-urdu').checked ? 1 : 0,
        };

        if (itemType === 'mcq') {
            body.option_a = document.getElementById('edit-opt-a').value.trim();
            body.option_b = document.getElementById('edit-opt-b').value.trim();
            body.option_c = document.getElementById('edit-opt-c').value.trim();
            body.option_d = document.getElementById('edit-opt-d').value.trim();
            body.correct_option = document.getElementById('edit-correct').value;
        }

        try {
            await apiFetch(`/api/questions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            showToast('Question updated');
            closeModal('edit-modal');
            loadQuestions();
        } catch (_) {}
    });

    // ── Add Subject Modal ───────────────────────────────────────────────

    addSubjectBtn.addEventListener('click', () => {
        document.getElementById('modal-subject-name').value = '';
        openModal('subject-modal');
        document.getElementById('modal-subject-name').focus();
    });

    document.getElementById('modal-subject-save').addEventListener('click', async () => {
        const classId = classSelect.value;
        const name = document.getElementById('modal-subject-name').value.trim();
        if (!name) { showToast('Subject name is required', 'error'); return; }

        try {
            await apiFetch('/api/subjects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ class_id: parseInt(classId), name }),
            });
            showToast('Subject added');
            closeModal('subject-modal');
            // Reload subjects
            const subjects = await apiFetch(`/api/subjects?class_id=${classId}`);
            populateSelect(subjectSelect, subjects, 'id', 'name', '— Select Subject —');
        } catch (_) {}
    });

    // ── Add Chapter Modal ───────────────────────────────────────────────

    addChapterBtn.addEventListener('click', () => {
        document.getElementById('modal-chapter-no').value = '';
        document.getElementById('modal-chapter-title').value = '';
        openModal('chapter-modal');
        document.getElementById('modal-chapter-no').focus();
    });

    document.getElementById('modal-chapter-save').addEventListener('click', async () => {
        const subjectId = subjectSelect.value;
        const chapterNo = parseInt(document.getElementById('modal-chapter-no').value);
        const title = document.getElementById('modal-chapter-title').value.trim();
        if (!chapterNo || !title) { showToast('Chapter number and title are required', 'error'); return; }

        try {
            await apiFetch('/api/chapters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject_id: parseInt(subjectId), chapter_no: chapterNo, title }),
            });
            showToast('Chapter added');
            closeModal('chapter-modal');
            // Reload chapters
            const chapters = await apiFetch(`/api/chapters?subject_id=${subjectId}`);
            const items = chapters.map(c => ({ id: c.id, name: `Ch ${c.chapter_no}: ${c.title}` }));
            populateSelect(chapterSelect, items, 'id', 'name', '— Select Chapter —');
        } catch (_) {}
    });

    // ── Auto-expanding Textareas ────────────────────────────────────────

    document.querySelectorAll('.form-textarea').forEach(ta => {
        ta.addEventListener('input', () => {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
        });
    });
});
