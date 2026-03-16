// ── CONFIG ──────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:8000';

// ── STATE ────────────────────────────────────────────────────────────────────
let state = {
    step: 'setup',       // setup | loading | interview | results
    resumeText: '',
    questions: [],
    currentIndex: 0,
    answers: {},         // { [index]: string }
    results: [],         // evaluated results in order
    autoSelectCount: false,
    voiceMode: false,
    timerMode: false,
    timePerQuestion: 120
};

// ── DOM HELPERS ───────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showStep(stepName) {
    ['setup', 'loading', 'interview', 'results'].forEach(s => {
        const el = $(`step-${s}`);
        if (el) el.classList.add('hidden');
    });
    const target = $(`step-${stepName}`);
    if (target) target.classList.remove('hidden');
    state.step = stepName;
}

function showLoader(id) {
    const el = $(id);
    if (el) el.classList.remove('hidden');
}

function hideLoader(id) {
    const el = $(id);
    if (el) el.classList.add('hidden');
}

function showError(msg) {
    const el = $('error-toast');
    if (el) {
        el.textContent = '⚠️ ' + msg;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 5000);
    } else {
        alert(msg);
    }
}

function showSuccess(msg) {
    const el = $('success-toast');
    if (el) {
        el.textContent = '✅ ' + msg;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 4000);
    }
}

// ── API FUNCTIONS ─────────────────────────────────────────────────────────────
async function parseResume(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/upload_resume`, {
        method: 'POST',
        body: formData
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Upload failed (${res.status})`);
    }
    return await res.json();
}

