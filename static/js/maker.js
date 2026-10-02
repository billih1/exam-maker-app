/**
 * maker.js — Exam Maker workspace (Block → Sub-Part → Questions architecture)
 * ExamForge Local — 100 % Offline Exam Paper Maker
 */

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

async function fetchJSON(url, opts = {}) {
    try {
        const res = await fetch(url, opts);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || res.statusText);
        }
        return res.json();
    } catch (e) {
        showToast(e.message, 'error');
        throw e;
    }
}

function escapeHTML(str) {
    if (!str) return '';
    const d = document.createElement('span');
    d.textContent = str;
    return d.innerHTML;
}

function truncate(text, max) {
    if (!text) return '';
    return text.length > max ? text.substring(0, max) + '…' : text;
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const romans = [
    'i','ii','iii','iv','v','vi','vii','viii','ix','x',
    'xi','xii','xiii','xiv','xv','xvi','xvii','xviii','xix','xx',
    'xxi','xxii','xxiii','xxiv','xxv','xxvi','xxvii','xxviii','xxix','xxx',
];
const letters = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p'];

function toRoman(n)  { return n < romans.length  ? '(' + romans[n]  + ')' : '(' + (n + 1) + ')'; }
function toLetter(n) { return n < letters.length ? '(' + letters[n] + ')' : '(' + (n + 1) + ')'; }

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

const typeMap = {
    mcq:              'MCQs',
    short_q:          'Short Questions',
    long_q:           'Long Questions',
    translation_para: 'Translation Paragraphs',
    letter:           'Letters',
    essay:            'Essays',
    story:            'Stories',
    fill_blank:       'Fill in the Blanks',
    matching:         'Matching Columns',
    true_false:       'True / False',
    diagram:          'Diagrams / Drawings',
};

/** Default marks-per-item for each type */
const defaultMarksFor = {
    mcq: 1, true_false: 1, fill_blank: 1,
    short_q: 2, matching: 2,
    translation_para: 4, letter: 5, essay: 5, story: 5,
    long_q: 5, diagram: 3,
};

// ══════════════════════════════════════════════════════════════════════════════
// State
// ══════════════════════════════════════════════════════════════════════════════

const state = {
    blocks: [],
    // blocks[i] = {
    //   heading: 'OBJECTIVE',
    //   subParts: [
    //     { type: 'mcq', marks: 1, attempt: 5, questionIds: [] }
    //   ]
    // }
    questionData: {},       // qid → question object
    chapters: [],           // [{id, chapter_no, title, subject_id}]
    chapterQuestions: {},    // chapterId → [question, …]
    globalSelected: new Set(),
    logoData: null,         // base64 data URI or null
};

// ══════════════════════════════════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    // Default institute name from settings
    try {
        const inst = await fetchJSON('/api/settings/institute_name');
        if (inst && inst.value) document.getElementById('institute-name').value = inst.value;
    } catch (_) { /* not saved yet */ }

    // Today's date
    document.getElementById('exam-date').value = new Date().toISOString().split('T')[0];

    // Load classes
    const classes = await fetchJSON('/api/classes');
    const classSel = document.getElementById('maker-class');
    classes.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.name;
        classSel.appendChild(o);
    });

    classSel.addEventListener('change', onClassChange);
    document.getElementById('maker-subject').addEventListener('change', onSubjectChange);
    document.getElementById('add-block-btn').addEventListener('click', addBlock);

    // Logo upload
    const logoInput = document.getElementById('logo-upload');
    if (logoInput) {
        logoInput.addEventListener('change', onLogoSelected);
    }
    const removeLogoBtn = document.getElementById('remove-logo-btn');
    if (removeLogoBtn) {
        removeLogoBtn.addEventListener('click', removeLogo);
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// Cascading Dropdowns
// ══════════════════════════════════════════════════════════════════════════════

async function onClassChange() {
    const classId = document.getElementById('maker-class').value;
    const subSel = document.getElementById('maker-subject');
    subSel.innerHTML = '<option value="">— Select Subject —</option>';
    subSel.disabled = true;
    document.getElementById('add-block-btn').disabled = true;
    document.getElementById('blocks-container').innerHTML = '';
    resetState();

    if (!classId) return;
    const subjects = await fetchJSON('/api/subjects?class_id=' + classId);
    subjects.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.name;
        subSel.appendChild(o);
    });
    subSel.disabled = false;
}

