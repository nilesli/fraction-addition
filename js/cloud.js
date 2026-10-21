/**
 * Fraction Addition — Firebase cloud + local fallback for play records.
 * ES module; exposes window.FracCloud when ready.
 */
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const APP_ID = 'fraction-addition-default';
const LS_CONFIG = 'fraction_addition_firebase_config';
const LS_TEACHER = 'fraction_addition_teacher_code';
const LS_PENDING = 'fraction_addition_pending_records';
const LS_LOCAL = 'fraction_addition_local_records';
const DEFAULT_TEACHER = 'default';

let app = null;
let auth = null;
let db = null;
let ready = false;
let initPromise = null;
let unsubLive = null;

function sanitizeTeacherCode(raw) {
  const s = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  return s || DEFAULT_TEACHER;
}

function getTeacherCode() {
  try {
    return sanitizeTeacherCode(localStorage.getItem(LS_TEACHER));
  } catch (e) {
    return DEFAULT_TEACHER;
  }
}

function setTeacherCode(raw) {
  const code = sanitizeTeacherCode(raw);
  try {
    localStorage.setItem(LS_TEACHER, code);
  } catch (e) { /* private mode */ }
  return code;
}

function getFirebaseConfig() {
  if (
    typeof window.FRACTION_ADDITION_FIREBASE_CONFIG === 'object' &&
    window.FRACTION_ADDITION_FIREBASE_CONFIG &&
    window.FRACTION_ADDITION_FIREBASE_CONFIG.apiKey
  ) {
    return window.FRACTION_ADDITION_FIREBASE_CONFIG;
  }
  try {
    const raw = localStorage.getItem(LS_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.apiKey && parsed.projectId) return parsed;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function saveFirebaseConfigToLocal(obj) {
  localStorage.setItem(LS_CONFIG, JSON.stringify(obj));
}

function clearFirebaseConfigLocal() {
  try {
    localStorage.removeItem(LS_CONFIG);
  } catch (e) { /* ignore */ }
}

function isConfigured() {
  const c = getFirebaseConfig();
  return !!(c && c.apiKey && c.projectId && c.apiKey !== 'demo');
}

function readJsonArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function writeJsonArray(key, arr) {
  try {
    localStorage.setItem(key, JSON.stringify(arr.slice(-500)));
  } catch (e) { /* quota */ }
}

function appendLocalMirror(record) {
  const all = readJsonArray(LS_LOCAL);
  all.push(record);
  writeJsonArray(LS_LOCAL, all);
}

function appendPending(record) {
  const all = readJsonArray(LS_PENDING);
  all.push(record);
  writeJsonArray(LS_PENDING, all);
}

function entriesPath(teacherCode) {
  const code = sanitizeTeacherCode(teacherCode);
  return collection(
    db,
    'artifacts',
    APP_ID,
    'public',
    'data',
    'fraction_addition',
    `records_${code}`,
    'entries'
  );
}

async function ensureInit() {
  if (ready && db) return true;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const cfg = getFirebaseConfig();
    if (!cfg || !cfg.apiKey || !cfg.projectId || cfg.apiKey === 'demo') {
      ready = false;
      return false;
    }
    try {
      if (getApps().some((a) => a.name === 'fraction-addition')) {
        app = getApp('fraction-addition');
      } else {
        app = initializeApp(cfg, 'fraction-addition');
      }
      auth = getAuth(app);
      db = getFirestore(app);
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
      ready = !!(auth.currentUser && db);
      return ready;
    } catch (err) {
      console.warn('[FracCloud] init failed', err);
      ready = false;
      db = null;
      return false;
    }
  })();
  try {
    return await initPromise;
  } finally {
    if (!ready) initPromise = null;
  }
}

/**
 * Save one play record. Always mirrors locally.
 * @returns {'cloud'|'local'|'error'}
 */
async function saveRecord(partial) {
  const teacherCode = sanitizeTeacherCode(
    partial.teacherCode != null ? partial.teacherCode : getTeacherCode()
  );
  const finishedAt = partial.finishedAt || new Date().toISOString();
  const record = {
    teacherCode,
    studentId: String(partial.studentId || '').slice(0, 40),
    level: Number(partial.level) || 1,
    stage: partial.stage != null ? String(partial.stage) : '',
    mistakes: Number(partial.mistakes) || 0,
    durationSec: Math.max(0, Math.round(Number(partial.durationSec) || 0)),
    finishedAt,
    createdAt: new Date().toISOString(),
    streakAfter: Number(partial.streakAfter) || 0,
  };
  if (partial.sessionId) {
    record.sessionId = String(partial.sessionId).slice(0, 64);
  }
  if (partial.questionSummary) {
    record.questionSummary = String(partial.questionSummary).slice(0, 80);
  }

  appendLocalMirror(record);

  const ok = await ensureInit();
  if (!ok) {
    appendPending(record);
    return 'local';
  }
  try {
    await addDoc(entriesPath(teacherCode), record);
    return 'cloud';
  } catch (err) {
    console.warn('[FracCloud] upload failed', err);
    appendPending(record);
    return 'error';
  }
}

