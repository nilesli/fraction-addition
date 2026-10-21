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
        hintExtra: i === 0 ? '短除第一個除數可以試較小的質數，例如 2。' : null,
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
      label: '公倍數（用來通分）',
      expected: sd.product,
      hintExtra: '用左邊除數和最底兩個數相乘，就是最小公倍數。',
    });
    return fields;
  }

  function simplifyDivisorFields(fromN, fromD) {
    const g = M.gcd(fromN, fromD);
    return [
      { key: 'simp_div_n', label: '約分除數（分子）', expected: g },
      { key: 'simp_div_d', label: '約分除數（分母）', expected: g },
    ];
  }

  function buildSimplifyCheckProper(sumN, d, forceAlways) {
    const simp = M.simplify(sumN, d);
    const needs = simp.n !== sumN || simp.d !== d;
    if (!forceAlways && !needs) return null;
    const answerFields = needs
      ? simplifyDivisorFields(sumN, d).concat([
          { key: 'simp_n', label: '最簡分子', expected: simp.n },
          { key: 'simp_d', label: '最簡分母', expected: simp.d },
        ])
      : [
          { key: 'simp_n', label: '最簡分子', expected: simp.n },
          { key: 'simp_d', label: '最簡分母', expected: simp.d },
        ];
    return {
      id: 'check-simplify',
      title: '是否需要約分（分子分母同時除以相同的數）？（黃金密碼：2、3、5、7）',
      hint: '按下面「有」或「沒有」。約分是分子和分母同時除以相同的數，可以試黃金密碼質數 2、3、5、7。如果有約分，再填寫除數和最簡分數。',
      isSimplifyChoice: true,
      needsSimplify: needs,
      fields: [],
      answerFields,
      show: { type: 'check-simplify', from: { n: sumN, d }, to: simp, needs, div: M.gcd(sumN, d) },
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
      ? '這題是真分數，沒有整數部分。分母相同，將兩個分子加起來，分母不變。下一步先判斷要不要約分。'
      : '分母相同，可以直接將兩個分子加起來，分母不變。在空格填寫答案的分子和分母。';
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
        hint: '分子和分母有公因數，約簡到最簡分數。找最大公因數來除。',
        fields: [
          { key: 'simp_n', label: '最簡分子', expected: simp.n },
          { key: 'simp_d', label: '最簡分母', expected: simp.d },
        ],
        show: { type: 'simplify', from: { n: sumN, d }, to: simp },
      });
    }

    // 假分數不用轉成帶分數；最後以分數（可為假分數）作答
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
          ? '帶分數相加：整數加整數、分數加分數，一齊計算。真分數的整數當作 0。分母相同，分子加起來，分母不變。分數部分加完會小於 1，不用進位。下一步先判斷要不要約分。'
          : '帶分數相加：整數加整數、分數加分數，一齊計算。真分數的整數當作 0。分母相同，分子加起來，分母不變。分數部分加完會小於 1，不用進位。',
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
        hint: '帶分數相加：先將兩個整數部分加起來（真分數的整數當作 0）。分數部分下一步再加。這一關分數加完會小於 1，不用進位。',
        fields: [
          { key: 'whole_sum', label: '整數和', expected: wholeSum },
        ],
        show: { type: 'add-wholes', a: fmtAddend(a), b: fmtAddend(b) },
      });
      steps.push({
        id: 'add-fracs',
        title: '分子相加，分母不變',
        hint: '現在加分數部分：分母相同，將兩個分子加起來，分母不變。填寫答案的分子和分母。',
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
        title: '是否需要約分（分子分母同時除以相同的數）？（黃金密碼：2、3、5、7）',
        hint: '按下面「有」或「沒有」。約分是分子和分母同時除以相同的數，可以試黃金密碼質數 2、3、5、7。如果有約分，再填寫除數和最簡帶分數（整數不變）。',
        isSimplifyChoice: true,
        needsSimplify: needsSimp,
        fields: [],
        answerFields: (needsSimp
          ? simplifyDivisorFields(fracSumN, d)
          : []).concat([
          { key: 'final_w', label: '整數', expected: wholeSum },
          { key: 'simp_n', label: '最簡分子', expected: s.n },
          { key: 'simp_d', label: '最簡分母', expected: s.d },
        ]),
        show: {
          type: 'check-simplify-mixed',
          w: wholeSum,
          from: { n: fracSumN, d },
          to: s,
          needs: needsSimp,
          div: M.gcd(fracSumN, d),
        },
      });
    } else if (q.skipSimplifyStep) {
      // Stage B: single combined step is the full answer
    } else if (needsSimp) {
      steps.push({
        id: 'simplify-mixed',
        title: '約分',
        hint: '分數部分可以約簡。整數不用改，只約分子和分母。',
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
        title: '寫出答案',
        hint: '整數和分數部分合起來就是答案。記住：可以用假分數作答案，不一定要轉成帶分數。',
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

    // Left step 1: 通分母 result = four blanks for two expanded fractions
    // Right hint-process: 要通分 → 短除法(+乘數) → 分別擴分
    steps.push({
      id: 'tongfen',
      title: '通分母',
      hint: '兩個分母不同，要先通分。開啟提示時，請先在右邊完成通分過程；完成後再在左邊填寫通分後的兩個分數。',
      fields: [
        { key: 'exp_a_n', label: '第一個擴分分子', expected: ea.n },
        { key: 'exp_a_d', label: '第一個擴分分母', expected: lcd },
        { key: 'exp_b_n', label: '第二個擴分分子', expected: eb.n },
        { key: 'exp_b_d', label: '第二個擴分分母', expected: lcd },
      ],
      show: {
        type: 'tongfen-result',
        a: fmtAddend(a),
        b: fmtAddend(b),
        ea,
        eb,
        multA: ea.mult,
        multB: eb.mult,
        lcd,
      },
      process: {
        type: 'tongfen-guide',
        d1: a.d,
        d2: b.d,
        lcd,
        sd,
        a: fmtAddend(a),
        b: fmtAddend(b),
        ea,
        eb,
        multA: ea.mult,
        multB: eb.mult,
      },
      cpa: { d1: a.d, d2: b.d, lcd },
      locksLeftUntilHintDone: true,
    });

    steps.push({
      id: 'add-nums',
      title: '分子相加',
      hint: '分母現在相同，將兩個分子加起來，分母不變。如果和是假分數，可以直接用假分數作答案，不用轉成帶分數。',
      fields: [
        { key: 'sum_n', label: '分子', expected: sumN },
        { key: 'sum_d', label: '分母', expected: lcd },
      ],
      show: { type: 'sum-expanded', ea, eb, sumN, lcd },
    });

    const simp = M.simplify(sumN, lcd);
    // L2 第一／第二關唔約分；第三關用「有／沒有」先再填（同級別 1）
    if (q.forceSimplifyCheck || q.l2Stage === 'C') {
      const chk = buildSimplifyCheckProper(sumN, lcd, true);
      if (chk) {
        chk.hint = '按下面「有」或「沒有」。約分是分子和分母同時除以相同的數，可以試黃金密碼質數 2、3、5、7。如果有約分，再填寫除數和最簡分數。可以用假分數作答案，不用轉成帶分數。';
        steps.push(chk);
      }
    } else if (q.level !== 2 && (simp.n !== sumN || simp.d !== lcd)) {
      steps.push({
        id: 'simplify',
        title: '約分',
        hint: '約至最簡分數。可以用假分數作答案，不用轉成帶分數。',
        fields: [
          { key: 'simp_n', label: '最簡分子', expected: simp.n },
          { key: 'simp_d', label: '最簡分母', expected: simp.d },
        ],
        show: { type: 'simplify', from: { n: sumN, d: lcd }, to: simp },
      });
    }

    // 假分數不用轉成帶分數；可用假分數作答案
    return steps;
  }

  function tongfenStepForParts(a, b, ea, eb, lcd, sd) {
    return {
      id: 'tongfen',
      title: '通分母',
      hint: '分數部分分母不同，要先通分。開啟提示時，請先在右邊完成通分過程；完成後再在左邊填寫通分後的兩個分數部分。',
      fields: [
        { key: 'exp_a_n', label: '第一個擴分分子', expected: ea.n },
        { key: 'exp_a_d', label: '第一個擴分分母', expected: lcd },
        { key: 'exp_b_n', label: '第二個擴分分子', expected: eb.n },
        { key: 'exp_b_d', label: '第二個擴分分母', expected: lcd },
      ],
      show: {
        type: 'tongfen-result',
        a: fmtAddend(a),
        b: fmtAddend(b),
        ea,
        eb,
        multA: ea.mult,
        multB: eb.mult,
        lcd,
        // keepWholes: 通分母步驟保留帶分數整數
        keepWholes: true,
      },
      process: {
        type: 'tongfen-guide',
        d1: a.d,
        d2: b.d,
        lcd,
        sd,
        a: fmtAddend(a),
        b: fmtAddend(b),
        ea,
        eb,
        multA: ea.mult,
        multB: eb.mult,
        keepWholes: true,
      },
      cpa: { d1: a.d, d2: b.d, lcd },
      locksLeftUntilHintDone: true,
      keepWholes: true,
    };
  }

  /**
   * L2 帶分數：先通分母，再跟級別 1 帶分數流程（整數+分數一齊加）。
   * 保證分數部分和 < 1（唔使進位）。
   */
  function buildUnlikeMixedL2(q) {
    const [a, b] = q.addends;
    const lcd = q.lcd || M.lcm(a.d, b.d);
    const ea = Q.expand(a.n, a.d, lcd);
    const eb = Q.expand(b.n, b.d, lcd);
    const fracSumN = ea.n + eb.n;
    const wholeSum = (a.w || 0) + (b.w || 0);
    const sd = M.shortDivisionLcm(a.d, b.d);
    const steps = [];

    // 1) 通分母 first
    steps.push(tongfenStepForParts(a, b, ea, eb, lcd, sd));

    // 2) Same as L1 Stage B: 整數加整數，分數加分數（一齊填）
    //    After 通分, show expanded fraction parts in the prompt
    const aExp = { kind: 'mixed', w: a.w || 0, n: ea.n, d: lcd };
    const bExp = { kind: 'mixed', w: b.w || 0, n: eb.n, d: lcd };
    steps.push({
      id: 'add-mixed-together',
      title: '整數加整數，分數加分數',
      hint: '通分之後分母相同，好像級別 1 帶分數一樣：整數加整數、分數加分數一齊計算。分數部分加完會小於 1，不用進位。可以用假分數作答案。',
      fields: [
        { key: 'whole_sum', label: '整數和', expected: wholeSum },
        { key: 'frac_n', label: '分子', expected: fracSumN },
        { key: 'frac_d', label: '分母', expected: lcd },
      ],
      show: { type: 'add-mixed-together', a: aExp, b: bExp },
    });

    const s = M.simplify(fracSumN, lcd);
    const needsSimp = fracSumN > 0 && (s.n !== fracSumN || s.d !== lcd);
    // L2 第三關：先問有／沒有約分，再填結果（同級別 1）
    if (q.l2Stage === 'C' || q.forceSimplifyCheck) {
      steps.push({
        id: 'check-simplify-mixed',
        title: '是否需要約分（分子分母同時除以相同的數）？（黃金密碼：2、3、5、7）',
        hint: '按下面「有」或「沒有」。約分是分子和分母同時除以相同的數，可以試黃金密碼質數 2、3、5、7。如果有約分，再填寫除數和最簡分數（整數不變）。可以用假分數作答案，不用轉成帶分數。',
        isSimplifyChoice: true,
        needsSimplify: needsSimp,
        fields: [],
        answerFields: (needsSimp
          ? simplifyDivisorFields(fracSumN, lcd)
          : []).concat([
          { key: 'final_w', label: '整數', expected: wholeSum },
          { key: 'simp_n', label: '最簡分子', expected: s.n },
          { key: 'simp_d', label: '最簡分母', expected: s.d },
        ]),
        show: {
          type: 'check-simplify-mixed',
          w: wholeSum,
          from: { n: fracSumN, d: lcd },
          to: s,
          needs: needsSimp,
          div: M.gcd(fracSumN, lcd),
        },
      });
    }
    // No carry — L2 帶分數同 L1 一樣唔使進位
    return steps;
  }

  /** L3：跟級別2帶分數流程（通分母 → 整數/分數一齊加），再處理進位／約分 */
  function buildUnlikeMixedL3(q) {
    const [a, b] = q.addends;
    const lcd = q.lcd || M.lcm(a.d, b.d);
    const ea = Q.expand(a.n, a.d, lcd);
    const eb = Q.expand(b.n, b.d, lcd);
    const fracSumN = ea.n + eb.n;
    const wholeSum = (a.w || 0) + (b.w || 0);
    const sd = M.shortDivisionLcm(a.d, b.d);
    const needCarry = fracSumN >= lcd;
    const steps = [];

    // 1) 通分母（保留整數）
    steps.push(tongfenStepForParts(a, b, ea, eb, lcd, sd));

    // 2) 同級別2：整數加整數，分數加分數（一齊填）
    const aExp = { kind: 'mixed', w: a.w || 0, n: ea.n, d: lcd };
    const bExp = { kind: 'mixed', w: b.w || 0, n: eb.n, d: lcd };
    steps.push({
      id: 'add-mixed-together',
      title: '整數加整數，分數加分數',
      hint: '通分之後分母相同，好像級別 2 帶分數一樣：整數加整數、分數加分數一齊計算。如果分數部分 ≥ 1，下一步再進位。可以用假分數作答案。',
      fields: [
        { key: 'whole_sum', label: '整數和', expected: wholeSum },
        { key: 'frac_n', label: '分子', expected: fracSumN },
        { key: 'frac_d', label: '分母', expected: lcd },
      ],
      show: { type: 'add-mixed-together', a: aExp, b: bExp },
    });

    let curW = wholeSum;
    let curN = fracSumN;
    let curD = lcd;

    if (needCarry) {
      const carry = Math.floor(fracSumN / lcd);
      const rem = fracSumN % lcd;
      steps.push({
        id: 'carry',
        title: '分數進位',
        hint: '分數部分是假分數（分子 ≥ 分母），要用除法變成帶分數：分子 ÷ 分母，商加到整數，餘數作為新分子。請先完成右邊提示，再在左邊填寫答案。',
        locksLeftUntilHintDone: true,
        process: {
          type: 'carry-guide',
          whole: wholeSum,
          n: fracSumN,
          d: lcd,
          carry,
          rem,
        },
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
    }

    // 唔再加「寫出答案」：進位／加法步已係最終答案；只有要約分先加一步
    const s = M.simplify(curN || 0, curD || 1);
    const needsSimp = curN > 0 && (s.n !== curN || s.d !== curD);
    if (needsSimp) {
      steps.push({
        id: 'check-simplify-mixed',
        title: '是否需要約分（分子分母同時除以相同的數）？（黃金密碼：2、3、5、7）',
        hint: '按下面「有」或「沒有」。約分是分子和分母同時除以相同的數。如果有約分，再填寫除數和最簡分數（整數不變）。可以用假分數作答案，不用轉成帶分數。',
        isSimplifyChoice: true,
        needsSimplify: true,
        fields: [],
        answerFields: simplifyDivisorFields(curN, curD).concat([
          { key: 'final_w', label: '整數', expected: curW },
          { key: 'simp_n', label: '最簡分子', expected: s.n },
          { key: 'simp_d', label: '最簡分母', expected: s.d },
        ]),
        show: {
          type: 'check-simplify-mixed',
          w: curW,
          from: { n: curN, d: curD },
          to: s,
          needs: true,
          div: M.gcd(curN || 0, curD || 1),
        },
      });
    }

    return steps;
  }

  /** Route mixed unlike-denom questions */
  function buildUnlikeMixed(q) {
    // L2 帶分數（第二／第三關）用 no-carry L1-style flow
    if (q.sub === '2B' || q.sub === '2C' || (q.level === 2 && q.l2Stage === 'B') || (q.level === 2 && q.l2Stage === 'C' && q.addends && q.addends.some((x) => (x.w || 0) > 0 || x.type === 'mixed'))) {
      return buildUnlikeMixedL2(q);
    }
    // L3: 跟級別2流程 + 可進位
    return buildUnlikeMixedL3(q);
  }

  function buildSteps(q) {
    let steps;
    if (q.sub === '1A') steps = buildSameDenomProper(q);
    else if (q.sub === '1B' || q.sub === '1BP') steps = buildSameDenomMixed(q);
    else if (q.sub === '2A') steps = buildUnlikeProper(q);
    else if (q.sub === '2B' || q.sub === '2C' || q.sub === '3A' || q.sub === '3B') steps = buildUnlikeMixed(q);
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
    if (fieldKey === 'simp_div_n' || fieldKey === 'simp_div_d') {
      return '約分時分子和分母要除以同一個大於 1 的數。可以試黃金密碼 2、3、5、7。';
    }
    if (fieldKey.startsWith('sd_div')) return '短除第一個除數試較小的質數，例如 2 或 3。';
    if (fieldKey.startsWith('sd_')) return '再看一看短除：兩個數都可以被同一個數整除，才寫在左邊。';
    if (fieldKey === 'simp_n' || fieldKey === 'simp_d') {
      return '用分子和分母同時除以同一個數，得到最簡分數。';
    }
    if (fieldKey.includes('n') || fieldKey.includes('分子')) return '分子計算錯了，請慢慢再加一次。';
    if (fieldKey.includes('d') || fieldKey.includes('分母')) return '分母通常不變（通分後用公倍數）。';
    return '請慢慢再試這一格，可以先用草稿計算。';
  }

  global.FracSteps = {
    buildSteps,
    gradeStep,
    extraHintForField,
    fmtAddend,
  };
})(typeof window !== 'undefined' ? window : globalThis);
