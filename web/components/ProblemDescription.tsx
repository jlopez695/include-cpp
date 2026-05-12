'use client';

import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { extractCodeText } from '@/lib/clipboard';

interface ProblemDescriptionProps {
  markdown: string;
}

function CopyButton({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = extractCodeText(children);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      className="copy-btn"
      onClick={handleCopy}
      aria-label="Copy code"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function Pre({ children, ...props }: React.HTMLAttributes<HTMLPreElement> & { children?: ReactNode }) {
  return (
    <pre {...props} style={{ position: 'relative' }}>
      {children}
      <CopyButton>{children}</CopyButton>
    </pre>
  );
}

export function ProblemDescription({ markdown }: ProblemDescriptionProps) {
  return (
    <div
      key={markdown.slice(0, 50)}
      className="flex-1 overflow-y-auto px-6 pt-[22px] pb-8 prose-potd animate-fade-in"
      role="article"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{ pre: Pre }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
