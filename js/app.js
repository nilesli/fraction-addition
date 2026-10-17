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
    stageStreak: 0, // correct-in-a-row within current L1 stage
    stageBIndex: 0, // for alternating mixed types in Stage B
    lastQuestionFp: null, // avoid consecutive identical questions
    wrongCounts: {}, // `${stepIndex}:${fieldKey}` -> count
    pendingStageAdvance: null, // 'B' | 'C' | 'done' after celebration
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
  const STAGE_STREAK_NEED = 3;
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

  function showScreen(id) {
    $$('.screen').forEach((el) => el.classList.remove('active'));
    const s = document.getElementById(id);
    if (s) s.classList.add('active');
    // Portrait blocker only on practice; start screen must scroll on short phones
    document.body.classList.toggle('start-active', id === 'screen-start');
    document.body.classList.toggle('practice-active', id === 'screen-practice');
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
      err.textContent = '請輸入學號先可以開始練習呀！';
      input.focus();
      return;
    }
    if (raw.length > 20) {
      err.textContent = '學號請唔好超過 20 個字。';
      input.focus();
      return;
    }
    err.textContent = '';
    state.studentId = raw;
    safeStorage.set(STORAGE_ID, raw);
    try {
      startPractice();
    } catch (e) {
      console.error(e);
      err.textContent = '開始練習出咗問題，請再試一次或換個瀏覽器開。';
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
    } else {
      el.textContent = `連續 ${state.streaks[state.level] || 0} 題`;
    }
    const stageEl = $('#stage-label');
    if (stageEl) {
      if (state.level === 1) {
        stageEl.style.display = '';
        stageEl.textContent = L1_STAGE_META[state.l1Stage].label;
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

  function setLevel(level, forceNew) {
    const prev = state.level;
    state.level = level;
    if (level === 1 && prev !== 1) {
      resetL1ToStageA();
    }
    $$('.level-switch button').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.level) === level);
    });
    updateStreakUI();
    if (forceNew !== false) newQuestion();
  }

  function newQuestion() {
    // Skipping mid-question breaks the stage streak (weaker-student soft rule)
    if (state.level === 1 && !state.complete && state.question) {
      /* keep streak — only completed wrongs aren't possible; 新題 abandons */
      state.stageStreak = 0;
    }
    const genOpts = {
      avoidFingerprint: state.lastQuestionFp,
    };
    if (state.level === 1) {
      genOpts.l1Stage = state.l1Stage;
      genOpts.stageBIndex = state.stageBIndex;
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
    setMascot('guide');
    renderPractice();
    updateStreakUI();
  }

  function renderPractice() {
    const q = state.question;
    let sub = q.label;
    if (state.level === 1) {
      sub = L1_STAGE_META[state.l1Stage].label + ' · ' + q.label;
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
        const inputsWrap = buildStepInputs(step, i, status);
        work.appendChild(inputsWrap);
      }

      block.appendChild(work);

      if (status === 'current') {
        const fb = document.createElement('div');
        fb.className = 'step-feedback';
        fb.id = 'step-feedback';
        block.appendChild(fb);

        const showCheck =
          !step.isSimplifyChoice || step._showAnswer === true;
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
    } else if (s.type === 'short-div') {
      wrap.innerHTML = `<span>分母 ${s.a} 同 ${s.b}</span>`;
    } else if (s.type === 'expand' || s.type === 'expand-parts') {
      wrap.innerHTML = `${htmlAddend(s.a)} → ？　　${htmlAddend(s.b)} → ？`;
    } else if (s.type === 'sum-expanded') {
      wrap.innerHTML = `${htmlFrac(s.ea.n, s.ea.d)}<span class="op">+</span>${htmlFrac(s.eb.n, s.eb.d)}`;
    } else if (s.type === 'add-frac-expanded') {
      wrap.innerHTML = `${htmlFrac(s.ea.n, s.ea.d)}<span class="op">+</span>${htmlFrac(s.eb.n, s.eb.d)}`;
    } else if (s.type === 'simplify' || s.type === 'check-simplify') {
      wrap.innerHTML = `${htmlFrac(s.from.n, s.from.d)} → 有沒有約分？`;
    } else if (s.type === 'check-simplify-mixed') {
      wrap.innerHTML = `${s.w} ${htmlFrac(s.from.n, s.from.d)} → 有沒有約分？`;
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

    if (step.id === 'short-div') {
      wrap.appendChild(buildShortDivUI(step, readonly));
      return wrap;
    }

    // Group common patterns
    const keys = step.fields.map((f) => f.key);

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
      wrap.appendChild(document.createTextNode('　同　'));
      wrap.appendChild(buildFracInput(step, 'exp_b_n', 'exp_b_d', readonly));
      return wrap;
    }

    // Single whole
    if (keys.length === 1 && (keys[0] === 'whole_sum' || keys[0] === 'final_w_only' || keys[0] === 'denom_check')) {
      wrap.appendChild(eqEquals());
      wrap.appendChild(buildSingleInput(step, keys[0], readonly));
      return wrap;
    }

    // d1, d2
    if (keys.includes('d1') && keys.includes('d2')) {
      wrap.appendChild(buildLabeledInput(step, 'd1', '分母①', readonly));
      wrap.appendChild(document.createTextNode('　同　'));
      wrap.appendChild(buildLabeledInput(step, 'd2', '分母②', readonly));
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

  function buildShortDivUI(step, readonly) {
    const sd = step.show.sd;
    const box = document.createElement('div');
    box.className = 'short-div-ui';

    // Row 0: original numbers (static) with first divisor slot
    const nDiv = sd.divisors.length;

    for (let i = 0; i <= nDiv; i++) {
      const row = document.createElement('div');
      row.className = 'sd-row';

      if (i < nDiv) {
        const slot = document.createElement('div');
        slot.className = 'sd-div-slot';
        const inp = makeNumInput(step, `sd_div_${i}`, readonly);
        slot.appendChild(inp);
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
        nums.appendChild(makeNumInput(step, `sd_row_${i}_L`, readonly));
        nums.appendChild(makeNumInput(step, `sd_row_${i}_R`, readonly));
      }
      row.appendChild(nums);
      box.appendChild(row);
    }

    const lcmRow = document.createElement('div');
    lcmRow.className = 'sd-lcm-row';
    lcmRow.innerHTML = '<span>公倍數 =</span>';
    lcmRow.appendChild(makeNumInput(step, 'sd_lcm', readonly));
    box.appendChild(lcmRow);

    return box;
  }

  function buildSimplifyChoiceUI(step, stepIndex, status) {
    const box = document.createElement('div');
    box.className = 'simplify-choice-ui';
    const readonly = status !== 'current';
    const needs = !!step.needsSimplify;
    const chosen = step._choice; // true=有, false=沒有, undefined=not yet

    if (status === 'done' || status === 'review') {
      const summary = document.createElement('div');
      summary.className = 'simplify-choice-summary';
      const label = needs ? '有約分' : '沒有約分';
      summary.textContent = '✓ ' + label;
      box.appendChild(summary);
      if (needs && step.answerFields) {
        // show correct simplified answer
        const fake = { fields: step.answerFields };
        const keys = step.answerFields.map((f) => f.key);
        if (keys.includes('final_w')) {
          box.appendChild(buildMixedInput(
            { fields: step.answerFields },
            'final_w', 'simp_n', 'simp_d',
            true
          ));
        } else {
          const row = document.createElement('div');
          row.style.display = 'inline-flex';
          row.style.alignItems = 'center';
          row.style.gap = '0.35rem';
          row.appendChild(eqEquals());
          row.appendChild(buildFracInput({ fields: step.answerFields }, 'simp_n', 'simp_d', true));
          box.appendChild(row);
        }
      }
      return box;
    }

    // Current: choice buttons (unless already correctly picked 「有」)
    if (!step._showAnswer) {
      const prompt = document.createElement('div');
      prompt.className = 'simplify-choice-prompt';
      prompt.textContent = '有冇約分？';
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

    // Answer phase after correct 「有」
    const note = document.createElement('div');
    note.className = 'simplify-choice-prompt';
    note.innerHTML = colorizeMathTerms('啱！請填最簡分子／分母（整數唔變）：');
    box.appendChild(note);

    if (!step.fields || !step.fields.length) {
      step.fields = step.answerFields.slice();
    }
    const keys = step.answerFields.map((f) => f.key);
    if (keys.includes('final_w')) {
      box.appendChild(buildMixedInput(step, 'final_w', 'simp_n', 'simp_d', false));
    } else {
      const row = document.createElement('div');
      row.style.display = 'inline-flex';
      row.style.alignItems = 'center';
      row.style.gap = '0.35rem';
      row.appendChild(eqEquals());
      row.appendChild(buildFracInput(step, 'simp_n', 'simp_d', false));
      box.appendChild(row);
    }
    return box;
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
      if (!needs) {
        // 「沒有」且正確 → 即時過關（通常係最後一步）
        if (fb) {
          fb.className = 'step-feedback ok';
          fb.textContent = '✓ 啱！唔使約分。';
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
          fb.textContent = '✓ 啱！而家填最簡分數啦。';
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
      if (fb) {
        fb.className = 'step-feedback err';
        fb.textContent = needs
          ? '再諗諗：其實要約分㗎，試下撳「有」。'
          : '再諗諗：已經最簡，唔使約分，試下撳「沒有」。';
      }
      setMascot('think');
      const wk = `${i}:choice`;
      state.wrongCounts[wk] = (state.wrongCounts[wk] || 0) + 1;
      const extraEl = $('#hint-extra');
      if ((state.wrongCounts[wk] || 0) >= 2 && extraEl) {
        extraEl.innerHTML = colorizeMathTerms(needs
          ? '多一層提示：分子同分母有公因數就可以約。'
          : '多一層提示：分子同分母冇公因數就係最簡。');
        extraEl.classList.add('show');
      }
    }
  }

  function advanceAfterStepOk(i) {
    if (i + 1 >= state.steps.length) {
      completeProblem();
    } else {
      state.currentStep = i + 1;
      setMascot('guide');
      renderPractice();
    }
  }

    function collectValues(stepIndex) {
    const wrap = $(`.step-inputs[data-step-index="${stepIndex}"]`);
    const values = {};
    if (!wrap) return values;
    $$('input[data-field]', wrap).forEach((inp) => {
      values[inp.dataset.field] = inp.value.trim();
    });
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
        fb.textContent = '請先撳「有」或「沒有」。';
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
        fb.textContent = '請填晒呢一步所有格仔再核對。';
      }
      return;
    }

    const result = FracSteps.gradeStep(gradeStep, values);
    const wrap = $(`.step-inputs[data-step-index="${i}"]`);

    Object.keys(result.results).forEach((key) => {
      const inp = wrap && wrap.querySelector(`input[data-field="${key}"]`);
      if (!inp) return;
      const r = result.results[key];
      inp.classList.remove('wrong', 'correct');
      if (r.ok) {
        inp.classList.add('correct');
      } else {
        inp.classList.add('wrong');
        const wk = `${i}:${key}`;
        state.wrongCounts[wk] = (state.wrongCounts[wk] || 0) + 1;
      }
    });

    const fb = $('#step-feedback');
    if (result.allOk) {
      if (fb) {
        fb.className = 'step-feedback ok';
        fb.textContent = '✓ 做得好！';
      }
      setMascot('thumbsup');
      setTimeout(() => advanceAfterStepOk(i), 450);
    } else {
      if (fb) {
        fb.className = 'step-feedback err';
        fb.textContent = '呢格再試下，唔使緊。';
      }
      setMascot('think');
      // Extra hints after 2–3 wrongs
      let extra = null;
      step.fields.forEach((f) => {
        if (!result.results[f.key].ok) {
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

  function completeProblem() {
    state.complete = true;
    state.streaks[state.level] = (state.streaks[state.level] || 0) + 1;
    saveStreaks();
    setMascot('celebrate');

    const ans = FracQuestions.computeAnswer(state.question);
    const banner = $('#complete-banner');
    banner.classList.add('show');
    const q = state.question;
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
        `做得好！呢一關已連續答對 ${state.stageStreak}/${need} 題。`;

      renderSteps();
      renderHints();

      if (state.stageStreak >= need) {
        if (state.l1Stage === 'A' || state.l1Stage === 'B') {
          const next = meta.next;
          state.pendingStageAdvance = next;
          if (againBtn) againBtn.style.display = 'none';
          showStageOverlay({
            title: '做得好！',
            msg: `你已經連續答對 ${need} 題。難度會提升啦！下一關：${L1_STAGE_META[next].label}`,
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
          '做得好！級別 1 三關都過咗。可以升級去級別 2，或者重温一次。';
        showStageOverlay({
          title: '做得好！',
          msg: '你可以升級去級別 2 學異分母，或者重温一次（由第一關再練）。',
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
              label: '重温一次',
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
    } else {
      updateStreakUI();
      $('#complete-msg').textContent =
        `好叻呀！本級已連續答對 ${state.streaks[state.level]} 題。`;
    }

    renderSteps();
    renderHints();
  }

  // ---------- Hints panel ----------
  function renderHints() {
    renderHintText();
    renderHintNav();
    renderCPA();
  }

  function renderHintText() {
    const step = state.steps[state.currentStep];
    const bubble = $('#hint-bubble');
    if (!bubble) return;
    if (state.complete) {
      bubble.innerHTML = colorizeMathTerms('全部步驟都完成啦！左邊可以回顧成條橫式過程。按「再來一題」繼續練習。');
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
    }
    updateHintToggleFab();
    $('#btn-toggle-hint').textContent = state.hintOpen ? '隱藏提示' : '顯示提示';
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
      initStart();
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
