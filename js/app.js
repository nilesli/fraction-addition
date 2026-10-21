/**
 * Fraction Addition Practice — UI controller
 */
(function () {
  'use strict';

  const STORAGE_ID = 'frac_add_student_id';
  const STORAGE_STREAK = 'frac_add_streaks';

  const safeStorage = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* file:// / private */ } },
  };

  const state = {
    studentId: '',
    level: 1,
    question: null,
    steps: [],
    currentStep: 0,
    complete: false,
    hintOpen: true,
    mascotState: 'wave', // wave | guide | think | thumbsup | celebrate
    streaks: { 1: 0, 2: 0, 3: 0 },
    l1Stage: 'A', // A | B | C
    l2Stage: 'A', // A=真分數 | B=帶分數 | C=約分
    stageStreak: 0, // correct-in-a-row within current L1/L2 stage
    stageBIndex: 0, // for alternating mixed types in Stage B
    lastQuestionFp: null, // avoid consecutive identical questions
    wrongCounts: {}, // `${stepIndex}:${fieldKey}` -> count
    questionMistakes: 0, // total wrong attempts this question
    questionAutoRevealed: false, // 連錯三次自動顯示答案 → 整題記為錯誤
    partConsecutiveWrongs: {}, // partKey -> 連續答錯次數（每部分獨立）
    questionStartedAt: 0, // Date.now() when solving starts
    pendingStageAdvance: null, // 'B' | 'C' | 'done' after celebration
    hintGuideStage: 0, // 0要通分 1短除+乘數 2擴分
    hintGuideDone: false,
    lastSubmittedAnswer: null, // {w,n,d} form student actually entered on final check
    lastPlayRecord: null, // last record payload for retry upload
    playSessionId: null, // groups stage records from one practice visit
  };

  const MASCOT_FILES = {
    wave: 'assets/mascot-wave.png',
    guide: 'assets/mascot-guide.png',
    think: 'assets/mascot-think.png',
    thumbsup: 'assets/mascot-thumbsup.png',
    celebrate: 'assets/mascot-celebrate.png',
  };

  const L1_STAGE_META = {
    A: { label: '第一關・真分數', short: '第一關', next: 'B', nextLabel: '第二關・帶分數' },
    B: { label: '第二關・帶分數', short: '第二關', next: 'C', nextLabel: '第三關・約分' },
    C: { label: '第三關・約分', short: '第三關', next: null, nextLabel: null },
  };
  const L2_STAGE_META = {
    A: { label: '第一關・異分母真分數', short: '第一關', next: 'B', nextLabel: '第二關・異分母帶分數' },
    B: { label: '第二關・異分母帶分數', short: '第二關', next: 'C', nextLabel: '第三關・約分' },
    C: { label: '第三關・約分', short: '第三關', next: null, nextLabel: null },
  };
  const STAGE_STREAK_NEED = 3;
  const L2_STAGE_STREAK_NEED = 2; // 級別二連對兩題（含提示流程）即可升級
  const MASCOT_EMOJI = {
    wave: '👋',
    guide: '📖',
    think: '🤔',
    thumbsup: '👍',
    celebrate: '🎉',
  };

  // ---------- 分子／分母／整數 color helpers ----------
  function fieldRole(key) {
    if (!key) return null;
    if (key === 'need_simp') return null;
    // 約分除數格：白底黑框，不套分子／分母色
    if (key === 'simp_div_n' || key === 'simp_div_d') return null;
    if (
      key === 'whole_sum' ||
      key === 'final_w' ||
      key === 'final_w_only' ||
      key === 'mix_w' ||
      key === 'carry_w' ||
      key.endsWith('_w')
    ) {
      return 'whole';
    }
    if (
      key === 'd1' ||
      key === 'd2' ||
      key === 'denom_check' ||
      key.endsWith('_d') ||
      key.includes('denom')
    ) {
      return 'den';
    }
    if (
      key.endsWith('_n') ||
      key.includes('num') ||
      key === 'sum_n' ||
      key === 'frac_n' ||
      key === 'simp_n'
    ) {
      return 'num';
    }
    return null;
  }

  function roleClass(role) {
    if (role === 'num') return 'input-num';
    if (role === 'den') return 'input-den';
    if (role === 'whole') return 'input-whole';
    return '';
  }

  /** Highlight 分子／分母／整數 in plain text (HTML-escaped first). */
  function colorizeMathTerms(text) {
    if (text == null || text === '') return '';
    const s = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // Longer phrases first if needed; single nouns
    return s
      .replace(/分母/g, '<span class="term-den">分母</span>')
      .replace(/分子/g, '<span class="term-num">分子</span>')
      .replace(/整數/g, '<span class="term-whole">整數</span>');
  }

    // ---------- DOM refs ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Measure fixed keypad (+ soft portrait tip) for padding-top on ≤1200 practice. */
  function syncPracticeChromeOffset() {
    const root = document.documentElement;
    const keypad = document.getElementById('num-keypad-bar');
    const tip = document.getElementById('portrait-blocker');
    const active = document.body.classList.contains('practice-active');
    let chromeH = 0;
    let tipH = 0;
    if (active && keypad) {
      // Keypad is position:fixed on ≤1200; measure its visible height
      chromeH = Math.ceil(keypad.getBoundingClientRect().height);
      if (!chromeH) chromeH = 48;
    }
    root.style.setProperty('--practice-chrome-h', chromeH + 'px');
    if (active && tip) {
      const cs = getComputedStyle(tip);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') {
        tipH = Math.ceil(tip.getBoundingClientRect().height);
      }
    }
    root.style.setProperty('--practice-tip-h', tipH + 'px');
  }

  function setupPracticeChromePin() {
    const run = () => syncPracticeChromeOffset();
    run();
    window.addEventListener('resize', run);
    window.addEventListener('orientationchange', () => setTimeout(run, 120));
    if (typeof ResizeObserver !== 'undefined') {
      const keypad = document.getElementById('num-keypad-bar');
      const tip = document.getElementById('portrait-blocker');
      if (keypad) new ResizeObserver(run).observe(keypad);
      if (tip) new ResizeObserver(run).observe(tip);
    }
  }

  function showScreen(id) {
    $$('.screen').forEach((el) => el.classList.remove('active'));
    const s = document.getElementById(id);
    if (s) s.classList.add('active');
    // Portrait blocker only on practice; start screen must scroll on short phones
    document.body.classList.toggle('start-active', id === 'screen-start');
    document.body.classList.toggle('practice-active', id === 'screen-practice');
    document.body.classList.toggle('teacher-active', id === 'screen-teacher');
    const keypad = $('#num-keypad-bar');
    if (keypad) keypad.style.display = id === 'screen-practice' ? '' : 'none';
    requestAnimationFrame(() => {
      syncPracticeChromeOffset();
      requestAnimationFrame(syncPracticeChromeOffset);
    });
  }

  // ---------- Mascot ----------
  function setMascot(kind) {
    state.mascotState = kind;
    $$('[data-mascot]').forEach((el) => {
      const img = el.querySelector('img');
      const fallback = el.querySelector('.mascot-fallback');
      const src = MASCOT_FILES[kind];
      if (img) {
        img.onerror = () => {
          img.style.display = 'none';
          if (fallback) {
            fallback.style.display = 'flex';
            fallback.textContent = MASCOT_EMOJI[kind] || '😊';
          }
        };
        img.onload = () => {
          img.style.display = 'block';
          if (fallback) fallback.style.display = 'none';
        };
        // Try load; if missing, onerror fires
        if (img.getAttribute('src') !== src) {
          img.style.display = 'none';
          if (fallback) {
            fallback.style.display = 'flex';
            fallback.textContent = MASCOT_EMOJI[kind] || '😊';
          }
          img.src = src;
        }
      } else if (fallback) {
        fallback.textContent = MASCOT_EMOJI[kind] || '😊';
      }
    });
  }

  // ---------- Fraction HTML helpers ----------
  function htmlFrac(n, d) {
    return `<span class="frac" aria-label="${n} 分之 ${d}"><span class="num term-num">${n}</span><span class="bar"></span><span class="den term-den">${d}</span></span>`;
  }
  function htmlMixed(w, n, d) {
    if (!n) return `<span class="mixed"><span class="whole term-whole">${w}</span></span>`;
    return `<span class="mixed"><span class="whole term-whole">${w}</span>${htmlFrac(n, d)}</span>`;
  }
  function htmlAddend(a) {
    if (a.kind === 'mixed' || (a.w && a.w > 0)) return htmlMixed(a.w, a.n, a.d);
    return htmlFrac(a.n, a.d);
  }
  function htmlProblemExpr(q) {
    const [a, b] = q.addends;
    const fa = a.type === 'mixed' ? htmlMixed(a.w, a.n, a.d) : htmlFrac(a.n, a.d);
    const fb = b.type === 'mixed' ? htmlMixed(b.w, b.n, b.d) : htmlFrac(b.n, b.d);
    return `${fa}<span class="op">+</span>${fb}<span class="op">=</span><span class="op">？</span>`;
  }
  function htmlFinalAnswer(ans) {
    if (!ans.n) return `<span class="whole" style="font-size:1.3em;font-weight:700">${ans.w}</span>`;
    if (!ans.w) return htmlFrac(ans.n, ans.d);
    return htmlMixed(ans.w, ans.n, ans.d);
  }

  /** Build {w,n,d} from graded fields + student values (prefer what they typed). */
  function answerShapeFromFields(fields, values) {
    if (!fields || !fields.length) return null;
    const map = {};
    fields.forEach((f) => {
      const raw = values && values[f.key] !== undefined && values[f.key] !== ''
        ? values[f.key]
        : f.expected;
      const num = Number(raw);
      if (Number.isFinite(num)) map[f.key] = num;
    });
    const keys = Object.keys(map);
    const wKey = keys.find((k) =>
      k === 'whole_sum' || k === 'final_w' || k === 'carry_w' || k === 'mix_w' || k === 'final_w_only'
    );
    const nKey = keys.find((k) =>
      k === 'frac_n' || k === 'sum_n' || k === 'simp_n' || k === 'final_n' ||
      k === 'check_n' || k === 'carry_n' || k === 'mix_n' ||
      (k.endsWith('_n') && k !== wKey)
    );
    const dKey = keys.find((k) =>
      k === 'frac_d' || k === 'sum_d' || k === 'simp_d' || k === 'final_d' ||
      k === 'check_d' || k === 'carry_d' || k === 'mix_d' ||
      (k.endsWith('_d') && !String(k).startsWith('exp_'))
    );
    if (wKey !== undefined && nKey && dKey) {
      return { w: map[wKey], n: map[nKey], d: map[dKey] };
    }
    if (wKey !== undefined && (!nKey || !dKey)) {
      return { w: map[wKey], n: 0, d: 1 };
    }
    if (nKey && dKey) {
      return { w: 0, n: map[nKey], d: map[dKey] };
    }
    return null;
  }

  function rememberSubmittedAnswer(stepOrGrade, values) {
    const fields = (stepOrGrade && stepOrGrade.fields) ||
      (stepOrGrade && stepOrGrade.answerFields) ||
      null;
    const shape = answerShapeFromFields(fields, values || {});
    if (shape) state.lastSubmittedAnswer = shape;
  }

  /** Completion display: student's submitted form; never force improper from mixed. */
  function displayAnswerForComplete(q) {
    if (state.lastSubmittedAnswer) return state.lastSubmittedAnswer;
    const computed = FracQuestions.computeAnswer(q);
    const hasMixed = (q.addends || []).some((a) => a.type === 'mixed' || (a.w || 0) > 0);
    if (hasMixed && computed.n && computed.d && !(computed.w > 0)) {
      return FracMath.toMixed(computed.n, computed.d);
    }
    return computed;
  }

  // ---------- Start screen ----------
  function initStart() {
    const saved = safeStorage.get(STORAGE_ID);
    if (saved) {
      state.studentId = saved;
      $('#student-id-input').value = saved;
    }
    const streakRaw = safeStorage.get(STORAGE_STREAK);
    if (streakRaw) {
      try { state.streaks = JSON.parse(streakRaw); } catch (e) { /* ignore */ }
    }
    setMascot('wave');
    showScreen('screen-start');
  }

  function submitStudentId() {
    // exposed for inline onclick backup
    const input = $('#student-id-input');
    const err = $('#start-error');
    const raw = (input.value || '').trim();
    if (!raw) {
      err.textContent = '請先輸入學號，才可以開始練習！';
      input.focus();
      return;
    }
    if (raw.length > 20) {
      err.textContent = '學號請不要超過 20 個字。';
      input.focus();
      return;
    }
    err.textContent = '';
    state.studentId = raw;
    state.playSessionId = newPlaySessionId();
    safeStorage.set(STORAGE_ID, raw);
    try {
      startPractice();
    } catch (e) {
      console.error(e);
      err.textContent = '開始練習出現問題，請再試一次或換另一個瀏覽器開啟。';
    }
  }

  // ---------- Practice ----------
  function startPractice() {
    showScreen('screen-practice');
    $('#display-student-id').textContent = state.studentId;
    updateStreakUI();
    setLevel(state.level, true);
  }

  function updateStreakUI() {
    const el = $('#streak-display');
    if (!el) return;
    if (state.level === 1) {
      el.textContent = `${L1_STAGE_META[state.l1Stage].short} ${state.stageStreak}/${STAGE_STREAK_NEED}`;
    } else if (state.level === 2) {
      el.textContent = `${L2_STAGE_META[state.l2Stage].short} ${state.stageStreak}/${L2_STAGE_STREAK_NEED}`;
    } else {
      el.textContent = `連續 ${state.streaks[state.level] || 0} 題`;
    }
    const stageEl = $('#stage-label');
    if (stageEl) {
      if (state.level === 1) {
        stageEl.style.display = '';
        stageEl.textContent = L1_STAGE_META[state.l1Stage].label;
      } else if (state.level === 2) {
        stageEl.style.display = '';
        stageEl.textContent = L2_STAGE_META[state.l2Stage].label;
      } else {
        stageEl.style.display = 'none';
      }
    }
  }

  function saveStreaks() {
    safeStorage.set(STORAGE_STREAK, JSON.stringify(state.streaks));
  }

  function resetL1ToStageA() {
    state.l1Stage = 'A';
    state.stageStreak = 0;
    state.stageBIndex = 0;
    state.pendingStageAdvance = null;
  }

  function resetL2ToStageA() {
    state.l2Stage = 'A';
    state.stageStreak = 0;
    state.pendingStageAdvance = null;
  }

  function setLevel(level, forceNew) {
    const prev = state.level;
    state.level = level;
    if (level === 1 && prev !== 1) {
      resetL1ToStageA();
    }
    if (level === 2 && prev !== 2) {
      resetL2ToStageA();
    }
    $$('.level-switch button').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.level) === level);
    });
    updateStreakUI();
    if (forceNew !== false) newQuestion();
  }

  function newQuestion() {
    // Skipping mid-question breaks the stage streak (weaker-student soft rule)
    if ((state.level === 1 || state.level === 2) && !state.complete && state.question) {
      /* 新題 abandons current stage streak */
      state.stageStreak = 0;
    }
    const genOpts = {
      avoidFingerprint: state.lastQuestionFp,
    };
    if (state.level === 1) {
      genOpts.l1Stage = state.l1Stage;
      genOpts.stageBIndex = state.stageBIndex;
    }
    if (state.level === 2) {
      genOpts.l2Stage = state.l2Stage;
    }
    state.question = FracQuestions.generate(state.level, genOpts);
    state.lastQuestionFp = state.question.fingerprint || FracQuestions.fingerprint(state.question);
    if (state.level === 1 && state.l1Stage === 'B') {
      state.stageBIndex += 1;
    }
    state.steps = FracSteps.buildSteps(state.question);
    state.currentStep = 0;
    state.complete = false;
    state.wrongCounts = {};
    state.questionMistakes = 0;
    state.questionAutoRevealed = false;
    state.partConsecutiveWrongs = {};
    state.questionStartedAt = Date.now();
    state.lastSubmittedAnswer = null;
    state.lastPlayRecord = null;
    resetHintGuide();
    setMascot('guide');
    renderPractice();
    updateStreakUI();
    const rs = $('#record-status');
    if (rs) { rs.textContent = ''; rs.className = 'record-status'; }
  }

  function renderPractice() {
    const q = state.question;
    let sub = q.label;
    if (state.level === 1) {
      sub = L1_STAGE_META[state.l1Stage].label + ' · ' + q.label;
    } else if (state.level === 2) {
      sub = L2_STAGE_META[state.l2Stage].label + ' · ' + q.label;
    }
    $('#problem-sublabel').textContent = sub;
    $('#problem-expr').innerHTML = htmlProblemExpr(q);
    $('#complete-banner').classList.remove('show');
    hideStageOverlay();

    renderSteps();
    renderHints();
    updateHintToggleFab();
    updateStreakUI();
  }

  function renderSteps() {
    const list = $('#steps-list');
    list.innerHTML = '';
    state.steps.forEach((step, i) => {
      const status = state.complete
        ? 'review'
        : i < state.currentStep
          ? 'done'
          : i === state.currentStep
            ? 'current'
            : 'locked';
      const block = document.createElement('div');
      block.className = `step-block ${status}`;
      block.dataset.step = String(i);

      const title = document.createElement('div');
      title.className = 'step-title';
      title.innerHTML =
        (status === 'done' || status === 'review' ? '<span class="check">✓</span>' : '') +
        '步驟 ' + (i + 1) + '：' + colorizeMathTerms(step.title);
      block.appendChild(title);

      const work = document.createElement('div');
      work.className = 'step-work';
      work.appendChild(buildStepShow(step));

      if (status === 'current' || status === 'done' || status === 'review') {
        const locked = status === 'current' && isLeftLockedByHint(step);
        // Build as 'current' so blanks stay EMPTY (readonly would pre-fill expected answers)
        const inputsWrap = buildStepInputs(step, i, locked ? 'current' : status);
        if (locked) {
          inputsWrap.classList.add('left-locked');
          $$('input', inputsWrap).forEach((inp) => {
            inp.readOnly = true;
            inp.disabled = true;
            inp.value = '';
            inp.classList.remove('correct', 'wrong');
            inp.placeholder = '□';
          });
          const lockMsg = document.createElement('div');
          lockMsg.className = 'left-lock-msg';
          const pType = step.process && step.process.type;
          if (pType === 'carry-guide') {
            lockMsg.textContent = '請先在右邊學完怎樣將假分數變成帶分數，完成後就可以在左邊作答。';
          } else {
            lockMsg.textContent = '請先在右邊完成通分過程（要通分 → 短除法 → 擴分），完成後就可以在左邊作答。';
          }
          work.appendChild(lockMsg);
        }
        work.appendChild(inputsWrap);
      }

      block.appendChild(work);

      if (status === 'current') {
        const fb = document.createElement('div');
        fb.className = 'step-feedback';
        fb.id = 'step-feedback';
        block.appendChild(fb);

        const locked = isLeftLockedByHint(step);
        const showCheck =
          !locked && (!step.isSimplifyChoice || step._showAnswer === true);
        if (showCheck) {
          const checkRow = document.createElement('div');
          checkRow.style.marginTop = '0.5rem';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-check';
          btn.textContent = '核對本步';
          btn.addEventListener('click', () => checkCurrentStep());
          checkRow.appendChild(btn);
          block.appendChild(checkRow);
        }
      }

      list.appendChild(block);
    });

    // Focus first empty input of current step
    setTimeout(() => {
      const first = list.querySelector('.step-block.current input:not([readonly])');
      if (first) first.focus();
    }, 50);
  }

  function buildStepShow(step) {
    const wrap = document.createElement('div');
    wrap.style.display = 'inline-flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '0.35rem';
    wrap.style.flexWrap = 'wrap';
    const s = step.show || {};
    // Light visual context — no answers
    if (s.type === 'confirm-same' || s.type === 'sum-frac' || s.type === 'need-common' ||
        s.type === 'add-wholes' || s.type === 'add-frac-parts' || s.type === 'need-common-parts' ||
        s.type === 'add-mixed-together') {
      wrap.innerHTML = `${htmlAddend(s.a)}<span class="op">+</span>${htmlAddend(s.b)}`;
    } else if (s.type === 'tongfen-result') {
      // Keep mixed 整數 visible in step1 通分母
      wrap.innerHTML = `${htmlAddend(s.a)}<span class="op">+</span>${htmlAddend(s.b)}`;
    } else if (s.type === 'short-div') {
      wrap.innerHTML = `<span>分母 ${s.a} 和 ${s.b}</span>`;
    } else if (s.type === 'expand' || s.type === 'expand-parts') {
      wrap.innerHTML = `${htmlAddend(s.a)} → ？　　${htmlAddend(s.b)} → ？`;
    } else if (s.type === 'sum-expanded') {
      wrap.innerHTML = `${htmlFrac(s.ea.n, s.ea.d)}<span class="op">+</span>${htmlFrac(s.eb.n, s.eb.d)}`;
    } else if (s.type === 'add-frac-expanded') {
      wrap.innerHTML = `${htmlFrac(s.ea.n, s.ea.d)}<span class="op">+</span>${htmlFrac(s.eb.n, s.eb.d)}`;
    } else if (s.type === 'simplify' || s.type === 'check-simplify') {
      if (step._showAnswer) {
        wrap.innerHTML = '';
        wrap.style.display = 'none';
      } else {
        wrap.innerHTML = `${htmlFrac(s.from.n, s.from.d)} → 是否需要約分（分子分母同時除以相同的數）？`;
      }
    } else if (s.type === 'check-simplify-mixed') {
      if (step._showAnswer) {
        wrap.innerHTML = '';
        wrap.style.display = 'none';
      } else {
        const wPart = (s.w && s.w > 0) ? `${s.w} ` : '';
        wrap.innerHTML = `${wPart}${htmlFrac(s.from.n, s.from.d)} → 是否需要約分（分子分母同時除以相同的數）？`;
      }
    } else if (s.type === 'to-mixed') {
      wrap.innerHTML = `${htmlFrac(s.from.n, s.from.d)} → 帶分數？`;
    } else if (s.type === 'carry') {
      wrap.innerHTML = `整數 ${s.whole}，分數 ${htmlFrac(s.n, s.d)} → 進位？`;
    } else if (s.type === 'confirm-no-carry') {
      wrap.innerHTML = `整數 ${s.w} + ${htmlFrac(s.n, s.d)}`;
    } else if (s.type === 'simplify-mixed') {
      wrap.innerHTML = `${s.w} ${htmlFrac(s.from.n, s.from.d)} → 約分？`;
    } else if (s.type === 'final-mixed') {
      wrap.innerHTML = `寫出：`;
    } else if (s.type === 'final-whole') {
      wrap.innerHTML = `寫出整數答案：`;
    }
    return wrap;
  }

  function buildStepInputs(step, stepIndex, status) {
    const wrap = document.createElement('div');
    wrap.className = 'step-inputs';
    wrap.dataset.stepIndex = String(stepIndex);

    const readonly = status !== 'current';

    // Group common patterns
    const keys = step.fields.map((f) => f.key);

    // 通分母：= [整數]□/□ + [整數]□/□（帶分數保留整數）
    if (step.id === 'tongfen' || (step.show && step.show.type === 'tongfen-result')) {
      wrap.appendChild(eqEquals());
      const sh = step.show || {};
      const keepW = !!(step.keepWholes || (sh && sh.keepWholes));
      const wA = (sh.a && (sh.a.w || 0)) || 0;
      const wB = (sh.b && (sh.b.w || 0)) || 0;
      if (keepW && wA > 0) {
        const w = document.createElement('span');
        w.className = 'whole term-whole';
        w.style.fontSize = '1.35rem';
        w.style.fontWeight = '700';
        w.style.marginRight = '0.2rem';
        w.textContent = String(wA);
        wrap.appendChild(w);
      }
      wrap.appendChild(buildFracInput(step, 'exp_a_n', 'exp_a_d', readonly));
      const plus = document.createElement('span');
      plus.className = 'op';
      plus.textContent = '+';
      wrap.appendChild(plus);
      if (keepW && wB > 0) {
        const w = document.createElement('span');
        w.className = 'whole term-whole';
        w.style.fontSize = '1.35rem';
        w.style.fontWeight = '700';
        w.style.marginRight = '0.2rem';
        w.textContent = String(wB);
        wrap.appendChild(w);
      }
      wrap.appendChild(buildFracInput(step, 'exp_b_n', 'exp_b_d', readonly));
      return wrap;
    }

    if (step.id === 'short-div') {
      wrap.appendChild(buildCommonDenomResultUI(step, readonly));
      return wrap;
    }

    // Stage C: 有／沒有約分（大掣）
    if (step.isSimplifyChoice) {
      wrap.appendChild(buildSimplifyChoiceUI(step, stepIndex, status));
      return wrap;
    }

    // L1B simultaneous: whole + frac in one step
    if (keys.includes('whole_sum') && keys.includes('frac_n') && keys.includes('frac_d')) {
      wrap.appendChild(eqEquals());
      const wInput = makeNumInput(step, 'whole_sum', readonly);
      wInput.classList.add('whole-input');
      wInput.style.width = '3.2rem';
      wInput.style.height = '3.4rem';
      wInput.style.fontSize = '1.4rem';
      wInput.style.fontWeight = '700';
      wInput.style.textAlign = 'center';
      wInput.style.borderRadius = '10px';
      wInput.setAttribute('aria-label', '整數和');
      wrap.appendChild(wInput);
      wrap.appendChild(buildFracInput(step, 'frac_n', 'frac_d', readonly));
      return wrap;
    }

    // Mixed final / carry: w + n/d
    if (keys.includes('mix_w') || keys.includes('carry_w') || keys.includes('final_w')) {
      const wKey = keys.find((k) => k.endsWith('_w') || k === 'mix_w' || k === 'carry_w' || k === 'final_w');
      const nKey = keys.find((k) => k.endsWith('_n') && k !== wKey);
      const dKey = keys.find((k) => k.endsWith('_d'));
      wrap.appendChild(buildMixedInput(step, wKey, nKey, dKey, readonly));
      return wrap;
    }

    // Proper n/d
    if ((keys.includes('sum_n') || keys.includes('simp_n') || keys.includes('frac_n') ||
         keys.includes('check_n')) && keys.length <= 2) {
      const nKey = keys.find((k) => k.includes('n'));
      const dKey = keys.find((k) => k.includes('d'));
      wrap.appendChild(eqEquals());
      wrap.appendChild(buildFracInput(step, nKey, dKey, readonly));
      return wrap;
    }

    // Expand two fractions
    if (keys.includes('exp_a_n')) {
      wrap.appendChild(document.createTextNode(' → '));
      wrap.appendChild(buildFracInput(step, 'exp_a_n', 'exp_a_d', readonly));
      wrap.appendChild(document.createTextNode('　和　'));
      wrap.appendChild(buildFracInput(step, 'exp_b_n', 'exp_b_d', readonly));
      return wrap;
    }

    // Single whole
    if (keys.length === 1 && (keys[0] === 'whole_sum' || keys[0] === 'final_w_only' || keys[0] === 'denom_check')) {
      wrap.appendChild(eqEquals());
      wrap.appendChild(buildSingleInput(step, keys[0], readonly));
      return wrap;
    }

    // d1, d2 — 通分母結果（通分後兩個分母）
    if (keys.includes('d1') && keys.includes('d2')) {
      wrap.appendChild(buildLabeledInput(step, 'd1', '通分母①', readonly));
      wrap.appendChild(document.createTextNode('　和　'));
      wrap.appendChild(buildLabeledInput(step, 'd2', '通分母②', readonly));
      return wrap;
    }

    // Fallback: all fields
    step.fields.forEach((f) => {
      wrap.appendChild(buildLabeledInput(step, f.key, f.label, readonly));
    });
    return wrap;
  }

  function eqEquals() {
    const s = document.createElement('span');
    s.className = 'op';
    s.textContent = '=';
    return s;
  }

  function makeNumInput(step, key, readonly) {
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
    input.dataset.field = key;
    const fMeta = (step.fields || []).find((x) => x.key === key);
    input.setAttribute('aria-label', (fMeta && fMeta.label) || key);
    input.autocomplete = 'off';
    const rc = roleClass(fieldRole(key));
    if (rc) input.classList.add(rc);
    if (readonly) {
      input.readOnly = true;
      const f = (step.fields || []).find((x) => x.key === key);
      if (f) input.value = String(f.expected);
      input.classList.add('correct');
    } else {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^\d]/g, '');
        input.classList.remove('wrong');
        maybeAutoCheck(step);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          checkCurrentStep();
        }
      });
    }
    return input;
  }

  function buildSingleInput(step, key, readonly) {
    const cell = document.createElement('div');
    cell.className = 'input-cell';
    cell.appendChild(makeNumInput(step, key, readonly));
    return cell;
  }

  function buildLabeledInput(step, key, label, readonly) {
    const cell = document.createElement('div');
    cell.className = 'input-cell';
    const lab = document.createElement('span');
    lab.className = 'cell-label';
    lab.innerHTML = colorizeMathTerms(label);
    cell.appendChild(lab);
    cell.appendChild(makeNumInput(step, key, readonly));
    return cell;
  }

  function buildFracInput(step, nKey, dKey, readonly) {
    const frac = document.createElement('div');
    frac.className = 'frac-input';
    frac.appendChild(makeNumInput(step, nKey, readonly));
    const bar = document.createElement('div');
    bar.className = 'frac-bar';
    frac.appendChild(bar);
    frac.appendChild(makeNumInput(step, dKey, readonly));
    return frac;
  }

  function buildMixedInput(step, wKey, nKey, dKey, readonly) {
    const mix = document.createElement('div');
    mix.className = 'mixed-input';
    mix.appendChild(eqEquals());
    const wInput = makeNumInput(step, wKey, readonly);
    wInput.classList.add('whole-input');
    wInput.style.width = '3.2rem';
    wInput.style.height = '3.4rem';
    wInput.style.fontSize = '1.4rem';
    wInput.style.fontWeight = '700';
    wInput.style.textAlign = 'center';
    wInput.style.borderRadius = '10px';
    mix.appendChild(wInput);
    if (nKey && dKey) {
      mix.appendChild(buildFracInput(step, nKey, dKey, readonly));
    }
    return mix;
  }

  /** Left panel: only enter 公倍數／通分母結果 */
  function buildCommonDenomResultUI(step, readonly) {
    const box = document.createElement('div');
    box.className = 'common-denom-result';
    box.style.display = 'inline-flex';
    box.style.alignItems = 'center';
    box.style.gap = '0.5rem';
    box.style.flexWrap = 'wrap';
    const s = step.show || {};
    const ctx = document.createElement('span');
    ctx.textContent = '分母 ' + (s.a != null ? s.a : '') + ' 和 ' + (s.b != null ? s.b : '') + ' →';
    box.appendChild(ctx);
    const lcmRow = document.createElement('div');
    lcmRow.className = 'sd-lcm-row';
    lcmRow.style.margin = '0';
    lcmRow.innerHTML = '<span>公倍數 =</span>';
    lcmRow.appendChild(makeNumInput(step, 'sd_lcm', readonly));
    box.appendChild(lcmRow);
    return box;
  }

  /**
   * Right hint panel: 通分過程 short-div grid (divisors + rows).
   * includeLcm: whether to also show 公倍數 input (usually false — result is on left).
   * graded: if false, inputs are practice-only (no data-field grading keys).
   */
  function buildShortDivProcessUI(step, readonly, opts) {
    opts = opts || {};
    const includeLcm = !!opts.includeLcm;
    const graded = opts.graded !== false;
    const proc = (step.process && step.process.sd) ? step.process : step.show;
    const sd = proc && proc.sd;
    const box = document.createElement('div');
    box.className = 'short-div-ui';
    if (!sd) {
      box.textContent = '兩個分母互質時，公倍數 = 兩數相乘。';
      return box;
    }

    const nDiv = sd.divisors.length;
    // Use a step-like object so makeNumInput can find field metadata
    const fieldStep = step;

    for (let i = 0; i <= nDiv; i++) {
      const row = document.createElement('div');
      row.className = 'sd-row' + (i < nDiv ? ' sd-has-div' : ' sd-remain');

      if (i < nDiv) {
        const slot = document.createElement('div');
        slot.className = 'sd-div-slot';
        if (graded && step.fields.some((f) => f.key === 'sd_div_' + i)) {
          slot.appendChild(makeNumInput(fieldStep, 'sd_div_' + i, readonly));
        } else {
          const inp = makeNumInput(fieldStep, 'sd_div_' + i, readonly);
          if (!graded) {
            delete inp.dataset.field;
            inp.dataset.practice = 'sd_div_' + i;
          }
          slot.appendChild(inp);
        }
        row.appendChild(slot);
      } else {
        const spacer = document.createElement('div');
        spacer.style.width = '2.6rem';
        row.appendChild(spacer);
      }

      const nums = document.createElement('div');
      nums.className = 'sd-nums';
      if (i === 0) {
        const L = document.createElement('span');
        L.className = 'static';
        L.textContent = String(sd.rows[0][0]);
        const R = document.createElement('span');
        R.className = 'static';
        R.textContent = String(sd.rows[0][1]);
        nums.appendChild(L);
        nums.appendChild(R);
      } else {
        const kL = 'sd_row_' + i + '_L';
        const kR = 'sd_row_' + i + '_R';
        const iL = makeNumInput(fieldStep, kL, readonly);
        const iR = makeNumInput(fieldStep, kR, readonly);
        if (!graded) {
          delete iL.dataset.field; iL.dataset.practice = kL;
          delete iR.dataset.field; iR.dataset.practice = kR;
        }
        nums.appendChild(iL);
        nums.appendChild(iR);
      }
      row.appendChild(nums);
      box.appendChild(row);
    }

    if (includeLcm) {
      const lcmRow = document.createElement('div');
      lcmRow.className = 'sd-lcm-row';
      lcmRow.innerHTML = '<span>公倍數 =</span>';
      lcmRow.appendChild(makeNumInput(fieldStep, 'sd_lcm', readonly));
      box.appendChild(lcmRow);
    }
    return box;
  }

  function buildShortDivUI(step, readonly) {
    // legacy full UI (unused for left); keep for safety
    const box = buildShortDivProcessUI(step, readonly, { includeLcm: true, graded: true });
    return box;
  }

  function buildSimplifyChoiceUI(step, stepIndex, status) {
    const box = document.createElement('div');
    box.className = 'simplify-choice-ui';
    const readonly = status !== 'current';
    const needs = !!step.needsSimplify;
    const chosen = step._choice; // true=有, false=沒有, undefined=not yet
    const CHOICE_Q = '是否需要約分（分子分母同時除以相同的數）？';

    if (status === 'done' || status === 'review') {
      const summary = document.createElement('div');
      summary.className = 'simplify-choice-summary';
      const label = needs ? '有約分' : '沒有約分';
      summary.textContent = '✓ ' + label;
      box.appendChild(summary);
      if (needs && step.answerFields) {
        if (!step.fields || !step.fields.length) {
          step.fields = step.answerFields.slice();
        }
        box.appendChild(buildSimplifyDivideWorkspace(step, true));
      }
      return box;
    }

    // Current: choice buttons (unless already correctly picked 「有」)
    if (!step._showAnswer) {
      const prompt = document.createElement('div');
      prompt.className = 'simplify-choice-prompt';
      prompt.textContent = CHOICE_Q;
      box.appendChild(prompt);

      const row = document.createElement('div');
      row.className = 'simplify-choice-btns';

      const btnYes = document.createElement('button');
      btnYes.type = 'button';
      btnYes.className = 'btn btn-choice-yes';
      btnYes.textContent = '有';
      btnYes.addEventListener('click', () => onSimplifyChoice(true));

      const btnNo = document.createElement('button');
      btnNo.type = 'button';
      btnNo.className = 'btn btn-choice-no';
      btnNo.textContent = '沒有';
      btnNo.addEventListener('click', () => onSimplifyChoice(false));

      row.appendChild(btnYes);
      row.appendChild(btnNo);
      box.appendChild(row);
      return box;
    }

    // Answer phase after correct 「有」— ÷ 除數 + 最簡結果（對齊手繪草圖）
    const note = document.createElement('div');
    note.className = 'simplify-choice-prompt simplify-fill-prompt';
    const sh = step.show || {};
    const hasWhole = !!(step.answerFields || []).some((f) => f.key === 'final_w');
    if (hasWhole) {
      note.innerHTML = colorizeMathTerms('對！請填寫最簡分子／分母（整數不變）：');
    } else {
      note.innerHTML = colorizeMathTerms('對！請填寫最簡分子／分母：');
    }
    box.appendChild(note);

    if (!step.fields || !step.fields.length) {
      step.fields = step.answerFields.slice();
    }
    box.appendChild(buildSimplifyDivideWorkspace(step, false));
    return box;
  }

  /** 約分工作區：原分數 ÷[除數]/÷[除數] = 最簡（帶分數含整數格） */
  function buildSimplifyDivideWorkspace(step, readonly) {
    const sh = step.show || {};
    const from = sh.from || { n: 0, d: 1 };
    const keys = (step.fields || step.answerFields || []).map((f) => f.key);
    const hasWhole = keys.includes('final_w');
    const wholeVal = hasWhole ? (sh.w != null ? sh.w : 0) : null;

    const row = document.createElement('div');
    row.className = 'simplify-workspace';

    // 左側：整數（若有）+ 分子÷框 / 分母÷框
    const fromBox = document.createElement('div');
    fromBox.className = 'simplify-from';
    if (hasWhole && wholeVal != null && wholeVal > 0) {
      const wSpan = document.createElement('span');
      wSpan.className = 'simplify-from-whole term-whole';
      wSpan.textContent = String(wholeVal);
      fromBox.appendChild(wSpan);
    }

    const fracCol = document.createElement('div');
    fracCol.className = 'simplify-from-frac';

    const topRow = document.createElement('div');
    topRow.className = 'simplify-from-row';
    const numSpan = document.createElement('span');
    numSpan.className = 'simplify-from-num term-num';
    numSpan.textContent = String(from.n);
    topRow.appendChild(numSpan);
    const divOpN = document.createElement('span');
    divOpN.className = 'simplify-div-op';
    divOpN.textContent = '÷';
    topRow.appendChild(divOpN);
    const divInN = makeNumInput(step, 'simp_div_n', readonly);
    divInN.classList.add('simplify-div-input');
    divInN.setAttribute('aria-label', '分子的約分除數');
    topRow.appendChild(divInN);
    fracCol.appendChild(topRow);

    const bar = document.createElement('div');
    bar.className = 'simplify-from-bar';
    fracCol.appendChild(bar);

    const botRow = document.createElement('div');
    botRow.className = 'simplify-from-row';
    const denSpan = document.createElement('span');
    denSpan.className = 'simplify-from-den term-den';
    denSpan.textContent = String(from.d);
    botRow.appendChild(denSpan);
    const divOpD = document.createElement('span');
    divOpD.className = 'simplify-div-op';
    divOpD.textContent = '÷';
    botRow.appendChild(divOpD);
    const divInD = makeNumInput(step, 'simp_div_d', readonly);
    divInD.classList.add('simplify-div-input');
    divInD.setAttribute('aria-label', '分母的約分除數');
    botRow.appendChild(divInD);
    fracCol.appendChild(botRow);

    fromBox.appendChild(fracCol);
    row.appendChild(fromBox);

    // 兩個除數格同步（分子分母須除以相同的數）
    if (!readonly) {
      const sync = (src, dst) => {
        src.addEventListener('input', () => {
          if (dst.value !== src.value) {
            dst.value = src.value;
            dst.classList.remove('wrong');
          }
        });
      };
      sync(divInN, divInD);
      sync(divInD, divInN);
    }

    row.appendChild(eqEquals());

    // 右側結果
    const result = document.createElement('div');
    result.className = 'simplify-result';
    if (hasWhole) {
      const wInput = makeNumInput(step, 'final_w', readonly);
      wInput.classList.add('whole-input', 'simplify-result-whole');
      wInput.style.width = '3.2rem';
      wInput.style.height = '3.4rem';
      wInput.style.fontSize = '1.4rem';
      wInput.style.fontWeight = '700';
      wInput.style.textAlign = 'center';
      wInput.style.borderRadius = '10px';
      wInput.setAttribute('aria-label', '整數（不變）');
      result.appendChild(wInput);
    }
    result.appendChild(buildFracInput(step, 'simp_n', 'simp_d', readonly));
    row.appendChild(result);

    return row;
  }

  const AUTO_REVEAL_MSG = '已連續答錯三次，以下為正確答案，請繼續。';
  const AUTO_REVEAL_AFTER_MS = 900;

  function markQuestionIncorrectByReveal() {
    state.questionAutoRevealed = true;
  }

  function registerPartWrong(partKey) {
    if (!state.partConsecutiveWrongs) state.partConsecutiveWrongs = {};
    state.partConsecutiveWrongs[partKey] = (state.partConsecutiveWrongs[partKey] || 0) + 1;
    return state.partConsecutiveWrongs[partKey];
  }

  function resetPartConsecutive(partKey) {
    if (!state.partConsecutiveWrongs) state.partConsecutiveWrongs = {};
    state.partConsecutiveWrongs[partKey] = 0;
  }

  function setRevealFeedback(fbEl, msg) {
    if (!fbEl) return;
    fbEl.className = 'step-feedback reveal';
    fbEl.textContent = msg || AUTO_REVEAL_MSG;
  }

  function fillInputExpected(inp, expected) {
    if (!inp) return;
    inp.value = String(expected);
    inp.classList.remove('wrong');
    inp.classList.add('correct', 'auto-revealed');
  }

  /** 左邊步驟：連錯三次 → 填入正確答案並繼續（整題仍記錯誤） */
  function revealAndAdvanceStep(i, gradeStep) {
    markQuestionIncorrectByReveal();
    const wrap = $(`.step-inputs[data-step-index="${i}"]`);
    const proc = $('#hint-process');
    (gradeStep.fields || []).forEach((f) => {
      let inp = wrap && wrap.querySelector(`input[data-field="${f.key}"]`);
      if (!inp && proc) inp = proc.querySelector(`input[data-field="${f.key}"]`);
      fillInputExpected(inp, f.expected);
    });
    if (i + 1 >= state.steps.length) {
      const values = Object.fromEntries((gradeStep.fields || []).map((f) => [f.key, String(f.expected)]));
      rememberSubmittedAnswer(gradeStep, values);
    }
    setRevealFeedback($('#step-feedback'));
    setMascot('think');
    setTimeout(() => advanceAfterStepOk(i), AUTO_REVEAL_AFTER_MS);
  }

  function onSimplifyChoice(saidHas) {
    if (state.complete) return;
    const i = state.currentStep;
    const step = state.steps[i];
    if (!step || !step.isSimplifyChoice) return;

    const needs = !!step.needsSimplify;
    const fb = $('#step-feedback');

    if (saidHas === needs) {
      step._choice = saidHas;
      resetPartConsecutive(`step:${i}:choice`);
      if (!needs) {
        // 「沒有」且正確 → 即時過關（通常係最後一步）
        // 用上一布學生填嘅（或 expected）作完成畫面答案形式
        if (i + 1 >= state.steps.length) {
          const prev = state.steps[i - 1];
          if (prev && prev.fields && prev.fields.length) {
            const prevVals = collectValues(i - 1);
            const useDom = allFieldsFilled(prev, prevVals);
            const vals = useDom
              ? prevVals
              : Object.fromEntries(prev.fields.map((f) => [f.key, String(f.expected)]));
            rememberSubmittedAnswer(prev, vals);
          }
        }
        if (fb) {
          fb.className = 'step-feedback ok';
          fb.textContent = '✓ 對！不用約分。';
        }
        setMascot('thumbsup');
        setTimeout(() => advanceAfterStepOk(i), 350);
      } else {
        // 「有」且正確 → 再填最簡
        step._showAnswer = true;
        // Activate answer fields for grading
        step.fields = step.answerFields.slice();
        if (fb) {
          fb.className = 'step-feedback ok';
          fb.textContent = '✓ 對！請填寫除數和最簡分子／分母。';
        }
        setMascot('thumbsup');
        renderSteps();
        renderHints();
        setTimeout(() => {
          const first = document.querySelector('.step-block.current input:not([readonly])');
          if (first) first.focus();
        }, 40);
      }
    } else {
      // 撳錯
      step._choice = undefined;
      const wk = `${i}:choice`;
      const partKey = `step:${i}:choice`;
      state.wrongCounts[wk] = (state.wrongCounts[wk] || 0) + 1;
      state.questionMistakes += 1;
      const consec = registerPartWrong(partKey);
      if (consec >= 3) {
        // 連錯三次：自動選正確選項並繼續；整題記為錯誤
        markQuestionIncorrectByReveal();
        setRevealFeedback(fb);
        setMascot('think');
        setTimeout(() => onSimplifyChoice(needs), 500);
        return;
      }
      if (fb) {
        fb.className = 'step-feedback err';
        fb.textContent = needs
          ? '再想一想：其實需要約分，請按「有」。'
          : '再想一想：已經是最簡分數，不用約分，請按「沒有」。';
      }
      setMascot('think');
      const extraEl = $('#hint-extra');
      if ((state.wrongCounts[wk] || 0) >= 2 && extraEl) {
        extraEl.innerHTML = colorizeMathTerms(needs
          ? '多一層提示：分子和分母有公因數就可以約分。'
          : '多一層提示：分子和分母沒有公因數就是最簡分數。');
        extraEl.classList.add('show');
      }
    }
  }

  function advanceAfterStepOk(i) {
    if (i + 1 >= state.steps.length) {
      completeProblem();
    } else {
      state.currentStep = i + 1;
      const next = state.steps[state.currentStep];
      if (next && next.locksLeftUntilHintDone) resetHintGuide();
      else { state.hintGuideDone = true; }
      setMascot('guide');
      renderPractice();
    }
  }

  function collectValues(stepIndex) {
    const values = {};
    const wrap = $(`.step-inputs[data-step-index="${stepIndex}"]`);
    if (wrap) {
      $$('input[data-field]', wrap).forEach((inp) => {
        values[inp.dataset.field] = inp.value.trim();
      });
    }
    // 通分過程 inputs live in right hint panel
    const proc = $('#hint-process');
    if (proc) {
      $$('input[data-field]', proc).forEach((inp) => {
        values[inp.dataset.field] = inp.value.trim();
      });
    }
    return values;
  }

  function allFieldsFilled(step, values) {
    return step.fields.every((f) => {
      const v = values[f.key];
      return v !== '' && v !== undefined && v !== null;
    });
  }

  function maybeAutoCheck(step) {
    if (state.complete) return;
    const gradeStep = step.isSimplifyChoice && step._showAnswer && step.answerFields
      ? { fields: step.answerFields }
      : step;
    if (gradeStep.fields.length === 0) return;
    const values = collectValues(state.currentStep);
    if (allFieldsFilled(gradeStep, values)) {
      // slight delay so last digit registers
      clearTimeout(maybeAutoCheck._t);
      maybeAutoCheck._t = setTimeout(() => checkCurrentStep(), 280);
    }
  }

  function checkCurrentStep() {
    if (state.complete) return;
    const i = state.currentStep;
    const step = state.steps[i];
    if (!step) return;

    // Simplify choice: must pick 有／沒有 first
    if (step.isSimplifyChoice && !step._showAnswer) {
      const fb = $('#step-feedback');
      if (fb) {
        fb.className = 'step-feedback err';
        fb.textContent = '請先按「有」或「沒有」。';
      }
      return;
    }

    const gradeStep = step.isSimplifyChoice && step.answerFields
      ? { fields: step.answerFields }
      : step;

    const values = collectValues(i);
    if (!allFieldsFilled(gradeStep, values)) {
      const fb = $('#step-feedback');
      if (fb) {
        fb.className = 'step-feedback err';
        fb.textContent = '請填妥這一步所有空格再核對。';
      }
      return;
    }

    const result = FracSteps.gradeStep(gradeStep, values);
    const wrap = $(`.step-inputs[data-step-index="${i}"]`);
    const proc = $('#hint-process');

    Object.keys(result.results).forEach((key) => {
      let inp = wrap && wrap.querySelector(`input[data-field="${key}"]`);
      if (!inp && proc) inp = proc.querySelector(`input[data-field="${key}"]`);
      if (!inp) return;
      const r = result.results[key];
      inp.classList.remove('wrong', 'correct', 'auto-revealed');
      if (r.ok) {
        inp.classList.add('correct');
      } else {
        inp.classList.add('wrong');
        const wk = `${i}:${key}`;
        state.wrongCounts[wk] = (state.wrongCounts[wk] || 0) + 1;
        state.questionMistakes += 1;
      }
    });

    const fb = $('#step-feedback');
    const partKey = `step:${i}`;
    if (result.allOk) {
      resetPartConsecutive(partKey);
      // Final accepted step → remember student's answer shape for completion screen
      if (i + 1 >= state.steps.length) {
        rememberSubmittedAnswer(gradeStep, values);
      }
      if (fb) {
        fb.className = 'step-feedback ok';
        fb.textContent = '✓ 做得好！';
      }
      setMascot('thumbsup');
      setTimeout(() => advanceAfterStepOk(i), 450);
    } else {
      const consec = registerPartWrong(partKey);
      if (consec >= 3) {
        revealAndAdvanceStep(i, gradeStep);
        return;
      }
      if (fb) {
        fb.className = 'step-feedback err';
        let msg = '這一格請再試，不要緊。';
        if (step.isSimplifyChoice && step._showAnswer) {
          const rn = result.results.simp_div_n;
          const rd = result.results.simp_div_d;
          if ((rn && !rn.ok) || (rd && !rd.ok)) {
            msg = '約分時，分子和分母要同時除以相同的數（大於 1），再填最簡結果。';
          } else if ((result.results.simp_n && !result.results.simp_n.ok) ||
                     (result.results.simp_d && !result.results.simp_d.ok)) {
            msg = '除數對了嗎？請再檢查最簡分子和分母。';
          } else if (result.results.final_w && !result.results.final_w.ok) {
            msg = '整數部分不用改，請再檢查。';
          }
        }
        fb.textContent = msg;
      }
      setMascot('think');
      // Extra hints after 2–3 wrongs
      let extra = null;
      step.fields.forEach((f) => {
        if (result.results[f.key] && !result.results[f.key].ok) {
          const c = state.wrongCounts[`${i}:${f.key}`] || 0;
          const h = FracSteps.extraHintForField(step, f.key, c);
          if (h) extra = h;
        }
      });
      const extraEl = $('#hint-extra');
      if (extra && extraEl) {
        extraEl.innerHTML = colorizeMathTerms('多一層提示：' + extra);
        extraEl.classList.add('show');
      }
      renderHintText(); // refresh bubble still on current
    }
  }

  function hideStageOverlay() {
    const ov = $('#stage-overlay');
    if (ov) ov.classList.remove('show');
  }

  function showStageOverlay(opts) {
    const ov = $('#stage-overlay');
    if (!ov) return;
    $('#stage-overlay-title').textContent = opts.title || '做得好！';
    $('#stage-overlay-msg').textContent = opts.msg || '';
    const actions = $('#stage-overlay-actions');
    actions.innerHTML = '';
    (opts.buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.primary ? 'btn-primary' : 'btn-ghost');
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      actions.appendChild(btn);
    });
    ov.classList.add('show');
    setMascot(opts.mascot || 'celebrate');
  }

  function advanceToStage(next) {
    state.l1Stage = next;
    state.stageStreak = 0;
    state.pendingStageAdvance = null;
    if (next === 'B') state.stageBIndex = 0;
    hideStageOverlay();
    updateStreakUI();
    newQuestion();
  }

  function advanceToL2Stage(next) {
    state.l2Stage = next;
    state.stageStreak = 0;
    state.pendingStageAdvance = null;
    hideStageOverlay();
    updateStreakUI();
    newQuestion();
  }

  // ---------- Play-session recording ----------
  function whenFracCloudReady() {
    if (window.FracCloud) return Promise.resolve(window.FracCloud);
    return new Promise((resolve) => {
      const done = () => resolve(window.FracCloud || null);
      window.addEventListener('fraccloud-ready', done, { once: true });
      setTimeout(done, 4000);
    });
  }

  function sumWrongCounts() {
    let n = 0;
    Object.keys(state.wrongCounts || {}).forEach((k) => {
      n += Number(state.wrongCounts[k]) || 0;
    });
    return n;
  }

  function currentStageLabel() {
    if (state.level === 1) return state.l1Stage || '';
    if (state.level === 2) return state.l2Stage || '';
    return '';
  }

  function formatQuestionSummary(q) {
    if (!q || !q.addends || q.addends.length < 2) return '';
    const fmt = (a) => {
      if (!a) return '?';
      if (a.type === 'mixed') return `${a.w}又${a.n}/${a.d}`;
      return `${a.n}/${a.d}`;
    };
    return fmt(q.addends[0]) + '+' + fmt(q.addends[1]);
  }

  function setRecordStatus(kind, message) {
    const el = $('#record-status');
    if (!el) return;
    el.className = 'record-status' + (kind ? ' ' + kind : '');
    el.textContent = message || '';
    el.onclick = null;
    if (kind === 'error' || kind === 'local') {
      el.style.cursor = 'pointer';
      el.title = '按一下可重試上傳';
      el.onclick = () => retryLastRecordUpload();
    } else {
      el.style.cursor = '';
      el.title = '';
    }
  }

  async function retryLastRecordUpload() {
    if (!state.lastPlayRecord) return;
    setRecordStatus('pending', '正在重新上傳成績……');
    const cloud = await whenFracCloudReady();
    if (!cloud || !cloud.saveRecord) {
      setRecordStatus('local', '成績已暫存在本機（尚未連接雲端）。按一下可重試。');
      return;
    }
    try {
      const result = await cloud.saveRecord(state.lastPlayRecord);
      if (result === 'cloud') {
        setRecordStatus('ok', '成績已上傳到雲端。');
      } else if (result === 'local') {
        setRecordStatus('local', '成績已暫存在本機（尚未連接雲端）。按一下可重試。');
      } else {
        setRecordStatus('error', '成績上傳失敗，已暫存本機。按一下可重試。');
      }
    } catch (e) {
      setRecordStatus('error', '成績上傳失敗，已暫存本機。按一下可重試。');
    }
  }

  function newPlaySessionId() {
    return 'ps_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function ensurePlaySessionId() {
    if (!state.playSessionId) state.playSessionId = newPlaySessionId();
    return state.playSessionId;
  }

  async function recordPlaySession() {
    // 含左邊核對 + 提示區（短除／擴分等）答錯次數
    const mistakes = Math.max(sumWrongCounts(), Number(state.questionMistakes) || 0);
    const started = state.questionStartedAt || Date.now();
    const durationSec = Math.max(0, Math.round((Date.now() - started) / 1000));
    // L1/L2 stageStreak is incremented later in completeProblem; count this success now.
    const streakAfter = (state.level === 1 || state.level === 2)
      ? (state.stageStreak || 0) + 1
      : (state.streaks[state.level] || 0);
    // 正確／錯誤：只要本題曾因連錯三次而自動顯示答案，即記為錯誤（即使最後填對）
    const isCorrect = !state.questionAutoRevealed;
    const payload = {
      studentId: state.studentId,
      level: state.level,
      stage: currentStageLabel(),
      mistakes,
      durationSec,
      finishedAt: new Date().toISOString(),
      streakAfter,
      questionSummary: formatQuestionSummary(state.question),
      sessionId: ensurePlaySessionId(),
      correct: isCorrect,
      autoRevealed: !!state.questionAutoRevealed,
      result: isCorrect ? '正確' : '錯誤',
    };
    state.lastPlayRecord = payload;
    setRecordStatus('pending', '正在儲存成績……');

    const cloud = await whenFracCloudReady();
    if (!cloud || !cloud.saveRecord) {
      // Persist minimal local copy without FracCloud helper
      try {
        const key = 'fraction_addition_pending_records';
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        arr.push(Object.assign({ teacherCode: 'default', createdAt: new Date().toISOString() }, payload));
        localStorage.setItem(key, JSON.stringify(arr.slice(-500)));
      } catch (e) { /* ignore */ }
      setRecordStatus('local', '成績已暫存在本機（尚未連接雲端）。按一下可重試。');
      return;
    }
    try {
      const result = await cloud.saveRecord(payload);
      if (result === 'cloud') {
        setRecordStatus('ok', '成績已上傳到雲端。');
      } else if (result === 'local') {
        setRecordStatus('local', '成績已暫存在本機（尚未連接雲端）。按一下可重試。');
      } else {
        setRecordStatus('error', '成績上傳失敗，已暫存本機。按一下可重試。');
      }
    } catch (e) {
      console.warn(e);
      setRecordStatus('error', '成績上傳失敗，已暫存本機。按一下可重試。');
    }
  }

  function completeProblem() {
    state.complete = true;
    state.streaks[state.level] = (state.streaks[state.level] || 0) + 1;
    saveStreaks();
    setMascot('celebrate');
    // Fire-and-forget; do not block celebration UI
    try { recordPlaySession(); } catch (e) { console.warn(e); }

    const q = state.question;
    const ans = displayAnswerForComplete(q);
    const banner = $('#complete-banner');
    banner.classList.add('show');
    const [a, b] = q.addends;
    const fa = a.type === 'mixed' ? htmlMixed(a.w, a.n, a.d) : htmlFrac(a.n, a.d);
    const fb = b.type === 'mixed' ? htmlMixed(b.w, b.n, b.d) : htmlFrac(b.n, b.d);
    $('#complete-final').innerHTML =
      fa + '<span class="op">+</span>' + fb + '<span class="op">=</span>' + htmlFinalAnswer(ans);

    const againBtn = $('#btn-again');
    const upgradeRow = $('#l1-finish-actions');
    if (upgradeRow) upgradeRow.style.display = 'none';
    if (againBtn) againBtn.style.display = '';

    if (state.level === 1) {
      state.stageStreak += 1;
      updateStreakUI();
      const need = STAGE_STREAK_NEED;
      const meta = L1_STAGE_META[state.l1Stage];
      $('#complete-msg').textContent =
        `做得好！這一關已連續答對 ${state.stageStreak}/${need} 題。可以用假分數作答案。`;

      renderSteps();
      renderHints();

      if (state.stageStreak >= need) {
        if (state.l1Stage === 'A' || state.l1Stage === 'B') {
          const next = meta.next;
          state.pendingStageAdvance = next;
          if (againBtn) againBtn.style.display = 'none';
          showStageOverlay({
            title: '做得好！',
            msg: `你已經連續答對 ${need} 題。難度會提升！下一關：${L1_STAGE_META[next].label}`,
            mascot: 'celebrate',
            buttons: [
              {
                label: '繼續下一關',
                primary: true,
                onClick: () => advanceToStage(next),
              },
            ],
          });
          return;
        }
        // Stage C cleared
        state.pendingStageAdvance = 'done';
        if (againBtn) againBtn.style.display = 'none';
        if (upgradeRow) upgradeRow.style.display = 'flex';
        $('#complete-msg').textContent =
          '做得好！級別 1 三關都過了。可以升級到級別 2，或者重溫一次。';
        showStageOverlay({
          title: '做得好！',
          msg: '你可以升級到級別 2 學習異分母，或者重溫一次（由第一關再練習）。',
          mascot: 'thumbsup',
          buttons: [
            {
              label: '升級',
              primary: true,
              onClick: () => {
                hideStageOverlay();
                setLevel(2, true);
              },
            },
            {
              label: '重溫一次',
              primary: false,
              onClick: () => {
                hideStageOverlay();
                resetL1ToStageA();
                updateStreakUI();
                newQuestion();
              },
            },
          ],
        });
        return;
      }
    } else if (state.level === 2) {
      state.stageStreak += 1;
      updateStreakUI();
      const need = L2_STAGE_STREAK_NEED; // 連對兩題（含提示）升級
      const meta = L2_STAGE_META[state.l2Stage];
      $('#complete-msg').textContent =
        `做得好！這一關已連續答對 ${state.stageStreak}/${need} 題。可以用假分數作答案，不用轉成帶分數。`;

      renderSteps();
      renderHints();

      if (state.stageStreak >= need) {
        if (state.l2Stage === 'A' || state.l2Stage === 'B') {
          const next = meta.next;
          state.pendingStageAdvance = 'L2' + next;
          if (againBtn) againBtn.style.display = 'none';
          const nextLabel = next === 'B' ? '繼續下一關・帶分數' : '繼續下一關・約分';
          showStageOverlay({
            title: '做得好！',
            msg: `你已經連續答對 ${need} 題。難度會提升！下一關：${L2_STAGE_META[next].label}`,
            mascot: 'celebrate',
            buttons: [
              {
                label: nextLabel,
                primary: true,
                onClick: () => advanceToL2Stage(next),
              },
            ],
          });
          return;
        }
        // Stage C cleared
        state.pendingStageAdvance = 'L2done';
        $('#complete-msg').textContent =
          '做得好！級別 2 三關都過了。可以升級到級別 3，或者重溫。可以用假分數作答案。';
        showStageOverlay({
          title: '做得好！',
          msg: '級別 2 真分數、帶分數和約分都練習過了。可以升級到級別 3，或者由第一關重溫。',
          mascot: 'thumbsup',
          buttons: [
            {
              label: '升級到級別 3',
              primary: true,
              onClick: () => {
                hideStageOverlay();
                setLevel(3, true);
              },
            },
            {
              label: '繼續練習約分關',
              primary: false,
              onClick: () => {
                hideStageOverlay();
                state.stageStreak = 0;
                updateStreakUI();
                newQuestion();
              },
            },
            {
              label: '重溫第一關',
              primary: false,
              onClick: () => {
                hideStageOverlay();
                resetL2ToStageA();
                updateStreakUI();
                newQuestion();
              },
            },
          ],
        });
        return;
      }
    } else {
      updateStreakUI();
      $('#complete-msg').textContent =
        `很棒！本級已連續答對 ${state.streaks[state.level]} 題。可以用假分數作答案，不用轉成帶分數。`;
    }

    renderSteps();
    renderHints();
  }

  // ---------- Hint-guide lock (通分過程) ----------
  function resetHintGuide() {
    state.hintGuideStage = 0;
    state.hintGuideDone = false;
  }

  function isLeftLockedByHint(step) {
    if (!step || !step.locksLeftUntilHintDone) return false;
    if (!state.hintOpen) return false; // hints OFF → left free
    return !state.hintGuideDone;
  }

  function ensureHintGuideForStep(step) {
    if (!step || !step.process) return;
    const t = step.process.type;
    if (t !== 'tongfen-guide' && t !== 'carry-guide') return;
    // Keep progress if already working this step; reset only when needed
    if (state.hintGuideDone) return;
  }

  // ---------- Hints panel ----------
  function renderHints() {
    renderHintText();
    renderHintProcess();
    renderHintNav();
    renderCPA();
  }

  /** Right panel: 通分／進位引導 */
  function renderHintProcess() {
    const box = $('#hint-process');
    if (!box) return;
    box.innerHTML = '';
    const step = state.steps[state.currentStep];
    if (!step || state.complete || !step.process) {
      box.style.display = 'none';
      return;
    }
    if (step.process.type === 'carry-guide') {
      box.style.display = 'block';
      ensureHintGuideForStep(step);
      renderCarryGuide(box, step);
      return;
    }
    if (step.process.type !== 'tongfen-guide') {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    ensureHintGuideForStep(step);
    const P = step.process;
    const stage = state.hintGuideDone ? 3 : state.hintGuideStage;

    const title = document.createElement('div');
    title.className = 'hint-process-title';
    title.textContent = '通分過程';
    box.appendChild(title);

    // Stage pills
    const pills = document.createElement('div');
    pills.className = 'hint-guide-pills';
    const names = ['要通分', '短除法找公倍數', '兩個分數分別擴分'];
    names.forEach((name, i) => {
      const pill = document.createElement('div');
      let cls = 'hint-guide-pill';
      if (state.hintGuideDone || i < state.hintGuideStage) cls += ' done';
      else if (i === state.hintGuideStage) cls += ' current';
      pill.className = cls;
      pill.textContent = (i + 1) + '. ' + name;
      pills.appendChild(pill);
    });
    box.appendChild(pills);

    const body = document.createElement('div');
    body.className = 'hint-guide-body';
    box.appendChild(body);

    if (state.hintGuideDone) {
      // Keep step-3 分別擴分 results visible (read-only) as reference for left answering
      const ok = document.createElement('p');
      ok.className = 'hint-guide-ok';
      ok.textContent = '✓ 通分過程完成！下面擴分結果可以對照左邊作答，再按「核對本步」。';
      body.appendChild(ok);
      const h = document.createElement('h4');
      h.textContent = '③ 兩個分數分別擴分（參考）';
      body.appendChild(h);
      body.appendChild(buildExpandGuideRowReadonly(P.a, P.multA, P.ea.n, P.lcd));
      body.appendChild(buildExpandGuideRowReadonly(P.b, P.multB, P.eb.n, P.lcd));
      return;
    }

    if (state.hintGuideStage <= 0) {
      renderGuideStageDenoms(body, step, P);
    } else if (state.hintGuideStage === 1) {
      renderGuideStageShortDiv(body, step, P);
    } else {
      // stage >= 2 → 分別擴分 (must complete before hintGuideDone)
      renderGuideStageExpand(body, step, P);
    }
  }

  function renderGuideStageDenoms(body, step, P) {
    const h = document.createElement('h4');
    h.textContent = '① 要通分';
    body.appendChild(h);
    const p = document.createElement('p');
    p.innerHTML = colorizeMathTerms('兩個分母不同，份的大小不一樣，不可以直接加分子。請填出兩個分母：');
    body.appendChild(p);
    const list = document.createElement('div');
    list.className = 'hint-denom-list';

    function denomRow(label, key) {
      const row = document.createElement('div');
      row.className = 'hint-denom-item';
      row.appendChild(document.createTextNode(label + ' = '));
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.inputMode = 'numeric';
      inp.pattern = '[0-9]*';
      inp.dataset.guide = key;
      inp.setAttribute('aria-label', label);
      inp.placeholder = '□';
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/[^\d]/g, '');
        inp.classList.remove('wrong', 'correct');
      });
      row.appendChild(inp);
      return row;
    }
    list.appendChild(denomRow('分母①', 'd1'));
    list.appendChild(denomRow('分母②', 'd2'));
    body.appendChild(list);

    const fb = document.createElement('div');
    fb.className = 'step-feedback';
    fb.id = 'hint-guide-fb';
    body.appendChild(fb);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = '核對分母';
    btn.addEventListener('click', () => {
      const i1 = body.querySelector('[data-guide="d1"]');
      const i2 = body.querySelector('[data-guide="d2"]');
      const v1 = Number(i1 && i1.value.trim());
      const v2 = Number(i2 && i2.value.trim());
      // Accept either order
      const ok =
        (v1 === P.d1 && v2 === P.d2) || (v1 === P.d2 && v2 === P.d1);
      const partKey = 'guide:denoms';
      if (i1) {
        i1.classList.toggle('correct', ok && Number.isFinite(v1));
        i1.classList.toggle('wrong', !ok);
      }
      if (i2) {
        i2.classList.toggle('correct', ok && Number.isFinite(v2));
        i2.classList.toggle('wrong', !ok);
      }
      if (ok) {
        resetPartConsecutive(partKey);
        fb.className = 'step-feedback ok';
        fb.textContent = '✓ 分母正確！';
        state.hintGuideStage = 1;
        setTimeout(() => renderHints(), 350);
      } else {
        state.questionMistakes += 1;
        const consec = registerPartWrong(partKey);
        if (consec >= 3) {
          markQuestionIncorrectByReveal();
          fillInputExpected(i1, P.d1);
          fillInputExpected(i2, P.d2);
          setRevealFeedback(fb);
          setMascot('think');
          state.hintGuideStage = 1;
          setTimeout(() => renderHints(), AUTO_REVEAL_AFTER_MS);
          return;
        }
        fb.className = 'step-feedback err';
        fb.textContent = '再看一看題目的兩個分母，填入空格。';
      }
    });
    body.appendChild(btn);
  }

  function lcmFactorList(sd) {
    // divisors on the left × bottom remainders
    const factors = (sd.divisors || []).slice();
    const rem = sd.remainders || (sd.rows && sd.rows.length ? sd.rows[sd.rows.length - 1] : []);
    if (rem && rem.length) {
      rem.forEach((n) => factors.push(n));
    }
    return factors;
  }

  function renderGuideStageShortDiv(body, step, P) {
    const h = document.createElement('h4');
    h.textContent = '② 短除法找公倍數';
    body.appendChild(h);
    const sd = P.sd;
    // Reuse process UI; grade short-div fields against a synthetic step
    const synFields = (typeof FracSteps !== 'undefined' && sd)
      ? null
      : null;
    // Build fields locally for grading this stage
    const fields = [];
    if (sd) {
      (sd.divisors || []).forEach((div, i) => {
        fields.push({ key: 'sd_div_' + i, expected: div, label: '除數' + (i + 1) });
      });
      for (let i = 1; i < (sd.rows || []).length; i++) {
        fields.push({ key: 'sd_row_' + i + '_L', expected: sd.rows[i][0] });
        fields.push({ key: 'sd_row_' + i + '_R', expected: sd.rows[i][1] });
      }
    }
    const synStep = { fields: fields, show: { sd: sd }, process: { sd: sd } };
    body.appendChild(buildShortDivProcessUI(synStep, false, { includeLcm: false, graded: true }));

    // Multiply guide: user fills factor blanks AND product (nothing auto-filled)
    const expectedFactors = lcmFactorList(sd || { divisors: [], remainders: [P.d1, P.d2], rows: [[P.d1, P.d2]] });
    const nFac = Math.max(expectedFactors.length, 2);
    const mul = document.createElement('div');
    mul.className = 'hint-lcm-mul';
    const mulLabel = document.createElement('div');
    mulLabel.className = 'hint-lcm-expr';
    mulLabel.textContent = '相乘：';
    mul.appendChild(mulLabel);
    const factorInputs = [];
    for (let fi = 0; fi < nFac; fi++) {
      if (fi > 0) {
        const times = document.createElement('span');
        times.textContent = ' × ';
        mul.appendChild(times);
      }
      const fin = document.createElement('input');
      fin.type = 'text';
      fin.inputMode = 'numeric';
      fin.pattern = '[0-9]*';
      fin.dataset.guide = 'lcm_fac_' + fi;
      fin.placeholder = '□';
      fin.setAttribute('aria-label', '乘數 ' + (fi + 1));
      fin.addEventListener('input', () => {
        fin.value = fin.value.replace(/[^\d]/g, '');
        fin.classList.remove('wrong', 'correct');
      });
      factorInputs.push(fin);
      mul.appendChild(fin);
    }
    const eq = document.createElement('span');
    eq.textContent = ' = ';
    mul.appendChild(eq);
    const lcmInp = document.createElement('input');
    lcmInp.type = 'text';
    lcmInp.inputMode = 'numeric';
    lcmInp.pattern = '[0-9]*';
    lcmInp.dataset.guideField = 'lcm';
    lcmInp.placeholder = '□';
    lcmInp.setAttribute('aria-label', '公倍數');
    lcmInp.className = 'role-den';
    lcmInp.addEventListener('input', () => {
      lcmInp.value = lcmInp.value.replace(/[^\d]/g, '');
      lcmInp.classList.remove('wrong', 'correct');
    });
    mul.appendChild(lcmInp);
    body.appendChild(mul);
    const tip = document.createElement('p');
    tip.className = 'hint-guide-tip';
    tip.textContent = '將短除左邊每個除數，以及最底兩個數，全部填入相乘，得出最小公倍數。';
    body.appendChild(tip);

    const fb = document.createElement('div');
    fb.className = 'step-feedback';
    fb.id = 'hint-guide-fb';
    body.appendChild(fb);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = '核對短除／公倍數';
    btn.addEventListener('click', () => {
      const values = {};
      $$('#hint-process input[data-field]').forEach((inp) => {
        values[inp.dataset.field] = inp.value.trim();
      });
      let allOk = true;
      // Require short-div grid when there are divisor rows
      fields.forEach((f) => {
        const inp = document.querySelector('#hint-process input[data-field="' + f.key + '"]');
        const num = Number(values[f.key]);
        const ok = values[f.key] !== '' && Number.isFinite(num) && num === f.expected;
        if (inp) {
          inp.classList.toggle('correct', ok);
          inp.classList.toggle('wrong', !ok);
        }
        if (!ok) allOk = false;
      });

      // Factor blanks: must multiply to lcd (order-insensitive match to expected factors preferred)
      const gotFacs = factorInputs.map((inp) => Number(inp.value.trim()));
      const facsFilled = factorInputs.every((inp) => inp.value.trim() !== '');
      let facProd = 1;
      gotFacs.forEach((n) => { facProd *= n; });
      const sortedGot = gotFacs.slice().sort((a, b) => a - b);
      const sortedExp = expectedFactors.slice().sort((a, b) => a - b);
      const facsMatch =
        facsFilled &&
        sortedGot.length === sortedExp.length &&
        sortedGot.every((n, i) => n === sortedExp[i]);
      const facProdOk = facsFilled && facProd === P.lcd;
      factorInputs.forEach((inp) => {
        inp.classList.toggle('correct', facsMatch || facProdOk);
        inp.classList.toggle('wrong', !(facsMatch || facProdOk));
      });
      if (!(facsMatch || facProdOk)) allOk = false;

      const gotLcm = Number(lcmInp.value.trim());
      const lcmOk = lcmInp.value.trim() !== '' && gotLcm === P.lcd;
      lcmInp.classList.toggle('correct', lcmOk);
      lcmInp.classList.toggle('wrong', !lcmOk);
      if (!lcmOk) allOk = false;

      // Never skip to done here — only advance to stage 2 (擴分)
      const fbEl = $('#hint-guide-fb');
      const partKey = 'guide:shortdiv';
      if (allOk) {
        resetPartConsecutive(partKey);
        if (fbEl) { fbEl.className = 'step-feedback ok'; fbEl.textContent = '✓ 短除和公倍數正確！下一步擴分。'; }
        state.hintGuideStage = 2; // MUST go to 分別擴分 — do not set hintGuideDone
        state.hintGuideDone = false;
        setTimeout(() => renderHints(), 350);
      } else {
        state.questionMistakes += 1;
        const consec = registerPartWrong(partKey);
        if (consec >= 3) {
          markQuestionIncorrectByReveal();
          fields.forEach((f) => {
            const inp = document.querySelector('#hint-process input[data-field="' + f.key + '"]');
            fillInputExpected(inp, f.expected);
          });
          // 相乘格：優先填預期因數；格數唔啱則用「公倍數 × 1 × …」令積正確
          if (factorInputs.length === expectedFactors.length) {
            factorInputs.forEach((inp, idx) => fillInputExpected(inp, expectedFactors[idx]));
          } else {
            factorInputs.forEach((inp, idx) => fillInputExpected(inp, idx === 0 ? P.lcd : 1));
          }
          fillInputExpected(lcmInp, P.lcd);
          setRevealFeedback(fbEl);
          setMascot('think');
          state.hintGuideStage = 2;
          state.hintGuideDone = false;
          setTimeout(() => renderHints(), AUTO_REVEAL_AFTER_MS);
          return;
        }
        if (fbEl) { fbEl.className = 'step-feedback err'; fbEl.textContent = '請再試短除空格、相乘和公倍數。'; }
      }
    });
    body.appendChild(btn);
  }

  function renderGuideStageExpand(body, step, P) {
    const h = document.createElement('h4');
    h.textContent = '③ 兩個分數分別擴分';
    body.appendChild(h);
    const tip = document.createElement('p');
    tip.className = 'hint-guide-tip';
    tip.innerHTML = colorizeMathTerms('每個分數的分子和分母都要乘同一個倍數，令分母變成 ' + P.lcd + '。');
    body.appendChild(tip);

    body.appendChild(buildExpandGuideRow(P.a, P.multA, P.ea.n, P.lcd, 'a'));
    body.appendChild(buildExpandGuideRow(P.b, P.multB, P.eb.n, P.lcd, 'b'));

    const fb = document.createElement('div');
    fb.className = 'step-feedback';
    fb.id = 'hint-guide-fb';
    body.appendChild(fb);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = '核對擴分';
    btn.addEventListener('click', () => {
      const checks = [
        { sel: '[data-guide="a_mult_n"]', exp: P.multA },
        { sel: '[data-guide="a_mult_d"]', exp: P.multA },
        { sel: '[data-guide="a_res_n"]', exp: P.ea.n },
        { sel: '[data-guide="b_mult_n"]', exp: P.multB },
        { sel: '[data-guide="b_mult_d"]', exp: P.multB },
        { sel: '[data-guide="b_res_n"]', exp: P.eb.n },
      ];
      let allOk = true;
      checks.forEach((c) => {
        const inp = body.querySelector(c.sel);
        if (!inp) { allOk = false; return; }
        const num = Number(inp.value.trim());
        const ok = num === c.exp;
        inp.classList.toggle('correct', ok);
        inp.classList.toggle('wrong', !ok);
        if (!ok) allOk = false;
      });
      const fbEl = $('#hint-guide-fb');
      const partKey = 'guide:expand';
      if (allOk) {
        resetPartConsecutive(partKey);
        if (fbEl) { fbEl.className = 'step-feedback ok'; fbEl.textContent = '✓ 擴分正確！'; }
        state.hintGuideDone = true;
        setMascot('thumbsup');
        setTimeout(() => {
          renderSteps();
          renderHints();
        }, 350);
      } else {
        state.questionMistakes += 1;
        const consec = registerPartWrong(partKey);
        if (consec >= 3) {
          markQuestionIncorrectByReveal();
          checks.forEach((c) => {
            const inp = body.querySelector(c.sel);
            fillInputExpected(inp, c.exp);
          });
          setRevealFeedback(fbEl);
          setMascot('think');
          state.hintGuideDone = true;
          setTimeout(() => {
            renderSteps();
            renderHints();
          }, AUTO_REVEAL_AFTER_MS);
          return;
        }
        if (fbEl) { fbEl.className = 'step-feedback err'; fbEl.textContent = '再看一看倍數和擴分後的分子。'; }
      }
    });
    body.appendChild(btn);
  }

  function buildExpandGuideRow(addend, mult, resN, lcd, side) {
    const row = document.createElement('div');
    row.className = 'hint-expand-row';
    // e.g. 1/2 = (1×□)/(2×□) = □/10  — all with stacked fraction bars
    const n = addend.n;
    const d = addend.d;

    const left = document.createElement('span');
    left.className = 'hint-expand-left';
    left.innerHTML = htmlFrac(n, d);
    row.appendChild(left);

    const eq1 = document.createElement('span');
    eq1.className = 'op';
    eq1.textContent = '=';
    row.appendChild(eq1);

    // Middle: stacked fraction  (n × □) / (d × □)
    const mid = document.createElement('span');
    mid.className = 'frac hint-expand-mid-frac';
    const midNum = document.createElement('span');
    midNum.className = 'num hint-expand-mul';
    midNum.appendChild(document.createTextNode(n + ' × '));
    midNum.appendChild(guideBlank('' + side + '_mult_n'));
    mid.appendChild(midNum);
    const midBar = document.createElement('span');
    midBar.className = 'bar';
    mid.appendChild(midBar);
    const midDen = document.createElement('span');
    midDen.className = 'den hint-expand-mul';
    midDen.appendChild(document.createTextNode(d + ' × '));
    midDen.appendChild(guideBlank('' + side + '_mult_d'));
    mid.appendChild(midDen);
    row.appendChild(mid);

    const eq2 = document.createElement('span');
    eq2.className = 'op';
    eq2.textContent = '=';
    row.appendChild(eq2);

    // Result: stacked □ / lcd
    const right = document.createElement('span');
    right.className = 'frac hint-expand-frac';
    const rn = document.createElement('span');
    rn.className = 'num';
    rn.appendChild(guideBlank('' + side + '_res_n'));
    right.appendChild(rn);
    const rbar = document.createElement('span');
    rbar.className = 'bar';
    right.appendChild(rbar);
    const rd = document.createElement('span');
    rd.className = 'den hint-expand-den';
    rd.textContent = String(lcd);
    right.appendChild(rd);
    row.appendChild(right);

    return row;
  }

  /** Read-only filled expansion row for post-guide reference */
  function buildExpandGuideRowReadonly(addend, mult, resN, lcd) {
    const row = document.createElement('div');
    row.className = 'hint-expand-row hint-expand-readonly';
    const n = addend.n;
    const d = addend.d;

    const left = document.createElement('span');
    left.className = 'hint-expand-left';
    left.innerHTML = htmlFrac(n, d);
    row.appendChild(left);

    const eq1 = document.createElement('span');
    eq1.className = 'op';
    eq1.textContent = '=';
    row.appendChild(eq1);

    const mid = document.createElement('span');
    mid.className = 'frac hint-expand-mid-frac';
    const midNum = document.createElement('span');
    midNum.className = 'num hint-expand-mul';
    midNum.innerHTML = n + ' × <strong class="hint-filled">' + mult + '</strong>';
    mid.appendChild(midNum);
    const midBar = document.createElement('span');
    midBar.className = 'bar';
    mid.appendChild(midBar);
    const midDen = document.createElement('span');
    midDen.className = 'den hint-expand-mul';
    midDen.innerHTML = d + ' × <strong class="hint-filled">' + mult + '</strong>';
    mid.appendChild(midDen);
    row.appendChild(mid);

    const eq2 = document.createElement('span');
    eq2.className = 'op';
    eq2.textContent = '=';
    row.appendChild(eq2);

    const right = document.createElement('span');
    right.className = 'frac hint-expand-frac';
    const rn = document.createElement('span');
    rn.className = 'num';
    rn.innerHTML = '<strong class="hint-filled">' + resN + '</strong>';
    right.appendChild(rn);
    const rbar = document.createElement('span');
    rbar.className = 'bar';
    right.appendChild(rbar);
    const rd = document.createElement('span');
    rd.className = 'den hint-expand-den';
    rd.textContent = String(lcd);
    right.appendChild(rd);
    row.appendChild(right);

    return row;
  }

  function guideBlank(key) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.inputMode = 'numeric';
    inp.pattern = '[0-9]*';
    inp.dataset.guide = key;
    inp.setAttribute('aria-label', key);
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/[^\d]/g, '');
      inp.classList.remove('wrong', 'correct');
    });
    return inp;
  }

  /** Right panel: 假分數 → 帶分數（進位）引導 */
  function renderCarryGuide(box, step) {
    const P = step.process;
    const title = document.createElement('div');
    title.className = 'hint-process-title';
    title.textContent = '假分數變帶分數';
    box.appendChild(title);

    const pills = document.createElement('div');
    pills.className = 'hint-guide-pills';
    const names = ['認假分數', '除法變帶分數'];
    names.forEach((name, i) => {
      const pill = document.createElement('div');
      let cls = 'hint-guide-pill';
      if (state.hintGuideDone || i < state.hintGuideStage) cls += ' done';
      else if (i === state.hintGuideStage) cls += ' current';
      pill.className = cls;
      pill.textContent = (i + 1) + '. ' + name;
      pills.appendChild(pill);
    });
    box.appendChild(pills);

    const body = document.createElement('div');
    body.className = 'hint-guide-body';
    box.appendChild(body);

    if (state.hintGuideDone) {
      const ok = document.createElement('p');
      ok.className = 'hint-guide-ok';
      ok.textContent = '✓ 假分數已變帶分數！可以對照左邊填：整數 ' + (P.whole + P.carry) + '，分數 ' + P.rem + '/' + P.d + '。';
      body.appendChild(ok);
      body.appendChild(buildCarryResultReadonly(P));
      return;
    }

    if (state.hintGuideStage <= 0) {
      renderCarryStageRecognize(body, P);
    } else {
      renderCarryStageDivide(body, P);
    }
  }

  function buildCarryResultReadonly(P) {
    const wrap = document.createElement('div');
    wrap.className = 'hint-carry-result';
    wrap.innerHTML =
      '<div class="hint-carry-eq">' +
      '<span class="term-whole">' + P.whole + '</span> ' +
      '<span class="frac"><span class="num term-num">' + P.n + '</span><span class="bar"></span><span class="den term-den">' + P.d + '</span></span>' +
      ' = ' +
      '<span class="term-whole">' + (P.whole + P.carry) + '</span> ' +
      '<span class="frac"><span class="num term-num">' + P.rem + '</span><span class="bar"></span><span class="den term-den">' + P.d + '</span></span>' +
      '</div>';
    return wrap;
  }

  function renderCarryStageRecognize(body, P) {
    const h = document.createElement('h4');
    h.textContent = '① 認假分數';
    body.appendChild(h);
    const p = document.createElement('p');
    // colorizeMathTerms escapes HTML — build markup after coloring plain text
    p.innerHTML =
      '分數部分 <strong class="term-num">' + P.n + '</strong>/<strong class="term-den">' + P.d + '</strong>：' +
      colorizeMathTerms('分子 ' + P.n + ' ≥ 分母 ' + P.d + '，所以是') +
      '<strong>假分數</strong>' +
      colorizeMathTerms('（大於或等於 1）。假分數要先變成') +
      '<strong>帶分數</strong>' +
      colorizeMathTerms('，才可以和整數合起來。');
    body.appendChild(p);
    const tip = document.createElement('p');
    tip.className = 'hint-guide-tip';
    tip.textContent = '下一步會用「分子 ÷ 分母」找商和餘數。';
    body.appendChild(tip);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = '下一步：除法變帶分數';
    btn.addEventListener('click', () => {
      state.hintGuideStage = 1;
      state.hintGuideDone = false;
      renderHints();
    });
    body.appendChild(btn);
  }

  function renderCarryStageDivide(body, P) {
    const h = document.createElement('h4');
    h.textContent = '② 除法變帶分數';
    body.appendChild(h);
    const tip = document.createElement('p');
    tip.className = 'hint-guide-tip';
    tip.innerHTML =
      colorizeMathTerms('用分子 ÷ 分母找商和餘數；') +
      colorizeMathTerms('然後 ') +
      '<strong>整數＋商＋餘/分母</strong>' +
      colorizeMathTerms(' = 帶分數。');
    body.appendChild(tip);

    // n ÷ d = □ ... □
    const divRow = document.createElement('div');
    divRow.className = 'hint-carry-div';
    divRow.appendChild(document.createTextNode(P.n + ' ÷ ' + P.d + ' = '));
    const qInp = document.createElement('input');
    qInp.type = 'text';
    qInp.inputMode = 'numeric';
    qInp.pattern = '[0-9]*';
    qInp.dataset.guide = 'carry_q';
    qInp.placeholder = '商';
    qInp.setAttribute('aria-label', '商');
    divRow.appendChild(qInp);
    divRow.appendChild(document.createTextNode(' … '));
    const rInp = document.createElement('input');
    rInp.type = 'text';
    rInp.inputMode = 'numeric';
    rInp.pattern = '[0-9]*';
    rInp.dataset.guide = 'carry_r';
    rInp.placeholder = '餘';
    rInp.setAttribute('aria-label', '餘數');
    divRow.appendChild(rInp);
    body.appendChild(divRow);

    const join = document.createElement('p');
    join.style.margin = '0.75rem 0 0.35rem';
    join.innerHTML = colorizeMathTerms('合起來成為帶分數：');
    body.appendChild(join);

    // (整數) + (商) + (餘)/分母 = [新整數] [新分子]/分母  （分數用分線）
    const mixRow = document.createElement('div');
    mixRow.className = 'hint-carry-div hint-carry-eq';
    const wholeParen = document.createElement('span');
    wholeParen.innerHTML = '(<span class="term-whole">' + P.whole + '</span>)';
    mixRow.appendChild(wholeParen);
    mixRow.appendChild(document.createTextNode(' + '));
    const qParen = document.createElement('span');
    qParen.textContent = '(商)';
    mixRow.appendChild(qParen);
    mixRow.appendChild(document.createTextNode(' + '));
    const remFrac = document.createElement('span');
    remFrac.className = 'frac';
    remFrac.setAttribute('aria-label', '餘 分之 ' + P.d);
    remFrac.innerHTML =
      '<span class="num term-num">餘</span><span class="bar"></span><span class="den term-den">' +
      P.d +
      '</span>';
    mixRow.appendChild(remFrac);
    mixRow.appendChild(document.createTextNode(' = '));
    const wInp = document.createElement('input');
    wInp.type = 'text';
    wInp.inputMode = 'numeric';
    wInp.pattern = '[0-9]*';
    wInp.dataset.guide = 'carry_new_w';
    wInp.placeholder = '□';
    wInp.setAttribute('aria-label', '新整數');
    mixRow.appendChild(wInp);
    const ansFrac = document.createElement('span');
    ansFrac.className = 'frac';
    ansFrac.setAttribute('aria-label', '新分子 分之 ' + P.d);
    const nInp = document.createElement('input');
    nInp.type = 'text';
    nInp.inputMode = 'numeric';
    nInp.pattern = '[0-9]*';
    nInp.dataset.guide = 'carry_new_n';
    nInp.placeholder = '□';
    nInp.setAttribute('aria-label', '新分子');
    const numWrap = document.createElement('span');
    numWrap.className = 'num term-num';
    numWrap.appendChild(nInp);
    ansFrac.appendChild(numWrap);
    const ansBar = document.createElement('span');
    ansBar.className = 'bar';
    ansFrac.appendChild(ansBar);
    const denSpan = document.createElement('span');
    denSpan.className = 'den term-den';
    denSpan.textContent = String(P.d);
    ansFrac.appendChild(denSpan);
    mixRow.appendChild(ansFrac);
    body.appendChild(mixRow);

    const fb = document.createElement('div');
    fb.className = 'step-feedback';
    fb.id = 'hint-guide-fb';
    body.appendChild(fb);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = '核對假分數→帶分數';
    btn.style.marginTop = '0.65rem';
    btn.addEventListener('click', () => {
      const checks = [
        { sel: '[data-guide="carry_q"]', exp: P.carry },
        { sel: '[data-guide="carry_r"]', exp: P.rem },
        { sel: '[data-guide="carry_new_w"]', exp: P.whole + P.carry },
        { sel: '[data-guide="carry_new_n"]', exp: P.rem },
      ];
      let allOk = true;
      checks.forEach((c) => {
        const inp = body.querySelector(c.sel);
        if (!inp) { allOk = false; return; }
        const num = Number(inp.value.trim());
        const ok = inp.value.trim() !== '' && num === c.exp;
        inp.classList.toggle('correct', ok);
        inp.classList.toggle('wrong', !ok);
        if (!ok) allOk = false;
      });
      const fbEl = $('#hint-guide-fb');
      const partKey = 'guide:carry';
      if (allOk) {
        resetPartConsecutive(partKey);
        if (fbEl) { fbEl.className = 'step-feedback ok'; fbEl.textContent = '✓ 假分數變成帶分數正確！'; }
        state.hintGuideDone = true;
        setMascot('thumbsup');
        setTimeout(() => {
          renderSteps();
          renderHints();
        }, 350);
      } else {
        state.questionMistakes += 1;
        const consec = registerPartWrong(partKey);
        if (consec >= 3) {
          markQuestionIncorrectByReveal();
          checks.forEach((c) => {
            const inp = body.querySelector(c.sel);
            fillInputExpected(inp, c.exp);
          });
          setRevealFeedback(fbEl);
          setMascot('think');
          state.hintGuideDone = true;
          setTimeout(() => {
            renderSteps();
            renderHints();
          }, AUTO_REVEAL_AFTER_MS);
          return;
        }
        if (fbEl) {
          fbEl.className = 'step-feedback err';
          fbEl.textContent = '請再試：' + P.n + ' ÷ ' + P.d + ' 的商和餘數，再加到整數 ' + P.whole + '。';
        }
      }
    });
    body.appendChild(btn);
  }

  function renderHintText() {
    const step = state.steps[state.currentStep];
    const bubble = $('#hint-bubble');
    if (!bubble) return;
    if (state.complete) {
      bubble.innerHTML = colorizeMathTerms('全部步驟都完成了！左邊可以回顧整條橫式過程。按「再來一題」繼續練習。');
      $('#hint-extra').classList.remove('show');
      return;
    }
    if (step) {
      bubble.innerHTML = colorizeMathTerms(step.hint);
    }
  }

  function renderHintNav() {
    const nav = $('#hint-steps-nav');
    if (!nav) return;
    nav.innerHTML = '';
    state.steps.forEach((step, i) => {
      const pill = document.createElement('div');
      let cls = 'hint-step-pill';
      if (state.complete) cls += ' review done';
      else if (i < state.currentStep) cls += ' done';
      else if (i === state.currentStep) cls += ' current';
      pill.className = cls;
      pill.innerHTML = (i + 1) + '. ' + colorizeMathTerms(step.title);
      nav.appendChild(pill);
    });
  }

  function renderCPA() {
    const box = $('#cpa-bars');
    if (!box) return;
    const step = state.steps[state.currentStep];
    if (!step || !step.cpa || state.complete) {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    const { d1, d2, lcd } = step.cpa;
    box.innerHTML = `<h4>圖像提示：通分後份一樣大</h4>
      ${cpaRow(d1, '第一個分母', '#5eead4')}
      ${cpaRow(d2, '第二個分母', '#7dd3fc')}
      ${cpaRow(lcd, '公倍數', '#86efac')}`;
  }

  function cpaRow(parts, label, color) {
    const n = Math.min(parts, 24);
    let cells = '';
    for (let i = 0; i < n; i++) cells += `<span style="background:${color}"></span>`;
    return `<div class="cpa-bar-row"><span style="width:5.5rem">${label} ${parts}</span><div class="cpa-bar">${cells}</div></div>`;
  }

  function toggleHints() {
    state.hintOpen = !state.hintOpen;
    const panel = $('#hint-panel');
    const work = $('#work-panel');
    if (state.hintOpen) {
      panel.classList.remove('hidden');
      work.classList.remove('expanded');
    } else {
      panel.classList.add('hidden');
      work.classList.add('expanded');
      // Hints off → left answering unlocked immediately
    }
    updateHintToggleFab();
    $('#btn-toggle-hint').textContent = state.hintOpen ? '隱藏提示' : '顯示提示';
    renderSteps();
    renderHints();
  }

  function updateHintToggleFab() {
    const fab = $('#hint-toggle-fab');
    if (!fab) return;
    if (!state.hintOpen) {
      fab.classList.add('show');
      fab.textContent = '顯示提示';
    } else {
      fab.classList.remove('show');
    }
  }


  // ---------- On-screen numeric keypad (mobile-friendly) ----------
  let lastNumInput = null;

  function isKeypadTarget(el) {
    if (!el || el.tagName !== 'INPUT' || el.disabled) return false;
    if (!el.closest('#work-panel, #hint-panel')) return false;
    // Locked / graded-complete blanks (not OSK-suppressed)
    if (el.readOnly && !el.dataset.osk) return false;
    const mode = el.inputMode || '';
    return (
      mode === 'numeric' ||
      mode === 'none' ||
      el.pattern === '[0-9]*' ||
      el.dataset.field != null ||
      el.dataset.guide != null
    );
  }

  function listKeypadTargets() {
    const root = $('#screen-practice');
    if (!root) return [];
    return Array.from(
      root.querySelectorAll('#work-panel input, #hint-panel input')
    ).filter(isKeypadTarget);
  }

  function findFirstEmptyNumInput() {
    const all = listKeypadTargets();
    return all.find((el) => !String(el.value || '').trim()) || all[0] || null;
  }

  function resolveKeypadTarget() {
    const input = lastNumInput;
    if (input && input.isConnected && isKeypadTarget(input)) return input;
    return findFirstEmptyNumInput();
  }

  function wantsOnscreenKeypad() {
    try {
      return window.matchMedia('(pointer: coarse)').matches;
    } catch (e) {
      return false;
    }
  }

  function suppressSoftKeyboard(el) {
    if (!wantsOnscreenKeypad() || !el) return;
    el.dataset.osk = '1';
    el.setAttribute('readonly', 'readonly');
    el.inputMode = 'none';
  }

  function applyKeypadKey(key) {
    const input = resolveKeypadTarget();
    if (!input) return;
    suppressSoftKeyboard(input);
    if (key === 'del') {
      input.value = String(input.value || '').slice(0, -1);
    } else if (/^\d$/.test(key)) {
      input.value = (String(input.value || '') + key).replace(/[^\d]/g, '');
    } else {
      return;
    }
    input.classList.remove('wrong');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    try {
      input.focus({ preventScroll: true });
    } catch (e) {
      input.focus();
    }
    lastNumInput = input;
  }

  function bindNumKeypad() {
    const pad = $('#num-keypad');
    if (!pad) return;

    document.addEventListener('focusin', (e) => {
      if (isKeypadTarget(e.target)) {
        lastNumInput = e.target;
        suppressSoftKeyboard(e.target);
      }
    });

    // Keep the blank focused when tapping keys (don't steal focus)
    pad.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button[data-key]')) e.preventDefault();
    });

    pad.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-key]');
      if (!btn || btn.disabled) return;
      applyKeypadKey(btn.dataset.key);
    });
  }



  // ---------- Teacher report ----------
  let teacherUnlocked = false;
  let teacherRecordsCache = [];
  let teacherUnsub = null;
  let teacherExpandedSessions = new Set();
  const TEACHER_SESSION_GAP_MS = 15 * 60 * 1000;

  function wantTeacherMode() {
    try {
      return new URLSearchParams(location.search).get('teacher') === '1';
    } catch (e) {
      return false;
    }
  }

  function openTeacherScreen() {
    showScreen('screen-teacher');
    const gate = $('#teacher-gate');
    const panel = $('#teacher-panel');
    if (!teacherUnlocked) {
      if (gate) gate.hidden = false;
      if (panel) panel.hidden = true;
      whenFracCloudReady().then((cloud) => {
        const input = $('#teacher-gate-code');
        if (input && cloud) input.value = cloud.getTeacherCode() === 'default' ? '' : cloud.getTeacherCode();
      });
    } else {
      if (gate) gate.hidden = true;
      if (panel) panel.hidden = false;
      fillTeacherSettingsForm();
      refreshTeacherTable();
    }
  }

  function leaveTeacherScreen() {
    if (teacherUnsub) {
      try { teacherUnsub(); } catch (e) {}
      teacherUnsub = null;
    }
    // Strip ?teacher=1 without full reload if possible
    try {
      const url = new URL(location.href);
      url.searchParams.delete('teacher');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) {}
    if (state.studentId) {
      showScreen('screen-practice');
    } else {
      initStart();
    }
  }

  async function enterTeacherWithCode() {
    const cloud = await whenFracCloudReady();
    const raw = ($('#teacher-gate-code') && $('#teacher-gate-code').value) || '';
    const code = cloud ? cloud.sanitizeTeacherCode(raw) : (String(raw || 'default').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'default');
    if (cloud) cloud.setTeacherCode(code);
    teacherUnlocked = true;
    const gate = $('#teacher-gate');
    const panel = $('#teacher-panel');
    if (gate) gate.hidden = true;
    if (panel) panel.hidden = false;
    fillTeacherSettingsForm();
    refreshTeacherTable();
  }

  async function fillTeacherSettingsForm() {
    const cloud = await whenFracCloudReady();
    const ta = $('#teacher-config-input');
    const codeInp = $('#teacher-code-input');
    const status = $('#teacher-cloud-status');
    if (!cloud) {
      if (status) status.textContent = '雲端模組尚未載入。';
      return;
    }
    if (codeInp) codeInp.value = cloud.getTeacherCode();
    if (ta) {
      const cfg = cloud.getFirebaseConfig();
      ta.value = cfg ? JSON.stringify(cfg, null, 2) : '';
    }
    if (status) {
      status.textContent = cloud.isConfigured()
        ? '已偵測到 Firebase 設定，可嘗試連接雲端。'
        : '尚未設定 Firebase：學生成績會暫存本機。可在下方貼上 JSON，或編輯 js/firebase-config.js 後部署。';
    }
  }

  async function saveTeacherCloudSettings() {
    const cloud = await whenFracCloudReady();
    const status = $('#teacher-cloud-status');
    if (!cloud) {
      if (status) status.textContent = '雲端模組尚未載入。';
      return;
    }
    const rawVal = ($('#teacher-config-input') && $('#teacher-config-input').value || '').trim();
    const rawCode = ($('#teacher-code-input') && $('#teacher-code-input').value || '').trim();
    if (!rawVal) {
      alert('請輸入有效的 Firebase 設定 JSON。');
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(rawVal);
    } catch (e) {
      alert('JSON 格式不正確，請確認已複製完整內容（欄位名須加雙引號）。');
      return;
    }
    if (!parsed.apiKey || !parsed.projectId) {
      alert('設定缺少必要的 apiKey 或 projectId 欄位，請檢查。');
      return;
    }
    const code = cloud.sanitizeTeacherCode(rawCode);
    cloud.setTeacherCode(code);
    cloud.saveFirebaseConfigToLocal(parsed);
    if (status) status.textContent = '已儲存本機設定，正在重新連接……';
    // Force re-init by reload is simplest (Firebase app name already registered otherwise)
    alert('雲端設定已儲存，頁面將重新載入。');
    const url = new URL(location.href);
    url.searchParams.set('teacher', '1');
    location.href = url.toString();
  }

  async function clearTeacherCloudSettings() {
    if (!confirm('確定清除本瀏覽器的雲端設定嗎？（不會刪除已上傳的記錄）')) return;
    const cloud = await whenFracCloudReady();
    if (cloud) cloud.clearFirebaseConfigLocal();
    alert('已清除，頁面將重新載入。');
    const url = new URL(location.href);
    url.searchParams.set('teacher', '1');
    location.href = url.toString();
  }

  function stageDisplay(rec) {
    if (!rec) return '—';
    if (rec.level === 3 || rec.level === '3') return '—';
    const s = rec.stage || '';
    if (!s) return '—';
    const map = { A: '第一關', B: '第二關', C: '第三關' };
    return map[s] || s;
  }

  function stageOrder(stage) {
    const s = String(stage || '');
    if (s === 'A' || s === '第一關') return 1;
    if (s === 'B' || s === '第二關') return 2;
    if (s === 'C' || s === '第三關') return 3;
    return 0;
  }

  function progressScore(rec) {
    return (Number(rec && rec.level) || 0) * 10 + stageOrder(rec && rec.stage);
  }

  function progressLabel(rec) {
    const lv = 'L' + (rec && rec.level != null ? rec.level : '');
    const st = stageDisplay(rec);
    if (!st || st === '—') return lv;
    return lv + ' ' + st;
  }

  function formatDuration(sec) {
    const n = Math.max(0, Math.round(Number(sec) || 0));
    if (n < 60) return n + ' 秒';
    const m = Math.floor(n / 60);
    const s = n % 60;
    return m + ' 分 ' + s + ' 秒';
  }

  /** 單筆題目結果：正確／錯誤／—（舊資料無欄位） */
  function recordResultLabel(r) {
    if (!r) return '—';
    if (r.result === '正確' || r.result === '錯誤') return r.result;
    if (r.correct === true) return '正確';
    if (r.correct === false) return '錯誤';
    return '—';
  }

  function sessionResultSummary(stages) {
    let ok = 0;
    let bad = 0;
    let unknown = 0;
    (stages || []).forEach((r) => {
      const lab = recordResultLabel(r);
      if (lab === '正確') ok += 1;
      else if (lab === '錯誤') bad += 1;
      else unknown += 1;
    });
    if (ok + bad === 0) return '—';
    return ok + ' 正確／' + bad + ' 錯誤';
  }

  function buildTeacherSession(recs, key) {
    const sortedAsc = recs.slice().sort((a, b) => String(a.finishedAt || '').localeCompare(String(b.finishedAt || '')));
    let best = sortedAsc[0];
    let mistakes = 0;
    let duration = 0;
    sortedAsc.forEach((r) => {
      mistakes += Number(r.mistakes) || 0;
      duration += Number(r.durationSec) || 0;
      if (progressScore(r) >= progressScore(best)) best = r;
    });
    const latest = sortedAsc[sortedAsc.length - 1];
    return {
      key,
      studentId: (latest && latest.studentId) || (sortedAsc[0] && sortedAsc[0].studentId) || '',
      progressLabel: progressLabel(best),
      mistakes,
      resultSummary: sessionResultSummary(sortedAsc),
      durationSec: duration,
      finishedAt: latest && latest.finishedAt,
      stages: sortedAsc,
      sessionLabel: (sortedAsc[0] && sortedAsc[0].sessionId) || key,
    };
  }

  /**
   * Group stage records into play sessions.
   * Prefer sessionId when present; otherwise same studentId with ≤15 min gap.
   */
  function groupRecordsIntoSessions(records) {
    const withSession = new Map();
    const without = [];
    (records || []).forEach((r) => {
      const sid = r && r.sessionId != null && String(r.sessionId).trim();
      if (sid) {
        const k = String(r.studentId || '') + '\0' + sid;
        if (!withSession.has(k)) withSession.set(k, []);
        withSession.get(k).push(r);
      } else {
        without.push(r);
      }
    });

    const sessions = [];
    withSession.forEach((recs, k) => {
      const parts = k.split('\0');
      const studentId = parts[0];
      const sessionId = parts.slice(1).join('\0');
      sessions.push(buildTeacherSession(recs, 'sid:' + studentId + ':' + sessionId));
    });

    const byStudent = new Map();
    without.forEach((r) => {
      const sid = String(r.studentId || '');
      if (!byStudent.has(sid)) byStudent.set(sid, []);
      byStudent.get(sid).push(r);
    });

    byStudent.forEach((recs, studentId) => {
      const sorted = recs.slice().sort((a, b) => String(a.finishedAt || '').localeCompare(String(b.finishedAt || '')));
      let cluster = [];
      let clusterStart = '';
      const flush = () => {
        if (!cluster.length) return;
        sessions.push(buildTeacherSession(cluster, 'gap:' + studentId + ':' + clusterStart));
        cluster = [];
        clusterStart = '';
      };
      sorted.forEach((r) => {
        if (!cluster.length) {
          cluster = [r];
          clusterStart = String(r.finishedAt || '');
          return;
        }
        const prevT = new Date(cluster[cluster.length - 1].finishedAt).getTime();
        const t = new Date(r.finishedAt).getTime();
        const gapOk = !Number.isNaN(prevT) && !Number.isNaN(t) && (t - prevT) <= TEACHER_SESSION_GAP_MS;
        if (gapOk) {
          cluster.push(r);
        } else {
          flush();
          cluster = [r];
          clusterStart = String(r.finishedAt || '');
        }
      });
      flush();
    });

    sessions.sort((a, b) => String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')));
    return sessions;
  }

  function formatTeacherTime(iso) {
    if (window.FracCloud && window.FracCloud.formatHkTime) return window.FracCloud.formatHkTime(iso);
    try {
      return new Intl.DateTimeFormat('zh-HK', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(new Date(iso));
    } catch (e) { return iso || ''; }
  }

  function renderTeacherRows(records) {
    const tbody = $('#teacher-tbody');
    if (!tbody) return;
    const filter = (($('#teacher-filter-id') && $('#teacher-filter-id').value) || '').trim().toLowerCase();
    let list = records || [];
    if (filter) {
      list = list.filter((r) => String(r.studentId || '').toLowerCase().includes(filter));
    }
    const sessions = groupRecordsIntoSessions(list);
    if (!sessions.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="teacher-empty">尚未有記錄</td></tr>';
      return;
    }
    tbody.innerHTML = sessions.map((s) => {
      const expanded = teacherExpandedSessions.has(s.key);
      const sid = escapeHtml(s.studentId || '');
      const prog = escapeHtml(s.progressLabel || '');
      const resultSum = escapeHtml(s.resultSummary || '—');
      const mistakes = s.mistakes != null ? s.mistakes : '';
      const dur = formatDuration(s.durationSec);
      const t = escapeHtml(formatTeacherTime(s.finishedAt));
      const keyAttr = escapeHtml(s.key);
      const chevron = expanded ? '▼' : '▶';
      const summary =
        '<tr class="teacher-session-row' + (expanded ? ' is-expanded' : '') + '" data-session-key="' + keyAttr + '">' +
          '<td class="teacher-col-expand">' +
            '<button type="button" class="teacher-expand-btn" aria-expanded="' + (expanded ? 'true' : 'false') + '" ' +
              'aria-label="' + (expanded ? '收合明細' : '展開明細') + '：學號 ' + sid + '">' +
              '<span aria-hidden="true">' + chevron + '</span>' +
            '</button>' +
          '</td>' +
          '<td>' + sid + '</td>' +
          '<td>' + prog + '</td>' +
          '<td>' + resultSum + '</td>' +
          '<td>' + mistakes + '</td>' +
          '<td>' + dur + '</td>' +
          '<td>' + t + '</td>' +
        '</tr>';
      if (!expanded) return summary;
      const detailRows = s.stages.map((r) => {
        const lv = 'L' + (r.level != null ? r.level : '');
        const stage = escapeHtml(stageDisplay(r));
        const res = escapeHtml(recordResultLabel(r));
        const m = r.mistakes != null ? r.mistakes : '';
        const d = formatDuration(r.durationSec);
        const ft = escapeHtml(formatTeacherTime(r.finishedAt));
        const resCls = res === '正確' ? ' teacher-result-ok' : (res === '錯誤' ? ' teacher-result-bad' : '');
        return '<tr><td>' + lv + '</td><td>' + stage + '</td><td class="teacher-result' + resCls + '">' + res + '</td><td>' + m + '</td><td>' + d + '</td><td>' + ft + '</td></tr>';
      }).join('');
      const detail =
        '<tr class="teacher-detail-row" data-session-key="' + keyAttr + '">' +
          '<td colspan="7">' +
            '<div class="teacher-detail-wrap">' +
              '<table class="teacher-detail-table">' +
                '<thead><tr><th>關卡</th><th>關卡階段</th><th>結果</th><th>錯次</th><th>用時</th><th>完成時間</th></tr></thead>' +
                '<tbody>' + detailRows + '</tbody>' +
              '</table>' +
            '</div>' +
          '</td>' +
        '</tr>';
      return summary + detail;
    }).join('');
  }

  function toggleTeacherSession(sessionKey) {
    if (!sessionKey) return;
    if (teacherExpandedSessions.has(sessionKey)) teacherExpandedSessions.delete(sessionKey);
    else teacherExpandedSessions.add(sessionKey);
    renderTeacherRows(teacherRecordsCache);
  }

  function onTeacherTableClick(e) {
    const btn = e.target && e.target.closest && e.target.closest('.teacher-expand-btn');
    if (!btn) return;
    const row = btn.closest('tr[data-session-key]');
    if (!row) return;
    e.preventDefault();
    toggleTeacherSession(row.getAttribute('data-session-key'));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function teacherStatusText(result, sessions, stageCount) {
    const src = result && result.source === 'cloud' ? '雲端' : '本機';
    const err = result && result.error ? '（部分失敗）' : '';
    return '來源：' + src + ' · ' + sessions.length + ' 場（共 ' + stageCount + ' 筆明細）' + err;
  }

  async function refreshTeacherTable() {
    const status = $('#teacher-load-status');
    if (status) status.textContent = '載入中……';
    const cloud = await whenFracCloudReady();
    const code = cloud ? cloud.getTeacherCode() : 'default';
    if (teacherUnsub) {
      try { teacherUnsub(); } catch (e) {}
      teacherUnsub = null;
    }
    const applyResult = (result) => {
      teacherRecordsCache = result.records || [];
      const filter = (($('#teacher-filter-id') && $('#teacher-filter-id').value) || '').trim().toLowerCase();
      let list = teacherRecordsCache;
      if (filter) list = list.filter((r) => String(r.studentId || '').toLowerCase().includes(filter));
      const sessions = groupRecordsIntoSessions(list);
      renderTeacherRows(teacherRecordsCache);
      if (status) status.textContent = teacherStatusText(result, sessions, list.length);
    };
    if (cloud && cloud.subscribeRecords) {
      teacherUnsub = cloud.subscribeRecords(code, applyResult);
    } else if (cloud && cloud.loadRecords) {
      const result = await cloud.loadRecords(code);
      applyResult(result);
    } else {
      teacherRecordsCache = [];
      renderTeacherRows([]);
      if (status) status.textContent = '無法載入雲端模組。';
    }
  }

  function downloadTeacherCsv() {
    const cloud = window.FracCloud;
    const filter = (($('#teacher-filter-id') && $('#teacher-filter-id').value) || '').trim().toLowerCase();
    let list = teacherRecordsCache || [];
    if (filter) list = list.filter((r) => String(r.studentId || '').toLowerCase().includes(filter));
    const sessions = groupRecordsIntoSessions(list);
    const flat = [];
    sessions.forEach((s, idx) => {
      const label = (s.stages[0] && s.stages[0].sessionId) ? s.stages[0].sessionId : ('場次' + (idx + 1));
      s.stages.forEach((r) => {
        flat.push(Object.assign({}, r, { _sessionLabel: label }));
      });
    });
    const csv = cloud && cloud.recordsToCsv
      ? cloud.recordsToCsv(flat)
      : '\uFEFF學號,關卡,關卡階段,結果,錯次,用時秒,完成時間,題目,場次\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fraction-addition-records.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }


  // ---------- Wire events ----------
  function bind() {
    const btnStart = $('#btn-start');
    if (btnStart) {
      btnStart.addEventListener('click', submitStudentId);
      btnStart.onclick = submitStudentId; // backup for some mobile WebViews
    }
    const idInput = $('#student-id-input');
    if (idInput) {
      idInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitStudentId();
      });
    }

    $$('.level-switch button').forEach((btn) => {
      btn.addEventListener('click', () => {
        setLevel(Number(btn.dataset.level), true);
      });
    });

    const btnNew = $('#btn-new-q');
    if (btnNew) btnNew.addEventListener('click', () => {
      // Mid-question 新題 clears stage streak (see newQuestion)
      newQuestion();
    });

    const btnHint = $('#btn-toggle-hint');
    if (btnHint) btnHint.addEventListener('click', toggleHints);
    const fab = $('#hint-toggle-fab');
    if (fab) fab.addEventListener('click', toggleHints);

    const btnAgain = $('#btn-again');
    if (btnAgain) btnAgain.addEventListener('click', () => newQuestion());

    const btnChange = $('#btn-change-id');
    if (btnChange) btnChange.addEventListener('click', () => {
      state.playSessionId = null;
      initStart();
    });

    const btnUp = $('#btn-upgrade');
    if (btnUp) btnUp.addEventListener('click', () => {
      hideStageOverlay();
      setLevel(2, true);
    });
    const btnRev = $('#btn-review');
    if (btnRev) btnRev.addEventListener('click', () => {
      hideStageOverlay();
      resetL1ToStageA();
      updateStreakUI();
      newQuestion();
    });

    bindNumKeypad();

    const btnTeacherBack = $('#btn-teacher-back');
    if (btnTeacherBack) btnTeacherBack.addEventListener('click', leaveTeacherScreen);
    const btnTeacherEnter = $('#btn-teacher-enter');
    if (btnTeacherEnter) btnTeacherEnter.addEventListener('click', enterTeacherWithCode);
    const gateCode = $('#teacher-gate-code');
    if (gateCode) gateCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enterTeacherWithCode();
    });
    const btnSaveCloud = $('#btn-teacher-save-cloud');
    if (btnSaveCloud) btnSaveCloud.addEventListener('click', saveTeacherCloudSettings);
    const btnClearCloud = $('#btn-teacher-clear-cloud');
    if (btnClearCloud) btnClearCloud.addEventListener('click', clearTeacherCloudSettings);
    const btnRefresh = $('#btn-teacher-refresh');
    if (btnRefresh) btnRefresh.addEventListener('click', refreshTeacherTable);
    const btnCsv = $('#btn-teacher-csv');
    if (btnCsv) btnCsv.addEventListener('click', downloadTeacherCsv);
    const filterId = $('#teacher-filter-id');
    if (filterId) filterId.addEventListener('input', () => {
      renderTeacherRows(teacherRecordsCache);
      const status = $('#teacher-load-status');
      if (status && teacherRecordsCache) {
        const filter = (filterId.value || '').trim().toLowerCase();
        let list = teacherRecordsCache;
        if (filter) list = list.filter((r) => String(r.studentId || '').toLowerCase().includes(filter));
        const sessions = groupRecordsIntoSessions(list);
        const src = status.textContent.indexOf('本機') >= 0 ? '本機' : '雲端';
        status.textContent = '來源：' + src + ' · ' + sessions.length + ' 場（共 ' + list.length + ' 筆明細）';
      }
    });
    const teacherTable = $('#teacher-table');
    if (teacherTable) teacherTable.addEventListener('click', onTeacherTableClick);
    const linkTeacher = $('#link-teacher-report');
    if (linkTeacher) {
      linkTeacher.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          const url = new URL(location.href);
          url.searchParams.set('teacher', '1');
          history.replaceState(null, '', url.pathname + url.search + url.hash);
        } catch (err) {}
        openTeacherScreen();
      });
    }
  }

  // ---------- Boot ----------
  window.__fracStart = submitStudentId;
  /** Debug/preview: jump L1 stage A|B|C and load a fresh question */
  window.__fracDebugSetL1Stage = function (stage) {
    stage = String(stage || 'A').toUpperCase();
    if (!['A', 'B', 'C'].includes(stage)) return;
    state.level = 1;
    state.l1Stage = stage;
    state.stageStreak = 0;
    state.stageBIndex = 0;
    $$('.level-switch button').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.level) === 1);
    });
    if (!state.studentId) {
      state.studentId = 'P501';
      const input = $('#student-id-input');
      if (input) input.value = 'P501';
    }
    showScreen('screen-practice');
    $('#display-student-id').textContent = state.studentId;
    updateStreakUI();
    newQuestion();
  };


  function boot() {
    try {
      bind();
      setupPracticeChromePin();
      if (wantTeacherMode()) {
        openTeacherScreen();
      } else {
        initStart();
      }
    } catch (e) {
      console.error(e);
      const err = document.getElementById('start-error');
      if (err) err.textContent = '載入出問題：' + (e && e.message ? e.message : e);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
