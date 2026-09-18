import React, { useMemo, useState } from 'react';
import {
  BadgeCheck, CircleAlert, IdCard, MapPin, Pencil, Phone, Plus,
  Search, Truck, Trash2, UserRound, X
} from 'lucide-react';
import { Transportador, TransportadorContratacao, TransportadorTipoServico } from '../types';

interface TransportadoresProps {
  transportadores: Transportador[];
  onAdd: (data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => Transportador;
  onUpdate: (data: Transportador) => void;
  onDelete: (id: string) => void;
}

const EMPTY_FORM: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> = {
  nome: '',
  documento: '',
  tipoServico: 'AMBOS',
  contratacao: 'AMBOS',
  telefone: '',
  email: '',
  ie: '',
  rntrc: '',
  cnh: '',
  categoriaCnh: '',
  validadeCnh: '',
  placa: '',
  ufPlaca: 'PA',
  modeloVeiculo: '',
  endereco: '',
  cidade: '',
  uf: 'PA',
  ativo: true,
  observacoes: ''
};

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const tipoLabel: Record<TransportadorTipoServico, string> = {
  INTERNO: 'Trabalha na fazenda',
  ENTREGA: 'Entrega aos clientes',
  AMBOS: 'Interno e entregas'
};

const contratacaoLabel: Record<TransportadorContratacao, string> = {
  EMPRESA: 'Contratado pela empresa',
  CLIENTE: 'Contratado pelo cliente',
  AMBOS: 'Empresa ou cliente'
};

const Transportadores: React.FC<TransportadoresProps> = ({
  transportadores,
  onAdd,
  onUpdate,
  onDelete
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'TODOS' | TransportadorTipoServico>('TODOS');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Transportador | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const safeList = useMemo(
    () => (Array.isArray(transportadores) ? transportadores.filter(t => t && t.id) : []),
    [transportadores]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return safeList.filter(t => {
      const matchFilter = filter === 'TODOS' || t.tipoServico === filter || t.tipoServico === 'AMBOS';
      if (!matchFilter) return false;
      if (!q) return true;
      return [
        t.nome, t.documento, t.telefone, t.placa, t.rntrc, t.cidade, t.modeloVeiculo
      ].some(value => String(value || '').toLowerCase().includes(q));
    });
  }, [safeList, search, filter]);

  const stats = useMemo(() => ({
    total: safeList.length,
    ativos: safeList.filter(t => t.ativo).length,
    internos: safeList.filter(t => t.tipoServico === 'INTERNO' || t.tipoServico === 'AMBOS').length,
    entregas: safeList.filter(t => t.tipoServico === 'ENTREGA' || t.tipoServico === 'AMBOS').length
  }), [safeList]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setError('');
    setShowForm(true);
  };

  const openEdit = (item: Transportador) => {
    setEditing(item);
    setForm({
      ...EMPTY_FORM,
      ...item,
      nome: item.nome || '',
      documento: item.documento || ''
    });
    setError('');
    setShowForm(true);
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const nome = form.nome.trim();
    const documento = onlyDigits(form.documento);
    if (nome.length < 2) {
      setError('Informe o nome do caminhoneiro ou a razão social da transportadora.');
      return;
    }
    if (documento && documento.length !== 11 && documento.length !== 14) {
      setError('O CPF deve ter 11 dígitos ou o CNPJ deve ter 14 dígitos.');
      return;
    }

    const normalized = {
      ...form,
      nome,
      documento,
      ie: onlyDigits(form.ie || ''),
      telefone: (form.telefone || '').trim(),
      rntrc: (form.rntrc || '').trim(),
      placa: (form.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      ufPlaca: (form.ufPlaca || '').toUpperCase(),
      uf: (form.uf || '').toUpperCase()
    };

    if (editing) {
      onUpdate({ ...editing, ...normalized, updatedAt: new Date().toISOString() });
    } else {
      onAdd(normalized);
    }
    setShowForm(false);
  };

  const requestDelete = (item: Transportador) => {
    if (window.confirm(`Excluir o cadastro de ${item.nome}? As notas já emitidas não serão alteradas.`)) {
      onDelete(item.id);
    }
  };

  const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
  const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500';
  const summaryCards: Array<{
    label: string;
    value: number;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
  }> = [
    { label: 'Cadastros', value: stats.total, Icon: Truck },
    { label: 'Ativos', value: stats.ativos, Icon: BadgeCheck },
    { label: 'Operação interna', value: stats.internos, Icon: UserRound },
    { label: 'Entregas', value: stats.entregas, Icon: MapPin }
  ];

  return (
    <div className="space-y-5 pb-24 lg:pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Logística e transporte</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Transportadores</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Cadastre caminhoneiros internos, transportadoras e motoristas de entrega para reutilizar nas notas fiscais.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-100 hover:bg-emerald-800 sm:w-auto"
        >
          <Plus size={16} /> Novo transportador
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
            <Icon size={17} className="mb-2 text-emerald-700" />
            <p className="text-xl font-black text-slate-900">{value}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-3 sm:p-5">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar nome, CPF/CNPJ, placa, telefone ou RNTRC..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-emerald-600"
            />
          </div>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as typeof filter)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 outline-none"
          >
            <option value="TODOS">Todos os serviços</option>
            <option value="INTERNO">Operação interna</option>
            <option value="ENTREGA">Entrega aos clientes</option>
            <option value="AMBOS">Interno e entregas</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center text-slate-400">
            <Truck size={42} strokeWidth={1.5} />
            <p className="mt-3 text-sm font-black text-slate-600">Nenhum transportador encontrado</p>
            <p className="mt-1 text-xs">Cadastre o primeiro transportador ou ajuste a busca.</p>
          </div>
        ) : (
          <div className="grid gap-3 pt-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(item => (
              <article key={item.id} className={`rounded-2xl border p-4 ${item.ativo ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-black text-slate-900">{item.nome}</h3>
                      {!item.ativo && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[8px] font-black uppercase text-slate-600">Inativo</span>}
                    </div>
                    <p className="mt-0.5 text-[10px] font-mono text-slate-500">{item.documento || 'CPF/CNPJ não informado'}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => openEdit(item)} aria-label={`Editar ${item.nome}`} className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"><Pencil size={14} /></button>
                    <button type="button" onClick={() => requestDelete(item)} aria-label={`Excluir ${item.nome}`} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={14} /></button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase text-emerald-800">{tipoLabel[item.tipoServico]}</span>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black uppercase text-blue-800">{contratacaoLabel[item.contratacao]}</span>
                </div>

                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  {item.telefone && <p className="flex items-center gap-2"><Phone size={12} /> {item.telefone}</p>}
                  {(item.placa || item.modeloVeiculo) && <p className="flex items-center gap-2"><Truck size={12} /> {[item.placa, item.modeloVeiculo].filter(Boolean).join(' · ')}</p>}
                  {item.rntrc && <p className="flex items-center gap-2"><IdCard size={12} /> RNTRC {item.rntrc}</p>}
                  {item.cidade && <p className="flex items-center gap-2"><MapPin size={12} /> {item.cidade}/{item.uf || '—'}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[180] flex items-stretch justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <form onSubmit={save} className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[92vh] sm:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-4 sm:p-5">
              <div>
                <h3 className="text-lg font-black text-slate-900">{editing ? 'Editar transportador' : 'Novo transportador'}</h3>
                <p className="text-xs text-slate-500">Dados operacionais, fiscais, do motorista e do veículo.</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Fechar" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
              {error && <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700"><CircleAlert size={15} /> {error}</p>}

              <section>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Identificação</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className={labelClass}>Nome / Razão social *</label><input className={fieldClass} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required /></div>
                  <div><label className={labelClass}>CPF / CNPJ</label><input className={fieldClass} inputMode="numeric" value={form.documento} onChange={e => setForm({ ...form, documento: e.target.value })} placeholder="Somente dígitos" /></div>
                  <div><label className={labelClass}>Telefone / WhatsApp</label><input className={fieldClass} inputMode="tel" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
                  <div><label className={labelClass}>E-mail</label><input className={fieldClass} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  <div><label className={labelClass}>Tipo de serviço *</label><select className={fieldClass} value={form.tipoServico} onChange={e => setForm({ ...form, tipoServico: e.target.value as TransportadorTipoServico })}><option value="INTERNO">Trabalha dentro da fazenda</option><option value="ENTREGA">Carrega e entrega aos clientes</option><option value="AMBOS">Trabalha interno e faz entregas</option></select></div>
                  <div><label className={labelClass}>Quem pode contratar *</label><select className={fieldClass} value={form.contratacao} onChange={e => setForm({ ...form, contratacao: e.target.value as TransportadorContratacao })}><option value="EMPRESA">Somente nossa empresa</option><option value="CLIENTE">Somente o cliente</option><option value="AMBOS">Empresa ou cliente</option></select></div>
                </div>
              </section>

              <section>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Documentos e veículo</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div><label className={labelClass}>RNTRC / ANTT</label><input className={fieldClass} value={form.rntrc} onChange={e => setForm({ ...form, rntrc: e.target.value })} /></div>
                  <div><label className={labelClass}>Inscrição estadual</label><input className={fieldClass} value={form.ie} onChange={e => setForm({ ...form, ie: e.target.value })} /></div>
                  <div><label className={labelClass}>CNH</label><input className={fieldClass} value={form.cnh} onChange={e => setForm({ ...form, cnh: e.target.value })} /></div>
                  <div><label className={labelClass}>Categoria CNH</label><input className={fieldClass} value={form.categoriaCnh} onChange={e => setForm({ ...form, categoriaCnh: e.target.value.toUpperCase() })} placeholder="D / E" /></div>
                  <div><label className={labelClass}>Validade da CNH</label><input className={fieldClass} type="date" value={form.validadeCnh} onChange={e => setForm({ ...form, validadeCnh: e.target.value })} /></div>
                  <div><label className={labelClass}>Placa</label><input className={fieldClass} value={form.placa} onChange={e => setForm({ ...form, placa: e.target.value.toUpperCase() })} placeholder="ABC1D23" /></div>
                  <div className="col-span-2"><label className={labelClass}>Modelo do veículo</label><input className={fieldClass} value={form.modeloVeiculo} onChange={e => setForm({ ...form, modeloVeiculo: e.target.value })} placeholder="Ex: Volvo FH 540 / Carreta basculante" /></div>
                  <div><label className={labelClass}>UF da placa</label><input className={fieldClass} maxLength={2} value={form.ufPlaca} onChange={e => setForm({ ...form, ufPlaca: e.target.value.toUpperCase() })} /></div>
                </div>
              </section>

              <section>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Endereço e situação</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-3"><label className={labelClass}>Endereço</label><input className={fieldClass} value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} /></div>
                  <div className="sm:col-span-2"><label className={labelClass}>Cidade</label><input className={fieldClass} value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} /></div>
                  <div><label className={labelClass}>UF</label><input className={fieldClass} maxLength={2} value={form.uf} onChange={e => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></div>
                  <div className="sm:col-span-3"><label className={labelClass}>Observações</label><textarea rows={3} className={fieldClass} value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} className="h-4 w-4 accent-emerald-700" /> Cadastro ativo</label>
                </div>
              </section>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:p-5">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl px-5 py-3 text-xs font-black uppercase text-slate-500 hover:bg-slate-100">Cancelar</button>
              <button type="submit" className="rounded-xl bg-emerald-700 px-6 py-3 text-xs font-black uppercase text-white hover:bg-emerald-800">{editing ? 'Salvar alterações' : 'Cadastrar transportador'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Transportadores;
