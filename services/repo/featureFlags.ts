import { getSupabase } from '../supabaseClient';
import type { FeatureFlagMode } from './types';

const modeCache = new Map<string, { mode: FeatureFlagMode; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minuto de cache local

/**
 * Consulta o modo atual do módulo para a empresa.
 * Se a consulta falhar ou não houver configuração, devolve 'legacy' com segurança absoluta.
 */
export async function getModuleMode(companyId: string, module: string): Promise<FeatureFlagMode> {
  const cacheKey = `${companyId}:${module}`;
  const cached = modeCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.mode;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return 'legacy';
  }

  try {
    const { data, error } = await supabase
      .schema('erp')
      .from('feature_flags')
      .select('mode')
      .eq('company_id', companyId)
      .eq('module', module)
      .maybeSingle();

    if (error || !data?.mode) {
      // Fallback seguro para legacy
      modeCache.set(cacheKey, { mode: 'legacy', expiresAt: now + CACHE_TTL_MS });
      return 'legacy';
    }

    const mode = data.mode as FeatureFlagMode;
    modeCache.set(cacheKey, { mode, expiresAt: now + CACHE_TTL_MS });
    return mode;
  } catch {
    return 'legacy';
  }
}

export function clearModuleModeCache() {
  modeCache.clear();
}
