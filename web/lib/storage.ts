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

// Safe localStorage wrappers. Every call site in this file used to hit
// `localStorage.*` directly. Three things in the wild can break that:
//
//   - Safari Private Mode and iOS Lockdown Mode raise SecurityError on
//     EVERY access (read, write, remove) for many content settings.
//   - QuotaExceededError on full storage (mostly setItem).
//   - The page running inside a sandboxed iframe with `allow-same-origin`
//     stripped — `localStorage` access throws regardless of mode.
//
// Without these wrappers a single unguarded call escapes its caller and
// in the worst spots (useResizable's mouseup handler — a global window
// listener) lands as an uncaughtException. Routing every call through
// these helpers makes "the user's storage is broken" degrade to "the
// app forgets the user's preferences for this session" instead of
// "the app stops working." Reads return null on failure; writes and
// removes silently drop. There's no UI for surfacing the failure today —
// the cost of a quiet drop is much smaller than the cost of a hard crash.
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    /* SecurityError / QuotaExceededError — drop the write */
    return false;
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* SecurityError — drop the removal */
  }
}

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
  const existing = safeGetItem('cpp:anonymous-id');
  if (existing) return existing;

  const fresh = generateId();
  if (safeSetItem('cpp:anonymous-id', fresh)) return fresh;

  // localStorage couldn't persist (Safari Private Mode, quota exceeded,
  // sandboxed iframe). Keep the id in memory so subsequent calls within
  // this page session don't re-roll. The cmake-runner stages files at
  // .builds/<userId>/...; flipping the id mid-session would orphan the
  // staging tree and force a full rebuild on the next /run.
  if (!sessionFallbackId) sessionFallbackId = fresh;
  return sessionFallbackId;
}

export function getUserId(): string {
  // In Supabase mode, the actual user ID comes from auth.
  // For now this returns the anon ID; the auth hook overrides it.
  return getAnonId();
}

/* ── Code persistence ── */

const codeKey = (problemId: string, filename: string) =>
  `cpp:code:${problemId}:${filename}`;

export function loadCode(problemId: string, filename: string): string | null {
  if (typeof window === 'undefined') return null;
  // Both branches do the same thing today — Supabase reads happen later,
  // not on initial load. Routing through safeGetItem keeps a private-mode
  // SecurityError from bricking the editor at problem-load time.
  return safeGetItem(codeKey(problemId, filename));
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

// Shared rejection handler for the outer `getClient()` promise in each
// of the four background-sync sites below. getClient() itself can reject
// in two distinct ways the inner .then(({ error }) => …) handler does NOT
// catch:
//   - the dynamic `import('@supabase/ssr')` chunk fails to load (network
//     blip mid-session, a CSP that blocks the chunk URL, sandboxed iframe
//     with `allow-scripts` stripped from the parent),
//   - createBrowserClient(url, key) throws synchronously inside that
//     dynamic import callback (malformed env vars rolled out together,
//     for example).
// Without a `.catch` on the outer chain, those rejections escape `void`
// and surface as `unhandledrejection` on window — visible to anyone
// listening for them (Sentry, the dev console, error overlays in
// development). The Supabase sync is fire-and-forget and localStorage
// is the source of truth, so the right contract here matches the inner
// handler's: drop a console.warn breadcrumb and otherwise carry on.
// Pulled into a named helper rather than four inline arrow fns so the
// reason for the catch is documented exactly once.
function warnClientUnavailable(err: unknown): void {
  console.warn('[supabase] client unavailable, background sync skipped:', err);
}

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
      void getClient()
        .then(sb => {
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
        })
        .catch(warnClientUnavailable);
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
      void getClient()
        .then(sb => {
          if (!sb) return;
          sb.from('user_code')
            .delete()
            .eq('user_id', getUserId())
            .eq('problem_id', problemId)
            .eq('filename', filename)
            .then(({ error }) => {
              if (error) console.warn('[supabase] user_code delete failed:', error);
            });
        })
        .catch(warnClientUnavailable);
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
    safeRemoveItem(key);
  } else {
    safeSetItem(key, content);
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
    safeRemoveItem(codeKey(problemId, f));
    // Drop any pending debounced upsert for this file — without this,
    // the timer would fire AFTER the .delete() below and recreate the
    // row from the last typed content, undoing the reset.
    cancelPendingSupabaseSave(problemId, f);
  }
  if (supabaseEnabled) {
    void getClient()
      .then(sb => {
        if (!sb) return;
        sb.from('user_code')
          .delete()
          .eq('user_id', getUserId())
          .eq('problem_id', problemId)
          .then(({ error }) => {
            if (error) console.warn('[supabase] user_code delete failed:', error);
          });
      })
      .catch(warnClientUnavailable);
  }
}

