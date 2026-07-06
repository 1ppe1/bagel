import { useEffect, useState } from 'react';
import { ApiError, getWorkspace } from '../api.ts';
import { apiWorkspaceToWeb } from './apiWorkspace.ts';
import { mockWorkspace } from './mockWorkspace.ts';
import type { Workspace } from './types.ts';

export type WorkspaceSource = 'loading' | 'api' | 'demo' | 'empty' | 'error';

type WorkspaceState = { workspace: Workspace | null; source: WorkspaceSource };

function isDemoMode() {
  return new URLSearchParams(window.location.search).has('demo');
}

/**
 * Load the workspace graph from the API.
 * - `?demo=1` renders the bundled demo workspace without touching the API.
 * - A 404 (nothing pushed yet) resolves to `empty` so callers can show a
 *   getting-started guide instead of fabricated data.
 * - Network/server failures resolve to `error`.
 */
export function useWorkspace(): WorkspaceState {
  const [state, setState] = useState<WorkspaceState>(() =>
    isDemoMode()
      ? { workspace: mockWorkspace, source: 'demo' }
      : { workspace: null, source: 'loading' }
  );

  useEffect(() => {
    if (isDemoMode()) {
      return;
    }

    let cancelled = false;

    getWorkspace()
      .then((response) => {
        if (!cancelled) {
          setState({ workspace: apiWorkspaceToWeb(response.workspace), source: 'api' });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const isEmpty = error instanceof ApiError && error.status === 404;
        setState({ workspace: null, source: isEmpty ? 'empty' : 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
