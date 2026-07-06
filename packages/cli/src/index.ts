import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { type Comment, type ContextComment, anchorStatuses, workflowStatuses } from '@docsync/core';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

export type CliRuntime = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  stdout?: (chunk: string) => void;
  stderr?: (chunk: string) => void;
};

type LocalConfig = {
  projectId: string;
  reviewId: string;
  reviewToken: string;
  serverUrl: string;
  defaultArtifact: string;
  lastContentHash: string | null;
  lastPulledAt: string | null;
  workspaceRoot: string;
  commentsPath: string;
  contextPath: string;
};

type LocalCommentsFile = {
  projectId: string;
  reviewId: string;
  syncedAt: string;
  comments: Comment[];
};

type CreateProjectResponse = {
  project: {
    id: string;
  };
  review: {
    id: string;
  };
  reviewToken: string;
  reviewUrl: string;
};

type CreateRevisionResponse = {
  revision: {
    id: string;
    contentHash: string;
  };
  reviewToken: string;
  reviewUrl: string;
  artifactUrl: string;
};

type CommentsResponse = {
  comments: Comment[];
};

const DOCSYNC_DIR = '.docsync';
const CONFIG_FILE = join(DOCSYNC_DIR, 'config.json');
const COMMENTS_FILE = join(DOCSYNC_DIR, 'comments.json');
const CONTEXT_FILE = join(DOCSYNC_DIR, 'context.md');
const DEFAULT_SERVER_URL = 'http://localhost:8787';
const DEFAULT_ARTIFACT = 'spec.html';
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const DEFAULT_PROJECT_NAME = 'Bagel Review';
const DEFAULT_PROJECT_TITLE = 'Bagel Review';

export const helpText = `bagel CLI

Usage:
  bagel <command> [options]

Commands:
  init                 Create a local .docsync configuration.
  push <file.html>     Publish a single HTML file for review.
  pull                 Sync review comments into .docsync/comments.json.
  context              Generate .docsync/context.md for open comments.
  workspace [file]     Push a workspace graph manifest (default .docsync/workspace.json).
  share                Expose the local server through a Cloudflare quick tunnel.

Options:
  -h, --help           Show this help message.
  -v, --version        Show the CLI version.`;

function hashString(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function normalizeServerUrl(serverUrl: string) {
  return serverUrl.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function getOptionValue(args: string[], names: string[]) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    for (const name of names) {
      if (arg === name) {
        return args[index + 1];
      }

      if (arg.startsWith(`${name}=`)) {
        return arg.slice(name.length + 1);
      }
    }
  }

  return undefined;
}

function hasFlag(args: string[], name: string) {
  return args.includes(name);
}

function getPositionals(args: string[]) {
  const positionals: string[] = [];
  const valueFlags = new Set(['--server', '--default-artifact', '--artifact']);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }

    if (arg.includes('=')) {
      continue;
    }

    if (valueFlags.has(arg)) {
      index += 1;
    }
  }

  return positionals;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text) as T;
}

async function writeAtomicText(filePath: string, content: string) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, filePath);
}

async function writeAtomicJson(filePath: string, value: unknown) {
  await writeAtomicText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function validateArtifactHtml(html: string) {
  if (Buffer.byteLength(html, 'utf8') > MAX_ARTIFACT_BYTES) {
    return 'Artifact exceeds the maximum allowed size.';
  }

  if (/<script\b/i.test(html)) {
    return 'Artifact contains a <script> tag.';
  }

  if (/\bon[a-z]+\s*=/i.test(html)) {
    return 'Artifact contains an inline event handler.';
  }

  if (/<\s*(iframe|object|embed|form)\b/i.test(html)) {
    return 'Artifact contains a forbidden embedded element.';
  }

  if (/javascript\s*:/i.test(html)) {
    return 'Artifact contains a javascript: URL.';
  }

  return null;
}

function asConfig(value: unknown): LocalConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const requiredStrings: (keyof LocalConfig)[] = [
    'projectId',
    'reviewId',
    'reviewToken',
    'serverUrl',
    'defaultArtifact',
    'workspaceRoot',
    'commentsPath',
    'contextPath'
  ];

  if (!requiredStrings.every((key) => isString(value[key]))) {
    return null;
  }

  const projectId = value.projectId as string;
  const reviewId = value.reviewId as string;
  const reviewToken = value.reviewToken as string;
  const serverUrl = value.serverUrl as string;
  const defaultArtifact = value.defaultArtifact as string;
  const workspaceRoot = value.workspaceRoot as string;
  const commentsPath = value.commentsPath as string;
  const contextPath = value.contextPath as string;

  if (
    value.lastContentHash !== undefined &&
    value.lastContentHash !== null &&
    !isString(value.lastContentHash)
  ) {
    return null;
  }

  if (value.lastPulledAt !== undefined && value.lastPulledAt !== null && !isString(value.lastPulledAt)) {
    return null;
  }

  return {
    projectId,
    reviewId,
    reviewToken,
    serverUrl: normalizeServerUrl(serverUrl),
    defaultArtifact,
    lastContentHash: value.lastContentHash ?? null,
    lastPulledAt: value.lastPulledAt ?? null,
    workspaceRoot,
    commentsPath,
    contextPath
  };
}