/* ── Status persistence ── */

const statusKey = (problemId: string) => `cpp:status:${problemId}`;

// Valid Status values, parallel to the `Status` union in lib/types. Inlined
// (not exported from types) because runtime validation needs the actual set
// of strings, not just the compile-time type.
const VALID_STATUSES = new Set<Status>(['solved', 'attempted']);

export function loadStatus(problemId: string): Status {
  if (typeof window === 'undefined') return 'unsolved';
  // The old `(safeGetItem(...) as Status) || 'unsolved'` cast was a lie:
  // it accepted ANY non-empty string at runtime and labeled it Status,
  // even though the only writer (saveStatus) only ever persists 'solved'
  // or 'attempted' (and removes the key for 'unsolved'). Realistic
  // corruption sources are the same set as the other storage entries —
  // a devtools edit, a clobbering browser extension, a half-written
  // value from a tab killed mid-setItem, an old build's value that
  // doesn't match the current Status union after a rename. Without
  // validation, the bogus value flows out:
  //   - TopBar / StatusDot do `aria-label={status}`, so a screen reader
  //     announces "weird-value" verbatim;
  //   - pickRandom's `=== 'unsolved'` and `=== 'attempted'` filters
  //     both miss, falling through to the "all others" branch and
  //     subtly skewing the random pick;
  //   - the Sidebar's solvedCount filter `=== 'solved'` is correct on
  //     the count side, but any future code that exhaustively switches
  //     on Status (TypeScript would think it's exhaustive) hits a
  //     silent runtime default for the unknown value.
  // Validate against the union explicitly: anything that isn't one of
  // the two persisted states becomes 'unsolved' (the same shape the
  // user gets when the key is missing entirely).
  const raw = safeGetItem(statusKey(problemId));
  return raw && VALID_STATUSES.has(raw as Status) ? (raw as Status) : 'unsolved';
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
export const STATUS_CHANGE_EVENT = 'cpp:status-change';
export const STREAK_CHANGE_EVENT = 'cpp:streak-change';

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
    safeRemoveItem(statusKey(problemId));
  } else {
    safeSetItem(statusKey(problemId), status);
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
    void getClient()
      .then(sb => {
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
      })
      .catch(warnClientUnavailable);
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
// corruption to cpp:solve-dates or cpp:bookmarks (manual devtools
// edit, a half-written value, an extension stomping on storage) would
// throw synchronously and brick the page that reads it — the streak
// display, the bookmarks list, the sidebar — until the user manually
// clears their localStorage. The defensive path is invisible on the
// happy path; it only kicks in when storage is already broken.
function readStringArray(key: string): string[] {
  const raw = safeGetItem(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

// Strict YYYY-MM-DD shape — applied to every entry surfaced from
// cpp:solve-dates before it can reach calendarDaysApart below.
// readStringArray already filtered non-strings, but accepted any string
// that JSON.parse produced — including a half-written value, a clobbering
// extension's payload, a 'YYYY-MM' truncation, or a leftover from a build
// that stored dates in a different shape. Any of those reaching
// calendarDaysApart returned NaN; NaN flowed through subtraction and
// Math.round, then the `=== 1` check in getStreak's loop failed and the
// streak silently truncated. Match the exact shape recordSolveDate writes
// (`toISOString().slice(0, 10)`) so the heal is symmetric — a date that
// the writer would emit must be the only kind of date the reader trusts.
const VALID_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readSolveDates(): string[] {
  return readStringArray('cpp:solve-dates').filter(d => VALID_DATE_RE.test(d));
}

export function recordSolveDate(): void {
  if (typeof window === 'undefined') return;
  const today = new Date().toISOString().slice(0, 10);
  // Read through the validating filter so any accumulated garbage gets
  // *healed* on the next solve instead of persisting indefinitely. Without
  // the heal, the visible streak would be correct (the read-side filter
  // in getStreak handles that) but every subsequent recordSolveDate would
  // write the garbage right back into the array — paying the filter cost
  // forever and leaving the bad data one regex bug away from resurfacing.
  // Same pattern as recordSolveDate's existing parse-error recovery
  // (storage-corruption.spec.ts pins it for the JSON-parse case).
  const dates = readSolveDates();
  let mutated = false;
  if (!dates.includes(today)) {
    // Immutable append — same reasoning as toggleBookmark above:
    // build the next array, then write. Pre-fix the .push() mutated
    // the local `dates` reference before the safeSetItem call, so
    // a write failure (Safari Private Mode, quota exceeded) left
    // the in-memory value optimistically toggled while localStorage
    // still held the old value. Building a fresh array via spread
    // keeps the read-side state untouched on write failure.
    const next = [...dates, today];
    safeSetItem('cpp:solve-dates', JSON.stringify(next));
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
  // Read through the validating filter so a single corrupt entry doesn't
  // truncate the streak. A garbage entry like "garbage" or "2026-13-45"
  // produced NaN from calendarDaysApart's split('-').map(Number), and
  // `NaN === 1` is false, so the loop broke at the first malformed
  // neighbor — a user with one bad write between two good ones saw their
  // 30-day streak collapse to whatever ran from `today` to the bad row.
  // No error surfaced; the count just silently lied.
  const dates = readSolveDates();
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
  const raw = safeGetItem(`cpp:best:${problemId}`);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      // Number.isFinite, not typeof === 'number'. The previous guard let
      // Infinity through (typeof Infinity === 'number' is true), and would
      // have let NaN through too if it ever arrived in-memory — typeof NaN
      // is also 'number'. JSON.parse can produce Infinity from a literal
      // like 1e9999 (manual devtools edit, an extension's bad write); the
      // old code returned `{passed: Infinity, total: 5}` to the caller and
      // every subsequent comparison (existing.passed >= passed) became
      // unbeatable, so the user's best-result number froze at infinity
      // and could not be re-overwritten by any real solve.
      Number.isFinite((parsed as BestResult).passed) &&
      Number.isFinite((parsed as BestResult).total)
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
  // Reject non-finite inputs *before* the comparison or the write. The
  // destructive case the test suite pins: an upstream NaN arrives, the
  // existing valid entry passes the `existing.passed >= NaN` check as
  // false (NaN compares unequal to everything), and the writer happily
  // emits JSON.stringify({passed: NaN, total: 5}) → '{"passed":null,...}'.
  // That null-payload write *clobbers* the previously-correct entry with
  // an unrecoverable shape, and loadBestResult then returns null forever
  // — the user's actual best result is gone with no error surfaced.
  // Refusing the write here is strictly safer than the old behavior:
  // a non-finite input was never a legitimate "best result" anyway, so
  // dropping it on the floor preserves whatever good data already exists.
  if (!Number.isFinite(passed) || !Number.isFinite(total)) return false;
  const existing = loadBestResult(problemId);
  if (existing && existing.passed >= passed && existing.total === total) return false;
  return safeSetItem(`cpp:best:${problemId}`, JSON.stringify({ passed, total }));
}

/* ── Bookmarks ── */

const BOOKMARKS_KEY = 'cpp:bookmarks';

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
  // Build the next array immutably instead of splice/push-then-write.
  // The pre-fix shape mutated `ids` in place BEFORE the safeSetItem
  // — and getBookmarkedIds returns a fresh array each call, so the
  // mutation was technically local. But two failure modes follow
  // from the in-place style anyway:
  //   1. If safeSetItem returns false (Safari Private Mode, quota
  //      exceeded), the in-memory `ids` is already mutated; the
  //      caller's local reference would have a phantom toggle that
  //      doesn't match localStorage truth. Building the next array
  //      separately keeps the read-side state untouched on write
  //      failure.
  //   2. Mid-write the array shape was "almost the right state but
  //      not yet stringified," so any concurrent storage-event
  //      listener that observed the next read between mutate and
  //      write would see drift between the indexOf-based decision
  //      and the persisted value. Immutable build → write resolves
  //      that race window.
  const ids = getBookmarkedIds();
  const idx = ids.indexOf(problemId);
  const next = idx >= 0
    ? ids.filter((_, i) => i !== idx)
    : [...ids, problemId];
  safeSetItem(BOOKMARKS_KEY, JSON.stringify(next));
  return idx < 0;
}

/* ── UI state persistence ── */

export function loadUiState<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const raw = safeGetItem(`cpp:ui:${key}`);
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    // The old `JSON.parse(raw) as T` was a compile-time lie: at runtime
    // the parsed value was whatever was in localStorage, and the only
    // escape back to `fallback` was a JSON.parse exception. Anything that
    // parsed successfully — even with the wrong shape — flowed straight
    // through the cast.
    //
    // Realistic corruption sources are the same set as every other entry
    // in this file: a devtools edit, a clobbering extension, a half-
    // written value from a tab killed mid-setItem, a leftover from an
    // older build whose UI state shape has since changed. With the cast
    // unchecked, the wrong-type value reached the caller as the wrong
    // type — useResizable's `Math.max(min, Math.min(max, val))` coerced
    // a stored `"hello"` to NaN and the panel collapsed to a NaN-pixel
    // size, recoverable only by manually clearing localStorage because
    // every subsequent mouseup wrote the post-drag size back through
    // the same lying load.
    //
    // Validate the parsed value's *runtime shape* against the fallback
    // before returning it. The shape match is intentionally shallow:
    // typeof primitives, Array.isArray for arrays, object-ish for the
    // rest. Deep element validation belongs at the call site (the
    // bookmarks path uses readStringArray for exactly this reason).
    if (shapeMatches(parsed, fallback)) return parsed as T;
    return fallback;
  } catch {
    return fallback;
  }
}

function shapeMatches(parsed: unknown, fallback: unknown): boolean {
  // Either side being null is decided by strict equality — a stored JSON
  // `null` must not be accepted when the caller's fallback is an object
  // or any primitive (typeof null === 'object' would let it pass an
  // unguarded typeof check). Two nulls match, anything else with one
  // null side doesn't.
  if (parsed === null || fallback === null) return parsed === fallback;
  // Arrays vs plain objects must not be conflated. typeof [] === 'object',
  // so without the explicit Array.isArray pair, a stored array would
  // pass through when the caller wanted `{ ... }` and a stored object
  // would pass through when the caller wanted `[ ... ]`.
  if (Array.isArray(fallback)) return Array.isArray(parsed);
  if (Array.isArray(parsed)) return false;
  // Primitives and plain objects: typeof comparison is sufficient now
  // that null and arrays have been ruled out.
  return typeof parsed === typeof fallback;
}

export function saveUiState<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  // No-op on private-mode failure. The biggest hot path is useResizable's
  // mouseup handler (global window listener — a throw here would surface
  // as uncaughtException), so the silent-drop semantics matter.
  safeSetItem(`cpp:ui:${key}`, JSON.stringify(value));
}
