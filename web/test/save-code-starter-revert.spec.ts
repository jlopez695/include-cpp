/**
 * Regression test for "Reset / revert-to-starter leaves the Supabase row
 * resurrected with starter content".
 *
 * Repro chain (before this fix):
 *   1. User has typed code; Supabase row exists with that content.
 *   2. User clicks Reset → clearCode() cancels pending saves and issues a
 *      .delete() against user_code for that problem.
 *   3. useProblemEditor.reset() then calls models.updateContent(starter)
 *      for each editable file, which fires Monaco's
 *      onDidChangeModelContent, which calls saveCode(content === starter).
 *   4. saveCode unconditionally called scheduleSupabaseSave(starter), so
 *      ~500ms later the row was UPSERTED back into existence with the
 *      starter content — silently undoing step 2 for any future
 *      read-from-Supabase path (and leaving Supabase out of sync with
 *      the localStorage truth, which was correctly removeItem'd).
 *
 * The fix: saveCode now branches on content === starterContent and
 * schedules a .delete() in that case instead of a .upsert(). Both
 * operations share the same pendingSupabaseSaves debounce slot so a
 * rapid "type → undo → retype" sequence collapses to a single fire of
 * whichever op matched the user's final state.
 *
 * supabaseEnabled is derived from NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
 * at module load and those env vars are unset in CI, so this test pins
 * the structural shape of the implementation rather than exercising
 * the network path end-to-end.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('storage.saveCode mirrors localStorage removal on revert-to-starter', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'lib', 'storage.ts'),
      'utf8',
    );
  });

  it('defines a scheduleSupabaseDelete helper alongside scheduleSupabaseSave', () => {
    assert.match(src, /function scheduleSupabaseDelete\(/);
  });

  it('scheduleSupabaseDelete issues a .delete() filtered by user_id, problem_id, and filename', () => {
    const fn = src.match(/function scheduleSupabaseDelete[\s\S]+?\n\}\s/);
    assert.ok(fn, 'could not locate scheduleSupabaseDelete');
    const body = fn![0];
    // .delete() — not .upsert() — is the whole point of this helper.
    assert.match(body, /\.delete\(\)/);
    assert.doesNotMatch(body, /\.upsert\(/);
    // Per-row filter: ALL three keys are required. Filtering by just
    // user_id+problem_id would over-delete (sibling editable files); a
    // missing user_id would be a cross-user data leak.
    assert.match(body, /\.eq\(\s*'user_id'/);
    assert.match(body, /\.eq\(\s*'problem_id'/);
    assert.match(body, /\.eq\(\s*'filename'/);
  });

  it('scheduleSupabaseDelete shares the pendingSupabaseSaves map (so a final type/upsert wins over an earlier revert/delete and vice versa)', () => {
    const fn = src.match(/function scheduleSupabaseDelete[\s\S]+?\n\}\s/);
    assert.ok(fn);
    const body = fn![0];
    // Without sharing the same map, a rapid type→revert→retype could
    // leave BOTH an upsert and a delete queued for the same key, and
    // their fire order would depend on whichever timer happened to win
    // the race. Same-map = clearTimeout collapses them to "last call wins".
    assert.match(body, /pendingSupabaseSaves\.set\(/);
    assert.match(body, /clearTimeout\(/);
    assert.match(body, /SUPABASE_SAVE_DEBOUNCE_MS/);
  });

  it('saveCode branches on content === starter and routes to the delete helper', () => {
    const saveCodeBody = src.match(/export function saveCode[\s\S]+?\n\}/);
    assert.ok(saveCodeBody, 'could not locate saveCode body');
    const body = saveCodeBody![0];
    // The branch we're guarding: when content matches starter we must
    // call scheduleSupabaseDelete, NOT scheduleSupabaseSave.
    assert.match(body, /scheduleSupabaseDelete\(/);
    // The non-starter branch still goes through the save scheduler.
    assert.match(body, /scheduleSupabaseSave\(/);
    // Sanity: a content === starter comparison exists.
    assert.match(body, /content\s*===\s*starterContent/);
  });

  it('saveCode no longer issues a starter-content upsert (the resurrection bug)', () => {
    // If you find yourself loosening this test, check the issue: any
    // path that lets the starter content flow into scheduleSupabaseSave
    // re-introduces the Reset race.
    const saveCodeBody = src.match(/export function saveCode[\s\S]+?\n\}/);
    assert.ok(saveCodeBody);
    const body = saveCodeBody![0];

    // Find the starter-matches branch of the supabaseEnabled block. The
    // expected shape: `if (matchesStarter) { scheduleSupabaseDelete(...) }
    // else { scheduleSupabaseSave(...) }`. The delete call must come
    // FIRST in source order, not after a fallthrough to the save.
    const deleteIdx = body.indexOf('scheduleSupabaseDelete(');
    const saveIdx = body.indexOf('scheduleSupabaseSave(');
    assert.ok(deleteIdx >= 0 && saveIdx >= 0);
    assert.ok(
      deleteIdx < saveIdx,
      'scheduleSupabaseDelete must appear before scheduleSupabaseSave so the matches-starter branch routes correctly',
    );
  });
});
