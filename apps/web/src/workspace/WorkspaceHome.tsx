import { WorkspaceGraph } from './WorkspaceGraph.tsx';
import { useWorkspace } from './useWorkspace.ts';

// The workspace graph home screen — the product's entry point.
// Data comes from the API workspace manifest, falling back to the bundled mock.
export function WorkspaceHome() {
  const { workspace, source } = useWorkspace();

  return (
    <main className="home-shell">
      <header className="home-topbar">
        <div className="home-brand">
          <span className="home-mark">&gt;_</span>
          <span className="home-name">bagel</span>
          <span className="home-sep">/</span>
          <span className="home-workspace">{workspace.name}</span>
        </div>
        <div className="home-topbar-meta">
          <span>{workspace.nodes.length} artifacts</span>
          <span>{workspace.comments.filter((comment) => !comment.resolved).length} open comments</span>
          {source === 'mock' ? <span className="home-source-mock">mock data</span> : null}
          <a className="home-sync-link" href="/sync">
            AI sync ⇅
          </a>
        </div>
      </header>

      <WorkspaceGraph workspace={workspace} />
    </main>
  );
}
