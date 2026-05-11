'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface ProblemDescriptionProps {
  markdown: string;
}

export function ProblemDescription({ markdown }: ProblemDescriptionProps) {
  return (
    <div className="flex-1 overflow-y-auto px-6 pt-[22px] pb-8 prose-potd" role="article">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
