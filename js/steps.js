/**
 * Build graded step trajectories for each question type.
 * Hints teach method only; answers live in field.expected (never shown in hint text).
 */
(function (global) {
  'use strict';
  const M = global.FracMath;
  const Q = global.FracQuestions;

  function fmtAddend(a) {
    if (a.type === 'mixed' || (a.w && a.w > 0)) {
      return { kind: 'mixed', w: a.w, n: a.n, d: a.d };
    }
    return { kind: 'proper', n: a.n, d: a.d };
  }

  function shortDivFields(sd) {
    // Student fills each divisor and the row values after each division,
    // plus final LCM product factors recognition: we check LCM result primarily,
    // and intermediate short-div rows for scaffolding.
    const fields = [];
    // Divisors down the left
    sd.divisors.forEach((div, i) => {
      fields.push({
        key: `sd_div_${i}`,
        role: 'short-div-divisor',
        label: `短除除數 ${i + 1}`,
        expected: div,
        hintExtra: i === 0 ? '短除第一個除數可以試細質數，例如 2。' : null,
      });
    });
    // After each division, the two quotients
    // rows[0] is original; rows[1..] are after each divisor
    for (let i = 1; i < sd.rows.length; i++) {
      fields.push({
        key: `sd_row_${i}_L`,
        role: 'short-div-row',
        label: `短除第 ${i} 行左`,
        expected: sd.rows[i][0],
      });
      fields.push({
        key: `sd_row_${i}_R`,
        role: 'short-div-row',
        label: `短除第 ${i} 行右`,
        expected: sd.rows[i][1],
      });
    }
    fields.push({
      key: 'sd_lcm',
      role: 'lcm',
      label: '公倍數（用嚟通分）',
      expected: sd.product,
      hintExtra: '用左邊除數同最底兩個數相乘，就係最小公倍數。',
    });
    return fields;
  }

  function buildSimplifyCheckProper(sumN, d, forceAlways) {
    const simp = M.simplify(sumN, d);
    const needs = simp.n !== sumN || simp.d !== d;
    if (!forceAlways && !needs) return null;
    return {
      id: 'check-simplify',
      title: '是否需要約分？（黃金密碼：2、3、5、7）',
      hint: '撳下面「有」或「沒有」。約分可以試黃金密碼質數 2、3、5、7。如果有約分，再填最簡分數。',
      isSimplifyChoice: true,
      needsSimplify: needs,
      fields: [],
      answerFields: [
        { key: 'simp_n', label: '最簡分子', expected: simp.n },
        { key: 'simp_d', label: '最簡分母', expected: simp.d },
      ],
      show: { type: 'check-simplify', from: { n: sumN, d }, to: simp, needs },
    };
  }

  function buildSameDenomProper(q) {
    const [a, b] = q.addends;
    const sumN = a.n + b.n;
    const d = a.d;
    const simp = M.simplify(sumN, d);
    const steps = [];

    // One step: 分母相同 → 分子相加、分母唔變
    // Stage C step1 標題同帶分數對齊（真分數只填分子／分母）
    const properTitle = q.forceSimplifyCheck
      ? '整數加整數，分數加分數'
      : '分子相加，分母不變';
    const properHint = q.forceSimplifyCheck
      ? '呢題係真分數，冇整數部分。分母相同，將兩個分子加起嚟，分母唔變。下一布先判斷要唔要約分。'
      : '分母相同，可以直接將兩個分子加起嚟，分母唔變。喺格仔填答案嘅分子同分母。';
    steps.push({
      id: 'add-nums',
      title: properTitle,
      hint: properHint,
      fields: [
        { key: 'sum_n', label: '分子', expected: sumN },
        { key: 'sum_d', label: '分母', expected: d },
      ],
      show: { type: 'sum-frac', a: fmtAddend(a), b: fmtAddend(b) },
    });

    if (q.forceSimplifyCheck) {
      const chk = buildSimplifyCheckProper(sumN, d, true);
      if (chk) steps.push(chk);
    } else if (!q.skipSimplifyStep && (simp.n !== sumN || simp.d !== d)) {
      steps.push({
        id: 'simplify',
        title: '約至最簡',
        hint: '分子同分母有公因數，約簡到最簡分數。搵最大公因數嚟除。',
        fields: [
          { key: 'simp_n', label: '最簡分子', expected: simp.n },
          { key: 'simp_d', label: '最簡分母', expected: simp.d },
        ],
        show: { type: 'simplify', from: { n: sumN, d }, to: simp },
      });
    }

    // L1 never carries / improper; keep guard for other callers
    if (!q.skipSimplifyStep && !q.forceSimplifyCheck && simp.n >= simp.d) {
      const mixed = M.toMixed(simp.n, simp.d);
      steps.push({
        id: 'to-mixed',
        title: '化帶分數',
        hint: '呢個係假分數（分子 ≥ 分母）。用分子除以分母，得出整數同剩餘分子。',
        fields: [
          { key: 'mix_w', label: '整數', expected: mixed.w },
          { key: 'mix_n', label: '分子', expected: mixed.n },
          { key: 'mix_d', label: '分母', expected: mixed.d },
        ],
        show: { type: 'to-mixed', from: simp, to: mixed },
        optionalZeroNum: true,
      });
    }

    return steps;
  }

  function buildSameDenomMixed(q) {
    // Same-denom mixed (and mixed+proper): no frac carry.
    // Wholes + fracs computed together in one step.
    const [a, b] = q.addends;
    const d = a.d;
    const wholeSum = (a.w || 0) + (b.w || 0);
    const fracSumN = a.n + b.n;
    const steps = [];
    const s = M.simplify(fracSumN, d);
    const needsSimp = fracSumN > 0 && (s.n !== fracSumN || s.d !== d);

    if (q.skipSimplifyStep || q.forceSimplifyCheck) {
      // Stage B / Stage C step1: ONE step — 整數 + 分子 + 分母一齊填
      steps.push({
        id: 'add-mixed-together',
        title: '整數加整數，分數加分數',
        hint: q.forceSimplifyCheck
          ? '帶分數相加：整數加整數、分數加分數，一齊計。真分數嘅整數當 0。分母相同，分子加埋，分母唔變。分數部分加完會細過 1，唔使進位。下一布先判斷要唔要約分。'
          : '帶分數相加：整數加整數、分數加分數，一齊計。真分數嘅整數當 0。分母相同，分子加埋，分母唔變。分數部分加完會細過 1，唔使進位。',
        fields: [
          { key: 'whole_sum', label: '整數和', expected: wholeSum },
          { key: 'frac_n', label: '分子', expected: fracSumN },
          { key: 'frac_d', label: '分母', expected: d },
        ],
        show: { type: 'add-mixed-together', a: fmtAddend(a), b: fmtAddend(b) },
      });
    } else {
      // Other (non L1 staged): 整數先，再分數
      steps.push({
        id: 'add-wholes',
        title: '整數加整數，分數加分數',
        hint: '帶分數相加：先將兩個整數部分加埋（真分數嘅整數當 0）。分數部分下一布先加。呢關分數加完會細過 1，唔使進位。',
        fields: [
          { key: 'whole_sum', label: '整數和', expected: wholeSum },
        ],
        show: { type: 'add-wholes', a: fmtAddend(a), b: fmtAddend(b) },
      });
      steps.push({
        id: 'add-fracs',
        title: '分子相加，分母不變',
        hint: '而家加分數部分：分母相同，將兩個分子加起嚟，分母唔變。填答案嘅分子同分母。',
        fields: [
          { key: 'frac_n', label: '分子', expected: fracSumN },
          { key: 'frac_d', label: '分母', expected: d },
        ],
        show: { type: 'add-frac-parts', a: fmtAddend(a), b: fmtAddend(b) },
      });
    }

    if (q.forceSimplifyCheck) {
      steps.push({
        id: 'check-simplify-mixed',
        title: '是否需要約分？（黃金密碼：2、3、5、7）',
        hint: '撳下面「有」或「沒有」。約分可以試黃金密碼質數 2、3、5、7。如果有約分，再填最簡帶分數（整數唔變）。',
        isSimplifyChoice: true,
        needsSimplify: needsSimp,
        fields: [],
        answerFields: [
          { key: 'final_w', label: '整數', expected: wholeSum },
          { key: 'simp_n', label: '最簡分子', expected: s.n },
          { key: 'simp_d', label: '最簡分母', expected: s.d },
        ],
        show: {
          type: 'check-simplify-mixed',
          w: wholeSum,
          from: { n: fracSumN, d },
          to: s,
          needs: needsSimp,
        },
      });
    } else if (q.skipSimplifyStep) {
      // Stage B: single combined step is the full answer
    } else if (needsSimp) {
      steps.push({
        id: 'simplify-mixed',
        title: '約分',
        hint: '分數部分可以約簡。整數唔使改，只約分子同分母。',
        fields: [
          { key: 'final_w', label: '整數', expected: wholeSum },
          { key: 'final_n', label: '分子', expected: s.n },
          { key: 'final_d', label: '分母', expected: s.d },
        ],
        show: { type: 'simplify-mixed', w: wholeSum, from: { n: fracSumN, d }, to: s },
      });
    } else {
      steps.push({
        id: 'final-mixed',
        title: '寫出最簡帶分數',
        hint: '整數同分數部分合埋，就係最後答案。',
        fields: [
          { key: 'final_w', label: '整數', expected: wholeSum },
          { key: 'final_n', label: '分子', expected: fracSumN },
          { key: 'final_d', label: '分母', expected: d },
        ],
        show: { type: 'final-mixed', w: wholeSum, n: fracSumN, d },
      });
    }

    return steps;
  }

  function buildUnlikeProper(q) {
    const [a, b] = q.addends;
    const lcd = q.lcd || M.lcm(a.d, b.d);
    const ea = Q.expand(a.n, a.d, lcd);
    const eb = Q.expand(b.n, b.d, lcd);
    const sumN = ea.n + eb.n;
    const sd = M.shortDivisionLcm(a.d, b.d);
    const steps = [];

    steps.push({
      id: 'need-common',
      title: '要通分',
      hint: '兩個分母唔同，份嘅大小唔一樣，唔可以直接加分子。要先搵公倍數，令兩份一樣大先好加。',
      fields: [
        { key: 'd1', label: '第一個分母', expected: a.d },
        { key: 'd2', label: '第二個分母', expected: b.d },
      ],
      show: { type: 'need-common', a: fmtAddend(a), b: fmtAddend(b) },
    });

    steps.push({
      id: 'short-div',
      title: '短除法搵公倍數',
      hint: sd.divisors.length
        ? '用短除法搵兩個分母嘅公倍數。喺格仔填短除過程同最後嘅公倍數。提示：份一樣大先好加。'
        : '兩個分母冇共同質因數（互質），公倍數就係兩個分母相乘。將乘數填入「公倍數」格。',
      fields: shortDivFields(sd),
      show: { type: 'short-div', sd, a: a.d, b: b.d, lcd },
      cpa: { d1: a.d, d2: b.d, lcd },
    });

    steps.push({
      id: 'expand',
      title: '兩個分數分別擴分',
      hint: `通分到分母 ${lcd}：每個分數分子同埋分母都要乘同一個倍數。`,
      fields: [
        { key: 'exp_a_n', label: '第一個擴分分子', expected: ea.n },
        { key: 'exp_a_d', label: '第一個擴分分母', expected: lcd },
        { key: 'exp_b_n', label: '第二個擴分分子', expected: eb.n },
        { key: 'exp_b_d', label: '第二個擴分分母', expected: lcd },
      ],
      show: {
        type: 'expand',
        a: fmtAddend(a),
        b: fmtAddend(b),
        ea,
        eb,
        multA: ea.mult,
        multB: eb.mult,
        lcd,
      },
    });

    steps.push({
      id: 'add-nums',
      title: '分子相加',
      hint: '分母而家相同，將兩個分子加起嚟，分母唔變。',
      fields: [
        { key: 'sum_n', label: '分子', expected: sumN },
        { key: 'sum_d', label: '分母', expected: lcd },
      ],
      show: { type: 'sum-expanded', ea, eb, sumN, lcd },
    });

    const simp = M.simplify(sumN, lcd);
    if (simp.n !== sumN || simp.d !== lcd) {
      steps.push({
        id: 'simplify',
        title: '約分',
        hint: '約至最簡分數。',
        fields: [
          { key: 'simp_n', label: '最簡分子', expected: simp.n },
          { key: 'simp_d', label: '最簡分母', expected: simp.d },
        ],
        show: { type: 'simplify', from: { n: sumN, d: lcd }, to: simp },
      });
    }

    // Level 3 (or any improper): convert to mixed if ≥ 1
    if (simp.n >= simp.d) {
      const mixed = M.toMixed(simp.n, simp.d);
      steps.push({
        id: 'to-mixed',
        title: '化帶分數',
        hint: '和係假分數，化成帶分數：整數 + 真分數。',
        fields: [
          { key: 'mix_w', label: '整數', expected: mixed.w },
          { key: 'mix_n', label: '分子', expected: mixed.n },
          { key: 'mix_d', label: '分母', expected: mixed.d },
        ],
        show: { type: 'to-mixed', from: simp, to: mixed },
      });
    }

    return steps;
  }

  function buildUnlikeMixed(q) {
    const [a, b] = q.addends;
    const lcd = q.lcd || M.lcm(a.d, b.d);
    const ea = Q.expand(a.n, a.d, lcd);
    const eb = Q.expand(b.n, b.d, lcd);
    const fracSumN = ea.n + eb.n;
    const wholeSum = a.w + b.w;
    const sd = M.shortDivisionLcm(a.d, b.d);
    const needCarry = fracSumN >= lcd;
    const steps = [];

    steps.push({
      id: 'add-wholes',
      title: '整數加整數',
      hint: '先將兩個帶分數嘅整數部分加埋，可以先記低。',
      fields: [{ key: 'whole_sum', label: '整數和', expected: wholeSum }],
      show: { type: 'add-wholes', a: fmtAddend(a), b: fmtAddend(b) },
    });

    steps.push({
      id: 'need-common',
      title: '分數部分要通分',
      hint: '分數部分分母唔同，要通分先好加。份一樣大先好加。',
      fields: [
        { key: 'd1', label: '第一個分母', expected: a.d },
        { key: 'd2', label: '第二個分母', expected: b.d },
      ],
      show: { type: 'need-common-parts', a: fmtAddend(a), b: fmtAddend(b) },
    });

    steps.push({
      id: 'short-div',
      title: '短除法搵公倍數',
      hint: sd.divisors.length
        ? '用短除法搵兩個分母嘅公倍數。喺格仔填短除過程。'
        : '兩個分母冇共同質因數（互質），公倍數就係兩個分母相乘。將乘數填入「公倍數」格。',
      fields: shortDivFields(sd),
      show: { type: 'short-div', sd, a: a.d, b: b.d, lcd },
      cpa: { d1: a.d, d2: b.d, lcd },
    });

    steps.push({
      id: 'expand',
      title: '分數部分擴分',
      hint: `將兩個分數部分都擴分到分母 ${lcd}。`,
      fields: [
        { key: 'exp_a_n', label: '第一個擴分分子', expected: ea.n },
        { key: 'exp_a_d', label: '第一個擴分分母', expected: lcd },
        { key: 'exp_b_n', label: '第二個擴分分子', expected: eb.n },
        { key: 'exp_b_d', label: '第二個擴分分母', expected: lcd },
      ],
      show: {
        type: 'expand-parts',
        a: fmtAddend(a),
        b: fmtAddend(b),
        ea,
        eb,
        multA: ea.mult,
        multB: eb.mult,
        lcd,
      },
    });

    steps.push({
      id: 'add-fracs',
      title: '分數部分相加',
      hint: '分母相同，將擴分後兩個分子加起嚟。',
      fields: [
        { key: 'frac_n', label: '分子', expected: fracSumN },
        { key: 'frac_d', label: '分母', expected: lcd },
      ],
      show: { type: 'add-frac-expanded', ea, eb, fracSumN, lcd },
    });

    let curW = wholeSum;
    let curN = fracSumN;
    let curD = lcd;

    if (needCarry) {
      // Level 3 path
      const carry = Math.floor(fracSumN / lcd);
      const rem = fracSumN % lcd;
      steps.push({
        id: 'carry',
        title: '分數進位',
        hint: '分數部分加埋大過或等於 1，要向整數進位。整數加進位數，分子留餘數。',
        fields: [
          { key: 'carry_w', label: '進位後整數', expected: wholeSum + carry },
          { key: 'carry_n', label: '剩餘分子', expected: rem },
          { key: 'carry_d', label: '分母', expected: lcd },
        ],
        show: { type: 'carry', whole: wholeSum, n: fracSumN, d: lcd, carry, rem },
      });
      curW = wholeSum + carry;
      curN = rem;
      curD = lcd;
    } else {
      // Level 2: confirm < 1
      steps.push({
        id: 'confirm-no-carry',
        title: '確認唔使進位',
        hint: '分數部分嘅和細過 1，唔使向整數進位。可以同整數合併。',
        fields: [
          { key: 'check_n', label: '分數分子', expected: fracSumN },
          { key: 'check_d', label: '分數分母', expected: lcd },
        ],
        show: { type: 'confirm-no-carry', n: fracSumN, d: lcd, w: wholeSum },
      });
    }

    if (curN > 0 && !M.isSimplified(curN, curD)) {
      const s = M.simplify(curN, curD);
      steps.push({
        id: 'simplify-merge',
        title: '約分並合併',
        hint: '約簡分數部分，再同整數寫成最簡帶分數。',
        fields: [
          { key: 'final_w', label: '整數', expected: curW },
          { key: 'final_n', label: '分子', expected: s.n },
          { key: 'final_d', label: '分母', expected: s.d },
        ],
        show: { type: 'simplify-mixed', w: curW, from: { n: curN, d: curD }, to: s },
      });
    } else if (curN === 0) {
      steps.push({
        id: 'final-whole',
        title: '寫出答案',
        hint: '分數部分啱啱進成整數，最後答案係一個整數。',
        fields: [{ key: 'final_w_only', label: '答案（整數）', expected: curW }],
        show: { type: 'final-whole', w: curW },
      });
    } else {
      steps.push({
        id: 'final-mixed',
        title: '寫出最簡帶分數',
        hint: '整數同分數部分合埋，就係最後答案。',
        fields: [
          { key: 'final_w', label: '整數', expected: curW },
          { key: 'final_n', label: '分子', expected: curN },
          { key: 'final_d', label: '分母', expected: curD },
        ],
        show: { type: 'final-mixed', w: curW, n: curN, d: curD },
      });
    }

    return steps;
  }

  function buildSteps(q) {
    let steps;
    if (q.sub === '1A') steps = buildSameDenomProper(q);
    else if (q.sub === '1B' || q.sub === '1BP') steps = buildSameDenomMixed(q);
    else if (q.sub === '2A' || q.sub === '3A') steps = buildUnlikeProper(q);
    else if (q.sub === '2B' || q.sub === '3B') steps = buildUnlikeMixed(q);
    else steps = buildSameDenomProper(q);

    steps.forEach((s, i) => {
      s.index = i;
      s.wrongCounts = {};
    });
    return steps;
  }

  /**
   * Grade one step. values: { fieldKey: number|string }
   * Returns { ok, results: { key: { ok, expected } }, allOk }
   */
  function gradeStep(step, values) {
    const results = {};
    let allOk = true;
    for (const f of step.fields) {
      const raw = values[f.key];
      const num = raw === '' || raw === undefined || raw === null ? NaN : Number(raw);
      const ok = Number.isFinite(num) && num === f.expected;
      results[f.key] = { ok, expected: f.expected, got: num };
      if (!ok) allOk = false;
    }
    return { allOk, results };
  }

  function extraHintForField(step, fieldKey, wrongCount) {
    if (wrongCount < 2) return null;
    const f = step.fields.find((x) => x.key === fieldKey);
    if (f && f.hintExtra) return f.hintExtra;
    if (fieldKey.startsWith('sd_div')) return '短除第一個除數試細嘅質數，例如 2 或 3。';
    if (fieldKey.startsWith('sd_')) return '再睇吓短除：兩個數都可以被同一個數整除先寫落左邊。';
    if (fieldKey.includes('n') || fieldKey.includes('分子')) return '分子計錯咗，慢慢再加一次。';
    if (fieldKey.includes('d') || fieldKey.includes('分母')) return '分母通常唔變（通分後用公倍數）。';
    return '慢慢再試下呢一格，可以先用草稿計。';
  }

  global.FracSteps = {
    buildSteps,
    gradeStep,
    extraHintForField,
    fmtAddend,
  };
})(typeof window !== 'undefined' ? window : globalThis);
