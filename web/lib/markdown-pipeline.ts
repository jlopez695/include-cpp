import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeStringify from 'rehype-stringify';
import cpp from 'highlight.js/lib/languages/cpp';
import makefile from 'highlight.js/lib/languages/makefile';

/**
 * Markdown → sanitized + highlighted HTML pipeline.
 *
 * Split out from `markdown-server.ts` so the pipeline can be unit-tested
 * directly. `markdown-server.ts` re-exports `renderMarkdown` from here
 * behind an `import 'server-only'` guard; production callers go through
 * that re-export, so the client bundle still trips on the server-only
 * marker if a client component ever imports it.
 *
 * Pipeline order matters and the contract is:
 *
 *   1. remarkParse → remarkGfm → remarkRehype: markdown → hast.
 *   2. rehypeSanitize BEFORE highlight + external-links. Two reasons:
 *      (a) any markdown-derived <a href="javascript:..."> gets its
 *          href stripped here — the GitHub-style defaultSchema's
 *          protocols.href is tightened to http/https/mailto.
 *      (b) rehype-highlight's hljs-* classNames (added in step 3) are
 *          NOT subjected to the schema, because the schema already ran.
 *          The schema only allows /^language-./ on <code> and nothing
 *          on <span>; running sanitize after highlight would strip
 *          every hljs-keyword/hljs-string/hljs-* className and kill
 *          syntax highlighting visually.
 *   3. rehypeHighlight (cpp + makefile only) adds hljs classNames.
 *   4. rehypeExternalLinks adds rel="noopener noreferrer" and
 *      target="_blank" to off-site <a> tags. Runs AFTER sanitize so
 *      the target/rel additions aren't stripped. Defends against
 *      window.opener tabnapping from a hostile-contributor PR landing
 *      [click me](https://attacker.example/...) in a problem.md.
 *   5. rehypeStringify serializes to HTML.
 *
 * Threat model is "hostile-contributor PR lands a poisoned problem.md"
 * in a classroom-contributed corpus that accepts student PRs — not
 * "hostile user submits markdown at request time". The render output
 * is rendered with dangerouslySetInnerHTML on the client, so the
 * sanitizer is the security boundary regardless of provenance.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, {
    ...defaultSchema,
    protocols: {
      ...defaultSchema.protocols,
      // Tighten the href protocol allowlist to http/https/mailto.
      // defaultSchema also permits irc/ircs/xmpp; we don't use those
      // and a poisoned problem.md doesn't get to either. javascript:,
      // data:, vbscript:, file: were never on the list and remain off.
      href: ['http', 'https', 'mailto'],
    },
  })
  .use(rehypeHighlight, { languages: { cpp, makefile } })
  .use(rehypeExternalLinks, {
    rel: ['noopener', 'noreferrer'],
    target: '_blank',
  })
  .use(rehypeStringify);

export async function renderMarkdown(md: string): Promise<string> {
  const file = await processor.process(md);
  return String(file);
}
