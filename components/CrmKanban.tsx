import React, { useMemo, useState } from 'react';
import {
  Building2, CalendarClock, ExternalLink, FileText, MapPin, MessageSquarePlus, Pencil, Phone, Plus, Search,
  Sprout, Trash2, Trophy, UserRound, Weight, X
} from 'lucide-react';
import { CrmLead, CrmNote, CrmOrderType, CrmPriority, CrmStage, Customer, InventoryItem, User } from '../types';
import { useConfirm } from './ui/ConfirmDialog';
import { newId } from '../services/ids';
import { findMatchingCustomer, suggestProductForLead } from '../services/domain/crmConversion';
import { sellableInventoryItems } from '../utils/salesOrderProduct';

export type CrmLeadInput = Omit<CrmLead, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>;

export interface CrmBranchOption { id: string; name: string }
export interface CrmConvertOptions { customerId?: string; productId: string; quantity: number; unitPrice: number }

interface CrmKanbanProps {
  leads: CrmLead[];
  currentUserName?: string;
  onAdd: (data: CrmLeadInput) => CrmLead;
  onUpdate: (data: CrmLead) => void;
  onDelete: (id: string) => void;
  customers: Customer[];
  inventory: InventoryItem[];
  users: User[];
  branches: CrmBranchOption[];
  activeCompanyId: string;
  onConvert: (lead: CrmLead, opts: CrmConvertOptions) => { ok: boolean; error?: string; reference?: string };
  onOpenQuotes: () => void;
}

export const CRM_STAGES: Array<{ id: CrmStage; label: string; accent: string }> = [
  { id: 'NOVO', label: 'Novo produtor', accent: 'bg-slate-400' },
  { id: 'CONTATO', label: 'Primeiro contato', accent: 'bg-sky-500' },
  { id: 'VISITA', label: 'Visita à fazenda', accent: 'bg-indigo-500' },
  { id: 'PROPOSTA', label: 'Proposta enviada', accent: 'bg-amber-500' },
  { id: 'NEGOCIACAO', label: 'Negociação', accent: 'bg-orange-500' },
  { id: 'GANHO', label: 'Pedido fechado', accent: 'bg-emerald-600' },
  { id: 'PERDIDO', label: 'Perdido', accent: 'bg-rose-500' }
];

export const ORDER_TYPE_LABEL: Record<CrmOrderType, string> = {
  CALCARIO_DOLOMITICO: 'Calcário dolomítico',
  CALCARIO_CALCITICO: 'Calcário calcítico',
  CALCARIO_FILLER: 'Calcário filler',
  GESSO_AGRICOLA: 'Gesso agrícola',
  BRITA: 'Brita',
  FRETE: 'Frete / entrega',
  OUTRO: 'Outro'
};

const PRIORITY_STYLE: Record<CrmPriority, string> = {
  BAIXA: 'bg-slate-100 text-slate-600',
  MEDIA: 'bg-amber-50 text-amber-800',
  ALTA: 'bg-rose-50 text-rose-700'
};

const CULTURAS = ['Soja', 'Milho', 'Pastagem', 'Café', 'Cana', 'Algodão', 'Feijão', 'Arroz', 'Fruticultura', 'Eucalipto'];

const EMPTY_FORM: CrmLeadInput = {
  stage: 'NOVO',
  priority: 'MEDIA',
  produtor: '',
  documento: '',
  telefone: '',
  email: '',
  fazenda: '',
  cidade: '',
  uf: 'PA',
  localizacao: '',
  areaTotalHa: undefined,
  areaPlantadaHa: undefined,
  culturas: [],
  rebanhoCabecas: undefined,
  analiseSolo: false,
  tipoPedido: 'CALCARIO_DOLOMITICO',
  quantidadeT: undefined,
  valorEstimado: undefined,
  previsaoEntrega: '',
  proximoContato: '',
  origem: '',
  responsavel: '',
  motivoPerda: '',
  observacoes: '',
  notes: []
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const toNum = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};
const fmtDate = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '');
const today = () => new Date().toISOString().slice(0, 10);

