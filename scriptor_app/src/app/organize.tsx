import { ComingSoon } from '../ui/ComingSoon';

export default function Organize() {
  return (
    <ComingSoon
      icon="sitemap-outline"
      title="Organize"
      phase="later phases"
      holds={[
        'Characters: the cast, profiles and relationships',
        'World: places, factions, items, powers and lore',
        'Systems: progression blueprints and status windows',
        'Modules, and the Plan and Visualize tabs (timeline, plot threads, scene board, maps, the knowledge graph)',
      ]}
    />
  );
}
