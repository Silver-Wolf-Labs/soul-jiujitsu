/**
 * Renders a limited subset of inline Markdown:
 *   **bold**  *italic*  ~~strikethrough~~  __underline__  [link](url)
 *
 * Intentionally does NOT support headings, images, code blocks, or block-level elements.
 */
export function InlineMd({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{parse(text)}</span>;
}

function parse(text: string): React.ReactNode[] {
  const re = /(\*\*[^*]+\*\*|~~[^~]+~~|__[^_]+__|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const s = m[0];

    if (s.startsWith("**"))      parts.push(<strong key={key++}>{s.slice(2, -2)}</strong>);
    else if (s.startsWith("~~")) parts.push(<del key={key++}>{s.slice(2, -2)}</del>);
    else if (s.startsWith("__")) parts.push(<u key={key++}>{s.slice(2, -2)}</u>);
    else if (s.startsWith("*"))  parts.push(<em key={key++}>{s.slice(1, -1)}</em>);
    else {
      const lm = s.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm) {
        const href = lm[2];
        const safe = /^https?:\/\//.test(href) || (href.startsWith("/") && !href.startsWith("//"));
        parts.push(
          safe ? (
            <a key={key++} href={href} target="_blank" rel="noopener noreferrer"
              className="underline hover:opacity-80">
              {lm[1]}
            </a>
          ) : (
            <span key={key++}>{lm[1]}</span>
          )
        );
      } else {
        parts.push(s);
      }
    }
    last = m.index + s.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
