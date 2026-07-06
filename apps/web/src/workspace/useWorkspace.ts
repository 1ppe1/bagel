import { useEffect, useState } from 'react';
import { getWorkspace } from '../api.ts';
import { apiWorkspaceToWeb } from './apiWorkspace.ts';
import { mockWorkspace } from './mockWorkspace.ts';
import type { Workspace } from './types.ts';

export type WorkspaceSource = 'loading' | 'api' | 'mock';

/**
 * Load the workspace graph from the API, falling back to the bundled mock
 * (so the graph still renders before any manifest has been pushed, or when
 * the API is unreachable). The mock is shown immediately while the API loads.
 */
export function useWorkspace(): { workspace: Workspace; source: WorkspaceSource } {
  const [workspace, setWorkspace] = useState<Workspace>(mockWorkspace);
  const [source, setSource] = useState<WorkspaceSource>('loading');

  useEffect(() => {
    let cancelled = false;

    getWorkspace()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setWorkspace(apiWorkspaceToWeb(response.workspace));
        setSource('api');
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setWorkspace(mockWorkspace);
        setSource('mock');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { workspace, source };
}
