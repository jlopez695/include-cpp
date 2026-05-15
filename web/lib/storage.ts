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

export function recordSolveDate(): void {
  if (typeof window === 'undefined') return;
  const today = new Date().toISOString().slice(0, 10);
  const raw = localStorage.getItem('potd:solve-dates');
  const dates: string[] = raw ? JSON.parse(raw) : [];
  if (!dates.includes(today)) {
    dates.push(today);
    localStorage.setItem('potd:solve-dates', JSON.stringify(dates));
  }
}

export function getStreak(): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem('potd:solve-dates');
  if (!raw) return 0;
  const dates: string[] = JSON.parse(raw);
  if (dates.length === 0) return 0;

  const sorted = [...dates].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const curr = new Date(sorted[i - 1] + 'T00:00:00');
    const prev = new Date(sorted[i] + 'T00:00:00');
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) streak++;
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
  return raw ? JSON.parse(raw) : null;
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
  const raw = localStorage.getItem(BOOKMARKS_KEY);
  return raw ? JSON.parse(raw) : [];
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
