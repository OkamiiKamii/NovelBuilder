export interface WorkspaceSection {
  path: string;
  label: string;
  phase: number;
  description: string;
}

/** Workspace areas owned by phases not built yet. Each phase removes its entry and adds a real route. */
export const WORKSPACE_SECTIONS: WorkspaceSection[] = [
];
