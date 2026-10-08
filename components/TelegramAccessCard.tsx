import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, MessageCircle, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { getSupabase } from '../services/supabaseClient';
import { useConfirm } from './ui/ConfirmDialog';

interface TelegramLinkView {
  chatId: string;
  displayName?: string;
  role: string;
  createdAt?: string;
  lastSeenAt?: string;
}

interface PairingCode {
  code: string;
  expiresAt: string;
  deepLink?: string | null;
  botUsername?: string | null;
}

interface ReconciliationIssue {
  reference: string;
  receiptsTotal: number;
  paymentsTotal: number;
  difference: number;
}

interface Reconciliation {
  pedidosConferidos: number;
  lancamentosPeloTelegram: number;
  divergencias: ReconciliationIssue[];
}

const formatBRL = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function authorizedFetch(input: string, init: RequestInit = {}) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Entre novamente para conectar o Telegram.');

  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Falha ao falar com o servidor.');
  return payload;
}

export const TelegramAccessCard: React.FC = () => {
  const confirmDialog = useConfirm();
  const [links, setLinks] = useState<TelegramLinkView[]>([]);
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [audit, setAudit] = useState<Reconciliation | null>(null);
  const [auditing, setAuditing] = useState(false);

  const loadLinks = useCallback(async () => {
    try {
      setError(null);
      const payload = await authorizedFetch('/api/telegram/pair');
      setLinks(payload.links || []);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os chats vinculados.');
    } finally {
      setLoading(false);
    }
  }, []);

  const runReconciliation = async () => {
    setAuditing(true);
    setError(null);
    try {
      setAudit(await authorizedFetch('/api/telegram/conferir'));
    } catch (err: any) {
      setError(err?.message || 'Não foi possível conferir os lançamentos.');
    } finally {
      setAuditing(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const generateCode = async () => {
    setGenerating(true);
    setError(null);
    setCopied(false);
    try {
      const payload = await authorizedFetch('/api/telegram/pair', { method: 'POST' });
      setPairing(payload);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível gerar o código.');
    } finally {
      setGenerating(false);
    }
  };

  const revoke = async (chatId: string) => {
    if (!(await confirmDialog({ title: 'Desconectar este Telegram?', description: 'O chat perde o acesso ao ERP até ser pareado de novo.', confirmLabel: 'Desconectar', danger: true }))) return;
    try {
      await authorizedFetch('/api/telegram/pair', {
        method: 'DELETE',
        body: JSON.stringify({ chatId })
      });
      await loadLinks();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível revogar o acesso.');
    }
  };

  const copyCommand = async () => {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(`/vincular ${pairing.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copie o código manualmente.');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[2rem] p-6 md:p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl">
            <MessageCircle size={22} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 tracking-tight">Conectar Telegram</h3>
            <p className="text-xs text-slate-500 font-medium">
              Assessor no celular: consulta saldo, faz pedido, emite NF-e e registra abatimentos por texto, áudio ou foto.
            </p>
          </div>
        </div>
        <button
          onClick={loadLinks}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          title="Atualizar lista"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl text-xs font-semibold">
          {error}
        </div>
      )}

      {pairing ? (
        <div className="mb-6 p-5 bg-slate-900 text-white rounded-[1.5rem]">
          <p className="text-[11px] uppercase tracking-widest font-black text-slate-400 mb-2">
            Mande esta mensagem para o bot
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="text-2xl font-black tracking-[0.2em] text-emerald-300">/vincular {pairing.code}</code>
            <button
              onClick={copyCommand}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            {pairing.deepLink && (
              <a
                href={pairing.deepLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-sky-500 hover:bg-sky-400 rounded-xl text-xs font-bold transition-colors"
              >
                <Link2 size={14} />
                Abrir no Telegram
              </a>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500 font-medium">
            O código vale por 10 minutos e só pode ser usado uma vez.
            {pairing.botUsername ? ` Bot: @${pairing.botUsername}.` : ' Defina TELEGRAM_BOT_USERNAME para mostrar o link direto.'}
          </p>
        </div>
      ) : (
        <button
          onClick={generateCode}
          disabled={generating}
          className="w-full mb-6 flex items-center justify-center gap-2 p-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-2xl font-black text-sm transition-colors"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {generating ? 'Gerando...' : 'Gerar código de pareamento'}
        </button>
      )}

      <div>
        <p className="text-[11px] uppercase tracking-widest font-black text-slate-400 mb-3">Chats conectados</p>
        {loading ? (
          <p className="text-xs text-slate-400 font-medium">Carregando...</p>
        ) : links.length === 0 ? (
          <p className="text-xs text-slate-400 font-medium">Nenhum Telegram conectado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => (
              <li
                key={link.chatId}
                className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800">{link.displayName || 'Usuário'}</p>
                  <p className="text-xs text-slate-500 font-medium">
                    {link.role} · chat {link.chatId}
                    {link.lastSeenAt ? ` · visto em ${new Date(link.lastSeenAt).toLocaleDateString('pt-BR')}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => revoke(link.chatId)}
                  className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                  title="Revogar acesso"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-black text-slate-500">Conferência</p>
            <p className="text-xs text-slate-500 font-medium">
              Compara, por pedido, a soma dos recibos com a soma das baixas no financeiro.
            </p>
          </div>
          <button
            onClick={runReconciliation}
            disabled={auditing}
            className="shrink-0 px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 rounded-xl text-xs font-black transition-colors"
          >
            {auditing ? 'Conferindo...' : 'Conferir agora'}
          </button>
        </div>

        {audit && (
          <div
            className={`p-4 rounded-2xl border text-xs font-semibold ${
              audit.divergencias.length
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {audit.divergencias.length === 0 ? (
              <p>
                Tudo batendo em {audit.pedidosConferidos} pedido(s). Lançamentos feitos pelo Telegram:{' '}
                {audit.lancamentosPeloTelegram}.
              </p>
            ) : (
              <>
                <p className="mb-2">{audit.divergencias.length} pedido(s) com diferença:</p>
                <ul className="space-y-1">
                  {audit.divergencias.slice(0, 8).map((issue) => (
                    <li key={issue.reference}>
                      {issue.reference}: recibos {formatBRL(issue.receiptsTotal)} × baixas{' '}
                      {formatBRL(issue.paymentsTotal)} (diferença {formatBRL(issue.difference)})
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TelegramAccessCard;
