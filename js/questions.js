/**
 * Question generator for fraction addition levels 1–3.
 * Hard-filters L2 (no fractional carry) vs L3 (with fractional carry).
 */
(function (global) {
  'use strict';
  const M = global.FracMath;

  const DENOM_POOL = [2, 3, 4, 5, 6, 8, 9, 10, 12];

  function makeProper(n, d) {
    return { type: 'proper', w: 0, n, d };
  }

  function makeMixed(w, n, d) {
    return { type: 'mixed', w, n, d };
  }

  /** Expand fraction n/d to common denom lcd */
  function expand(n, d, lcd) {
    const mult = lcd / d;
    return { n: n * mult, d: lcd, mult };
  }

  /**
   * After bringing fractional parts to LCD, does sum of nums >= lcd?
   * (i.e. fractional carry needed)
   */
  function fracPartsNeedCarry(a, b) {
    const lcd = M.lcm(a.d, b.d);
    const na = a.n * (lcd / a.d);
    const nb = b.n * (lcd / b.d);
    return na + nb >= lcd;
  }

  function relationOfDenoms(d1, d2) {
    if (d1 === d2) return 'same';
    if (d1 % d2 === 0 || d2 % d1 === 0) return 'multiple';
    if (M.gcd(d1, d2) === 1) return 'coprime';
    return 'not-coprime';
  }

  /** Each addend's fraction part must already be lowest terms (題目一開始唔可約). */
  function addendAlreadySimplified(f) {
    if (!f || !f.d) return false;
    return M.isSimplified(f.n, f.d);
  }
  function addendsStartSimplified(q) {
    return !!(q && q.addends && q.addends.length && q.addends.every(addendAlreadySimplified));
  }

  // ---------- Level 1 staged generators (NO fractional carry ever) ----------
  /** Proper same-denom, sum < d, already simplest (Stage A). */
  function gen1ANoSimplify() {
    for (let attempt = 0; attempt < 60; attempt++) {
      const d = M.pick([3, 4, 5, 6, 7, 8, 9, 10, 12]);
      const n1 = M.randInt(1, d - 2);
      const n2 = M.randInt(1, d - n1 - 1);
      if (!M.isSimplified(n1, d) || !M.isSimplified(n2, d)) continue;
      const sum = n1 + n2;
      if (sum >= d) continue;
      if (M.gcd(sum, d) !== 1) continue;
      return {
        level: 1,
        sub: '1A',
        label: '同分母真分數',
        addends: [makeProper(n1, d), makeProper(n2, d)],
        sameDenom: true,
        needFracCarry: false,
        needSimplify: false,
        skipSimplifyStep: true,
      };
    }
    return {
      level: 1,
      sub: '1A',
      label: '同分母真分數',
      addends: [makeProper(1, 5), makeProper(2, 5)],
      sameDenom: true,
      needFracCarry: false,
      needSimplify: false,
      skipSimplifyStep: true,
    };
  }

  /** Proper same-denom, sum < d, NEEDS simplify (Stage C). */
  function gen1ANeedsSimplify() {
    for (let attempt = 0; attempt < 60; attempt++) {
      const d = M.pick([4, 6, 8, 9, 10, 12]);
      const n1 = M.randInt(1, d - 2);
      const n2 = M.randInt(1, d - n1 - 1);
      if (!M.isSimplified(n1, d) || !M.isSimplified(n2, d)) continue;
      const sum = n1 + n2;
      if (sum >= d) continue;
      if (M.gcd(sum, d) === 1) continue;
      return {
        level: 1,
        sub: '1A',
        label: '同分母真分數（要约分）',
        addends: [makeProper(n1, d), makeProper(n2, d)],
        sameDenom: true,
        needFracCarry: false,
        needSimplify: true,
        skipSimplifyStep: false,
        forceSimplifyCheck: true,
      };
    }
    return {
      level: 1,
      sub: '1A',
      label: '同分母真分數（要约分）',
      addends: [makeProper(1, 6), makeProper(1, 6)],
      sameDenom: true,
      needFracCarry: false,
      needSimplify: true,
      skipSimplifyStep: false,
      forceSimplifyCheck: true,
    };
  }

  /** Mixed+mixed, no carry, already simplest frac part (Stage B). */
  function gen1BNoSimplify() {
    for (let attempt = 0; attempt < 60; attempt++) {
      const d = M.pick([3, 4, 5, 6, 8, 10]);
      const w1 = M.randInt(1, 3);
      const w2 = M.randInt(1, 3);
      const n1 = M.randInt(1, d - 2);
      const n2 = M.randInt(1, d - n1 - 1);
      if (!M.isSimplified(n1, d) || !M.isSimplified(n2, d)) continue;
      if (n1 + n2 >= d) continue;
      if (M.gcd(n1 + n2, d) !== 1) continue;
      return {
        level: 1,
        sub: '1B',
        label: '同分母帶分數',
        addends: [makeMixed(w1, n1, d), makeMixed(w2, n2, d)],
        sameDenom: true,
        needFracCarry: false,
        needSimplify: false,
        skipSimplifyStep: true,
      };
    }
    return {
      level: 1,
      sub: '1B',
      label: '同分母帶分數',
      addends: [makeMixed(1, 1, 5), makeMixed(2, 1, 5)],
      sameDenom: true,
      needFracCarry: false,
      needSimplify: false,
      skipSimplifyStep: true,
    };
  }

  /** Mixed + proper (帶分數加真分數), no carry, no simplify (Stage B). */
  function gen1MixedPlusProperNoSimplify() {
    for (let attempt = 0; attempt < 60; attempt++) {
      const d = M.pick([3, 4, 5, 6, 8, 10]);
      const w = M.randInt(1, 3);
      const n1 = M.randInt(1, d - 2);
      const n2 = M.randInt(1, d - n1 - 1);
      if (!M.isSimplified(n1, d) || !M.isSimplified(n2, d)) continue;
      if (n1 + n2 >= d) continue;
      if (M.gcd(n1 + n2, d) !== 1) continue;
      const mixedFirst = Math.random() < 0.5;
      const mixed = makeMixed(w, n1, d);
      const proper = makeProper(n2, d);
      return {
        level: 1,
        sub: '1BP',
        label: '帶分數加真分數',
        addends: mixedFirst ? [mixed, proper] : [proper, mixed],
        sameDenom: true,
        needFracCarry: false,
        needSimplify: false,
        skipSimplifyStep: true,
      };
    }
    return {
      level: 1,
      sub: '1BP',
      label: '帶分數加真分數',
      addends: [makeMixed(2, 1, 5), makeProper(2, 5)],
      sameDenom: true,
      needFracCarry: false,
      needSimplify: false,
      skipSimplifyStep: true,
    };
  }

  /** Mixed variants that NEED simplify (Stage C). */
  function gen1BNeedsSimplify() {
    for (let attempt = 0; attempt < 60; attempt++) {
      const d = M.pick([4, 6, 8, 10, 12]);
      const w1 = M.randInt(1, 3);
      const w2 = M.randInt(0, 2); // 0 => proper-like second
      const n1 = M.randInt(1, d - 2);
      const n2 = M.randInt(1, d - n1 - 1);
      if (!M.isSimplified(n1, d) || !M.isSimplified(n2, d)) continue;
      if (n1 + n2 >= d) continue;
      if (M.gcd(n1 + n2, d) === 1) continue;
      const a = makeMixed(w1, n1, d);
      const b = w2 === 0 ? makeProper(n2, d) : makeMixed(w2, n2, d);
      return {
        level: 1,
        sub: w2 === 0 ? '1BP' : '1B',
        label: w2 === 0 ? '帶分數加真分數（要约分）' : '同分母帶分數（要约分）',
        addends: [a, b],
        sameDenom: true,
        needFracCarry: false,
        needSimplify: true,
        skipSimplifyStep: false,
        forceSimplifyCheck: true,
      };
    }
    return {
      level: 1,
      sub: '1B',
      label: '同分母帶分數（要约分）',
      addends: [makeMixed(1, 1, 6), makeMixed(1, 1, 6)],
      sameDenom: true,
      needFracCarry: false,
      needSimplify: true,
      skipSimplifyStep: false,
      forceSimplifyCheck: true,
    };
  }

  /** Stage C: ≥1 帶分數 (mixed); randomly need simplify; always forceSimplifyCheck.
   *  Never emits proper+proper — at least one addend is a mixed number. */
  function hasMixedAddend(q) {
    return !!(q && q.addends && q.addends.some((x) => x.type === 'mixed' || (x.w || 0) > 0));
  }

  function gen1StageC() {
    const wantSimp = Math.random() < 0.55;
    // Always ≥1 帶分數: mixed+mixed or mixed+proper (never proper+proper)
    const kind = M.pick(['mixed', 'mixedProper']);
    let q;
    if (kind === 'mixed') {
      q = wantSimp ? gen1BNeedsSimplify() : gen1BNoSimplify();
    } else {
      if (wantSimp) {
        q = gen1BNeedsSimplify();
        // Prefer mixed+proper shape; never fall back to proper+proper
        for (let i = 0; i < 30; i++) {
          const t = gen1BNeedsSimplify();
          if (t.sub === '1BP' || t.addends.some((x) => x.type === 'proper')) {
            q = t;
            break;
          }
        }
      } else {
        q = gen1MixedPlusProperNoSimplify();
      }
    }
    // Final guard: L1 第三關必須最少有一個帶分數
    if (!hasMixedAddend(q)) {
      q = wantSimp ? gen1BNeedsSimplify() : gen1MixedPlusProperNoSimplify();
    }
    q.forceSimplifyCheck = true;
    q.skipSimplifyStep = false;
    q.l1Stage = 'C';
    return q;
  }

  const L1_STAGE_STREAK_NEED = 3;

  function assertNoL1Carry(q) {
    const [a, b] = q.addends;
    if (!a || !b || a.d !== b.d || a.n + b.n >= a.d) {
      let safe;
      if (q && q.l1Stage === 'C') {
        // Stage C must keep ≥1 帶分數
        safe = gen1BNeedsSimplify();
        safe.forceSimplifyCheck = true;
        safe.skipSimplifyStep = false;
      } else if (q && q.l1Stage === 'B') {
        safe = gen1BNoSimplify();
      } else {
        safe = gen1ANoSimplify();
      }
      safe.l1Stage = q && q.l1Stage;
      return safe;
    }
    q.needFracCarry = false;
    return q;
  }

  // ---------- Level 2A: unlike proper (any sum OK) ----------
  function gen2A(preferRelation) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const d1 = M.pick(DENOM_POOL);
      let d2 = M.pick(DENOM_POOL.filter((x) => x !== d1));
      const rel = relationOfDenoms(d1, d2);
      if (preferRelation && rel !== preferRelation && attempt < 25) continue;
      const n1 = M.randInt(1, d1 - 1);
      const n2 = M.randInt(1, d2 - 1);
      if (!M.isSimplified(n1, d1) || !M.isSimplified(n2, d2)) continue;
      const lcd = M.lcm(d1, d2);
      if (lcd > 36) continue; // keep manageable
      const sumN = n1 * (lcd / d1) + n2 * (lcd / d2);
      // 第一關：唔要约分
      if (M.gcd(sumN, lcd) !== 1) continue;
      return {
        level: 2,
        sub: '2A',
        label: '異分母真分數',
        addends: [makeProper(n1, d1), makeProper(n2, d2)],
        sameDenom: false,
        lcd,
        denomRelation: rel,
        needFracCarry: sumN >= lcd,
        skipSimplifyStep: true,
        l2Stage: 'A',
      };
    }
    // fallback
    return {
      level: 2,
      sub: '2A',
      label: '異分母真分數',
      addends: [makeProper(1, 4), makeProper(1, 6)],
      sameDenom: false,
      lcd: 12,
      denomRelation: 'not-coprime',
      needFracCarry: false,
    };
  }

  // ---------- Level 2B: unlike mixed, NO fractional carry ----------
  function gen2B(preferRelation) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const d1 = M.pick(DENOM_POOL);
      const d2 = M.pick(DENOM_POOL.filter((x) => x !== d1));
      const rel = relationOfDenoms(d1, d2);
      if (preferRelation && rel !== preferRelation && attempt < 30) continue;
      const lcd = M.lcm(d1, d2);
      if (lcd > 36) continue;
      const n1 = M.randInt(1, d1 - 1);
      const n2 = M.randInt(1, d2 - 1);
      if (!M.isSimplified(n1, d1) || !M.isSimplified(n2, d2)) continue;
      if (fracPartsNeedCarry(makeProper(n1, d1), makeProper(n2, d2))) continue;
      const eaN = n1 * (lcd / d1);
      const ebN = n2 * (lcd / d2);
      // 第二關：唔要约分
      if (M.gcd(eaN + ebN, lcd) !== 1) continue;
      const w1 = M.randInt(1, 3);
      const w2 = M.randInt(1, 3);
      // After expand to lcd, frac sum must stay < lcd (no carry), same as L1 mixed
      return {
        level: 2,
        sub: '2B',
        label: '異分母帶分數（唔使進位）',
        addends: [makeMixed(w1, n1, d1), makeMixed(w2, n2, d2)],
        sameDenom: false,
        lcd,
        denomRelation: rel,
        needFracCarry: false,
        skipSimplifyStep: true,
        l2Stage: 'B',
      };
    }
    return {
      level: 2,
      sub: '2B',
      label: '異分母帶分數（唔使進位）',
      addends: [makeMixed(1, 1, 4), makeMixed(2, 1, 6)],
      sameDenom: false,
      lcd: 12,
      denomRelation: 'not-coprime',
      needFracCarry: false,
      skipSimplifyStep: true,
      l2Stage: 'B',
    };
  }

  /** L2 Stage C: 約分關 — proper or mixed, no carry, NEEDS simplify after 通分 */
  function gen2C() {
    for (let attempt = 0; attempt < 80; attempt++) {
      const wantMixed = Math.random() < 0.5;
      const d1 = M.pick(DENOM_POOL);
      const d2 = M.pick(DENOM_POOL.filter((x) => x !== d1));
      const lcd = M.lcm(d1, d2);
      if (lcd > 36) continue;
      const n1 = M.randInt(1, d1 - 1);
      const n2 = M.randInt(1, d2 - 1);
      if (!M.isSimplified(n1, d1) || !M.isSimplified(n2, d2)) continue;
      if (fracPartsNeedCarry(makeProper(n1, d1), makeProper(n2, d2))) continue;
      const sumN = n1 * (lcd / d1) + n2 * (lcd / d2);
      if (M.gcd(sumN, lcd) === 1) continue; // must need 約分
      if (wantMixed) {
        const w1 = M.randInt(1, 3);
        const w2 = M.randInt(1, 3);
        return {
          level: 2,
          sub: '2C',
          label: '異分母帶分數（要约分）',
          addends: [makeMixed(w1, n1, d1), makeMixed(w2, n2, d2)],
          sameDenom: false,
          lcd,
          denomRelation: relationOfDenoms(d1, d2),
          needFracCarry: false,
          forceSimplifyCheck: true,
          skipSimplifyStep: false,
          l2Stage: 'C',
        };
      }
      return {
        level: 2,
        sub: '2A', // proper shape but stage C
        label: '異分母真分數（要约分）',
        addends: [makeProper(n1, d1), makeProper(n2, d2)],
        sameDenom: false,
        lcd,
        denomRelation: relationOfDenoms(d1, d2),
        needFracCarry: sumN >= lcd,
        forceSimplifyCheck: true,
        skipSimplifyStep: false,
        l2Stage: 'C',
      };
    }
    // fallback mixed needing simplify: 1/6+1/3 → 1/6+2/6=3/6
    return {
      level: 2,
      sub: '2C',
      label: '異分母帶分數（要约分）',
      addends: [makeMixed(1, 1, 6), makeMixed(1, 1, 3)],
      sameDenom: false,
      lcd: 6,
      denomRelation: 'multiple',
      needFracCarry: false,
      forceSimplifyCheck: true,
      skipSimplifyStep: false,
      l2Stage: 'C',
    };
  }

  // ---------- Level 3A: ≥1 帶分數, 異分母, 通分後分數部分一定要進位 ----------
  function gen3A() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const d1 = M.pick(DENOM_POOL);
      const d2 = M.pick(DENOM_POOL.filter((x) => x !== d1));
      const lcd = M.lcm(d1, d2);
      if (lcd > 36) continue;
      const n1 = M.randInt(1, d1 - 1);
      const n2 = M.randInt(1, d2 - 1);
      if (!M.isSimplified(n1, d1) || !M.isSimplified(n2, d2)) continue;
      // 通分後分數部分和 ≥ 1 → 一定要進位
      if (!fracPartsNeedCarry(makeProper(n1, d1), makeProper(n2, d2))) continue;
      // At least one mixed (帶分數)
      const mode = M.pick(['MM', 'MP', 'PM']);
      let w1 = 0;
      let w2 = 0;
      if (mode === 'MM') {
        w1 = M.randInt(1, 3);
        w2 = M.randInt(1, 3);
      } else if (mode === 'MP') {
        w1 = M.randInt(1, 3);
        w2 = 0;
      } else {
        w1 = 0;
        w2 = M.randInt(1, 3);
      }
      const a = w1 > 0 ? makeMixed(w1, n1, d1) : makeProper(n1, d1);
      const b = w2 > 0 ? makeMixed(w2, n2, d2) : makeProper(n2, d2);
      return {
        level: 3,
        sub: '3A',
        label: '異分母帶分數（要進位）',
        addends: [a, b],
        sameDenom: false,
        lcd,
        denomRelation: relationOfDenoms(d1, d2),
        needFracCarry: true,
      };
    }
    return {
      level: 3,
      sub: '3A',
      label: '異分母帶分數（要進位）',
      addends: [makeMixed(1, 3, 4), makeProper(5, 6)],
      sameDenom: false,
      lcd: 12,
      denomRelation: 'not-coprime',
      needFracCarry: true,
    };
  }

  // ---------- Level 3B: unlike mixed WITH fractional carry ----------
  function gen3B(preferRelation) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const d1 = M.pick(DENOM_POOL);
      const d2 = M.pick(DENOM_POOL.filter((x) => x !== d1));
      const rel = relationOfDenoms(d1, d2);
      if (preferRelation && rel !== preferRelation && attempt < 30) continue;
      const lcd = M.lcm(d1, d2);
      if (lcd > 36) continue;
      const n1 = M.randInt(1, d1 - 1);
      const n2 = M.randInt(1, d2 - 1);
      if (!M.isSimplified(n1, d1) || !M.isSimplified(n2, d2)) continue;
      if (!fracPartsNeedCarry(makeProper(n1, d1), makeProper(n2, d2))) continue;
      const w1 = M.randInt(1, 3);
      const w2 = M.randInt(1, 3);
      return {
        level: 3,
        sub: '3B',
        label: '異分母帶分數（要進位）',
        addends: [makeMixed(w1, n1, d1), makeMixed(w2, n2, d2)],
        sameDenom: false,
        lcd,
        denomRelation: rel,
        needFracCarry: true,
      };
    }
    return {
      level: 3,
      sub: '3B',
      label: '異分母帶分數（要進位）',
      addends: [makeMixed(2, 3, 4), makeMixed(1, 5, 6)],
      sameDenom: false,
      lcd: 12,
      denomRelation: 'not-coprime',
      needFracCarry: true,
    };
  }

  /** Cycle relations for unlike-denom coverage */
  let relIdx = 0;
  const RELS = ['multiple', 'coprime', 'not-coprime'];

  function nextRelation() {
    const r = RELS[relIdx % RELS.length];
    relIdx++;
    return r;
  }

  /** Fingerprint for duplicate avoidance: level, stage/sub, ordered addends. */
  function fingerprint(q) {
    if (!q || !q.addends) return '';
    const parts = q.addends.map((a) => {
      const w = a.w || 0;
      const typ = a.type || (w > 0 ? 'mixed' : 'proper');
      return typ + ':' + w + '/' + a.n + '/' + a.d;
    });
    return [q.level, q.sub || '', q.l1Stage || '', q.l2Stage || '', parts.join('+')].join('|');
  }

  let lastFingerprint = null;

  function generateOnce(level, opts) {
    const force = opts.forceSub;
    let q;
    if (level === 1) {
      const stage = opts.l1Stage || 'A';
      const stageBIndex = opts.stageBIndex != null ? opts.stageBIndex : 0;
      if (force === '1A') q = gen1ANoSimplify();
      else if (force === '1B') q = gen1BNoSimplify();
      else if (stage === 'A') {
        q = gen1ANoSimplify();
        q.l1Stage = 'A';
      } else if (stage === 'B') {
        q = (stageBIndex % 2 === 1) ? gen1MixedPlusProperNoSimplify() : gen1BNoSimplify();
        q.l1Stage = 'B';
      } else {
        q = gen1StageC();
        q.l1Stage = 'C';
      }
      q = assertNoL1Carry(q);
      q.l1Stage = q.l1Stage || stage;
    } else if (level === 2) {
      // L2: A=真分數, B=帶分數, C=約分; unlock after streak (app uses 2)
      const stage = opts.l2Stage || 'A';
      const rel = nextRelation();
      if (force === '2A') q = gen2A(rel);
      else if (force === '2B') q = gen2B(rel);
      else if (force === '2C') q = gen2C();
      else if (stage === 'C') q = gen2C();
      else if (stage === 'B') q = gen2B(rel);
      else q = gen2A(rel);
      q.l2Stage = stage;
    } else {
      const rel = nextRelation();
      if (force === '3A') q = gen3A();
      else if (force === '3B') q = gen3B(rel);
      else q = Math.random() < 0.45 ? gen3A() : gen3B(rel); // both ≥1 帶分數
    }
    return q;
  }

  /**
   * Generate a question for level 1|2|3.
   * Never emits fractional carry on L1.
   * opts.forceSub, opts.l1Stage, opts.l2Stage, opts.stageBIndex, opts.avoidFingerprint
   * Retries up to 20 times to avoid consecutive identical fingerprint.
   */
  function generate(level, opts) {
    opts = opts || {};
    const avoid =
      opts.avoidFingerprint !== undefined ? opts.avoidFingerprint : lastFingerprint;
    let q = null;
    let fp = '';
    for (let attempt = 0; attempt < 40; attempt++) {
      q = generateOnce(level, opts);
      if (!addendsStartSimplified(q)) continue; // 題目一開始唔應有可約分分數
      // 級別 3：通分後分數部分一定要進位
      if (level === 3 && !q.needFracCarry) continue;
      fp = fingerprint(q);
      if (!avoid || fp !== avoid) break;
    }
    if (!addendsStartSimplified(q)) {
      // last-resort known-good (already simplified addends)
      if (level === 1) {
        const st = (opts && opts.l1Stage) || 'A';
        if (st === 'C') {
          q = gen1BNeedsSimplify();
          q.forceSimplifyCheck = true;
          q.skipSimplifyStep = false;
        } else if (st === 'B') {
          q = gen1BNoSimplify();
        } else {
          q = gen1ANoSimplify();
        }
        q.l1Stage = st;
        q = assertNoL1Carry(q);
      } else if (level === 2) {
        const st = (opts && opts.l2Stage) || 'A';
        if (st === 'C') q = gen2C();
        else if (st === 'B') q = gen2B();
        else q = gen2A();
        q.l2Stage = st;
      } else {
        q = gen3B(); // L3 一定要進位
      }
    }
    fp = fingerprint(q);
    lastFingerprint = fp;
    q.fingerprint = fp;
    q.id = 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    q.createdAt = Date.now();
    return q;
  }

  function resetLastFingerprint() {
    lastFingerprint = null;
  }

  /** Compute final simplified answer (prefer improper/proper fraction, not mixed). */
  function computeAnswer(q) {
    const [a, b] = q.addends;
    const ia = M.toImproper(a.w || 0, a.n, a.d);
    const ib = M.toImproper(b.w || 0, b.n, b.d);
    const lcd = M.lcm(ia.d, ib.d);
    const sumN = ia.n * (lcd / ia.d) + ib.n * (lcd / ib.d);
    const s = M.simplify(sumN, lcd);
    if (s.n % s.d === 0) {
      return { w: s.n / s.d, n: 0, d: 1 };
    }
    // Keep as (possibly improper) fraction — 唔強制化帶分數
    return { w: 0, n: s.n, d: s.d };
  }

  global.FracQuestions = {
    generate,
    fingerprint,
    resetLastFingerprint,
    computeAnswer,
    fracPartsNeedCarry,
    relationOfDenoms,
    addendsStartSimplified,
    expand,
    L1_STAGE_STREAK_NEED,
    gen1ANoSimplify,
    gen1BNoSimplify,
    gen1MixedPlusProperNoSimplify,
  };
})(typeof window !== 'undefined' ? window : globalThis);
