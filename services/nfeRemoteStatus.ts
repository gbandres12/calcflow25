import { NfeStatus } from '../types';

/** Cancelamento homologado / evento de cancelamento na SEFAZ. */
export const CANCEL_CSTATS = new Set([101, 135, 151, 155]);
const AUTH_CSTATS = new Set([100, 150]);

export interface RemoteNfeStatusExtras {
  event?: string;
  cancelledAt?: string | null;
}

function blobOf(raw?: string, event?: string): string {
  return `${raw || ''} ${event || ''}`.toLowerCase().trim();
}

export function looksCancelled(
  raw?: string,
  cStat?: number,
  extras?: RemoteNfeStatusExtras
): boolean {
  if (cStat != null && CANCEL_CSTATS.has(Number(cStat))) return true;
  if (extras?.cancelledAt) return true;
  const blob = blobOf(raw, extras?.event);
  if (!blob) return false;
  if (/cancel\w*.*(process|pend|queue)|process\w*.*cancel/.test(blob)) return false;
  return /(cancelad[ao]|cancelled|canceled|invoice\.cancel|nfe\.cancel|nfce\.cancel)/.test(blob);
}

/**
 * Status da NotaAs/SEFAZ → ERP.
 * Cancelamento ganha de cStat 100: a consulta costuma manter o protocolo original
 * de autorização mesmo depois do evento 110111.
 */
export function mapRemoteNfeStatus(
  raw?: string,
  httpStatus?: number,
  cStat?: number,
  extras?: RemoteNfeStatusExtras
): NfeStatus {
  const s = (raw || '').toString().toLowerCase().trim();
  if (looksCancelled(raw, cStat, extras)) return 'cancelada';
  if (cStat != null && AUTH_CSTATS.has(Number(cStat))) return 'autorizada';
  if (['autorizada', 'issued', 'authorized', 'autorizado', 'autorizado_uso'].includes(s)) return 'autorizada';
  if (['rejeitada', 'rejected', 'erro', 'error', 'erro_autorizacao', 'inutilized', 'inutilizada'].includes(s)) {
    return 'rejeitada';
  }
  if (
    ['processando', 'processando_autorizacao', 'processing', 'pendente', 'pending', 'queued'].includes(s)
    || httpStatus === 202
  ) {
    return 'processando';
  }
  return 'rejeitada';
}

/** Evita a consulta antiga reabrir uma nota que o ERP já marcou cancelada. */
export function preferCancelledStatus(local?: NfeStatus | string, remote?: NfeStatus | string): NfeStatus | undefined {
  if (local === 'cancelada') return 'cancelada';
  if (remote && remote !== 'nao_emitida') return remote as NfeStatus;
  return (local || remote) as NfeStatus | undefined;
}
