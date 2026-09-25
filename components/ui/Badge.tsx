import React from 'react';

export type OrderBadgeStatus = 'aberto' | 'carregando' | 'faturado' | 'cancelado';
export type NfeBadgeStatus = 'rascunho' | 'autorizada' | 'rejeitada' | 'cancelada';
export type BadgeStatus = OrderBadgeStatus | NfeBadgeStatus;

const tone: Record<BadgeStatus, string> = {
  aberto: 'bg-[var(--cf-sand-soft)] text-[var(--cf-ink)]',
  carregando: 'bg-[var(--cf-forest-soft)] text-[var(--cf-forest)]',
  faturado: 'bg-[var(--cf-forest)] text-white',
  cancelado: 'bg-rose-100 text-rose-800',
  rascunho: 'bg-[var(--cf-cream)] text-[var(--cf-ink-soft)] border border-[var(--cf-line)]',
  autorizada: 'bg-[var(--cf-forest)] text-white',
  rejeitada: 'bg-rose-100 text-rose-800',
  cancelada: 'bg-rose-100 text-rose-800',
};

const label: Record<BadgeStatus, string> = {
  aberto: 'Aberto',
  carregando: 'Carregando',
  faturado: 'Faturado',
  cancelado: 'Cancelado',
  rascunho: 'Rascunho',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
};

interface BadgeProps {
  status: BadgeStatus;
}

export const Badge: React.FC<BadgeProps> = ({ status }) => (
  <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${tone[status]}`}>
    {label[status]}
  </span>
);
