/**
 * Persistence layer that works in two modes:
 * 1. Dev mode (no Supabase): localStorage with a stable anonymous ID
 * 2. Production mode: Supabase tables (user_code, problem_status, ui_state)
 *
 * Both modes expose the same interface. Components never know which is active.
 */

import { getClient, supabaseEnabled } from './supabase-browser';
import type { Status } from './types';

function getAnonId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = localStorage.getItem('potd:anonymous-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('potd:anonymous-id', id);
  }
  return id;
}

export function getUserId(): string {
  // In Supabase mode, the actual user ID comes from auth.
  // For now this returns the anon ID; the auth hook overrides it.
  return getAnonId();
}

/* ── Code persistence ── */

const codeKey = (problemId: string, filename: string) =>
  `potd:code:${problemId}:${filename}`;

export function loadCode(problemId: string, filename: string): string | null {
  if (typeof window === 'undefined') return null;

  if (supabaseEnabled) {
    // Supabase read is async — for initial load we still seed from localStorage
    // as a cache. The hook will reconcile with Supabase on mount.
    return localStorage.getItem(codeKey(problemId, filename));
  }
  return localStorage.getItem(codeKey(problemId, filename));
}

export function saveCode(
  problemId: string,
  filename: string,
  content: string,
  starterContent: string,
): void {
  if (typeof window === 'undefined') return;
  const key = codeKey(problemId, filename);

  if (content === starterContent) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, content);
  }

  if (supabaseEnabled) {
    // Fire-and-forget — Supabase SDK is dynamically imported on first use.
    void getClient().then(sb => {
      if (!sb) return;
      sb.from('user_code')
        .upsert(
          {
            user_id: getUserId(),
            problem_id: problemId,
            filename,
            content,
          },
          { onConflict: 'user_id,problem_id,filename' },
        )
        .then(() => {});
    });
  }
}

export function clearCode(problemId: string, filenames: string[]): void {
  if (typeof window === 'undefined') return;
  for (const f of filenames) {
    localStorage.removeItem(codeKey(problemId, f));
  }
  if (supabaseEnabled) {
    void getClient().then(sb => {
      if (!sb) return;
      sb.from('user_code')
        .delete()
        .eq('user_id', getUserId())
        .eq('problem_id', problemId)
        .then(() => {});
    });
  }
}

/* ── Status persistence ── */

const statusKey = (problemId: string) => `potd:status:${problemId}`;

export function loadStatus(problemId: string): Status {
  if (typeof window === 'undefined') return 'unsolved';
  return (localStorage.getItem(statusKey(problemId)) as Status) || 'unsolved';
}

/**
 * Count how many of the given problem IDs are currently in the 'solved'
 * state. SSR-safe (returns 0 when window is undefined). Linear scan over
 * problemIds; for the expected dataset size (a few dozen problems) this
 * runs in well under a millisecond.
 */
export function getSolvedCount(problemIds: string[]): number {
  if (typeof window === 'undefined') return 0;
  let count = 0;
  for (const id of problemIds) {
    if (loadStatus(id) === 'solved') count++;
  }
  return count;
}

export function saveStatus(
  problemId: string,
  status: Status,
  passed: number,
  total: number,
): void {
  if (typeof window === 'undefined') return;
  if (status === 'unsolved') {
    localStorage.removeItem(statusKey(problemId));
  } else {
    localStorage.setItem(statusKey(problemId), status);
  }

  if (supabaseEnabled) {
    void getClient().then(sb => {
      if (!sb) return;
      sb.from('problem_status')
        .upsert(
          {
            user_id: getUserId(),
            problem_id: problemId,
            status,
            passed,
            total,
          },
          { onConflict: 'user_id,problem_id' },
        )
        .then(() => {});
    });
  }
}

/* ── Streak tracking ── */

// Parse a localStorage value that we expect to be JSON of `string[]`.
// Returns [] if the key is missing, the JSON is malformed, or the parsed
// value isn't a homogeneous array of strings. Without this guard, any
// corruption to potd:solve-dates or potd:bookmarks (manual devtools
// edit, a half-written value, an extension stomping on storage) would
// throw synchronously and brick the page that reads it — the streak
// display, the bookmarks list, the sidebar — until the user manually
// clears their localStorage. The defensive path is invisible on the
// happy path; it only kicks in when storage is already broken.
function readStringArray(key: string): string[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

export function recordSolveDate(): void {
  if (typeof window === 'undefined') return;
  const today = new Date().toISOString().slice(0, 10);
  const dates = readStringArray('potd:solve-dates');
  if (!dates.includes(today)) {
    dates.push(today);
    localStorage.setItem('potd:solve-dates', JSON.stringify(dates));
  }
}

// Calendar-day diff between two YYYY-MM-DD strings, stable across DST.
// Parsing with `new Date(str + 'T00:00:00')` gives a local-time Date, so
// crossing a DST transition produces a 23h or 25h "day" and a diff that
// isn't a whole 1 — silently snapping the streak loop. Date.UTC has no
// DST, so this is always an integer number of calendar days.
function calendarDaysApart(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

export function getStreak(): number {
  if (typeof window === 'undefined') return 0;
  const dates = readStringArray('potd:solve-dates');
  if (dates.length === 0) return 0;

  const sorted = [...dates].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (calendarDaysApart(sorted[i - 1], sorted[i]) === 1) streak++;
    else break;
  }
  return streak;
}

/* ── Best result tracking ── */

export interface BestResult {
  passed: number;
  total: number;
}

export function loadBestResult(problemId: string): BestResult | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(`potd:best:${problemId}`);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as BestResult).passed === 'number' &&
      typeof (parsed as BestResult).total === 'number'
    ) {
      return parsed as BestResult;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save best result only if it improves on the existing one.
 * Returns true if the result was saved (new best).
 */
export function saveBestResult(problemId: string, passed: number, total: number): boolean {
  if (typeof window === 'undefined') return false;
  const existing = loadBestResult(problemId);
  if (existing && existing.passed >= passed && existing.total === total) return false;
  localStorage.setItem(`potd:best:${problemId}`, JSON.stringify({ passed, total }));
  return true;
}

/* ── Bookmarks ── */

const BOOKMARKS_KEY = 'potd:bookmarks';

export function getBookmarkedIds(): string[] {
  if (typeof window === 'undefined') return [];
  return readStringArray(BOOKMARKS_KEY);
}

export function isBookmarked(problemId: string): boolean {
  return getBookmarkedIds().includes(problemId);
}

/** Toggle bookmark for a problem. Returns the new bookmarked state. */
export function toggleBookmark(problemId: string): boolean {
  if (typeof window === 'undefined') return false;
  const ids = getBookmarkedIds();
  const idx = ids.indexOf(problemId);
  if (idx >= 0) {
    ids.splice(idx, 1);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids));
    return false;
  }
  ids.push(problemId);
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids));
  return true;
}

/* ── UI state persistence ── */

export function loadUiState<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(`potd:ui:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveUiState<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`potd:ui:${key}`, JSON.stringify(value));
}