async function onSubjectChange() {
    const subjectId = document.getElementById('maker-subject').value;
    document.getElementById('add-block-btn').disabled = true;
    document.getElementById('blocks-container').innerHTML = '';
    resetState();

    if (!subjectId) return;

    // Load chapters + questions
    state.chapters = await fetchJSON('/api/chapters?subject_id=' + subjectId);
    state.chapterQuestions = {};
    await Promise.all(state.chapters.map(async ch => {
        const qs = await fetchJSON('/api/questions?chapter_id=' + ch.id);
        state.chapterQuestions[ch.id] = qs;
        qs.forEach(q => { state.questionData[q.id] = q; });
    }));

    document.getElementById('add-block-btn').disabled = false;
}

function resetState() {
    state.blocks = [];
    state.globalSelected = new Set();
    state.logoData = null;
    updateSummary();
}

// ══════════════════════════════════════════════════════════════════════════════
// Logo Upload
// ══════════════════════════════════════════════════════════════════════════════

function onLogoSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
        state.logoData = ev.target.result; // base64 data URI
        const preview = document.getElementById('logo-preview');
        if (preview) {
            preview.src = state.logoData;
            preview.style.display = 'inline-block';
        }
        const removeBtn = document.getElementById('remove-logo-btn');
        if (removeBtn) removeBtn.style.display = 'inline-block';
        showToast('Logo loaded');
    };
    reader.readAsDataURL(file);
}

function removeLogo() {
    state.logoData = null;
    const preview = document.getElementById('logo-preview');
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    const removeBtn = document.getElementById('remove-logo-btn');
    if (removeBtn) removeBtn.style.display = 'none';
    const input = document.getElementById('logo-upload');
    if (input) input.value = '';
}

// ══════════════════════════════════════════════════════════════════════════════
// Block Management
// ══════════════════════════════════════════════════════════════════════════════

function addBlock() {
    state.blocks.push({
        heading: '',
        totalMarks: '',
        subParts: [],
    });
    renderAllBlocks();
    updateSummary();
}

function removeBlock(blockIdx) {
    state.blocks.splice(blockIdx, 1);
    rebuildGlobalSelected();
    renderAllBlocks();
    updateSummary();
}

function moveBlock(blockIdx, direction) {
    const target = blockIdx + direction;
    if (target < 0 || target >= state.blocks.length) return;
    const temp = state.blocks[blockIdx];
    state.blocks[blockIdx] = state.blocks[target];
    state.blocks[target] = temp;
    renderAllBlocks();
}

function onBlockMarksChange(bi, val) {
    state.blocks[bi].totalMarks = val;
    updateSummary();
}

// ══════════════════════════════════════════════════════════════════════════════
// Sub-Part Management
// ══════════════════════════════════════════════════════════════════════════════

function addSubPart(blockIdx) {
    state.blocks[blockIdx].subParts.push({
        type: 'mcq',
        questionIds: [],
    });
    renderAllBlocks();
    updateSummary();
}

function removeSubPart(blockIdx, spIdx) {
    state.blocks[blockIdx].subParts.splice(spIdx, 1);
    rebuildGlobalSelected();
    renderAllBlocks();
    updateSummary();
}

// ══════════════════════════════════════════════════════════════════════════════
// Global Selected tracking
// ══════════════════════════════════════════════════════════════════════════════

function rebuildGlobalSelected() {
    state.globalSelected = new Set();
    state.blocks.forEach(b => {
        b.subParts.forEach(sp => {
            sp.questionIds.forEach(id => state.globalSelected.add(id));
        });
    });
}

/**
 * Check whether a question id is used in a DIFFERENT sub-part than the one given.
 */
