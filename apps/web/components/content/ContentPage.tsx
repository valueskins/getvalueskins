import { Children, isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { parseContent, slugify } from '@/lib/content';
import { isProductionTarget } from '@/lib/env';
import { Icon } from '@/components/ui/Icon';

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function components(numbers: Map<string, number> | null): Components {
  return {
    h2: ({ children }) => {
      const title = Children.toArray(children).map(textOf).join('').trim();
      const id = slugify(title);
      const n = numbers?.get(id);
      return (
        <h2 id={id} className="scroll-mt-6">
          {n !== undefined ? <span className="n">{n}</span> : null}
          {children}
        </h2>
      );
    },
    a: ({ href, children }) => {
      const external = Boolean(href && /^https?:/.test(href));
      return (
        <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {children}
        </a>
      );
    },
  };
}

/** A review note for a passage about something this version does not do (content/README.md). */
function MissingNote({ text }: { text: string }) {
  return (
    <aside className="callout callout-wait my-4" aria-label="Not in this version">
      <Icon name="warning" />
      <div>
        <p className="callout-title">Not in this version</p>
        <p>{text}</p>
      </div>
    </aside>
  );
}

interface ContentPageProps {
  markdown: string;
  /** Legal pages number their sections. */
  numbered?: boolean;
  /** Shows the `:::missing` notes. Defaults to every build except one aimed at the production API. */
  showMissing?: boolean;
  /** Extra content under the text, for example a link to the terms. */
  footer?: ReactNode;
}

/** A long reading page: the sections list at the side (folded on phones), then the text. */
export function ContentPage({ markdown, numbered = false, showMissing, footer }: ContentPageProps) {
  const doc = parseContent(markdown);
  const show = showMissing ?? !isProductionTarget();
  const numbers = numbered ? new Map(doc.sections.map((s, i) => [s.id, i + 1])) : null;
  const md = components(numbers);

  const toc = (
    <>
      {doc.sections.map((s, i) => (
        <a key={s.id} href={`#${s.id}`}>
          {numbered ? <span className="n">{i + 1}</span> : null}
          {s.title}
        </a>
      ))}
    </>
  );

  return (
    <div className="mx-auto max-w-page px-4 pb-[88px] pt-8 md:px-8 md:pt-16">
      <header className="mb-8 flex max-w-[68ch] flex-col gap-3 md:mb-12">
        <h1 className="m-0 text-[34px] font-semibold leading-[40px] tracking-[-0.02em] md:text-[44px] md:leading-[52px]">
          {doc.title}
        </h1>
        {doc.lede ? (
          <p className="text-[17px] leading-[26px] text-ink-2 [&_a]:text-ink [&_a]:underline">
            <ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>
              {doc.lede}
            </ReactMarkdown>
          </p>
        ) : null}
      </header>

      {doc.sections.length > 1 ? (
        <details className="card mb-8 md:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3.5 text-[15px] font-medium">
            On this page
            <Icon name="caretDown" />
          </summary>
          <nav className="toc border-t border-rule px-3.5 py-2" aria-label="On this page">
            {toc}
          </nav>
        </details>
      ) : null}

      <div className="grid gap-12 md:grid-cols-[220px_minmax(0,1fr)]">
        {doc.sections.length > 1 ? (
          <aside className="hidden md:block">
            <nav className="toc sticky top-6" aria-label="Sections">
              <p className="toc-title">Sections</p>
              {toc}
            </nav>
          </aside>
        ) : (
          <div className="hidden md:block" />
        )}
        <article className="prose">
          {doc.segments.map((segment, i) =>
            segment.kind === 'markdown' ? (
              <ReactMarkdown key={i} components={md}>
                {segment.text}
              </ReactMarkdown>
            ) : show ? (
              <MissingNote key={i} text={segment.text} />
            ) : null,
          )}
          {footer}
        </article>
      </div>
    </div>
  );
}
