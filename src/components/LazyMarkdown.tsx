import React, { Suspense, lazy } from 'react';

const MarkdownRenderer = lazy(async () => ({
  default: (await import('react-markdown')).default,
}));

export function LazyMarkdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<div className="whitespace-pre-line text-sm leading-7 text-slate-600">{children}</div>}>
      <MarkdownRenderer>{children}</MarkdownRenderer>
    </Suspense>
  );
}
