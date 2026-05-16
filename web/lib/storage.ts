/**
 * Persistence layer that works in two modes:
 * 1. Dev mode (no Supabase): localStorage with a stable anonymous ID
 * 2. Production mode: Supabase tables (user_code, problem_status).
 *    The ui_state table exists in the schema but is reserved for future
 *    cross-device sync — loadUiState / saveUiState below are
 *    localStorage-only today (source of truth for UI prefs).
 *
 * Both modes expose the same interface. Components never know which is active.
 */

import { getClient, supabaseEnabled } from './supabase-browser';
import type { Status } from './types';

// Session-fallback id used when localStorage and/or crypto.randomUUID are
// both unavailable. Stays the same for the lifetime of the JS module so
// every getAnonId() call inside one page session is internally consistent
// (the cmake-runner stages files at .builds/<userId>/...; flipping the id
// mid-session would orphan the previous staging tree and force a full
// rebuild on the next run).
let sessionFallbackId: string | null = null;

/**
 * Generate a v4-ish id that survives without crypto.randomUUID. Insecure
 * http origins (not localhost) and a handful of locked-down browser modes
 * don't expose randomUUID — without this fallback the throw escaped
 * getAnonId, broke saveCode/saveStatus/getUserId at the call site, and
 * any /run or /test (which sends userId in the body) would fail before
 * it reached the network. The fallback is good enough as an opaque
 * per-session identifier; we don't depend on its uniqueness across
 * users (it's namespaced per-browser regardless).
 */
