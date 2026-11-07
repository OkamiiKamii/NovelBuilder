import type { StoryNode } from '@/modules/manuscript/types';
import type { StoryOrder } from '@/modules/relationships/timeline';

/** The chapters and scenes of the novel as menu options, in reading order, scenes indented. */
export const ChapterOptions = ({ nodes, order }: { nodes: StoryNode[]; order: StoryOrder }) => (
  <>
    {[...nodes].filter((n) => n.kind === 'chapter' || n.kind === 'scene').sort((a, b) => (order.position.get(a.id) ?? 0) - (order.position.get(b.id) ?? 0)).map((node) => (
      <option key={node.id} value={node.id}>
        {node.kind === 'scene' ? '  ' : ''}
        {node.title}
      </option>
    ))}
  </>
);
