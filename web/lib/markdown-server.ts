import 'server-only';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import cpp from 'highlight.js/lib/languages/cpp';
import makefile from 'highlight.js/lib/languages/makefile';

/**
 * Server-side markdown → HTML renderer. Runs at static-generation time
 * (or on the cached server render), so the client never pays for parsing
 * the same static content on every visit. We highlight cpp + makefile
 * only; everything else falls back to plain <code>.
 *
 * The resulting HTML is rendered with dangerouslySetInnerHTML on the
 * client. That is safe here because problem.md content originates from
 * files in the repo (controlled, not user-submitted), and rehype-stringify
 * already escapes embedded HTML by default.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeHighlight, { languages: { cpp, makefile } })
  .use(rehypeStringify);

export async function renderMarkdown(md: string): Promise<string> {
  const file = await processor.process(md);
  return String(file);
}