async function generateQuestions(resumeText, jobDescription, difficulty, numQuestions, autoSelectCount) {
    const sessionJobRole = sessionStorage.getItem('jobRole')?.trim();
    if (!sessionJobRole) {
        showError('Job role is missing. Please go back and enter a job role.');
        return;
    }

    const res = await fetch(`${API_BASE}/generate_questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            resume_text: resumeText,
            job_description: jobDescription,
            difficulty: difficulty,
            num_questions: numQuestions,
            auto_select_count: autoSelectCount
        })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 422) throw new Error('Invalid input: ' + JSON.stringify(err.detail));
        throw new Error(err.detail || `Question generation failed (${res.status})`);
    }
    return await res.json();
}

async function evaluateAnswer(question, answer) {
    const res = await fetch(`${API_BASE}/evaluate_answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Evaluation failed (${res.status})`);
    }
    return await res.json();
}

// ── UPLOAD LOGIC ──────────────────────────────────────────────────────────────
function initUpload() {
    const dropZone = $('drop-zone');
    const resumeInput = $('resume-upload');
    const fileInfo = $('file-info');
    const startBtn = $('start-btn');

    if (!dropZone || !resumeInput) return;

    dropZone.addEventListener('click', () => resumeInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--accent-color)';
        dropZone.style.background = 'rgba(124, 77, 255, 0.08)';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = '';
        dropZone.style.background = '';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '';
        dropZone.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file) processSelectedFile(file);
    });

    resumeInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) processSelectedFile(file);
    });

    async function processSelectedFile(file) {
        const allowedTypes = ['.pdf', '.docx', '.txt'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!allowedTypes.includes(ext)) {
            showError('Please upload a PDF, DOCX, or TXT file.');
            return;
        }

        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        fileInfo.innerHTML = `
            <div style="color: var(--accent-color); font-weight: 600;">✓ ${file.name}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">${sizeMB} MB — Uploading...</div>
        `;
        startBtn.disabled = true;

        try {
            const data = await parseResume(file);
            state.resumeText = data.extracted_text || '';
            fileInfo.innerHTML = `
                <div style="color: var(--success); font-weight: 600;">✓ ${file.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">${sizeMB} MB — Ready!</div>
            `;
            startBtn.disabled = false;
            showSuccess('Resume parsed successfully!');
        } catch (err) {
            fileInfo.innerHTML = `<p>Click or drag your resume (PDF, DOCX, TXT) here</p>`;
            showError('Failed to parse resume: ' + err.message);
        }
    }
}

// ── DIFFICULTY PILLS ──────────────────────────────────────────────────────────
function initDifficultyPills() {
    const pills = document.querySelectorAll('.difficulty-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
        });
    });
}

function getSelectedDifficulty() {
    const activePill = document.querySelector('.difficulty-pill.active');
    return activePill ? activePill.dataset.value : 'mixed';
}

// ── QUESTION COUNT SYNC ───────────────────────────────────────────────────────
function initQuestionCountSync() {
    const numInput = $('count-input');
    const rangeSlider = $('count-range');
    const aiToggle = $('ai-optimized-toggle');
    const manualControls = $('manual-count-controls');

    if (!numInput || !rangeSlider) return;

    numInput.addEventListener('input', () => {
        let v = Math.min(20, Math.max(1, parseInt(numInput.value) || 1));
        numInput.value = v;
        rangeSlider.value = v;
    });
    rangeSlider.addEventListener('input', () => {
        numInput.value = rangeSlider.value;
    });

    if (aiToggle && manualControls) {
        aiToggle.addEventListener('change', () => {
            state.autoSelectCount = aiToggle.checked;
            manualControls.style.display = aiToggle.checked ? 'none' : 'block';
        });
    }
}

// ── INTERVIEW START ───────────────────────────────────────────────────────────
function initStartButton() {
    const startBtn = $('start-btn');
    if (!startBtn) return;

    const jobRoleInput = $('job-role-input');
    const jobRoleError = $('job-role-error');

    // Clear error state on typing
    if (jobRoleInput) {
        jobRoleInput.addEventListener('input', () => {
            jobRoleInput.classList.remove('input-error');
            if (jobRoleError) jobRoleError.classList.remove('error-visible');
        });
    }

    startBtn.addEventListener('click', async () => {
        const jobRole = jobRoleInput ? jobRoleInput.value.trim() : '';

        // Frontend validation guard
        if (!jobRole) {
            if (jobRoleInput) jobRoleInput.classList.add('input-error');
            if (jobRoleError) jobRoleError.classList.add('error-visible');
            return;
        }

        sessionStorage.setItem('jobRole', jobRole);

        let jd = $('jd-input') ? $('jd-input').value.trim() : '';
        // Pass job role within job description since backend doesn't explicitly accept it
        if (jobRole) {
            jd = `Target Job Role: ${jobRole}\n\n${jd}`;
        }

        const difficulty = getSelectedDifficulty();
        const numQ = state.autoSelectCount ? 5 : parseInt($('count-input') ? $('count-input').value : '5');
        const voiceToggle = $('voice-toggle');
        const timerToggle = $('timer-toggle');

        state.voiceMode = voiceToggle ? voiceToggle.checked : false;
        state.timerMode = timerToggle ? timerToggle.checked : false;

        showStep('loading');
        $('loading-text').innerText = 'Generating your interview questions...';

        try {
            const data = await generateQuestions(
                state.resumeText, jd, difficulty, numQ, state.autoSelectCount
            );
            if (!data.questions || data.questions.length === 0) {
                throw new Error('No questions were generated. Please try again.');
            }
            state.questions = data.questions;
            state.currentIndex = 0;
            state.answers = {};
            state.results = [];
            showStep('interview');
            renderQuestion();
        } catch (err) {
            showError(err.message);
            showStep('setup');
        }
    });
}

// ── TIMER ─────────────────────────────────────────────────────────────────────
let timerInterval = null;

function startTimer(seconds) {
    clearInterval(timerInterval);
    let timeLeft = seconds;
    updateTimerDisplay(timeLeft);
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            // Auto-submit on timer end
            handleSubmitCurrentAnswer(true);
        }
    }, 1000);
}

function updateTimerDisplay(secs) {
    const el = $('timer-display');
    if (!el) return;
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    el.innerText = `${m}:${s}`;
    el.style.color = secs <= 10 ? 'var(--error)' : 'var(--accent-color)';
}

// ── VOICE ─────────────────────────────────────────────────────────────────────
function speakQuestion(text) {
    if (!state.voiceMode || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || voices[0];
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
}

// ── RENDER QUESTION ───────────────────────────────────────────────────────────
function renderQuestion() {
    const q = state.questions[state.currentIndex];
    const total = state.questions.length;
    const idx = state.currentIndex;

    // Question counter
    const counter = $('q-counter');
    if (counter) counter.innerText = `Question ${idx + 1} of ${total}`;

    // Question text
    $('current-question').innerText = q.text;

    // Type tag
    const qTag = $('q-tag');
    qTag.innerText = q.type;
    qTag.className = `question-tag tag-${q.type.toLowerCase()}`;

    // Difficulty badge
    const diffBadge = $('q-diff-badge');
    if (diffBadge) {
        diffBadge.innerText = q.difficulty;
        diffBadge.className = `diff-badge diff-${q.difficulty}`;
    }

    // Progress bar
    const progress = (idx / total) * 100;
    const fill = $('progress-fill');
    if (fill) fill.style.width = `${progress}%`;

    // Answer textarea – switch between code and text mode
    const answerInput = $('answer-input');
    const editorBadge = $('editor-badge');

    if (q.type === 'coding') {
        answerInput.classList.add('code-textarea');
        answerInput.placeholder = '// Write your code here...';
        answerInput.spellcheck = false;
        if (editorBadge) editorBadge.classList.remove('hidden');
    } else {
        answerInput.classList.remove('code-textarea');
        answerInput.placeholder = 'Type your answer here...';
        answerInput.spellcheck = true;
        if (editorBadge) editorBadge.classList.add('hidden');
    }

    // Restore saved answer (if navigating back)
    answerInput.value = state.answers[idx] || (q.type === 'coding' && q.initial_code ? q.initial_code : '');
    $('char-count').innerText = `${answerInput.value.length} characters`;

    // Previous button
    const prevBtn = $('prev-btn');
    if (prevBtn) prevBtn.disabled = idx === 0;

    // Submit/Next button label
    const submitBtn = $('submit-answer-btn');
    if (submitBtn) {
        submitBtn.innerText = idx === total - 1 ? 'Submit All Answers →' : 'Next Question →';
    }

    // Timer
    if (state.timerMode) {
        const disp = $('timer-display');
        if (disp) disp.style.display = 'block';
        startTimer(state.timePerQuestion);
    } else {
        const disp = $('timer-display');
        if (disp) disp.style.display = 'none';
        clearInterval(timerInterval);
    }

    // Voice
    const voiceControls = $('voice-controls');
    if (state.voiceMode) {
        if (voiceControls) voiceControls.style.display = 'flex';
        speakQuestion(q.text);
    } else {
        if (voiceControls) voiceControls.style.display = 'none';
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function saveCurrentAnswer() {
    const answerInput = $('answer-input');
    if (answerInput) {
        state.answers[state.currentIndex] = answerInput.value;
    }
}

async function handleSubmitCurrentAnswer(timedOut = false) {
    clearInterval(timerInterval);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    saveCurrentAnswer();

    const isLastQuestion = state.currentIndex === state.questions.length - 1;

    if (isLastQuestion) {
        // Evaluate all answers in parallel
        showStep('loading');
        $('loading-text').innerText = 'Evaluating all your answers...';

        try {
            const evaluationPromises = state.questions.map(async (q, i) => {
                const answer = state.answers[i] || (timedOut && i === state.currentIndex ? 'No answer provided.' : 'No answer provided.');
                const result = await evaluateAnswer(q.text, answer);
                return { question: q.text, type: q.type, difficulty: q.difficulty, answer: state.answers[i] || '', ...result };
            });

            state.results = await Promise.all(evaluationPromises);
            showStep('results');
            renderResults();
        } catch (err) {
            showError('Failed to evaluate answers: ' + err.message);
            showStep('interview');
        }
    } else {
        state.currentIndex++;
        renderQuestion();
    }
}

function initInterviewButtons() {
    const submitBtn = $('submit-answer-btn');
    const prevBtn = $('prev-btn');
    const answerInput = $('answer-input');

    if (submitBtn) {
        submitBtn.addEventListener('click', () => handleSubmitCurrentAnswer(false));
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            saveCurrentAnswer();
            if (state.currentIndex > 0) {
                clearInterval(timerInterval);
                state.currentIndex--;
                renderQuestion();
            }
        });
    }

    if (answerInput) {
        answerInput.addEventListener('input', (e) => {
            $('char-count').innerText = `${e.target.value.length} characters`;
        });
    }

    // Voice buttons
    const readQuestionBtn = $('read-question-btn');
    if (readQuestionBtn) {
        readQuestionBtn.addEventListener('click', () => {
            const q = state.questions[state.currentIndex];
            if (q) speakQuestion(q.text);
        });
    }

    const recordAnswerBtn = $('record-answer-btn');
    if (recordAnswerBtn) {
        recordAnswerBtn.addEventListener('click', () => {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) return showError('Speech recognition not supported in this browser.');

            const recognition = new SpeechRecognition();
            recognition.lang = 'en-US';
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.start();

            recordAnswerBtn.innerText = '🔴 Listening...';

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                const input = $('answer-input');
                input.value += (input.value ? ' ' : '') + transcript;
                $('char-count').innerText = `${input.value.length} characters`;
            };

            recognition.onend = () => { recordAnswerBtn.innerText = '🎤 Start Recording'; };
            recognition.onerror = () => {
                recordAnswerBtn.innerText = '🎤 Start Recording';
                showError('Speech recognition error. Please try again.');
            };
        });
    }
}

// ── RESULTS ───────────────────────────────────────────────────────────────────
function renderResults() {
    const results = state.results;
    const totalScore = results.reduce((sum, r) => sum + (r.score || 0), 0);
    const avg = results.length ? Math.round(totalScore / results.length) : 0;
    const strongCount = results.filter(r => r.score >= 7).length;

    // Score circle
    const avgScoreEl = $('avg-score');
    if (avgScoreEl) {
        avgScoreEl.innerText = avg;
        avgScoreEl.parentElement.style.borderColor = avg >= 7 ? 'var(--success)' : (avg >= 5 ? 'var(--accent-color)' : 'var(--error)');
    }

    // Stats grid
    const statsGrid = $('stats-grid');
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div class="stat-card">
                <span class="stat-number">${results.length}</span>
                <span class="stat-label">Questions Answered</span>
            </div>
            <div class="stat-card">
                <span class="stat-number" style="color: var(--success)">${strongCount}</span>
                <span class="stat-label">Strong Answers (7+)</span>
            </div>
        `;
    }

    // Per-question results
    const feedbackList = $('feedback-list');
    feedbackList.innerHTML = '';

    results.forEach((res, idx) => {
        const scoreColor = res.score >= 7 ? 'var(--success)' : (res.score >= 5 ? '#ffc107' : 'var(--error)');
        const typeClass = `tag-${(res.type || 'technical').toLowerCase()}`;
        const diffClass = `diff-${(res.difficulty || 'medium').toLowerCase()}`;

        const card = document.createElement('div');
        card.className = 'card result-card';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 16px;">
                <div style="flex: 1;">
                    <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
                        <span class="question-tag ${typeClass}">${res.type || 'technical'}</span>
                        <span class="diff-badge ${diffClass}">${res.difficulty || 'medium'}</span>
                    </div>
                    <h3 style="line-height: 1.4; font-size: 1rem;">${res.question}</h3>
                </div>
                <span class="result-score" style="color: ${scoreColor};">${res.score}/10</span>
            </div>

            <div class="feedback-section">
                <div class="answer-block">
                    <h4>Your Answer</h4>
                    <p style="color: var(--text-secondary); font-style: italic; margin-bottom: 15px;">"${res.answer || 'No answer provided.'}"</p>
                </div>

                <div class="result-grid">
                    <div class="result-col feedback-col">
                        <h4>Feedback</h4>
                        <p>${res.feedback || 'No feedback.'}</p>
                    </div>
                    ${res.improvements ? `
                    <div class="result-col improvements-col">
                        <h4>Key Improvements</h4>
                        <p>${res.improvements}</p>
                    </div>` : ''}
                </div>

                ${res.ideal_answer ? `
                <div class="ideal-answer-block">
                    <h4 style="color: var(--accent-color);">💡 Ideal Answer</h4>
                    <p>${res.ideal_answer}</p>
                </div>` : ''}

                ${res.missing_keywords && res.missing_keywords.length ? `
                <div style="margin-top: 12px;">
                    <h4 style="margin-bottom: 8px;">Missing Keywords</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${res.missing_keywords.map(k => `<span class="keyword-tag">${k}</span>`).join('')}
                    </div>
                </div>` : ''}
            </div>
        `;
        feedbackList.appendChild(card);
    });
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initUpload();
    initDifficultyPills();
    initQuestionCountSync();
    initStartButton();
    initInterviewButtons();
});