function isUsedElsewhere(qid, blockIdx, spIdx) {
    for (let bi = 0; bi < state.blocks.length; bi++) {
        const sps = state.blocks[bi].subParts;
        for (let si = 0; si < sps.length; si++) {
            if (bi === blockIdx && si === spIdx) continue;
            if (sps[si].questionIds.includes(qid)) return true;
        }
    }
    return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// Render All Blocks
// ══════════════════════════════════════════════════════════════════════════════

function renderAllBlocks() {
    const container = document.getElementById('blocks-container');
    container.innerHTML = '';

    state.blocks.forEach((block, bi) => {
        const card = document.createElement('div');
        card.className = 'block-card';
        card.id = 'block-' + bi;

        // --- Block header with manual Total Marks ---
        card.innerHTML = `
            <div class="block-card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span class="block-number" style="font-weight:700">Q.${bi + 1}</span>
                <input type="text" class="block-heading-input" placeholder="e.g. Choose the correct option / Write short answers"
                       value="${escapeHTML(block.heading || '')}"
                       style="flex:1;min-width:200px"
                       oninput="state.blocks[${bi}].heading = this.value">
                <label style="display:flex;align-items:center;gap:4px;font-size:0.85rem;white-space:nowrap;font-weight:600">
                    Total Marks:
                    <input type="number" class="form-input" style="width:70px;padding:3px 6px"
                           value="${block.totalMarks !== undefined ? block.totalMarks : ''}"
                           placeholder="0" min="0" step="any"
                           oninput="onBlockMarksChange(${bi}, this.value)">
                </label>
                <div class="block-card-actions">
                    ${bi > 0 ? `<button class="btn btn-sm" onclick="moveBlock(${bi},-1)" title="Move up">▲</button>` : ''}
                    ${bi < state.blocks.length - 1 ? `<button class="btn btn-sm" onclick="moveBlock(${bi},1)" title="Move down">▼</button>` : ''}
                    <button class="btn btn-sm btn-danger" onclick="removeBlock(${bi})" title="Delete block">🗑</button>
                </div>
            </div>
            <div class="block-card-body" id="subparts-${bi}"></div>
        `;
        container.appendChild(card);

        const spContainer = card.querySelector('#subparts-' + bi);

        // --- Sub-parts ---
        block.subParts.forEach((sp, si) => {
            renderSubPart(spContainer, bi, si, sp);
        });

        // Add sub-part button
        const addRow = document.createElement('div');
        addRow.className = 'add-subpart-row';
        addRow.innerHTML = `<button class="btn btn-sm btn-primary" onclick="addSubPart(${bi})">➕ Add Sub-Part</button>`;
        spContainer.appendChild(addRow);
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Render Sub-Part
// ══════════════════════════════════════════════════════════════════════════════

function renderSubPart(parentEl, bi, si, sp) {
    const spDiv = document.createElement('div');
    spDiv.className = 'subpart-card';
    spDiv.id = `sp-${bi}-${si}`;

    const selectedCount = sp.questionIds.length;

    // Build type options
    let typeOptions = '';
    for (const [val, label] of Object.entries(typeMap)) {
        typeOptions += `<option value="${val}" ${sp.type === val ? 'selected' : ''}>${label}</option>`;
    }

    spDiv.innerHTML = `
        <div class="subpart-header" style="display:flex;align-items:center;gap:10px">
            <select class="form-select subpart-type-select" data-bi="${bi}" data-si="${si}"
                    onchange="onSubPartTypeChange(${bi}, ${si}, this.value)">
                ${typeOptions}
            </select>
            <span class="subpart-selected-count" style="${selectedCount > 0 ? '' : 'display:none'}">${selectedCount} selected</span>
            <button class="btn btn-sm btn-danger" onclick="removeSubPart(${bi}, ${si})"
                    style="margin-left:auto" title="Remove sub-part">✕</button>
        </div>
        <div class="subpart-body">
            <div class="chapter-accordions" id="accordions-${bi}-${si}"></div>
        </div>
    `;
    parentEl.appendChild(spDiv);

    renderSubPartAccordions(bi, si);
}

// ══════════════════════════════════════════════════════════════════════════════
// Sub-Part Events
// ══════════════════════════════════════════════════════════════════════════════

function onSubPartTypeChange(bi, si, newType) {
    const sp = state.blocks[bi].subParts[si];
    // Deselect questions that were selected here before changing type
    sp.questionIds.forEach(id => state.globalSelected.delete(id));
    sp.questionIds = [];
    sp.type = newType;
    rebuildGlobalSelected();
    renderAllBlocks();
    updateSummary();
}

function updateSubPartCount(bi, si) {
    const sp = state.blocks[bi].subParts[si];
    const selectedCount = sp.questionIds.length;
    const countEl = document.querySelector(`#sp-${bi}-${si} .subpart-selected-count`);
    if (countEl) {
        countEl.textContent = selectedCount + ' selected';
        countEl.style.display = selectedCount > 0 ? 'inline-block' : 'none';
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Chapter Accordions (per sub-part)
// ══════════════════════════════════════════════════════════════════════════════

function renderSubPartAccordions(bi, si) {
    const sp = state.blocks[bi].subParts[si];
    const wrap = document.getElementById(`accordions-${bi}-${si}`);
    if (!wrap) return;
    wrap.innerHTML = '';

    if (state.chapters.length === 0) {
        wrap.innerHTML = '<div class="empty-state">No chapters found. Add chapters in the Question Bank first.</div>';
        return;
    }

    state.chapters.forEach(ch => {
        const allQs = state.chapterQuestions[ch.id] || [];
        const qs = allQs.filter(q => q.item_type === sp.type);
        const selInThisSp = qs.filter(q => sp.questionIds.includes(q.id)).length;

        const acc = document.createElement('div');
        acc.className = 'accordion open';

        acc.innerHTML = `
            <div class="accordion-header" onclick="toggleAccordion(this)">
                <span>
                    Ch ${ch.chapter_no}: ${escapeHTML(ch.title)}
                    <span class="badge" style="background:#e2e8f0;color:#334155;margin-left:6px">${qs.length}</span>
                    <span class="badge ch-selected-badge" id="ch-badge-${bi}-${si}-${ch.id}"
                          style="${selInThisSp > 0 ? '' : 'display:none;'}background:var(--success);color:#fff;margin-left:4px">${selInThisSp} selected</span>
                </span>
                <span style="display:flex;align-items:center;gap:8px">
                    <span class="accordion-arrow">▲</span>
                </span>
            </div>
            <div class="accordion-body" style="display:block">
                <div class="random-pick-row flex gap-1 mb-2" onclick="event.stopPropagation()">
                    <span style="font-size:0.82rem;color:var(--text-muted);display:flex;align-items:center">Pick:</span>
                    <input type="number" class="form-input" style="width:60px;padding:3px 6px;font-size:0.85rem" min="1" max="${qs.length}"
                           id="random-n-${bi}-${si}-${ch.id}" value="${Math.min(1, qs.length || 1)}">
                    <button class="btn btn-sm btn-primary" style="padding:3px 10px;font-size:0.82rem"
                            onclick="randomPick(${bi}, ${si}, ${ch.id})">⚡ Pick Random</button>
                </div>
                <div class="question-list" id="qlist-${bi}-${si}-${ch.id}">
                    ${qs.length === 0
                        ? '<div class="empty-state">No ' + typeMap[sp.type] + ' in this chapter</div>'
                        : qs.map(q => renderQuestionItem(bi, si, q)).join('')}
                </div>
            </div>
        `;
        wrap.appendChild(acc);
    });
}

function renderQuestionItem(bi, si, q) {
    const sp = state.blocks[bi].subParts[si];
    const isSelected = sp.questionIds.includes(q.id);
    const deduped = !isSelected && isUsedElsewhere(q.id, bi, si);

    let extra = '';
    if (q.item_type === 'mcq' && q.option_a) {
        extra = `<div class="mcq-options-row" style="margin-top:4px;padding-left:26px;display:flex;flex-wrap:wrap;gap:8px 16px;color:var(--text-muted);font-size:0.85rem">
            <span><strong>(A)</strong> ${escapeHTML(q.option_a)}</span>
            <span><strong>(B)</strong> ${escapeHTML(q.option_b)}</span>
            <span><strong>(C)</strong> ${escapeHTML(q.option_c)}</span>
            <span><strong>(D)</strong> ${escapeHTML(q.option_d)}</span>
        </div>`;
    }
    if (q.item_type === 'true_false') {
        extra = `<div style="margin-top:4px;padding-left:26px;color:var(--text-muted);font-size:0.85rem">
            <strong>Answer:</strong> ${escapeHTML(q.correct_option || '—')}
        </div>`;
    }

    return `
        <div class="checkbox-item${isSelected ? ' is-selected' : ''}${deduped ? ' dedup-disabled' : ''}" id="qi-${bi}-${si}-${q.id}">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;width:100%;margin:0">
                <input type="checkbox" class="q-check" data-bi="${bi}" data-si="${si}" data-qid="${q.id}" data-chid="${q.chapter_id}"
                       ${isSelected ? 'checked' : ''} ${deduped ? 'disabled' : ''}
                       onchange="onCheckChange(${bi}, ${si}, ${q.id}, ${q.chapter_id}, this.checked)">
                <span class="q-statement-text${q.is_urdu_script ? ' urdu-text' : ''}" style="flex:1;line-height:1.4">${escapeHTML(q.statement)}</span>
            </label>
            ${extra}
        </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Accordion Toggle
// ══════════════════════════════════════════════════════════════════════════════

function toggleAccordion(header) {
    const acc = header.closest('.accordion');
    const body = header.nextElementSibling;
    const arrow = header.querySelector('.accordion-arrow');
    if (body.style.display === 'none') {
        body.style.display = 'block';
        if (acc) acc.classList.add('open');
        if (arrow) arrow.textContent = '▲';
    } else {
        body.style.display = 'none';
        if (acc) acc.classList.remove('open');
        if (arrow) arrow.textContent = '▼';
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Selection Logic
// ══════════════════════════════════════════════════════════════════════════════

function onCheckChange(bi, si, qid, chapterId, checked) {
    const sp = state.blocks[bi].subParts[si];
    if (checked) {
        if (!sp.questionIds.includes(qid)) sp.questionIds.push(qid);
        state.globalSelected.add(qid);
    } else {
        sp.questionIds = sp.questionIds.filter(id => id !== qid);
        rebuildGlobalSelected();
    }

    // Update item container styling in DOM
    const itemEl = document.getElementById(`qi-${bi}-${si}-${qid}`);
    if (itemEl) {
        itemEl.classList.toggle('is-selected', checked);
    }

    // Update chapter selected count badge in header
    if (chapterId) {
        const chQs = (state.chapterQuestions[chapterId] || []).filter(q => q.item_type === sp.type);
        const countInCh = chQs.filter(q => sp.questionIds.includes(q.id)).length;
        const badge = document.getElementById(`ch-badge-${bi}-${si}-${chapterId}`);
        if (badge) {
            if (countInCh > 0) {
                badge.textContent = `${countInCh} selected`;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    updateSummary();
    refreshDedupStates();
    updateSubPartCount(bi, si);
}

function randomPick(bi, si, chapterId) {
    const sp = state.blocks[bi].subParts[si];
    const nInput = document.getElementById(`random-n-${bi}-${si}-${chapterId}`);
    const n = parseInt(nInput.value) || 1;
    const qs = (state.chapterQuestions[chapterId] || []).filter(q => q.item_type === sp.type);
    // Only pick from questions not yet selected in this sub-part AND not dedup-blocked
    const available = qs.filter(q => !sp.questionIds.includes(q.id) && !isUsedElsewhere(q.id, bi, si));

    if (available.length === 0) {
        showToast('No more available questions in this chapter', 'error');
        return;
    }

    const picks = shuffleArray(available).slice(0, n);
    picks.forEach(q => {
        sp.questionIds.push(q.id);
        state.globalSelected.add(q.id);

        // Update DOM checkbox and styling directly
        const itemEl = document.getElementById(`qi-${bi}-${si}-${q.id}`);
        if (itemEl) {
            itemEl.classList.add('is-selected');
            const cb = itemEl.querySelector('.q-check');
            if (cb) cb.checked = true;
        }
    });

    // Update chapter badge
    const countInCh = qs.filter(q => sp.questionIds.includes(q.id)).length;
    const badge = document.getElementById(`ch-badge-${bi}-${si}-${chapterId}`);
    if (badge) {
        badge.textContent = `${countInCh} selected`;
        badge.style.display = 'inline-block';
    }

    updateSummary();
    updateSubPartCount(bi, si);
    refreshDedupStates();
    showToast('Picked ' + picks.length + ' random question' + (picks.length > 1 ? 's' : ''));
}

/**
 * Refresh dedup-disabled state across ALL sub-parts without full re-render.
 * Uses DOM updates for performance.
 */
function refreshDedupStates() {
    state.blocks.forEach((block, bi) => {
        block.subParts.forEach((sp, si) => {
            const wrap = document.getElementById(`accordions-${bi}-${si}`);
            if (!wrap) return;
            wrap.querySelectorAll('.checkbox-item').forEach(el => {
                const cb = el.querySelector('.q-check');
                if (!cb) return;
                const qid = parseInt(cb.dataset.qid);
                const isSelected = sp.questionIds.includes(qid);
                const deduped = !isSelected && isUsedElsewhere(qid, bi, si);

                if (deduped) {
                    el.classList.add('dedup-disabled');
                    cb.disabled = true;
                    cb.checked = false;
                } else {
                    el.classList.remove('dedup-disabled');
                    cb.disabled = false;
                    cb.checked = isSelected;
                }
            });
        });
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════════

function updateSummary() {
    let totalQ = 0, totalM = 0;
    state.blocks.forEach(b => {
        b.subParts.forEach(sp => {
            totalQ += sp.questionIds.length;
        });
        totalM += parseFloat(b.totalMarks) || 0;
    });
    document.getElementById('summary-count').textContent = totalQ;
    document.getElementById('summary-marks').textContent = totalM;
    document.getElementById('total-marks-display').value = totalM;
}

// ══════════════════════════════════════════════════════════════════════════════
// Reset All
// ══════════════════════════════════════════════════════════════════════════════

function resetAll() {
    if (!confirm('Clear all blocks and selections?')) return;
    state.blocks = [];
    state.globalSelected = new Set();
    document.getElementById('blocks-container').innerHTML = '';
    updateSummary();
    showToast('All blocks cleared');
}

// ══════════════════════════════════════════════════════════════════════════════
// Preview Drawer
// ══════════════════════════════════════════════════════════════════════════════

function openPreview() {
    if (state.blocks.length === 0) {
        showToast('Add at least one block first', 'error');
        return;
    }
    const hasAny = state.blocks.some(b => b.subParts.some(sp => sp.questionIds.length > 0));
    if (!hasAny) {
        showToast('Select at least one question', 'error');
        return;
    }

    document.getElementById('preview-content').innerHTML = buildPreviewHTML();
    document.getElementById('preview-drawer').classList.add('open');
    document.getElementById('preview-overlay').classList.add('open');
}

function closePreview() {
    document.getElementById('preview-drawer').classList.remove('open');
    document.getElementById('preview-overlay').classList.remove('open');
}

function buildPreviewHTML() {
    const institute = document.getElementById('institute-name').value || 'Institute Name';
    const examTitle = document.getElementById('exam-title').value || 'Examination';
    const timeAllowed = document.getElementById('time-allowed').value || '';
    const totalMarks = document.getElementById('summary-marks').textContent;
    const examDate = document.getElementById('exam-date').value || '';
    const syllabusNote = document.getElementById('syllabus-note').value || '';
    const subjectEl = document.getElementById('maker-subject');
    const subjectName = subjectEl.options[subjectEl.selectedIndex]?.text || '';
    const classEl = document.getElementById('maker-class');
    const classRaw = classEl.options[classEl.selectedIndex]?.text || '';
    const className = classRaw.replace(/^class\s+/i, '');
    const includeKey = document.getElementById('include-answer-key').checked;

    // --- Header ---
    let html = `<div class="exam-container">
        <div class="print-header">
            ${state.logoData ? `<div style="text-align:center;margin-bottom:4px"><img src="${state.logoData}" class="institute-logo" alt="Logo"></div>` : ''}
            <div class="institute-name">${escapeHTML(institute)}</div>
            <div class="exam-title-header">${escapeHTML(examTitle)}</div>
        </div>
        <div class="paper-meta-strip">
            <table class="meta-table">
                <tr>
                    <td><strong>Name:</strong> _______________</td>
                    <td><strong>Roll No:</strong> __________</td>
                    <td><strong>Class:</strong> ${escapeHTML(className)}</td>
                    <td><strong>Subject:</strong> ${escapeHTML(subjectName)}</td>
                </tr>
                <tr>
                    <td><strong>Total Marks:</strong> ${totalMarks}</td>
                    <td><strong>Obtained Marks:</strong> _____</td>
                    <td><strong>Time Allowed:</strong> ${escapeHTML(timeAllowed)}</td>
                    <td><strong>Date:</strong> ${escapeHTML(examDate)}</td>
                </tr>
            </table>
        </div>
        ${syllabusNote ? `<p class="syllabus-note">${escapeHTML(syllabusNote)}</p>` : ''}
    `;

    let answerKeyData = [];

    // --- Blocks ---
    state.blocks.forEach((block, bi) => {
        const hasQuestions = block.subParts.some(sp => sp.questionIds.length > 0);
        if (!hasQuestions) return;

        // Block heading with optional teacher-assigned marks
        const headingText = block.heading || '';
        const marksStr = (block.totalMarks !== undefined && block.totalMarks !== '' && block.totalMarks !== null) ? `<span style="float:right;font-weight:bold">${escapeHTML(String(block.totalMarks))}</span>` : '';
        html += `<div class="block-heading" style="overflow:hidden">${marksStr}Q.${bi + 1}${headingText ? ': ' + escapeHTML(headingText) : ''}</div>`;

        // Sub-parts
        block.subParts.forEach((sp, si) => {
            if (sp.questionIds.length === 0) return;

            // Questions
            if (sp.type === 'mcq') {
                html += '<div class="mcq-section">';
                sp.questionIds.forEach((qid, qi) => {
                    const q = state.questionData[qid];
                    if (!q) return;
                    html += `<div class="mcq-item">
                        <div class="mcq-statement">${toRoman(qi)} ${escapeHTML(q.statement)}</div>
                        <div class="mcq-options">
                            <span class="mcq-option">(A) ${escapeHTML(q.option_a)}</span>
                            <span class="mcq-option">(B) ${escapeHTML(q.option_b)}</span>
                            <span class="mcq-option">(C) ${escapeHTML(q.option_c)}</span>
                            <span class="mcq-option">(D) ${escapeHTML(q.option_d)}</span>
                        </div>
                    </div>`;
                    answerKeyData.push({
                        block: bi + 1,
                        num: romans[qi] || String(qi + 1),
                        answer: q.correct_option || '—',
                    });
                });
                html += '</div>';
            } else if (sp.type === 'translation_para') {
                sp.questionIds.forEach((qid, qi) => {
                    const q = state.questionData[qid];
                    if (!q) return;
                    const rtl = q.is_urdu_script ? ' urdu-text' : '';
                    html += `<div class="translation-block">
                        <div class="para-numeral">${toRoman(qi)}</div>
                        <div class="para-text${rtl}">${escapeHTML(q.statement)}</div>
                    </div>`;
                });
            } else {
                // All other subjective types
                sp.questionIds.forEach((qid, qi) => {
                    const q = state.questionData[qid];
                    if (!q) return;
                    const rtl = q.is_urdu_script ? ' urdu-text' : '';
                    html += `<div class="subjective-item">
                        <span class="roman-numeral">${toRoman(qi)}</span>
                        <span class="question-text${rtl}">${escapeHTML(q.statement)}</span>
                    </div>`;
                });
            }
        });

    });

    // --- Answer Key ---
    if (includeKey && answerKeyData.length > 0) {
        html += `<div class="answer-key-box">
            <div class="answer-key-title">Answer Key — Objective</div>
            <div class="answer-key-grid">`;
        answerKeyData.forEach(item => {
            html += `<span class="key-cell">(${item.num}) ${item.answer}</span>`;
        });
        html += '</div></div>';
    }

    html += '</div>';
    return html;
}

// ══════════════════════════════════════════════════════════════════════════════
// Build Config Object
// ══════════════════════════════════════════════════════════════════════════════

function buildConfigJSON() {
    const classEl = document.getElementById('maker-class');
    const subjectEl = document.getElementById('maker-subject');

    return {
        className: (classEl.options[classEl.selectedIndex]?.text || '').replace(/^class\s+/i, ''),
        subjectName: subjectEl.options[subjectEl.selectedIndex]?.text || '',
        examDate: document.getElementById('exam-date').value || '',
        syllabusNote: document.getElementById('syllabus-note').value || '',
        logoData: state.logoData || '',
        includeAnswerKey: document.getElementById('include-answer-key').checked,
        blocks: state.blocks.map(b => ({
            heading: b.heading,
            totalMarks: b.totalMarks !== undefined && b.totalMarks !== '' ? parseFloat(b.totalMarks) || 0 : '',
            subParts: b.subParts.map(sp => ({
                type: sp.type,
                questionIds: sp.questionIds.slice(),
            })),
        })),
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// Save Paper
// ══════════════════════════════════════════════════════════════════════════════

function openSaveModal() {
    const examTitle = document.getElementById('exam-title').value;
    const subjectEl = document.getElementById('maker-subject');
    const subjectName = subjectEl.options[subjectEl.selectedIndex]?.text || '';
    const totalMarks = document.getElementById('summary-marks').textContent;

    if (!examTitle) {
        showToast('Please enter an exam title', 'error');
        return;
    }
    if (!subjectEl.value) {
        showToast('Please select a subject', 'error');
        return;
    }
    if (state.blocks.length === 0) {
        showToast('Add at least one block', 'error');
        return;
    }
    const hasAny = state.blocks.some(b => b.subParts.some(sp => sp.questionIds.length > 0));
    if (!hasAny) {
        showToast('Select at least one question', 'error');
        return;
    }

    document.getElementById('save-modal-title').textContent = examTitle;
    document.getElementById('save-modal-subject').textContent = subjectName;
    document.getElementById('save-modal-marks').textContent = totalMarks;
    document.getElementById('save-modal-blocks').textContent = state.blocks.length + ' block(s)';
    document.getElementById('save-modal').style.display = 'flex';
}

function closeSaveModal() {
    document.getElementById('save-modal').style.display = 'none';
}

async function confirmSave() {
    const subjectId = document.getElementById('maker-subject').value;
    const examTitle = document.getElementById('exam-title').value;
    const institute = document.getElementById('institute-name').value;
    const timeAllowed = document.getElementById('time-allowed').value;
    const totalMarks = parseFloat(document.getElementById('summary-marks').textContent) || 0;

    const configJson = buildConfigJSON();

    try {
        const result = await fetchJSON('/api/save-exam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject_id: parseInt(subjectId),
                exam_title: examTitle,
                institute_name: institute,
                time_allowed: timeAllowed,
                total_marks: totalMarks,
                config_json: JSON.stringify(configJson),
            }),
        });

        closeSaveModal();
        showToast('Paper saved successfully!');

        if (result.id) {
            if (confirm('Paper saved! Open print preview?')) {
                window.open('/print-paper/' + result.id, '_blank');
            }
        }
        return result;
    } catch (e) {
        showToast('Failed to save: ' + e.message, 'error');
        return null;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Print
// ══════════════════════════════════════════════════════════════════════════════

async function printPaper() {
    const subjectId = document.getElementById('maker-subject').value;
    if (!subjectId) {
        showToast('Select a subject first', 'error');
        return;
    }
    const examTitle = document.getElementById('exam-title').value;
    if (!examTitle) {
        showToast('Please enter an exam title', 'error');
        return;
    }
    const hasAny = state.blocks.some(b => b.subParts.some(sp => sp.questionIds.length > 0));
    if (!hasAny) {
        showToast('Select at least one question', 'error');
        return;
    }
    // Save first, then open print view
    await confirmSave();
}

function printFromPreview() {
    const content = document.getElementById('preview-content').innerHTML;
    const printWin = window.open('', '_blank');
    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Print Exam Paper</title>
    <link rel="stylesheet" href="/static/css/print.css">
    <style>
        body { margin: 0; padding: 20px; font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; }
        .no-print { display: none !important; }
        @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
        }
    </style>
</head>
<body>${content}</body>
</html>`);
    printWin.document.close();
    setTimeout(() => { printWin.print(); }, 400);
}
