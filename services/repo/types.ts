export type FeatureFlagMode = 'legacy' | 'shadow' | 'new' | 'retired';

export interface ModuleModeConfig {
  companyId: string;
  module: string;
  mode: FeatureFlagMode;
  minClientVersion?: string;
}