const CrmKanban: React.FC<CrmKanbanProps> = ({
  leads, currentUserName, onAdd, onUpdate, onDelete,
  customers, inventory, users, branches, activeCompanyId, onConvert, onOpenQuotes
}) => {
  const confirmDialog = useConfirm();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'TODOS' | CrmOrderType>('TODOS');
  const [branchFilter, setBranchFilter] = useState<string>('TODAS');
  const [ownerFilter, setOwnerFilter] = useState<string>('TODOS');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CrmLead | null>(null);
  const [form, setForm] = useState<CrmLeadInput>(EMPTY_FORM);
  const [newNote, setNewNote] = useState('');
  const [error, setError] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<CrmStage | null>(null);
  // Conversão (pedido fechado → cliente + orçamento)
  const [converting, setConverting] = useState<CrmLead | null>(null);
  const [conv, setConv] = useState({ customerId: '', productId: '', quantity: '', unitPrice: '' });
  const [convError, setConvError] = useState('');
  const [convDone, setConvDone] = useState<string | null>(null);

  const safeLeads = useMemo(() => (Array.isArray(leads) ? leads.filter(l => l && l.id) : []), [leads]);
  const safeCustomers = useMemo(() => (Array.isArray(customers) ? customers.filter(c => c && c.id) : []), [customers]);
  const products = useMemo(() => sellableInventoryItems(inventory), [inventory]);
  const teamNames = useMemo(() => {
    const names = new Set<string>();
    (Array.isArray(users) ? users : []).forEach(u => u?.name && u.status !== 'Inativo' && names.add(u.name));
    if (currentUserName) names.add(currentUserName);
    safeLeads.forEach(l => l.responsavel && names.add(l.responsavel));
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [users, currentUserName, safeLeads]);
  const branchName = (id?: string) => branches.find(b => b.id === id)?.name;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return safeLeads.filter(l => {
      if (typeFilter !== 'TODOS' && l.tipoPedido !== typeFilter) return false;
      if (branchFilter !== 'TODAS' && l.filialId !== branchFilter) return false;
      if (ownerFilter !== 'TODOS' && (l.responsavel || '') !== ownerFilter) return false;
      if (!q) return true;
      return [l.produtor, l.fazenda, l.cidade, l.telefone, l.documento, l.responsavel, l.filialNome, l.orderReference, ...(l.culturas || [])]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [safeLeads, search, typeFilter, branchFilter, ownerFilter]);

  const stats = useMemo(() => {
    const open = filtered.filter(l => l.stage !== 'GANHO' && l.stage !== 'PERDIDO');
    const won = filtered.filter(l => l.stage === 'GANHO');
    const closed = won.length + filtered.filter(l => l.stage === 'PERDIDO').length;
    return {
      abertos: open.length,
      pipeline: open.reduce((s, l) => s + (l.valorEstimado || 0), 0),
      toneladas: open.reduce((s, l) => s + (l.quantidadeT || 0), 0),
      conversao: closed ? Math.round((won.length / closed) * 100) : 0
    };
  }, [filtered]);

  const openNew = (stage: CrmStage = 'NOVO') => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      stage: stage === 'GANHO' ? 'NEGOCIACAO' : stage,
      responsavel: currentUserName || '',
      responsavelId: (users || []).find(u => u?.name === currentUserName)?.id,
      filialId: activeCompanyId,
      filialNome: branchName(activeCompanyId)
    });
    setNewNote('');
    setError('');
    setShowForm(true);
  };

  const openEdit = (lead: CrmLead) => {
    setEditing(lead);
    setForm({ ...EMPTY_FORM, ...lead, culturas: lead.culturas || [], notes: lead.notes || [] });
    setNewNote('');
    setError('');
    setShowForm(true);
  };

  const set = <K extends keyof CrmLeadInput>(key: K, value: CrmLeadInput[K]) => setForm(f => ({ ...f, [key]: value }));

  const toggleCultura = (c: string) =>
    set('culturas', (form.culturas || []).includes(c) ? (form.culturas || []).filter(x => x !== c) : [...(form.culturas || []), c]);

  const addNote = () => {
    const text = newNote.trim();
    if (!text) return;
    const note: CrmNote = { id: newId('note'), text, createdAt: new Date().toISOString(), authorName: currentUserName };
    set('notes', [note, ...(form.notes || [])]);
    setNewNote('');
  };

  const openConvert = (lead: CrmLead) => {
    const match = findMatchingCustomer(lead, safeCustomers);
    const product = suggestProductForLead(lead, inventory);
    const qty = lead.quantidadeT || 0;
    const price = qty && lead.valorEstimado ? lead.valorEstimado / qty : Number(product?.unitPrice) || 0;
    setConv({
      customerId: match?.id || '',
      productId: String(product?.id || ''),
      quantity: qty ? String(qty) : '',
      unitPrice: price ? String(Math.round(price * 100) / 100) : ''
    });
    setConvError('');
    setConvDone(null);
    setConverting(lead);
  };

  const confirmConvert = () => {
    if (!converting) return;
    const quantity = toNum(conv.quantity) || 0;
    const unitPrice = toNum(conv.unitPrice) || 0;
    if (!conv.productId) return setConvError('Selecione o produto.');
    if (quantity <= 0 || unitPrice <= 0) return setConvError('Informe quantidade e preço maiores que zero.');
    const result = onConvert(converting, { customerId: conv.customerId || undefined, productId: conv.productId, quantity, unitPrice });
    if (!result.ok) return setConvError(result.error || 'Não foi possível gerar o orçamento.');
    setConvDone(result.reference || 'gerado');
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const produtor = form.produtor.trim();
    if (produtor.length < 2) return setError('Informe o nome do produtor.');
    if (form.stage === 'PERDIDO' && !String(form.motivoPerda || '').trim()) return setError('Informe o motivo da perda.');
    let notes = form.notes || [];
    if (newNote.trim()) {
      notes = [{ id: newId('note'), text: newNote.trim(), createdAt: new Date().toISOString(), authorName: currentUserName }, ...notes];
    }
    const data: CrmLeadInput = {
      ...form,
      produtor,
      documento: String(form.documento || '').replace(/\D/g, ''),
      uf: String(form.uf || '').toUpperCase().slice(0, 2),
      notes
    };
    const wantsConversion = data.stage === 'GANHO' && !data.orderId;
    const saved = editing ? { ...editing, ...data } : onAdd(data);
    if (editing) onUpdate(saved);
    setShowForm(false);
    if (wantsConversion) openConvert(saved);
  };

  const moveTo = async (lead: CrmLead, stage: CrmStage) => {
    if (lead.stage === stage) return;
    if (stage === 'PERDIDO' && !lead.motivoPerda) {
      openEdit({ ...lead, stage });
      setError('Informe o motivo da perda e salve.');
      return;
    }
    if (stage === 'GANHO' && !lead.orderId) {
      openConvert(lead);
      return;
    }
    const note: CrmNote = {
      id: newId('note'),
      text: `Movido para "${CRM_STAGES.find(s => s.id === stage)?.label}"`,
      createdAt: new Date().toISOString(),
      authorName: currentUserName
    };
    onUpdate({ ...lead, stage, notes: [note, ...(lead.notes || [])] });
  };

  const requestDelete = async (lead: CrmLead) => {
    if (await confirmDialog({ title: `Excluir ${lead.produtor}?`, description: 'O card sai do funil com todo o histórico.', confirmLabel: 'Excluir', danger: true })) {
      onDelete(lead.id);
      setShowForm(false);
    }
  };

  const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
  const labelClass = 'mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500';
  const sectionClass = 'rounded-2xl border border-slate-200 p-4';
  const sectionTitle = 'mb-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-700';

  const summary = [
    { label: 'Negócios abertos', value: String(stats.abertos), Icon: Sprout },
    { label: 'Pipeline (R$)', value: brl(stats.pipeline), Icon: Trophy },
    { label: 'Toneladas em aberto', value: `${num(stats.toneladas)} t`, Icon: Weight },
    { label: 'Taxa de conversão', value: `${stats.conversao}%`, Icon: CalendarClock }
  ];

  return (
    <div className="space-y-5 pb-24 lg:pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Comercial</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">CRM de Produtores</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Acompanhe cada produtor, os dados da fazenda e o pedido do primeiro contato até o fechamento. Arraste os cards entre as etapas.
          </p>
        </div>
        <button type="button" onClick={() => openNew()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-100 hover:bg-emerald-800 sm:w-auto">
          <Plus size={16} /> Novo produtor
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
            <Icon size={17} className="mb-2 text-emerald-700" />
            <p className="text-xl font-black text-slate-900">{value}</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produtor, fazenda, cidade, cultura, telefone..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-emerald-600" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none">
          <option value="TODOS">Todos os tipos de pedido</option>
          {Object.entries(ORDER_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {branches.length > 1 && (
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} aria-label="Filial" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none">
            <option value="TODAS">Todas as filiais</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} aria-label="Responsável" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none">
          <option value="TODOS">Todos os responsáveis</option>
          {teamNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="-mx-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-3">
          {CRM_STAGES.map(stage => {
            const items = filtered.filter(l => l.stage === stage.id);
            const total = items.reduce((s, l) => s + (l.valorEstimado || 0), 0);
            const tons = items.reduce((s, l) => s + (l.quantidadeT || 0), 0);
            return (
              <section
                key={stage.id}
                onDragOver={e => { e.preventDefault(); setOverStage(stage.id); }}
                onDragLeave={() => setOverStage(s => (s === stage.id ? null : s))}
                onDrop={e => {
                  e.preventDefault();
                  const lead = safeLeads.find(l => l.id === (dragId || e.dataTransfer.getData('text/plain')));
                  if (lead) moveTo(lead, stage.id);
                  setDragId(null);
                  setOverStage(null);
                }}
                className={`flex w-72 flex-col rounded-3xl border bg-slate-50 transition ${overStage === stage.id ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'}`}
              >
                <header className="border-b border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${stage.accent}`} />
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">{stage.label}</h3>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-slate-500">{items.length}</span>
                    </div>
                    <button type="button" onClick={() => openNew(stage.id)} aria-label={`Novo em ${stage.label}`} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-emerald-700"><Plus size={15} /></button>
                  </div>
                  <p className="mt-1 text-[11px] font-bold text-slate-500">{brl(total)} · {num(tons)} t</p>
                </header>
                <div className="flex min-h-[200px] flex-1 flex-col gap-2 p-2">
                  {items.map(lead => {
                    const overdue = lead.proximoContato && lead.proximoContato.slice(0, 10) < today() && stage.id !== 'GANHO' && stage.id !== 'PERDIDO';
                    return (
                      <article
                        key={lead.id}
                        draggable
                        onDragStart={e => { setDragId(lead.id); e.dataTransfer.setData('text/plain', lead.id); }}
                        onDragEnd={() => { setDragId(null); setOverStage(null); }}
                        onClick={() => openEdit(lead)}
                        className={`cursor-grab rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:border-emerald-300 active:cursor-grabbing ${dragId === lead.id ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{lead.produtor}</p>
                            {lead.fazenda && <p className="truncate text-xs font-semibold text-slate-500">{lead.fazenda}</p>}
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${PRIORITY_STYLE[lead.priority]}`}>{lead.priority}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-800">{ORDER_TYPE_LABEL[lead.tipoPedido]}</span>
                          {(lead.culturas || []).slice(0, 2).map(c => <span key={c} className="rounded-full bg-lime-50 px-2 py-0.5 text-[10px] font-bold text-lime-800">{c}</span>)}
                        </div>
                        <div className="mt-2 space-y-0.5 text-[11px] font-semibold text-slate-500">
                          {(lead.cidade || lead.areaTotalHa) && (
                            <p className="flex items-center gap-1"><MapPin size={11} />{[lead.cidade && `${lead.cidade}${lead.uf ? `/${lead.uf}` : ''}`, lead.areaTotalHa && `${num(lead.areaTotalHa)} ha`].filter(Boolean).join(' · ')}</p>
                          )}
                          {lead.telefone && <p className="flex items-center gap-1"><Phone size={11} />{lead.telefone}</p>}
                          {(lead.responsavel || lead.filialId) && (
                            <p className="flex items-center gap-1"><UserRound size={11} />{[lead.responsavel, branches.length > 1 ? (branchName(lead.filialId) || lead.filialNome) : ''].filter(Boolean).join(' · ')}</p>
                          )}
                          {lead.proximoContato && (
                            <p className={`flex items-center gap-1 ${overdue ? 'font-black text-rose-600' : ''}`}><CalendarClock size={11} />Retorno {fmtDate(lead.proximoContato)}</p>
                          )}
                        </div>
                        {(lead.quantidadeT || lead.valorEstimado) && (
                          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs font-black text-slate-800">
                            <span>{lead.quantidadeT ? `${num(lead.quantidadeT)} t` : ''}</span>
                            <span>{lead.valorEstimado ? brl(lead.valorEstimado) : ''}</span>
                          </div>
                        )}
                        <select
                          value={lead.stage}
                          onClick={e => e.stopPropagation()}
                          onChange={e => moveTo(lead, e.target.value as CrmStage)}
                          aria-label="Mover etapa"
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600 outline-none md:hidden"
                        >
                          {CRM_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </article>
                    );
                  })}
                  {items.length === 0 && <p className="py-6 text-center text-[11px] font-semibold text-slate-400">Arraste um card para cá</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
          <form onSubmit={save} className="flex max-h-[95vh] w-full max-w-3xl flex-col rounded-t-3xl bg-white sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">CRM</p>
                <h3 className="text-lg font-black text-slate-900">{editing ? 'Editar produtor' : 'Novo produtor'}</h3>
              </div>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Fechar" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}

              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className={labelClass}>Etapa</label>
                  <select value={form.stage} onChange={e => set('stage', e.target.value as CrmStage)} className={fieldClass}>
                    {CRM_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select></div>
                <div><label className={labelClass}>Prioridade</label>
                  <select value={form.priority} onChange={e => set('priority', e.target.value as CrmPriority)} className={fieldClass}>
                    <option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option>
                  </select></div>
                <div><label className={labelClass}>Responsável</label>
                  <input value={form.responsavel || ''} onChange={e => set('responsavel', e.target.value)} className={fieldClass} /></div>
              </div>

              <div className={sectionClass}>
                <p className={sectionTitle}>Produtor</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label className={labelClass}>Nome do produtor *</label>
                    <input autoFocus value={form.produtor} onChange={e => set('produtor', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>CPF / CNPJ</label>
                    <input value={form.documento || ''} onChange={e => set('documento', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>Telefone / WhatsApp</label>
                    <input value={form.telefone || ''} onChange={e => set('telefone', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>E-mail</label>
                    <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>Origem do contato</label>
                    <input value={form.origem || ''} onChange={e => set('origem', e.target.value)} placeholder="Indicação, feira, WhatsApp..." className={fieldClass} /></div>
                </div>
              </div>

              <div className={sectionClass}>
                <p className={sectionTitle}>Fazenda</p>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-2"><label className={labelClass}>Nome da fazenda</label>
                    <input value={form.fazenda || ''} onChange={e => set('fazenda', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>Cidade</label>
                    <input value={form.cidade || ''} onChange={e => set('cidade', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>UF</label>
                    <input value={form.uf || ''} maxLength={2} onChange={e => set('uf', e.target.value.toUpperCase())} className={fieldClass} /></div>
                  <div className="sm:col-span-4"><label className={labelClass}>Localização / acesso</label>
                    <input value={form.localizacao || ''} onChange={e => set('localizacao', e.target.value)} placeholder="Estrada, km, coordenadas ou link do mapa" className={fieldClass} /></div>
                  <div><label className={labelClass}>Área total (ha)</label>
                    <input inputMode="decimal" value={form.areaTotalHa ?? ''} onChange={e => set('areaTotalHa', toNum(e.target.value))} className={fieldClass} /></div>
                  <div><label className={labelClass}>Área plantada (ha)</label>
                    <input inputMode="decimal" value={form.areaPlantadaHa ?? ''} onChange={e => set('areaPlantadaHa', toNum(e.target.value))} className={fieldClass} /></div>
                  <div><label className={labelClass}>Rebanho (cab.)</label>
                    <input inputMode="numeric" value={form.rebanhoCabecas ?? ''} onChange={e => set('rebanhoCabecas', toNum(e.target.value))} className={fieldClass} /></div>
                  <label className="flex items-end gap-2 pb-2.5 text-sm font-bold text-slate-700">
                    <input type="checkbox" checked={!!form.analiseSolo} onChange={e => set('analiseSolo', e.target.checked)} className="h-4 w-4 accent-emerald-700" />
                    Tem análise de solo
                  </label>
                  <div className="sm:col-span-4"><label className={labelClass}>Culturas</label>
                    <div className="flex flex-wrap gap-1.5">
                      {CULTURAS.map(c => {
                        const on = (form.culturas || []).includes(c);
                        return <button key={c} type="button" onClick={() => toggleCultura(c)} className={`rounded-full border px-3 py-1 text-xs font-bold ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'}`}>{c}</button>;
                      })}
                    </div></div>
                </div>
              </div>

              <div className={sectionClass}>
                <p className={sectionTitle}>Pedido</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><label className={labelClass}>Tipo de pedido</label>
                    <select value={form.tipoPedido} onChange={e => set('tipoPedido', e.target.value as CrmOrderType)} className={fieldClass}>
                      {Object.entries(ORDER_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select></div>
                  <div><label className={labelClass}>Quantidade (t)</label>
                    <input inputMode="decimal" value={form.quantidadeT ?? ''} onChange={e => set('quantidadeT', toNum(e.target.value))} className={fieldClass} /></div>
                  <div><label className={labelClass}>Valor estimado (R$)</label>
                    <input inputMode="decimal" value={form.valorEstimado ?? ''} onChange={e => set('valorEstimado', toNum(e.target.value))} className={fieldClass} /></div>
                  <div><label className={labelClass}>Previsão de entrega</label>
                    <input type="date" value={form.previsaoEntrega || ''} onChange={e => set('previsaoEntrega', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>Próximo contato</label>
                    <input type="date" value={form.proximoContato || ''} onChange={e => set('proximoContato', e.target.value)} className={fieldClass} /></div>
                  {form.stage === 'PERDIDO' && (
                    <div><label className={labelClass}>Motivo da perda *</label>
                      <input value={form.motivoPerda || ''} onChange={e => set('motivoPerda', e.target.value)} placeholder="Preço, frete, concorrente..." className={fieldClass} /></div>
                  )}
                  <div className="sm:col-span-3"><label className={labelClass}>Observações</label>
                    <textarea rows={2} value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value)} className={fieldClass} /></div>
                </div>
              </div>

              <div className={sectionClass}>
                <p className={sectionTitle}>Histórico</p>
                <div className="flex gap-2">
                  <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }} placeholder="Registrar ligação, visita, combinado..." className={fieldClass} />
                  <button type="button" onClick={addNote} aria-label="Adicionar anotação" className="rounded-xl bg-slate-900 px-3 text-white hover:bg-slate-700"><MessageSquarePlus size={16} /></button>
                </div>
                <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {(form.notes || []).map(n => (
                    <li key={n.id} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-sm text-slate-700">{n.text}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase text-slate-400">{new Date(n.createdAt).toLocaleString('pt-BR')}{n.authorName ? ` · ${n.authorName}` : ''}</p>
                    </li>
                  ))}
                  {(form.notes || []).length === 0 && <li className="text-xs text-slate-400">Nenhuma anotação ainda.</li>}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-4">
              {editing ? (
                <button type="button" onClick={() => requestDelete(editing)} className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-black uppercase text-rose-600 hover:bg-rose-50"><Trash2 size={14} /> Excluir</button>
              ) : <span />}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-xl px-4 py-2.5 text-xs font-black uppercase text-slate-600 hover:bg-slate-100">Cancelar</button>
                <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-black uppercase text-white hover:bg-emerald-800"><Pencil size={14} /> Salvar</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CrmKanban;
