/**
 * Persistence layer that works in two modes:
 * 1. Dev mode (no Supabase): localStorage with a stable anonymous ID
 * 2. Production mode: Supabase tables (user_code, problem_status, ui_state)
 *
 * Both modes expose the same interface. Components never know which is active.
 */

import { createClient, supabaseEnabled } from './supabase-browser';
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
    const sb = createClient();
    if (!sb) return;
    // Fire-and-forget upsert
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
  }
}

export function clearCode(problemId: string, filenames: string[]): void {
  if (typeof window === 'undefined') return;
  for (const f of filenames) {
    localStorage.removeItem(codeKey(problemId, f));
  }
  if (supabaseEnabled) {
    const sb = createClient();
    if (!sb) return;
    sb.from('user_code')
      .delete()
      .eq('user_id', getUserId())
      .eq('problem_id', problemId)
      .then(() => {});
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
    const sb = createClient();
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
  }
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