async function readConfig(cwd: string) {
  const configPath = join(cwd, CONFIG_FILE);
  if (!(await fileExists(configPath))) {
    return null;
  }

  return asConfig(await readJsonFile(configPath));
}

function makeConfig(cwd: string, response: CreateProjectResponse, serverUrl: string, defaultArtifact: string): LocalConfig {
  return {
    projectId: response.project.id,
    reviewId: response.review.id,
    reviewToken: response.reviewToken,
    serverUrl: normalizeServerUrl(serverUrl),
    defaultArtifact,
    lastContentHash: null,
    lastPulledAt: null,
    workspaceRoot: resolve(cwd),
    commentsPath: COMMENTS_FILE,
    contextPath: CONTEXT_FILE
  };
}

async function createProject(options: {
  cwd: string;
  serverUrl: string;
  fetchImpl: typeof fetch;
  defaultArtifact: string;
}) {
  const response = await options.fetchImpl(new URL('/api/projects', normalizeServerUrl(options.serverUrl)).toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      name: DEFAULT_PROJECT_NAME,
      localRootHint: resolve(options.cwd),
      title: DEFAULT_PROJECT_TITLE
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to create project: ${response.status}`);
  }

  const data = (await response.json()) as CreateProjectResponse;
  if (!data || !isRecord(data.project) || !isRecord(data.review) || !isString(data.reviewToken)) {
    throw new Error('Project creation returned an invalid response.');
  }

  return makeConfig(options.cwd, data, options.serverUrl, options.defaultArtifact);
}

async function ensureConfig(options: {
  cwd: string;
  serverUrl: string;
  fetchImpl: typeof fetch;
  defaultArtifact: string;
}) {
  const existing = await readConfig(options.cwd);
  if (existing) {
    return existing;
  }

  const config = await createProject(options);
  await writeAtomicJson(join(options.cwd, CONFIG_FILE), config);
  return config;
}

async function persistConfig(cwd: string, config: LocalConfig) {
  await writeAtomicJson(join(cwd, CONFIG_FILE), config);
}

async function readCommentsFile(cwd: string) {
  const commentsPath = join(cwd, COMMENTS_FILE);
  if (!(await fileExists(commentsPath))) {
    return null;
  }

  return readJsonFile<LocalCommentsFile>(commentsPath);
}

function mergeComments(localComments: Comment[], remoteComments: Comment[]) {
  const byId = new Map<string, Comment>();

  for (const comment of localComments) {
    byId.set(comment.id, comment);
  }

  for (const comment of remoteComments) {
    const existing = byId.get(comment.id);
    if (!existing || existing.updatedAt <= comment.updatedAt) {
      byId.set(comment.id, comment);
    }
  }

  return [...byId.values()].sort((left, right) => {
    if (left.updatedAt === right.updatedAt) {
      return left.id.localeCompare(right.id);
    }

    return left.updatedAt.localeCompare(right.updatedAt);
  });
}

function textQuoteSummary(anchor: Comment['anchor']) {
  if (!anchor.textQuote) {
    return '(none)';
  }

  const pieces = [`"${anchor.textQuote?.exact ?? ''}"`];
  if (anchor.textQuote?.prefix) {
    pieces.push(`prefix: "${anchor.textQuote.prefix}"`);
  }
  if (anchor.textQuote?.suffix) {
    pieces.push(`suffix: "${anchor.textQuote.suffix}"`);
  }
  return pieces.join(' ');
}

function headingPathSummary(anchor: Comment['anchor']) {
  return anchor.headingPath.length > 0 ? anchor.headingPath.join(' > ') : '(none)';
}

function suggestedInstruction(comment: ContextComment) {
  if (comment.fixInstruction) {
    return 'Apply this change directly to the referenced section, then keep unrelated content intact.';
  }
  switch (comment.anchorStatus) {
    case 'attached':
      return 'Update the referenced section while preserving unrelated content.';
    case 'needs_review':
      return 'Review the referenced section against the current HTML before editing it.';
    case 'orphaned':
      return 'Find the closest matching section in the current HTML or mark this comment for manual review.';
    default:
      return 'Update the referenced section carefully.';
  }
}

function renderContextMarkdown(comments: ContextComment[]) {
  const lines = ['# Bagel Review Context', '', '## Open Comments', ''];

  if (comments.length === 0) {
    lines.push('No open comments were found.', '');
    return `${lines.join('\n')}`;
  }

  for (const comment of comments) {
    const kind = comment.fixInstruction ? 'Fix instruction' : 'Comment';
    lines.push(`### ${comment.id}${comment.fixInstruction ? ' (fix instruction)' : ''}`);
    lines.push('');
    lines.push(`- Kind: ${kind}`);
    lines.push(`- Workflow status: ${comment.workflowStatus}`);
    lines.push(`- Anchor status: ${comment.anchorStatus}`);
    lines.push(`- Selector: \`${comment.anchor.selector}\``);
    lines.push(`- Text quote: ${textQuoteSummary(comment.anchor)}`);
    lines.push(`- Heading path: ${headingPathSummary(comment.anchor)}`);
    lines.push(`- ${kind}: ${comment.body}`);
    lines.push(`- Suggested instruction: ${suggestedInstruction(comment)}`);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function toContextComments(comments: Comment[]): ContextComment[] {
  return comments
    .filter((comment) => comment.workflowStatus !== 'resolved')
    .map((comment) => ({
      id: comment.id,
      body: comment.body,
      fixInstruction: comment.fixInstruction,
      workflowStatus: comment.workflowStatus,
      anchorStatus: comment.anchorStatus,
      revisionId: comment.revisionId,
      anchor: comment.anchor,
      suggestedInstruction: suggestedInstruction(comment)
    }));
}

async function initCommand(options: {
  cwd: string;
  serverUrl: string;
  fetchImpl: typeof fetch;
  stdout: (chunk: string) => void;
}) {
  const configPath = join(options.cwd, CONFIG_FILE);
  if (await fileExists(configPath)) {
    options.stdout('Local configuration already exists.\n');
    return 0;
  }

  const config = await ensureConfig({
    cwd: options.cwd,
    serverUrl: options.serverUrl,
    fetchImpl: options.fetchImpl,
    defaultArtifact: DEFAULT_ARTIFACT
  });

  options.stdout(`Initialized ${CONFIG_FILE}\n`);
  options.stdout(`Review URL: ${config.serverUrl}/r/${config.reviewToken}\n`);
  return 0;
}

async function pushCommand(options: {
  cwd: string;
  filePath: string;
  serverUrl: string;
  fetchImpl: typeof fetch;
  stdout: (chunk: string) => void;
}) {
  const html = await readFile(options.filePath, 'utf8');
  const artifactName = basename(options.filePath);

  if (!artifactName.toLowerCase().endsWith('.html')) {
    throw new Error('docsync push expects a single HTML file.');
  }

  const securityError = validateArtifactHtml(html);
  if (securityError) {
    throw new Error(`Security check failed: ${securityError}`);
  }

  const contentHash = hashString(html);
  const existingConfig = await readConfig(options.cwd);
  if (existingConfig && existingConfig.lastContentHash === contentHash) {
    options.stdout(`No changes detected for ${artifactName}; skipping publish.\n`);
    return 0;
  }

  const config = await ensureConfig({
    cwd: options.cwd,
    serverUrl: options.serverUrl,
    fetchImpl: options.fetchImpl,
    defaultArtifact: artifactName
  });

  const response = await options.fetchImpl(
    new URL(`/api/projects/${config.projectId}/revisions`, config.serverUrl).toString(),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        reviewToken: config.reviewToken,
        artifactName,
        html
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to publish revision: ${response.status} ${details}`.trim());
  }

  const data = (await response.json()) as CreateRevisionResponse;
  if (!data || !isRecord(data.revision) || !isString(data.reviewToken) || !isString(data.reviewUrl)) {
    throw new Error('Revision creation returned an invalid response.');
  }

  if (data.revision.contentHash !== contentHash) {
    throw new Error('Revision content hash did not match the local file hash.');
  }

  const nextConfig: LocalConfig = {
    ...config,
    defaultArtifact: artifactName,
    lastContentHash: contentHash
  };

  try {
    await persistConfig(options.cwd, nextConfig);
  } catch {
    // Keep the published revision if the local cache update fails.
  }

  options.stdout(`Review URL: ${new URL(data.reviewUrl, config.serverUrl).toString()}\n`);
  return 0;
}

async function pullCommand(options: {
  cwd: string;
  fetchImpl: typeof fetch;
  stdout: (chunk: string) => void;
}) {
  const config = await readConfig(options.cwd);
  if (!config) {
    throw new Error('Run docsync init before pulling comments.');
  }

  const response = await options.fetchImpl(
    new URL(`/api/reviews/${config.reviewToken}/comments`, config.serverUrl).toString()
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch comments: ${response.status}`);
  }

  const data = (await response.json()) as CommentsResponse;
  if (!data || !Array.isArray(data.comments)) {
    throw new Error('Comments response returned an invalid payload.');
  }

  const commentsPath = join(options.cwd, config.commentsPath);
  const existing = await readCommentsFile(options.cwd);
  const merged = mergeComments(existing?.comments ?? [], data.comments);
  const payload: LocalCommentsFile = {
    projectId: config.projectId,
    reviewId: config.reviewId,
    syncedAt: new Date().toISOString(),
    comments: merged
  };

  await writeAtomicJson(commentsPath, payload);
  await persistConfig(options.cwd, {
    ...config,
    lastPulledAt: payload.syncedAt
  });
  options.stdout(`Pulled ${data.comments.length} comment${data.comments.length === 1 ? '' : 's'} into ${config.commentsPath}.\n`);
  return 0;
}

async function contextCommand(options: {
  cwd: string;
  stdout: (chunk: string) => void;
}) {
  const config = await readConfig(options.cwd);
  if (!config) {
    throw new Error('Run docsync init before generating context.');
  }

  const commentsFile = await readCommentsFile(options.cwd);
  if (!commentsFile) {
    throw new Error('Run docsync pull before generating context.');
  }

  const contextComments = toContextComments(commentsFile.comments);
  const markdown = renderContextMarkdown(contextComments);
  await writeAtomicText(join(options.cwd, config.contextPath), markdown);
  options.stdout(`Wrote ${config.contextPath}.\n`);
  return 0;
}

async function readWorkspaceManifest(cwd: string, explicitPath: string | undefined) {
  const candidates = explicitPath
    ? [resolve(cwd, explicitPath)]
    : [join(cwd, '.docsync', 'workspace.json'), join(cwd, 'examples', 'workspace.json')];

  for (const candidate of candidates) {
    try {
      const text = await readFile(candidate, 'utf8');
      return { path: candidate, manifest: JSON.parse(text) as unknown };
    } catch (error) {
      if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `No workspace manifest found. Looked at: ${candidates.join(', ')}. Create .docsync/workspace.json.`
  );
}

/**
 * The server stores only review-token hashes, so it cannot produce /r/ URLs.
 * The CLI knows its own token: inject reviewUrl into any manifest artifact
 * whose file matches the artifact this checkout pushes (unless the manifest
 * already set one).
 */
function injectReviewUrls(manifest: unknown, config: LocalConfig | null) {
  if (!config || !isRecord(manifest) || !Array.isArray(manifest.artifacts)) {
    return manifest;
  }

  for (const artifact of manifest.artifacts) {
    if (
      isRecord(artifact) &&
      artifact.file === config.defaultArtifact &&
      artifact.reviewUrl === undefined
    ) {
      artifact.reviewUrl = `/r/${config.reviewToken}`;
    }
  }

  return manifest;
}

async function workspaceCommand(options: {
  cwd: string;
  manifestPath: string | undefined;
  serverUrl: string;
  fetchImpl: typeof fetch;
  stdout: (chunk: string) => void;
}) {
  const { path, manifest: rawManifest } = await readWorkspaceManifest(
    options.cwd,
    options.manifestPath
  );
  const manifest = injectReviewUrls(rawManifest, await readConfig(options.cwd));

  const response = await options.fetchImpl(
    new URL('/api/workspace', normalizeServerUrl(options.serverUrl)).toString(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(manifest)
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to push workspace: ${response.status} ${details}`.trim());
  }

  const data = (await response.json()) as { workspace?: { artifacts?: unknown[] } };
  const count = Array.isArray(data.workspace?.artifacts) ? data.workspace.artifacts.length : 0;
  options.stdout(`Pushed workspace from ${path} (${count} artifacts).\n`);
  return 0;
}

/** Extract the public trycloudflare URL from cloudflared's log output. */
export function parseTunnelUrl(line: string) {
  const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  return match ? match[0] : null;
}

const CLOUDFLARED_INSTALL_HINT = `bagel share needs cloudflared (Cloudflare quick tunnel, no account required).

Install it, then rerun:
  macOS:  brew install cloudflared
  Other:  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`;

async function shareCommand(options: {
  cwd: string;
  serverUrl: string;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}) {
  const serverUrl = normalizeServerUrl(options.serverUrl);
  const config = await readConfig(options.cwd);

  // Fail with guidance when cloudflared is not installed.
  const versionOk = await new Promise<boolean>((resolvePromise) => {
    const probe = spawn('cloudflared', ['--version'], { stdio: 'ignore' });
    probe.on('error', () => resolvePromise(false));
    probe.on('exit', (code) => resolvePromise(code === 0));
  });
  if (!versionOk) {
    throw new Error(CLOUDFLARED_INSTALL_HINT);
  }

  options.stdout(`Starting Cloudflare quick tunnel for ${serverUrl} ...\n`);
  const tunnel = spawn('cloudflared', ['tunnel', '--url', serverUrl], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let announced = false;
  const announce = (chunk: Buffer) => {
    if (announced) {
      return;
    }
    const url = parseTunnelUrl(chunk.toString());
    if (!url) {
      return;
    }
    announced = true;
    options.stdout(`\nShare URL: ${url}\n`);
    if (config) {
      options.stdout(`Review URL: ${url}/r/${config.reviewToken}\n`);
    }
    options.stdout('\nAnyone with these URLs can open them. Press Ctrl+C to stop sharing.\n');
  };
  tunnel.stdout.on('data', announce);
  tunnel.stderr.on('data', announce);

  const forwardSignal = () => tunnel.kill('SIGINT');
  process.on('SIGINT', forwardSignal);
  process.on('SIGTERM', forwardSignal);

  const exitCode = await new Promise<number>((resolvePromise) => {
    tunnel.on('error', () => resolvePromise(1));
    tunnel.on('exit', (code) => resolvePromise(code ?? 0));
  });

  process.off('SIGINT', forwardSignal);
  process.off('SIGTERM', forwardSignal);

  if (!announced && exitCode !== 0) {
    options.stderr('cloudflared exited before providing a tunnel URL.\n');
  }
  return exitCode;
}

export async function main(argv: string[] = process.argv.slice(2), runtime: CliRuntime = {}) {
  const cwd = resolve(runtime.cwd ?? process.cwd());
  const env = runtime.env ?? process.env;
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const stdout = runtime.stdout ?? ((chunk) => process.stdout.write(chunk));
  const stderr = runtime.stderr ?? ((chunk) => process.stderr.write(chunk));

  const [command, ...args] = argv;

  if (!command || command === '--help' || command === '-h') {
    stdout(`${helpText}\n`);
    return 0;
  }

  if (command === '--version' || command === '-v') {
    stdout('0.1.0\n');
    return 0;
  }

  const serverUrl = normalizeServerUrl(
    getOptionValue(args, ['--server']) ?? env.DOCSYNC_SERVER_URL ?? DEFAULT_SERVER_URL
  );

  try {
    switch (command) {
      case 'init':
        return await initCommand({
          cwd,
          serverUrl,
          fetchImpl,
          stdout
        });
      case 'push': {
        const [filePath] = getPositionals(args);
        if (!filePath) {
          throw new Error('docsync push requires an HTML file path.');
        }

        return await pushCommand({
          cwd,
          filePath: resolve(cwd, filePath),
          serverUrl,
          fetchImpl,
          stdout
        });
      }
      case 'pull':
        return await pullCommand({
          cwd,
          fetchImpl,
          stdout
        });
      case 'context':
        if (!hasFlag(args, '--open-comments')) {
          throw new Error('docsync context currently supports only --open-comments.');
        }

        return await contextCommand({
          cwd,
          stdout
        });
      case 'workspace': {
        const [manifestPath] = getPositionals(args);
        return await workspaceCommand({
          cwd,
          manifestPath,
          serverUrl,
          fetchImpl,
          stdout
        });
      }
      case 'share':
        return await shareCommand({
          cwd,
          serverUrl,
          stdout,
          stderr
        });
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export {
  anchorStatuses,
  workflowStatuses
};
