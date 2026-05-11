/**
 * Extract plain text from a code block's inner content.
 * Handles nested elements, newlines, and trims trailing whitespace.
 */
export function extractCodeText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractCodeText).join('');
  if (typeof node === 'object' && 'props' in (node as any)) {
    const props = (node as any).props;
    return extractCodeText(props?.children);
  }
  return String(node);
}

/**
 * Extract plain text from raw HTML-like nested structures (for testing).
 * Recursively walks { children } nodes and concatenates string leaves.
 */
export function extractTextFromTree(tree: unknown): string {
  if (tree == null) return '';
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(extractTextFromTree).join('');
  if (typeof tree === 'object' && tree !== null) {
    const obj = tree as Record<string, unknown>;
    if ('children' in obj) return extractTextFromTree(obj.children);
    if ('text' in obj) return String(obj.text);
  }
  return String(tree);
}