function generateId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* randomUUID can throw SecurityError in some sandboxed iframes */
  }
  // Two Math.random() calls × base36 yield ~25 chars of entropy. Prefix
  // makes the source visible if it ever appears in a Supabase row or
  // a backend log so an operator can spot "this id wasn't from a
  // healthy browser".
  return `anon-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function getAnonId(): string {
  if (typeof window === 'undefined') return 'ssr';

  // localStorage.getItem can throw SecurityError under Safari Private
  // Mode and the iOS Lockdown Mode profile. Pre-fix, that throw escaped
  // and took down every saveCode / saveStatus / getUserId() caller on
  // those browsers — the whole app effectively broke. Catch it and fall
  // back to an in-memory id for this session.
  try {
    const existing = localStorage.getItem('potd:anonymous-id');
    if (existing) return existing;
  } catch {
    if (!sessionFallbackId) sessionFallbackId = generateId();
    return sessionFallbackId;
  }

  const fresh = generateId();
  try {
    localStorage.setItem('potd:anonymous-id', fresh);
  } catch {
    // localStorage exists for read but writes are blocked (quota
    // exhausted, private mode that allows reads only). Keep the id in
    // memory so subsequent calls in this session don't re-roll it.
    if (!sessionFallbackId) sessionFallbackId = fresh;
    return sessionFallbackId;
  }
  return fresh;
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

// Debounce the network round-trip part of saveCode. Monaco fires
// onDidChangeModelContent on every keystroke; at typing speed that's
// ~10 upserts/sec without coalescing. localStorage stays immediate
// (it's microseconds, and we want a page reload to keep the most
// recent character), but the Supabase upsert is deferred until the
// user pauses. The map is keyed per-(problemId, filename) so saves to
// different files don't cancel each other.
const SUPABASE_SAVE_DEBOUNCE_MS = 500;
const pendingSupabaseSaves = new Map<string, ReturnType<typeof setTimeout>>();

function cancelPendingSupabaseSave(problemId: string, filename: string): void {
  const key = `${problemId}:${filename}`;
  const pending = pendingSupabaseSaves.get(key);
  if (pending !== undefined) {
    clearTimeout(pending);
    pendingSupabaseSaves.delete(key);
  }
}

function scheduleSupabaseSave(problemId: string, filename: string, content: string): void {
  const key = `${problemId}:${filename}`;
  const existing = pendingSupabaseSaves.get(key);
  if (existing !== undefined) clearTimeout(existing);
  pendingSupabaseSaves.set(
    key,
    setTimeout(() => {
      pendingSupabaseSaves.delete(key);
      void getClient().then(sb => {
        if (!sb) return;
        // PostgrestBuilder is lazy: the HTTP request only fires when
        // .then() (or await) is invoked. A bare `void sb.from(...).upsert(...)`
        // constructs the builder and discards it without triggering the
        // fetch — so the upsert silently doesn't happen. Always terminate
        // the chain with .then so the request actually goes out, and
        // surface any { error } so a misconfigured RLS / expired session
        // leaves a console breadcrumb instead of looking like a successful
        // local save.
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
          .then(({ error }) => {
            if (error) console.warn('[supabase] user_code upsert failed:', error);
          });
      });
    }, SUPABASE_SAVE_DEBOUNCE_MS),
  );
}

// Mirror of scheduleSupabaseSave for the "content reverted to starter" case.
// localStorage gets removeItem() in that case, so the Supabase row should go
// away too — otherwise the per-file row keeps the last upserted body and
// drifts out of sync with the local truth. Reset triggers this path via
// Monaco's setValue → onDidChangeModelContent chain, which calls saveCode
// with content === starter for every editable file *right after* clearCode
// has already deleted the row; without this delete, a debounced upsert
// would fire ~500ms later and resurrect the row with starter content.
// Shares the same pendingSupabaseSaves map as the upsert path so a rapid
// type → revert → retype sequence collapses to a single fire of whichever
// operation matched the user's *final* state.
function scheduleSupabaseDelete(problemId: string, filename: string): void {
  const key = `${problemId}:${filename}`;
  const existing = pendingSupabaseSaves.get(key);
  if (existing !== undefined) clearTimeout(existing);
  pendingSupabaseSaves.set(
    key,
    setTimeout(() => {
      pendingSupabaseSaves.delete(key);
      void getClient().then(sb => {
        if (!sb) return;
        sb.from('user_code')
          .delete()
          .eq('user_id', getUserId())
          .eq('problem_id', problemId)
          .eq('filename', filename)
          .then(({ error }) => {
            if (error) console.warn('[supabase] user_code delete failed:', error);
          });
      });
    }, SUPABASE_SAVE_DEBOUNCE_MS),
  );
}

export function saveCode(
  problemId: string,
  filename: string,
  content: string,
  starterContent: string,
): void {
  if (typeof window === 'undefined') return;
  const key = codeKey(problemId, filename);
  const matchesStarter = content === starterContent;

  if (matchesStarter) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, content);
  }

  if (supabaseEnabled) {
    // Keep the Supabase row in sync with the localStorage truth:
    //   - non-starter content  → upsert the row with the new content
    //   - content === starter  → delete the row (matches removeItem above)
    // The unconditional upsert this used to do was actively wrong on the
    // Reset path: clearCode() deletes the row, then Monaco's setValue
    // fires onDidChangeModelContent for each file with content === starter,
    // and a debounced upsert ~500ms later resurrected the row with the
    // starter body — undoing the reset for any future read-from-Supabase.
    if (matchesStarter) {
      scheduleSupabaseDelete(problemId, filename);
    } else {
      scheduleSupabaseSave(problemId, filename, content);
    }
  }
}

export function clearCode(problemId: string, filenames: string[]): void {
  if (typeof window === 'undefined') return;
  for (const f of filenames) {
    localStorage.removeItem(codeKey(problemId, f));
    // Drop any pending debounced upsert for this file — without this,
    // the timer would fire AFTER the .delete() below and recreate the
    // row from the last typed content, undoing the reset.
    cancelPendingSupabaseSave(problemId, f);
  }
  if (supabaseEnabled) {
    void getClient().then(sb => {
      if (!sb) return;
      sb.from('user_code')
        .delete()
        .eq('user_id', getUserId())
        .eq('problem_id', problemId)
        .then(({ error }) => {
          if (error) console.warn('[supabase] user_code delete failed:', error);
        });
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

// Custom event names other components subscribe to so they can refresh
// derived UI state (Sidebar status dots, footer solved-count, streak
// badge) without polling localStorage on a timer. The browser's native
// `storage` event only fires for cross-tab writes, not same-tab — these
// custom events fill that gap for the same-tab "solve current problem →
// see sidebar update without reloading" flow.
export const STATUS_CHANGE_EVENT = 'potd:status-change';
export const STREAK_CHANGE_EVENT = 'potd:streak-change';

export interface StatusChangeDetail {
  problemId: string;
  status: Status;
}

// Dispatch a CustomEvent on window if the runtime supports it. SSR
// (typeof window === 'undefined') and minimal node:test shims that mock
// `window = globalThis` without an EventTarget should both no-op rather
// than throw — the localStorage write is the source of truth either way.
function dispatchOnWindow(type: string, detail?: unknown): void {
  if (typeof window === 'undefined') return;
  if (typeof window.dispatchEvent !== 'function') return;
  if (typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(type, detail !== undefined ? { detail } : undefined));
}

export function saveStatus(
  problemId: string,
  status: Status,
  passed: number,
  total: number,
): void {
  if (typeof window === 'undefined') return;
  const isUnsolved = status === 'unsolved';
  if (isUnsolved) {
    localStorage.removeItem(statusKey(problemId));
  } else {
    localStorage.setItem(statusKey(problemId), status);
  }

  if (supabaseEnabled) {
    // Match the localStorage shape on the remote: a removed key locally
    // should be a deleted row remotely, not an upserted row with
    // status='unsolved'. Same logic as scheduleSupabaseDelete in saveCode:
    // an explicit unsolved row reads back the same as no row today
    // (loadStatus returns 'unsolved' for missing entries), but the two
    // states diverge the moment any read-from-Supabase reconciliation
    // is added, and an explicit row also wastes a write for the most
    // common transition (no row → no row → no row when the user opens
    // a fresh problem, fails its tests once, then never solves it).
    void getClient().then(sb => {
      if (!sb) return;
      if (isUnsolved) {
        sb.from('problem_status')
          .delete()
          .eq('user_id', getUserId())
          .eq('problem_id', problemId)
          .then(({ error }) => {
            if (error) console.warn('[supabase] problem_status delete failed:', error);
          });
      } else {
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
          .then(({ error }) => {
            if (error) console.warn('[supabase] problem_status upsert failed:', error);
          });
      }
    });
  }

  // Notify in-tab listeners (Sidebar, TopBar) so the visible status dot
  // and the footer's "N / total solved" count update on this solve
  // instead of waiting for a navigation or full page reload.
  dispatchOnWindow(STATUS_CHANGE_EVENT, { problemId, status } satisfies StatusChangeDetail);
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
  let mutated = false;
  if (!dates.includes(today)) {
    dates.push(today);
    localStorage.setItem('potd:solve-dates', JSON.stringify(dates));
    mutated = true;
  }
  // Only notify when the underlying solve-dates set actually changed —
  // recordSolveDate is idempotent on same-day re-solves and we don't
  // want StreakBadge re-rendering on every test re-run today. (If the
  // set didn't change, getStreak() will return the same value too.)
  if (mutated) {
    dispatchOnWindow(STREAK_CHANGE_EVENT);
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
