import type { Reviewer, Workspace } from './types.ts';

// Representative workspace used until a real backend workspace API exists.
// Mirrors the example artifact bundle described in the Notion spec
// (spec.html and its 1st–3rd degree relations, plus three reviewers).

const MO: Reviewer = { initials: 'MO', name: 'Mori', bg: '#ecddf6', fg: '#8a5ba8' };
const DR: Reviewer = { initials: 'DR', name: 'Drew', bg: '#d6e8f5', fg: '#2f76a0' };
const LW: Reviewer = { initials: 'LW', name: 'Lin', bg: '#d7ecd9', fg: '#3f7d57' };

export const mockWorkspace: Workspace = {
  name: 'new-saas-prd',
  nodes: [
    {
      id: 'spec',
      label: 'Product spec',
      file: 'spec.html',
      type: 'spec',
      summary: 'MVP spec for the new SaaS onboarding and team invitation flow.',
      checksPassed: 3,
      checksTotal: 3
    },
    {
      id: 'onboarding',
      label: 'Onboarding',
      file: 'onboarding.html',
      type: 'spec',
      summary: 'First-run onboarding screens and the invite modal.',
      checksPassed: 2,
      checksTotal: 3
    },
    {
      id: 'user-flow',
      label: 'User flow',
      file: 'user-flow.mmd',
      type: 'diagram',
      summary: 'End-to-end signup → workspace → invite flow diagram.',
      checksPassed: 1,
      checksTotal: 1
    },
    {
      id: 'pricing',
      label: 'Pricing',
      file: 'pricing.md',
      type: 'notes',
      summary: 'Free vs. Pro plan matrix and seat limits.',
      checksPassed: 2,
      checksTotal: 2
    },
    {
      id: 'api',
      label: 'API',
      file: 'api.md',
      type: 'notes',
      summary: 'REST contract for workspaces, invitations, and billing.',
      checksPassed: 4,
      checksTotal: 5
    },
    {
      id: 'billing',
      label: 'Billing',
      file: 'billing.md',
      type: 'notes',
      summary: 'Plan gating and upgrade paths.',
      checksPassed: 1,
      checksTotal: 2
    },
    {
      id: 'rate-limit',
      label: 'Rate limits',
      file: 'rate-limit.md',
      type: 'notes',
      summary: 'Throttling policy for POST /invitations and auth endpoints.',
      checksPassed: 1,
      checksTotal: 1
    },
    {
      id: 'launch-plan',
      label: 'Launch plan',
      file: 'launch-plan.md',
      type: 'plan',
      summary: 'Phased rollout and go-to-market checklist.',
      checksPassed: 2,
      checksTotal: 4
    },
    {
      id: 'metrics',
      label: 'Metrics',
      file: 'metrics.md',
      type: 'report',
      summary: 'Activation and invite-conversion targets for the launch.',
      checksPassed: 1,
      checksTotal: 1
    }
  ],
  links: [
    { source: 'spec', target: 'onboarding' },
    { source: 'spec', target: 'user-flow' },
    { source: 'spec', target: 'pricing' },
    { source: 'spec', target: 'api' },
    { source: 'onboarding', target: 'user-flow' },
    { source: 'pricing', target: 'billing' },
    { source: 'api', target: 'billing' },
    { source: 'api', target: 'rate-limit' },
    { source: 'launch-plan', target: 'spec' },
    { source: 'launch-plan', target: 'metrics' },
    { source: 'metrics', target: 'pricing' }
  ],
  comments: [
    {
      id: 'cmt_001',
      artifactId: 'spec',
      reviewer: MO,
      text: 'Gate invitation behind the Pro plan',
      fixInstruction: true,
      resolved: false
    },
    {
      id: 'cmt_002',
      artifactId: 'onboarding',
      reviewer: DR,
      text: '“Start trial” → “Create workspace”',
      fixInstruction: true,
      resolved: false
    },
    {
      id: 'cmt_003',
      artifactId: 'api',
      reviewer: LW,
      text: 'Confirm rate limit on POST /invitations',
      fixInstruction: false,
      resolved: false
    },
    {
      id: 'cmt_004',
      artifactId: 'pricing',
      reviewer: MO,
      text: 'Free plan should show an upsell, not the invite step',
      fixInstruction: false,
      resolved: true
    }
  ]
};
