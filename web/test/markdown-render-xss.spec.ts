/**
 * Regression test for "markdown-server pipeline had no URL-scheme
 * sanitization, so a poisoned problem.md could land a javascript:
 * href that becomes a live XSS sink under dangerouslySetInnerHTML".
 *
 * Pre-fix pipeline (web/lib/markdown-server.ts):
 *
 *   unified()
 *     .use(remarkParse)
 *     .use(remarkGfm)
 *     .use(remarkRehype)
 *     .use(rehypeHighlight, { languages: { cpp, makefile } })
 *     .use(rehypeStringify);
 *
 * rehypeStringify escapes embedded HTML text content but does NOT
 * filter URL schemes in href/src attributes. The HTML it emits is
 * rendered by ProblemDescription via dangerouslySetInnerHTML, so a
 * markdown link [click](javascript:alert(1)) became:
 *
 *   <a href="javascript:alert(1)">click</a>
 *
 * — a live XSS sink the moment a user clicked it. Threat model is
 * "hostile contributor lands a poisoned problem.md" in a community-
 * contributed POTD corpus that accepts outside PRs, not "hostile user
 * submits markdown at request time". The defense-in-depth gap is
 * realistic; defense-in-depth fix is to make the markdown→HTML
 * pipeline itself the security boundary.
 *
 * Fix: insert rehype-sanitize (with GitHub-style defaultSchema +
 * tightened protocols.href = ['http', 'https', 'mailto']) and
 * rehype-external-links (rel = noopener+noreferrer, target = _blank)
 * into the pipeline. Sanitize runs BEFORE rehype-highlight so the
 * highlight-js classNames added in step 3 aren't subjected to the
 * schema (which only allows /^language-./ on <code> — running
 * sanitize after highlight would strip every hljs-* className and
 * kill syntax highlighting visually).
 *
 * The pipeline was also split out from markdown-server.ts into a new
 * markdown-pipeline.ts so it can be unit-tested directly. The
 * `import 'server-only'` guard stays on markdown-server.ts (the
 * production entrypoint), but the pipeline file is plain TS that
 * imports cleanly under node --test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../lib/markdown-pipeline.js';

test('javascript: href is stripped (does not survive into the rendered HTML)', async () => {
  const html = await renderMarkdown('[click](javascript:alert(1))');
  // Two assertions because there are two acceptable "safe" shapes:
  //   - rehype-sanitize drops the href attribute entirely, leaving
  //     <a>click</a> (current behavior).
  //   - some sanitizer configs leave href="" or href="#".
  // Either way, the literal javascript:alert payload must NOT appear.
  assert.doesNotMatch(
    html,
    /javascript:/i,
    `Sanitizer must strip the javascript: scheme. Got: ${html}`,
  );
  // Belt-and-suspenders: also defend against the payload's body text
  // surviving as a raw href value.
  assert.doesNotMatch(
    html,
    /href="[^"]*alert\(1\)/i,
    `Sanitizer must not leave alert(1) inside any href. Got: ${html}`,
  );
});

test('data: URL href is stripped', async () => {
  // data: URLs aren't quite as immediately dangerous as javascript:
  // but data:text/html,<script>alert(1)</script> is a navigation XSS
  // sink in older browsers and a tabnap vector everywhere. Strip them.
  const html = await renderMarkdown(
    '[click](data:text/html,%3Cscript%3Ealert(1)%3C/script%3E)',
  );
  assert.doesNotMatch(html, /data:/i, `Got: ${html}`);
});

test('vbscript: href is stripped (legacy IE attack surface)', async () => {
  const html = await renderMarkdown('[click](vbscript:msgbox(1))');
  assert.doesNotMatch(html, /vbscript:/i, `Got: ${html}`);
});

test('http: link is preserved AND gains rel="noopener noreferrer" + target="_blank" (no tabnapping via window.opener)', async () => {
  const html = await renderMarkdown('[hi](https://example.com)');
  // The href itself survives — only the scheme allowlist filters URLs.
  assert.match(html, /href="https:\/\/example\.com"/, `Got: ${html}`);
  // rehype-external-links adds rel + target after sanitize. Both
  // attributes must be present so a poisoned external link can't read
  // window.opener (tabnapping) or leak the referrer (info disclosure).
  assert.match(html, /rel="noopener noreferrer"|rel="noreferrer noopener"/, `Got: ${html}`);
  assert.match(html, /target="_blank"/, `Got: ${html}`);
});

test('mailto: link is preserved (third allowed protocol)', async () => {
  // mailto: stays on the allowlist because real problem.md content can
  // legitimately link to an author's email. Pin it so a future
  // "tighten the allowlist further" change has to consciously decide
  // whether to drop mailto.
  const html = await renderMarkdown('[email](mailto:author@example.com)');
  assert.match(html, /href="mailto:author@example\.com"/, `Got: ${html}`);
});

test('cpp code block keeps highlight-js classNames (sanitize-before-highlight order)', async () => {
  // This is the pipeline-order invariant: sanitize runs BEFORE
  // highlight, so highlight's hljs-* classNames are added after the
  // schema check and survive. If a future refactor flips the order
  // (sanitize after highlight), the GitHub-style defaultSchema only
  // allows /^language-./ on <code> and nothing on <span>, so every
  // hljs-keyword/hljs-string/hljs-* className gets stripped and the
  // visual highlighting silently breaks.
  const html = await renderMarkdown('```cpp\nint x = 1;\n```');
  assert.match(
    html,
    /class="[^"]*hljs[^"]*"/,
    `cpp code block must keep at least one hljs-* class. Got: ${html}`,
  );
  // Pin that highlight emitted at least one <span> with an hljs-*
  // class inside the <code> block. Don't over-specify the exact class
  // name — highlight.js v11 classifies `int` as hljs-type, not
  // hljs-keyword, and an upgrade could shift it again. The
  // sanitize-before-highlight order invariant is "at least one
  // hljs-* span survives"; that's what we pin.
  assert.match(
    html,
    /<span\s+class="hljs-[a-z-]+">/,
    `Highlighted span with hljs-* class must survive sanitization. If this fails, sanitize-after-highlight order has regressed and the schema is stripping every hljs-* className from <span>. Got: ${html}`,
  );
});

test('makefile code block also keeps highlight classNames', async () => {
  const html = await renderMarkdown('```makefile\nall: main\n\\tgcc -o main main.c\n```');
  assert.match(
    html,
    /class="[^"]*hljs[^"]*"/,
    `makefile code block must keep at least one hljs-* class. Got: ${html}`,
  );
});

test('inline <script> in markdown HTML is stripped', async () => {
  // remark-gfm allows raw HTML to pass through. Without sanitize, an
  // embedded <script> tag in a problem.md would survive into the
  // rendered output. Pin that the sanitizer is wired up and stripping
  // scripts (defaultSchema's `strip: ['script']` rule).
  const html = await renderMarkdown('hello\n<script>alert(1)</script>\nworld');
  assert.doesNotMatch(html, /<script/i, `Got: ${html}`);
  assert.doesNotMatch(html, /alert\(1\)/, `Got: ${html}`);
});

test('img with javascript: src is stripped', async () => {
  // <img src="javascript:..."> doesn't fire onClick the way <a> does
  // in modern browsers, but historically some browsers evaluated it.
  // defaultSchema's protocols.src list doesn't include javascript:,
  // so the src attribute is dropped. Pin.
  const html = await renderMarkdown('![x](javascript:alert(1))');
  assert.doesNotMatch(html, /javascript:/i, `Got: ${html}`);
});

test('relative (in-page) anchor links keep their href and do NOT get external-link rel/target', async () => {
  // rehype-external-links should only annotate links that go OFF-site.
  // A markdown link like [section](#anchor) or [other](./other.md)
  // is intra-document; adding target="_blank" would be a UX regression
  // (opens a tab for an in-page anchor).
  const html = await renderMarkdown('[anchor](#section-2)');
  assert.match(html, /href="#section-2"/, `Got: ${html}`);
  assert.doesNotMatch(html, /target="_blank"/, `Relative link should not gain target="_blank". Got: ${html}`);
});

test('a code-block does not somehow leak its language class through sanitization', async () => {
  // remarkRehype turns ```cpp fences into <code class="language-cpp">.
  // defaultSchema allows that exact pattern (`/^language-./`) on
  // <code>. Pin it: the language class must still appear, otherwise
  // rehype-highlight has no marker to dispatch on.
  const html = await renderMarkdown('```cpp\nint y;\n```');
  assert.match(
    html,
    /<code[^>]*class="[^"]*language-cpp/,
    `Got: ${html}`,
  );
});
