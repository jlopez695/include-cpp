/**
 * Regression test for "saveStatus upserts an unsolved row to Supabase
 * instead of deleting it, drifting from localStorage".
 *
 * saveStatus mirrors saveCode's saved-vs-removed pattern: localStorage
 * stores ONLY the explicit non-default status, and a `status === 'unsolved'`
 * call does removeItem(). Before this commit the Supabase side ignored
 * that semantic split and unconditionally called .upsert(...) with the
 * passed status, including 'unsolved' — so localStorage said "no row"
 * while the remote table held an explicit unsolved row.
 *
 * Functionally identical today: loadStatus returns 'unsolved' for both
 * an explicit 'unsolved' string AND for a missing key, so users with
 * Supabase enabled couldn't tell the local truth diverged from the
 * remote one. But:
 *
 *   - Any future read-from-Supabase reconciliation gets a different
 *     answer than today's local-only read, surfacing the drift.
 *   - The most common transition for a never-solved-yet problem
 *     (open → fail tests once → never come back) wrote a Supabase
 *     row that should never have existed. With dozens of problems
 *     and many users, that's noticeable accumulated cruft.
 *   - Same shape as the saveCode bug fixed in 339938b: writes that
 *     localStorage-side were intended to delete should remote-side
 *     also delete.
 *
 * The fix branches saveStatus on `status === 'unsolved'`. When it
 * matches, route to .delete() filtered by (user_id, problem_id);
 * otherwise keep the existing upsert path. saveStatus is not
 * debounced (it fires once per test run, not per keystroke), so the
 * delete fires immediately rather than going through a shared timer
 * slot.
 *
 * supabaseEnabled is compiled false in CI, so this is structural
 * rather than a runtime exercise — same constraint that
 * save-code-starter-revert.spec.ts and save-code-debounce.spec.ts
 * already operate under.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('storage.saveStatus mirrors localStorage removal for unsolved status', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'lib', 'storage.ts'),
      'utf8',
    );
  });

  it('saveStatus branches on status === unsolved before issuing the Supabase write', () => {
    const body = src.match(/export function saveStatus[\s\S]+?\n\}/);
    assert.ok(body, 'could not locate saveStatus body');
    // Inside the supabaseEnabled block we must distinguish the unsolved
    // path from the explicit-status path. A bare flag check + ternary
    // is fine, but there must be a branch — not an unconditional upsert.
    const supabaseBlock = body![0].match(/if\s*\(supabaseEnabled\)\s*\{[\s\S]+?\}\s*\n\s*\/\//);
    assert.ok(supabaseBlock, 'could not locate the supabaseEnabled block inside saveStatus');
    assert.match(supabaseBlock![0], /isUnsolved|status\s*===\s*['"]unsolved['"]/);
  });

  it('the unsolved branch calls .delete() filtered by user_id + problem_id', () => {
    // Locate the delete chain on problem_status. Pre-fix this didn't
    // exist at all — every saveStatus call landed on .upsert(), which
    // is the symptom we are guarding against.
    const block = src.match(
      /from\(\s*'problem_status'\s*\)[\s\S]+?\.delete\(\)[\s\S]+?\.then\([\s\S]+?\}\)\s*;/,
    );
    assert.ok(
      block,
      'expected a from("problem_status").delete().then(...) chain — saveStatus must DELETE the row when status is unsolved, not upsert it',
    );
    assert.match(block![0], /\.eq\(\s*['"]user_id['"]/);
    assert.match(block![0], /\.eq\(\s*['"]problem_id['"]/);
    // And it must consume { error } and log on failure, like every
    // other Supabase write in this file (pinned separately by
    // storage-supabase-warn.spec.ts, restated here so a delete-path
    // regression that drops the breadcrumb is caught locally).
    assert.match(block![0], /\.then\(\(\s*\{\s*error[^}]*\}\s*\)\s*=>/);
    assert.match(block![0], /console\.warn\(/);
  });

  it('the non-unsolved branch still upserts (no regression of the happy path)', () => {
    // Make sure I didn't accidentally route 'solved' / 'attempted' to
    // delete. The upsert chain on problem_status must still exist.
    const upsert = src.match(
      /from\(\s*'problem_status'\s*\)[\s\S]+?\.upsert\([\s\S]+?\.then\([\s\S]+?\}\)\s*;/,
    );
    assert.ok(upsert, 'problem_status .upsert chain must remain for solved/attempted');
    assert.match(upsert![0], /onConflict:\s*['"]user_id,problem_id['"]/);
  });

  it('the unsolved branch appears BEFORE the upsert branch in source order', () => {
    // Cheap structural guard. If someone refactors and accidentally
    // makes the unsolved branch fall through into the upsert, we want
    // the test to flag it. The expected shape is:
    //   if (isUnsolved) { delete(); } else { upsert(); }
    const deleteIdx = src.indexOf("from('problem_status')\n          .delete()");
    const upsertIdx = src.indexOf("from('problem_status')\n          .upsert(");
    // Either both line breaks match or neither — fall back to a looser
    // index check that just looks for the operation names.
    const dIdx = deleteIdx >= 0 ? deleteIdx : src.search(/from\(\s*'problem_status'\s*\)\s*\.delete\(\)/);
    const uIdx = upsertIdx >= 0 ? upsertIdx : src.search(/from\(\s*'problem_status'\s*\)\s*\.upsert\(/);
    assert.ok(dIdx >= 0, 'must have a problem_status delete chain');
    assert.ok(uIdx >= 0, 'must have a problem_status upsert chain');
    assert.ok(
      dIdx < uIdx,
      'the delete (unsolved) chain must appear before the upsert (solved/attempted) chain so the if/else branches the right way',
    );
  });
});