async function flushPending() {
  const pending = readJsonArray(LS_PENDING);
  if (!pending.length) return { flushed: 0, left: 0 };
  const ok = await ensureInit();
  if (!ok) return { flushed: 0, left: pending.length };
  const left = [];
  let flushed = 0;
  for (const rec of pending) {
    try {
      const code = sanitizeTeacherCode(rec.teacherCode);
      await addDoc(entriesPath(code), rec);
      flushed += 1;
    } catch (e) {
      left.push(rec);
    }
  }
  writeJsonArray(LS_PENDING, left);
  return { flushed, left: left.length };
}

function localRecordsForTeacher(teacherCode) {
  const code = sanitizeTeacherCode(teacherCode);
  const local = readJsonArray(LS_LOCAL).filter((r) => sanitizeTeacherCode(r.teacherCode) === code);
  const pending = readJsonArray(LS_PENDING).filter((r) => sanitizeTeacherCode(r.teacherCode) === code);
  const map = new Map();
  [...local, ...pending].forEach((r) => {
    const k = `${r.studentId}|${r.finishedAt}|${r.level}|${r.stage}|${r.mistakes}|${r.durationSec}`;
    map.set(k, r);
  });
  return Array.from(map.values()).sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));
}

/**
 * Load records for teacher (cloud if available, else local mirror).
 */
async function loadRecords(teacherCode, max = 300) {
  const code = sanitizeTeacherCode(teacherCode);
  const local = localRecordsForTeacher(code);
  const ok = await ensureInit();
  if (!ok) {
    return { source: 'local', records: local.slice(0, max) };
  }
  try {
    const q = query(entriesPath(code), orderBy('finishedAt', 'desc'), limit(max));
    const snap = await getDocs(q);
    const cloud = [];
    snap.forEach((d) => cloud.push({ id: d.id, ...d.data() }));
    // Merge local-only that may not have uploaded yet
    const keys = new Set(cloud.map((r) => `${r.studentId}|${r.finishedAt}|${r.level}|${r.stage}`));
    local.forEach((r) => {
      const k = `${r.studentId}|${r.finishedAt}|${r.level}|${r.stage}`;
      if (!keys.has(k)) cloud.push(r);
    });
    cloud.sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));
    return { source: 'cloud', records: cloud.slice(0, max) };
  } catch (err) {
    console.warn('[FracCloud] load failed, trying without orderBy', err);
    try {
      const snap = await getDocs(query(entriesPath(code), limit(max)));
      const cloud = [];
      snap.forEach((d) => cloud.push({ id: d.id, ...d.data() }));
      cloud.sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));
      return { source: 'cloud', records: cloud };
    } catch (err2) {
      console.warn('[FracCloud] load fallback failed', err2);
      return { source: 'local', records: local.slice(0, max), error: String(err2 && err2.message) };
    }
  }
}

function subscribeRecords(teacherCode, onData, max = 300) {
  if (unsubLive) {
    unsubLive();
    unsubLive = null;
  }
  const code = sanitizeTeacherCode(teacherCode);
  ensureInit().then((ok) => {
    if (!ok) {
      onData({ source: 'local', records: localRecordsForTeacher(code).slice(0, max) });
      return;
    }
    try {
      const q = query(entriesPath(code), orderBy('finishedAt', 'desc'), limit(max));
      unsubLive = onSnapshot(
        q,
        (snap) => {
          const cloud = [];
          snap.forEach((d) => cloud.push({ id: d.id, ...d.data() }));
          onData({ source: 'cloud', records: cloud });
        },
        (err) => {
          console.warn('[FracCloud] snapshot error', err);
          onData({ source: 'local', records: localRecordsForTeacher(code).slice(0, max), error: String(err.message) });
        }
      );
    } catch (e) {
      onData({ source: 'local', records: localRecordsForTeacher(code).slice(0, max) });
    }
  });
  return () => {
    if (unsubLive) {
      unsubLive();
      unsubLive = null;
    }
  };
}

function recordsToCsv(records) {
  const header = ['學號', '關卡', '關卡階段', '錯次', '用時秒', '完成時間', '題目', '場次'];
  const rows = records.map((r) => {
    const hk = formatHkTime(r.finishedAt);
    return [
      r.studentId || '',
      r.level != null ? `L${r.level}` : '',
      r.stage || '',
      r.mistakes != null ? r.mistakes : '',
      r.durationSec != null ? r.durationSec : '',
      hk,
      r.questionSummary || '',
      r._sessionLabel || r.sessionId || '',
    ].map(csvEscape).join(',');
  });
  return '\uFEFF' + [header.join(','), ...rows].join('\n');
}

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatHkTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat('zh-HK', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch (e) {
    return String(iso);
  }
}

const api = {
  sanitizeTeacherCode,
  getTeacherCode,
  setTeacherCode,
  getFirebaseConfig,
  saveFirebaseConfigToLocal,
  clearFirebaseConfigLocal,
  isConfigured,
  ensureInit,
  saveRecord,
  flushPending,
  loadRecords,
  subscribeRecords,
  recordsToCsv,
  formatHkTime,
  DEFAULT_TEACHER,
  LS_CONFIG,
  LS_TEACHER,
};

window.FracCloud = api;
window.dispatchEvent(new Event('fraccloud-ready'));

// Warm init + flush pending when config exists
ensureInit().then((ok) => {
  if (ok) flushPending();
});
