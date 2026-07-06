import { useEffect, useRef, useState } from 'react';

// The AI sync loop screen. "Run sync" replays a local
// `bagel pull` → AI fix → diff → comment-resolution pass, mirroring the
// Notion design mock. This is a client-side visualization of a local process;
// no backend calls are made.

type LineClass = 'cmd' | 'dim' | 'warn' | 'ai' | 'ok' | 'done';

const TERM: Array<{ text: string; cls: LineClass }> = [
  { text: '$ bagel pull', cls: 'cmd' },
  { text: 'Reading .docsync/context.md …', cls: 'dim' },
  { text: '3 open comments → spec.html', cls: 'warn' },
  { text: 'Resolving related context · 4 files', cls: 'dim' },
  { text: '→ local AI applying fixes', cls: 'ai' },
  { text: 'patch spec.html ………… ok', cls: 'ok' },
  { text: 'patch user-flow.mmd ……… ok', cls: 'ok' },
  { text: 'patch api.md ……………… ok', cls: 'ok' },
  { text: 'patch onboarding.html …… ok', cls: 'ok' },
  { text: '✓ spec.html v3 → v4 · 3 comments resolved', cls: 'done' }
];

type DiffType = 'ctx' | 'del' | 'add';
const DIFF: Array<{ sign: string; type: DiffType; text: string }> = [
  { sign: ' ', type: 'ctx', text: '## 2.3 Team member invitation' },
  { sign: ' ', type: 'ctx', text: 'After creating a workspace, the user is' },
  { sign: '-', type: 'del', text: 'prompted to invite teammates by email.' },
  { sign: '+', type: 'add', text: 'prompted to invite teammates by email —' },
  { sign: '+', type: 'add', text: 'available on the Pro plan only. On the Free' },
  { sign: '+', type: 'add', text: 'plan the invite step is skipped with an upsell.' },
  { sign: ' ', type: 'ctx', text: '' },
  { sign: ' ', type: 'ctx', text: '# user-flow.mmd' },
  { sign: '+', type: 'add', text: '+ Plan check → Free: skip · Pro: invite' },
  { sign: ' ', type: 'ctx', text: '# api.md' },
  { sign: '+', type: 'add', text: '+ 403 PLAN_REQUIRED when plan disallows seats' }
];

const COMMENTS: Array<{
  ini: string;
  bg: string;
  fg: string;
  text: string;
  resolveAt: number;
}> = [
  { ini: 'MO', bg: '#ecddf6', fg: '#8a5ba8', text: 'Gate invitation behind the Pro plan', resolveAt: 7 },
  { ini: 'DR', bg: '#d6e8f5', fg: '#2f76a0', text: '“Start trial” → “Create workspace”', resolveAt: 8 },
  { ini: 'LW', bg: '#d7ecd9', fg: '#3f7d57', text: 'Confirm rate limit on POST /invitations', resolveAt: 9 }
];

const STEP_MS = 620;
const ADD_COUNT = 5;
const DEL_COUNT = 1;

export function SyncLoop() {
  const [prog, setProg] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  function runSync() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
    }
    setProg(0);
    setRunning(true);
    setDone(false);
    timerRef.current = window.setInterval(() => {
      setProg((prev) => {
        const next = prev + 1;
        if (next >= TERM.length) {
          if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setRunning(false);
          setDone(true);
        }
        return next;
      });
    }, STEP_MS);
  }

  const statusLabel = running ? 'running' : done ? 'complete' : 'ready';
  const showDiff = prog >= 6;
  const idle = !running && !done && prog === 0;
  const working = running && prog >= 4 && prog < TERM.length - 1;

  return (
    <main className="sync-shell">
      <header className="sync-topbar">
        <div className="home-brand">
          <a className="home-mark" href="/" aria-label="Home">
            &gt;_
          </a>
          <span className="home-name">bagel</span>
          <span className="home-sep">/</span>
          <a className="sync-crumb" href="/">
            new-saas-prd
          </a>
          <span className="home-sep">/</span>
          <span className="sync-crumb-active">Sync</span>
          <span
            className="sync-demo-badge"
            title="Scripted visualization — not connected to a real sync run yet."
          >
            Demo
          </span>
        </div>
        <div className="sync-topbar-right">
          <div className="sync-version">
            <span className="sync-file">spec.html</span>
            <span className={done ? 'sync-v-old sync-v-struck' : 'sync-v-old'}>v3</span>
            <span className="home-sep">→</span>
            <span className={done ? 'sync-v-new sync-v-new-on' : 'sync-v-new'}>v4</span>
          </div>
          <button
            type="button"
            className={running ? 'sync-run sync-run-busy' : done ? 'sync-run sync-run-again' : 'sync-run'}
            onClick={runSync}
            disabled={running}
          >
            {running ? 'Syncing…' : done ? '↻ Run again' : 'Run sync ▸'}
          </button>
        </div>
      </header>

      <div className="sync-body">
        <section className="sync-left">
          <div className="sync-left-head">
            <span className="sync-left-title">Sync run</span>
            <span className={`sync-pill sync-pill-${statusLabel}`}>{statusLabel}</span>
          </div>

          <div className="sync-term">
            {TERM.slice(0, prog).map((line, index) => (
              <div key={index} className={`sync-line sync-line-${line.cls}`}>
                {line.text}
              </div>
            ))}
            {(running || done) && (
              <div className="sync-cursor-row">
                {working && <span className="sync-spinner" />}
                <span className="sync-cursor" />
              </div>
            )}
          </div>

          <div className="sync-comments">
            <div className="sync-comments-label">Comments synced</div>
            {COMMENTS.map((comment) => {
              const resolved = prog >= comment.resolveAt;
              return (
                <div key={comment.ini} className="sync-comment">
                  <span
                    className="sync-avatar"
                    style={{ background: comment.bg, color: comment.fg }}
                  >
                    {comment.ini}
                  </span>
                  <span className="sync-comment-text">{comment.text}</span>
                  <span className={resolved ? 'sync-status sync-status-done' : 'sync-status sync-status-open'}>
                    {resolved ? '✓ Resolved' : 'Open'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="sync-right">
          <div className="sync-right-head">
            <span className="sync-file">spec.html</span>
            <span className="sync-section">§2.3 Team member invitation</span>
            <span className="sync-counts">
              <span className="sync-del">−{DEL_COUNT}</span>
              <span className="sync-add">+{ADD_COUNT}</span>
            </span>
          </div>

          <div className="sync-diff-scroll">
            {showDiff ? (
              <>
                <div className="sync-diff">
                  {DIFF.map((row, index) => (
                    <div key={index} className={`sync-diff-row sync-diff-${row.type}`}>
                      <span className="sync-diff-gutter">{row.sign}</span>
                      <span className="sync-diff-text">{row.text}</span>
                    </div>
                  ))}
                </div>
                <div className="sync-push">
                  <span className="sync-push-cmd">$ bagel push</span>
                  <span className="sync-push-note">
                    re-checks pass · {ADD_COUNT} additions across 4 files
                  </span>
                  <a className="sync-review-btn" href="/">
                    Back to workspace →
                  </a>
                </div>
              </>
            ) : (
              <div className="sync-idle">
                <div className="sync-idle-mark">⇅</div>
                <div className="sync-idle-title">Sync review comments back to the artifact</div>
                <p className="sync-idle-text">
                  Run <span className="sync-idle-cmd">bagel pull</span> to hand the 3 open comments
                  and their context to your local AI. It patches the files and bumps the version.
                </p>
                <button type="button" className="sync-run" onClick={runSync} disabled={!idle && running}>
                  Run sync ▸
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
