import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { DocNode, Piece } from './book';

const MARKS: Record<string, (children: ReactNode, key: number) => ReactNode> = {
  bold: (children, key) => <strong key={key}>{children}</strong>,
  italic: (children, key) => <em key={key}>{children}</em>,
  underline: (children, key) => <u key={key}>{children}</u>,
  strike: (children, key) => <s key={key}>{children}</s>,
};

function inline(nodes: DocNode[] | undefined): ReactNode {
  return (nodes ?? []).map((node, i) => {
    if (node.type === 'hardBreak') return <br key={i} />;
    if (node.type !== 'text') return <Fragment key={i}>{inline(node.content)}</Fragment>;
    // Links to the codex are the author's working marks; a reader sees only the words.
    return (node.marks ?? []).reduce<ReactNode>((children, mark) => MARKS[mark.type]?.(children, i) ?? children, <Fragment key={i}>{node.text}</Fragment>);
  });
}

const aligned = (node: DocNode): CSSProperties | undefined => {
  const align = node.attrs?.textAlign;
  return align === 'center' || align === 'right' || align === 'justify' || align === 'left' ? { textAlign: align } : undefined;
};

function block(node: DocNode, key: number, first: boolean): ReactNode {
  switch (node.type) {
    case 'paragraph': {
      const empty = !(node.content ?? []).some((child) => child.type !== 'text' || (child.text ?? '') !== '');
      return (
        <p key={key} className={empty ? 'blank' : first ? 'first' : undefined} style={aligned(node)}>
          {empty ? ' ' : inline(node.content)}
        </p>
      );
    }
    case 'heading': {
      const Tag = `h${Math.min(6, Number(node.attrs?.level ?? 2) + 2)}` as 'h3';
      return (
        <Tag key={key} className="prose-heading" style={aligned(node)}>
          {inline(node.content)}
        </Tag>
      );
    }
    case 'blockquote':
      return <blockquote key={key}>{(node.content ?? []).map((child, i) => block(child, i, i === 0))}</blockquote>;
    case 'bulletList':
      return <ul key={key}>{(node.content ?? []).map((child, i) => block(child, i, true))}</ul>;
    case 'orderedList':
      return <ol key={key}>{(node.content ?? []).map((child, i) => block(child, i, true))}</ol>;
    case 'listItem':
      return <li key={key}>{(node.content ?? []).map((child, i) => block(child, i, true))}</li>;
    default:
      return <Fragment key={key}>{(node.content ?? []).map((child, i) => block(child, i, first && i === 0))}</Fragment>;
  }
}

/**
 * READ-ONLY RENDERING RULE
 * The author's text, drawn as plain paragraphs. There is no editor here:
 * nothing is editable, nothing listens for typing, and the saved document
 * is only ever read from. Selecting words to see how a passage sits on the
 * page selects them and does nothing else.
 */
export function Prose({ pieces, sceneBreak }: { pieces: Piece[]; sceneBreak: string }) {
  let opening = true;
  return (
    <div className="prose">
      {pieces.map((piece, i) => {
        if (piece.kind === 'break') {
          opening = true;
          return (
            <p key={i} className="scene-break" role="separator" aria-label="Scene break">
              {sceneBreak || ' '}
            </p>
          );
        }
        // The first paragraph of a chapter or scene is set flush left, as in print.
        const first = opening;
        opening = piece.node.type === 'heading';
        return block(piece.node, i, first);
      })}
    </div>
  );
}

/** Plain text from the front or back matter, one paragraph a line. */
export const Lines = ({ text }: { text: string }) => (
  <>
    {text.split(/\n+/).map((line, i) => (
      <p key={i}>{line}</p>
    ))}
  </>
);
