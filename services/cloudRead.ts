export type CloudReadDecision =
  | 'use-remote'
  | 'keep-local-unauthenticated'
  | 'empty-authenticated'
  | 'seed-demo';

export function decideEmptyCloudRead(input: {
  isDemo: boolean;
  hasAuthUser: boolean;
  remoteRowCount: number;
}): CloudReadDecision {
  if (input.remoteRowCount > 0) return 'use-remote';
  if (input.isDemo) return 'seed-demo';
  if (!input.hasAuthUser) return 'keep-local-unauthenticated';
  return 'empty-authenticated';
}
