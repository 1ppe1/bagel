// Domain model for the workspace graph home screen.
//
// This mirrors the Notion design spec: artifacts are force nodes whose color
// encodes their type and whose size encodes connection degree. Reviewer
// comments orbit their parent artifact as avatar satellites.
//
// The shape is intentionally close to what a future backend workspace API
// could return, so the mock data source can later be swapped for real data.

export type ArtifactType = 'spec' | 'plan' | 'report' | 'diagram' | 'notes';

export type ArtifactNode = {
  id: string;
  /** Display name shown under the node. */
  label: string;
  /** Underlying file, e.g. `spec.html`. */
  file: string;
  type: ArtifactType;
  /** Short one-line summary shown in the inspector. */
  summary: string;
  /** Number of automated checks that currently pass. */
  checksPassed: number;
  checksTotal: number;
  /** Link to the artifact's review (`/r/<token>`), when one exists. */
  reviewUrl?: string;
};

export type ArtifactLink = {
  source: string;
  target: string;
};

export type Reviewer = {
  /** Two-letter initials used for the avatar. */
  initials: string;
  name: string;
  /** Avatar background color. */
  bg: string;
  /** Avatar foreground (text) color. */
  fg: string;
};

export type CommentSatellite = {
  id: string;
  /** Artifact this comment is attached to. */
  artifactId: string;
  reviewer: Reviewer;
  text: string;
  /** A plain comment vs. an instruction handed to the local AI. */
  fixInstruction: boolean;
  resolved: boolean;
};

export type Workspace = {
  name: string;
  nodes: ArtifactNode[];
  links: ArtifactLink[];
  comments: CommentSatellite[];
};

// Node type -> flat brand color, per the Notion design system.
export const TYPE_COLORS: Record<ArtifactType, string> = {
  spec: '#2383e2',
  plan: '#9065b0',
  report: '#448361',
  diagram: '#2f9e8f',
  notes: '#9b9a97'
};

export const TYPE_LABELS: Record<ArtifactType, string> = {
  spec: 'Spec',
  plan: 'Plan / Compare',
  report: 'Report',
  diagram: 'Diagram',
  notes: 'Notes'
};
