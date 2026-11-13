import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  value: string;
}

function CodeBlock({ language, value }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/80 px-4 py-2 text-xs text-slate-400">
        <span className="font-mono lowercase">{language || 'text'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 whitespace-nowrap shrink-0"
          aria-label="Copy code block"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-teal-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed font-mono">
        <code>{value}</code>
      </pre>
    </div>
  );
}

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export function MarkdownRenderer({ content, isStreaming = false }: MarkdownRendererProps) {
  return (
    <div className="prose-cadence text-[15.5px] leading-[1.7] text-slate-800 dark:text-slate-100 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }: { children?: ReactNode }) => (
            <h1 className="mt-6 mb-3 text-xl font-semibold tracking-tight text-slate-900 dark:text-white first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }: { children?: ReactNode }) => (
            <h2 className="mt-5 mb-2.5 text-lg font-semibold tracking-tight text-slate-900 dark:text-white first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }: { children?: ReactNode }) => (
            <h3 className="mt-4 mb-2 text-base font-semibold text-slate-900 dark:text-white first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }: { children?: ReactNode }) => (
            <p className="mb-3.5 last:mb-0">{children}</p>
          ),
          ul: ({ children }: { children?: ReactNode }) => (
            <ul className="mb-4 list-disc space-y-1.5 pl-6 last:mb-0 marker:text-slate-400 dark:marker:text-slate-500">
              {children}
            </ul>
          ),
          ol: ({ children }: { children?: ReactNode }) => (
            <ol className="mb-4 list-decimal space-y-1.5 pl-6 last:mb-0 marker:text-slate-500 dark:marker:text-slate-400 marker:font-medium">
              {children}
            </ol>
          ),
          li: ({ children }: { children?: ReactNode }) => (
            <li className="pl-1 leading-[1.65]">{children}</li>
          ),
          blockquote: ({ children }: { children?: ReactNode }) => (
            <blockquote className="my-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              {children}
            </blockquote>
          ),
          a: ({ href, children }: { href?: string; children?: ReactNode }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-teal-700 underline decoration-teal-600/40 underline-offset-2 transition-colors hover:text-teal-800 hover:decoration-teal-700 dark:text-teal-400 dark:decoration-teal-400/40 dark:hover:text-teal-300"
            >
              {children}
            </a>
          ),
          hr: () => (
            <hr className="my-6 border-t border-slate-200 dark:border-slate-800" />
          ),
          table: ({ children }: { children?: ReactNode }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full border-collapse text-left text-sm tabular-nums">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }: { children?: ReactNode }) => (
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              {children}
            </thead>
          ),
          th: ({ children }: { children?: ReactNode }) => (
            <th className="px-3.5 py-2.5">{children}</th>
          ),
          td: ({ children }: { children?: ReactNode }) => (
            <td className="border-t border-slate-200/80 px-3.5 py-2.5 text-slate-700 dark:border-slate-800/80 dark:text-slate-300">
              {children}
            </td>
          ),
          pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
          code: ({
            className,
            children,
            ...props
          }: {
            className?: string;
            children?: ReactNode;
          }) => {
            const match = /language-([\w-]+)/.exec(className || '');
            const rawText = String(children ?? '').replace(/\n$/, '');
            const isBlock = Boolean(match) || rawText.includes('\n');

            if (isBlock) {
              return <CodeBlock language={match ? match[1] : ''} value={rawText} />;
            }

            return (
              <code
                {...props}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[13.5px] font-mono text-slate-900 dark:bg-slate-800 dark:text-slate-100"
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span
          className="streaming-caret bg-teal-600 dark:bg-teal-400"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
