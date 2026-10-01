import { readFileSync } from 'node:fs';
import path from 'node:path';
import Markdown from 'react-markdown';

/** Renders apps/web/content/<file> (markdown). Read at build time: the pages
 * using this are static. Placeholder legal text is marked DRAFT in the files. */
export function MarkdownPage({ file }: { file: string }) {
  const source = readFileSync(path.join(process.cwd(), 'content', file), 'utf8');

  return (
    <article className="space-y-4 leading-relaxed">
      <Markdown
        components={{
          h1: (props) => <h1 className="text-2xl font-semibold" {...props} />,
          h2: (props) => <h2 className="pt-4 text-xl font-semibold" {...props} />,
          p: (props) => <p {...props} />,
          ul: (props) => <ul className="list-disc space-y-1 pl-6" {...props} />,
          a: (props) => <a className="underline" rel="noopener noreferrer" {...props} />,
          strong: (props) => <strong className="font-semibold" {...props} />,
        }}
      >
        {source}
      </Markdown>
    </article>
  );
}
