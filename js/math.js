/**
 * Fraction math helpers for Primary 5 addition practice.
 */
(function (global) {
  'use strict';

  function gcd(a, b) {
    a = Math.abs(a | 0);
    b = Math.abs(b | 0);
    while (b) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a || 1;
  }

  function lcm(a, b) {
    return Math.abs(a * b) / gcd(a, b);
  }

  function simplify(n, d) {
    if (d === 0) throw new Error('denom 0');
    const g = gcd(n, d);
    return { n: n / g, d: d / g };
  }

  /** Improper or proper → mixed { w, n, d } with 0 ≤ n < d */
  function toMixed(n, d) {
    const s = simplify(n, d);
    const w = Math.floor(s.n / s.d);
    return { w, n: s.n % s.d, d: s.d };
  }

  /** Mixed → improper numerator (over same d) */
  function toImproper(w, n, d) {
    return { n: w * d + n, d };
  }

  function isSimplified(n, d) {
    return gcd(n, d) === 1;
  }

  /** Factor primes for short division display (small numbers) */
  function primesUpTo(max) {
    const out = [];
    for (let p = 2; p <= max; p++) {
      let ok = true;
      for (let i = 2; i * i <= p; i++) if (p % i === 0) { ok = false; break; }
      if (ok) out.push(p);
    }
    return out;
  }

  /**
   * Short division steps for LCM of two positive integers.
   * Returns { divisors: number[], rows: [left, right][], product: lcm }
   * Classic HK primary layout: keep dividing while any share a factor.
   */
  function shortDivisionLcm(a, b) {
    let x = a;
    let y = b;
    const divisors = [];
    const rows = [[a, b]];
    const primes = primesUpTo(Math.max(a, b, 12));

    let guard = 0;
    while (guard++ < 20) {
      let divided = false;
      for (const p of primes) {
        if (x % p === 0 && y % p === 0) {
          divisors.push(p);
          x = x / p;
          y = y / p;
          rows.push([x, y]);
          divided = true;
          break;
        }
      }
      if (!divided) break;
    }
    // Remaining factors multiply into LCM
    const product = divisors.reduce((acc, d) => acc * d, 1) * x * y;
    return { divisors, rows, remainders: [x, y], product, a, b };
  }

  /** List multiples until common (for weaker students) */
  function listCommonMultiple(a, b, limit) {
    limit = limit || a * b;
    const multiplesA = [];
    for (let i = a; i <= limit; i += a) multiplesA.push(i);
    for (const m of multiplesA) {
      if (m % b === 0) return m;
    }
    return lcm(a, b);
  }

  function randInt(lo, hi) {
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Format fraction for display helpers */
  function fracKey(w, n, d) {
    if (w && w > 0) return `${w}_${n}_${d}`;
    return `${n}_${d}`;
  }

  global.FracMath = {
    gcd,
    lcm,
    simplify,
    toMixed,
    toImproper,
    isSimplified,
    shortDivisionLcm,
    listCommonMultiple,
    randInt,
    pick,
    shuffle,
    fracKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
