import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, reviewTokenFromPath } from './App.tsx';
import { WorkspaceHome } from './workspace/WorkspaceHome.tsx';
import { SyncLoop } from './workspace/SyncLoop.tsx';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Bagel review root was not found.');
}

// Route on the current path: `/r/:token` opens a review, `/sync` opens the AI
// sync loop, everything else opens the workspace graph home.
function Root() {
  const path = window.location.pathname;
  if (reviewTokenFromPath(path) != null) {
    return <App />;
  }
  if (path === '/sync' || path === '/sync/') {
    return <SyncLoop />;
  }
  return <WorkspaceHome />;
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
