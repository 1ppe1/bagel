import { WorkspaceGraph } from './WorkspaceGraph.tsx';
import { useWorkspace } from './useWorkspace.ts';

// The workspace graph home screen — the product's entry point.
// Data comes from the API workspace manifest; before anything has been pushed
// we show a getting-started guide instead of fabricated data. `?demo=1` shows
// the bundled demo workspace.
export function WorkspaceHome() {
  const { workspace, source } = useWorkspace();

  return (
    <main className="home-shell">
      <header className="home-topbar">
        <div className="home-brand">
          <span className="home-mark">&gt;_</span>
          <span className="home-name">bagel</span>
          {workspace ? (
            <>
              <span className="home-sep">/</span>
              <span className="home-workspace">{workspace.name}</span>
            </>
          ) : null}
        </div>
        <div className="home-topbar-meta">
          {workspace ? (
            <>
              <span>{workspace.nodes.length} artifacts</span>
              <span>
                {workspace.comments.filter((comment) => !comment.resolved).length} open comments
              </span>
            </>
          ) : null}
          {source === 'demo' ? <span className="home-source-mock">demo data</span> : null}
          <a className="home-sync-link" href="/sync">
            Sync demo ⇅
          </a>
        </div>
      </header>

      {workspace ? (
        <WorkspaceGraph workspace={workspace} />
      ) : source === 'loading' ? (
        <div className="home-guide">
          <p className="home-guide-loading">Loading workspace…</p>
        </div>
      ) : (
        <HomeGuide unreachable={source === 'error'} />
      )}
    </main>
  );
}

function HomeGuide({ unreachable }: { unreachable: boolean }) {
  return (
    <div className="home-guide">
      <div className="home-guide-card">
        <h1>Welcome to bagel</h1>
        <p>
          bagel turns browser review comments on your AI-generated HTML artifacts into agent
          context your local AI can act on.
        </p>
        {unreachable ? (
          <p className="inline-error">
            The bagel API is not reachable. Start it with <code>npm run dev</code> and reload.
          </p>
        ) : (
          <>
            <ol className="home-guide-steps">
              <li>
                Publish an artifact for review:
                <pre>./bagel push examples/spec.html</pre>
              </li>
              <li>
                Map your workspace graph (optional):
                <pre>./bagel workspace</pre>
              </li>
              <li>Open the review URL printed by push and collect comments.</li>
              <li>
                Hand them to your local AI:
                <pre>./bagel pull && ./bagel context --open-comments</pre>
              </li>
            </ol>
            <a className="home-guide-demo" href="/?demo=1">
              …or explore with demo data →
            </a>
          </>
        )}
      </div>
    </div>
  );
}
