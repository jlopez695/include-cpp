import 'server-only';

/**
 * Server-side markdown → HTML renderer. Runs at static-generation time
 * (or on the cached server render), so the client never pays for parsing
 * the same static content on every visit. We highlight cpp + makefile
 * only; everything else falls back to plain <code>.
 *
 * The resulting HTML is rendered with dangerouslySetInnerHTML on the
 * client. Defense-in-depth (sanitize javascript: URLs, force
 * rel="noopener noreferrer" on external links, etc.) lives in
 * `markdown-pipeline.ts`; this file is the production entrypoint and
 * carries the `import 'server-only'` marker that trips the build if a
 * client component ever imports it. The pipeline itself is split out
 * so it can be unit-tested without paying for Next.js's server-only
 * runtime guard.
 */
export { renderMarkdown } from './markdown-pipeline.js';
