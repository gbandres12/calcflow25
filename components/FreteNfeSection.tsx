import React, { useState } from 'react';
import { Truck, ChevronDown, ChevronUp, Info, Plus, Search, Save, X } from 'lucide-react';
import { FreteInfo, FRETE_MODALIDADES, Transportador } from '../types';

interface FreteNfeSectionProps {
  value: FreteInfo;
  onChange: (next: FreteInfo) => void;
  totalQuantidade?: number; // soma das quantidades (para sugerir peso)
  compact?: boolean;
  transportadores?: Transportador[];
  onAddTransportador?: (data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => Transportador | void;
}

function setDeep(base: FreteInfo, patch: Partial<FreteInfo>): FreteInfo {
  return { ...base, ...patch };
}

export const FreteNfeSection: React.FC<FreteNfeSectionProps> = ({
  value,
  onChange,
  totalQuantidade,
  compact,
  transportadores = [],
  onAddTransportador
}) => {
  const [showTransportadora, setShowTransportadora] = useState(
    Boolean(value.transportadora?.nome || value.transportadora?.documento || value.modalidade === 0 || value.modalidade === 2)
  );
  const [showVolumes, setShowVolumes] = useState(
    Boolean(value.volumes?.pesoBruto || value.volumes?.pesoLiquido || value.volumes?.quantidade || value.veiculo?.placa)
  );
  const [transportadorSearch, setTransportadorSearch] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [quick, setQuick] = useState({
    nome: '',
    documento: '',
    telefone: '',
    rntrc: '',
    placa: '',
    cidade: '',
    uf: 'PA'
  });

  const mod = Number(value.modalidade ?? 9);
  const precisaTransportadora = mod === 0 || mod === 2;
  const comCobranca = mod !== 9;
  const valor = Number(value.valor ?? 0) || 0;

  const update = (patch: Partial<FreteInfo>) => onChange(setDeep(value, patch));

  const transportadoresAtivos = (Array.isArray(transportadores) ? transportadores : [])
    .filter(item => item && item.ativo !== false)
    .filter(item => {
      const q = transportadorSearch.trim().toLowerCase();
      if (!q) return true;
      return [item.nome, item.documento, item.placa, item.telefone, item.rntrc]
        .some(field => String(field || '').toLowerCase().includes(q));
    })
    .slice(0, 30);

  const selectTransportador = (id: string) => {
    if (!id) {
      update({ transportadorId: undefined, transportadora: undefined, veiculo: undefined });
      return;
    }
    const item = transportadores.find(t => t?.id === id);
    if (!item) return;
    onChange({
      ...value,
      transportadorId: item.id,
      transportadora: {
        documento: item.documento || '',
        nome: item.nome || '',
        ie: item.ie || '',
        endereco: item.endereco || '',
        cidade: item.cidade || '',
        uf: item.uf || '',
        rntrc: item.rntrc || ''
      },
      veiculo: {
        ...(value.veiculo || {}),
        placa: item.placa || '',
        uf: item.ufPlaca || item.uf || '',
        rntrc: item.rntrc || ''
      }
    });
    setShowTransportadora(true);
  };

  const saveQuickTransportador = () => {
    const nome = quick.nome.trim();
    const documento = quick.documento.replace(/\D/g, '');
    if (nome.length < 2) {
      setQuickError('Informe o nome do caminhoneiro ou da transportadora.');
      return;
    }
    if (documento && documento.length !== 11 && documento.length !== 14) {
      setQuickError('CPF deve ter 11 dígitos ou CNPJ 14 dígitos.');
      return;
    }
    const data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> = {
      nome,
      documento,
      telefone: quick.telefone.trim(),
      rntrc: quick.rntrc.trim(),
      placa: quick.placa.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      ufPlaca: quick.uf.toUpperCase(),
      cidade: quick.cidade.trim(),
      uf: quick.uf.toUpperCase(),
      tipoServico: 'ENTREGA',
      contratacao: mod === 1 || mod === 4 ? 'CLIENTE' : mod === 0 || mod === 3 ? 'EMPRESA' : 'AMBOS',
      ativo: true
    };
    const created = onAddTransportador?.(data);
    if (created) {
      onChange({
        ...value,
        transportadorId: created.id,
        transportadora: {
          documento: created.documento,
          nome: created.nome,
          rntrc: created.rntrc,
          cidade: created.cidade,
          uf: created.uf
        },
        veiculo: {
          ...(value.veiculo || {}),
          placa: created.placa,
          uf: created.ufPlaca || created.uf,
          rntrc: created.rntrc
        }
      });
    } else {
      onChange({
        ...value,
        transportadora: { documento, nome, rntrc: data.rntrc, cidade: data.cidade, uf: data.uf },
        veiculo: { ...(value.veiculo || {}), placa: data.placa, uf: data.ufPlaca, rntrc: data.rntrc }
      });
    }
    setQuick({ nome: '', documento: '', telefone: '', rntrc: '', placa: '', cidade: '', uf: 'PA' });
    setQuickError('');
    setShowQuickAdd(false);
    setShowTransportadora(true);
  };

  const suggestPeso = () => {
    if (!totalQuantidade) return;
    // Calcário: 1 TON = 1000 kg. Assume unidade em toneladas quando valor alto parece TON.
    const kg = totalQuantidade * 1000;
    onChange({
      ...value,
      volumes: { ...(value.volumes || {}), pesoLiquido: kg, pesoBruto: kg }
    });
  };

  const inputCls = 'w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 placeholder:text-slate-300 placeholder:font-medium';
  const labelCls = 'text-[10px] font-black uppercase text-slate-400 tracking-wide';

  return (
    <div className={`space-y-3 min-w-0 ${compact ? 'p-0 bg-transparent border-0' : 'p-3.5 sm:p-5 bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-100'}`}>
      {!compact && (
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
        <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
          <Truck size={16} className="text-purple-600" /> Frete & Transporte
        </span>
        <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full ${
          mod === 9 ? 'bg-slate-200 text-slate-600'
          : mod === 0 ? 'bg-emerald-100 text-emerald-800'
          : mod === 1 ? 'bg-amber-100 text-amber-800'
          : 'bg-blue-100 text-blue-800'
        }`}>
          {FRETE_MODALIDADES.find(m => m.value === mod)?.sigla || 'Sem frete'}
        </span>
      </div>
      )}

      {/* Modalidades em cards clicáveis — melhor UX que select puro */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
        {FRETE_MODALIDADES.map((m) => {
          const active = mod === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => update({ modalidade: m.value, valor: m.value === 9 ? 0 : value.valor })}
              title={m.descricao}
              className={`text-left p-2 sm:p-2.5 rounded-xl sm:rounded-2xl border transition-all min-w-0 ${
                active
                  ? 'bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-200'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-purple-300 hover:bg-purple-50/50'
              }`}
            >
              <p className={`text-[11px] font-black leading-tight ${active ? 'text-white' : 'text-slate-800'}`}>
                {m.value === 9 ? 'Sem frete' : m.value === 0 ? 'CIF' : m.value === 1 ? 'FOB' : m.sigla}
              </p>
              <p className={`text-[9px] leading-tight mt-0.5 ${active ? 'text-purple-100' : 'text-slate-400'}`}>
                {m.value === 9 ? 'Sem transporte (9)'
                  : m.value === 0 ? 'Remetente paga (0)'
                  : m.value === 1 ? 'Destinatário paga (1)'
                  : m.value === 2 ? 'Terceiros (2)'
                  : m.value === 3 ? 'Próprio remetente (3)'
                  : 'Próprio destinatário (4)'}
              </p>
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-500 flex items-start gap-1.5 bg-white border border-slate-200/70 rounded-xl px-3 py-2">
        <Info size={13} className="shrink-0 mt-0.5 text-purple-500" />
        <span>
          {mod === 9 && 'Sem ocorrência de transporte: nenhum valor de frete entra na NF-e.'}
          {mod === 0 && <><b>CIF:</b> você (remetente) contrata e paga o frete. O valor <b>soma no total</b> da NF-e.</>}
          {mod === 1 && (
            <>
              <b>FOB:</b> frete por conta do destinatário (valor R$ 0 na nota). Informe <b>CPF e nome do motorista</b> abaixo e a placa — como na NF-e
              do eFácil. CNPJ de transportadora nesta modalidade costuma ser rejeitado; use CIF se a empresa transportadora for contratada por você.
            </>
          )}
          {mod === 2 && 'Frete por conta de terceiros: informe a transportadora contratada abaixo.'}
          {mod === 3 && 'Transporte próprio do remetente: use sua frota, normalmente sem valor de frete.'}
          {mod === 4 && 'Transporte próprio do destinatário: o cliente retira com frota própria.'}
        </span>
      </p>

      {comCobranca && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wide text-emerald-800">
                Transportador cadastrado
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="search"
                  value={transportadorSearch}
                  onChange={e => setTransportadorSearch(e.target.value)}
                  placeholder="Buscar nome, CPF/CNPJ, placa ou RNTRC..."
                  className="w-full rounded-xl border border-emerald-200 bg-white py-2.5 pl-9 pr-3 text-xs font-semibold outline-none focus:border-emerald-600"
                />
              </div>
              <select
                value={value.transportadorId || ''}
                onChange={e => selectTransportador(e.target.value)}
                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-600"
              >
                <option value="">Selecionar da lista...</option>
                {transportadoresAtivos.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.nome}{item.placa ? ` · ${item.placa}` : ''}{item.contratacao === 'CLIENTE' ? ' · do cliente' : item.contratacao === 'EMPRESA' ? ' · da empresa' : ''}
                  </option>
                ))}
              </select>
              {transportadoresAtivos.length === 0 && transportadorSearch && (
                <p className="text-[10px] font-semibold text-slate-500">Nenhum cadastro encontrado.</p>
              )}
            </div>
            {onAddTransportador && (
              <button
                type="button"
                onClick={() => {
                  setShowQuickAdd(!showQuickAdd);
                  setQuickError('');
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-[10px] font-black uppercase text-emerald-800 hover:bg-emerald-100 sm:w-auto"
              >
                {showQuickAdd ? <X size={14} /> : <Plus size={14} />}
                {showQuickAdd ? 'Fechar cadastro' : 'Cadastrar agora'}
              </button>
            )}
          </div>

          {value.transportadorId && (
            <p className="rounded-xl bg-white px-3 py-2 text-[10px] font-bold text-emerald-800">
              Cadastro selecionado: {value.transportadora?.nome}
              {value.veiculo?.placa ? ` · Placa ${value.veiculo.placa}` : ''}
            </p>
          )}

          {showQuickAdd && onAddTransportador && (
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-white p-3 animate-in fade-in duration-150">
              <div>
                <p className="text-xs font-black text-slate-800">Cadastro rápido do transportador</p>
                <p className="text-[10px] text-slate-500">O cadastro ficará salvo para as próximas notas.</p>
              </div>
              {quickError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">{quickError}</p>}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input value={quick.nome} onChange={e => setQuick({ ...quick, nome: e.target.value })} placeholder="Nome / Razão social *" className={inputCls} />
                <input value={quick.documento} onChange={e => setQuick({ ...quick, documento: e.target.value })} inputMode="numeric" placeholder="CPF / CNPJ" className={inputCls} />
                <input value={quick.telefone} onChange={e => setQuick({ ...quick, telefone: e.target.value })} inputMode="tel" placeholder="Telefone / WhatsApp" className={inputCls} />
                <input value={quick.rntrc} onChange={e => setQuick({ ...quick, rntrc: e.target.value })} placeholder="RNTRC / ANTT" className={inputCls} />
                <input value={quick.placa} onChange={e => setQuick({ ...quick, placa: e.target.value.toUpperCase() })} placeholder="Placa do veículo" className={inputCls} />
                <div className="flex gap-2">
                  <input value={quick.cidade} onChange={e => setQuick({ ...quick, cidade: e.target.value })} placeholder="Cidade" className={`${inputCls} flex-1`} />
                  <input value={quick.uf} onChange={e => setQuick({ ...quick, uf: e.target.value.toUpperCase() })} maxLength={2} placeholder="UF" className={`${inputCls} w-16 text-center`} />
                </div>
              </div>
              <button type="button" onClick={saveQuickTransportador} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-[10px] font-black uppercase text-white hover:bg-emerald-800">
                <Save size={14} /> Salvar e usar nesta NF-e
              </button>
            </div>
          )}
        </div>
      )}

      {comCobranca && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Valor do frete (R$) — compõe o total</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={value.valor ?? 0}
              onChange={(e) => update({ valor: parseFloat(e.target.value) || 0 })}
              className={inputCls}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Modalidade SEFAZ (modFrete)</label>
            <select
              value={mod}
              onChange={(e) => update({ modalidade: parseInt(e.target.value, 10) as FreteInfo['modalidade'] })}
              className={inputCls}
            >
              {FRETE_MODALIDADES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!comCobranca && (
        <input type="hidden" value={9} readOnly />
      )}

      {/* Transportadora */}
      {(precisaTransportadora || showTransportadora) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3">
          <button
            type="button"
            onClick={() => setShowTransportadora(!showTransportadora)}
            className="w-full flex items-start sm:items-center justify-between gap-2 text-left text-[10px] sm:text-[11px] font-black uppercase text-slate-600 tracking-wide"
          >
            <span>
              Transportadora{' '}
              {mod === 0
                ? '(contratada pelo remetente — CIF, vai na NF-e)'
                : mod === 1
                  ? '(FOB: motorista — CPF + nome na NF-e)'
                  : mod === 2
                    ? '(terceiros — vai na NF-e)'
                    : '(opcional)'}
            </span>
            {showTransportadora ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showTransportadora && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-150">
              <div className="space-y-1">
                <label className={labelCls}>CNPJ / CPF da transportadora</label>
                <input
                  type="text"
                  value={value.transportadora?.documento || ''}
                  onChange={(e) => update({ transportadora: { ...(value.transportadora || {}), documento: e.target.value } })}
                  className={`${inputCls} font-mono`}
                  placeholder="Somente dígitos"
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Razão social / Nome</label>
                <input
                  type="text"
                  value={value.transportadora?.nome || ''}
                  onChange={(e) => update({ transportadora: { ...(value.transportadora || {}), nome: e.target.value } })}
                  className={inputCls}
                  placeholder="Transportes LTDA"
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Inscrição Estadual (IE)</label>
                <input
                  type="text"
                  value={value.transportadora?.ie || ''}
                  onChange={(e) => update({ transportadora: { ...(value.transportadora || {}), ie: e.target.value } })}
                  className={inputCls}
                  placeholder="IE ou Isento"
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>RNTRC / ANTT</label>
                <input
                  type="text"
                  value={value.transportadora?.rntrc || ''}
                  onChange={(e) => update({ transportadora: { ...(value.transportadora || {}), rntrc: e.target.value } })}
                  className={`${inputCls} font-mono`}
                  placeholder="Registro ANTT"
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Cidade / UF</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={value.transportadora?.cidade || ''}
                    onChange={(e) => update({ transportadora: { ...(value.transportadora || {}), cidade: e.target.value } })}
                    className={`${inputCls} flex-1`}
                    placeholder="Santarém"
                  />
                  <input
                    type="text"
                    maxLength={2}
                    value={value.transportadora?.uf || ''}
                    onChange={(e) => update({ transportadora: { ...(value.transportadora || {}), uf: e.target.value.toUpperCase() } })}
                    className={`${inputCls} w-16 text-center uppercase`}
                    placeholder="PA"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Endereço</label>
                <input
                  type="text"
                  value={value.transportadora?.endereco || ''}
                  onChange={(e) => update({ transportadora: { ...(value.transportadora || {}), endereco: e.target.value } })}
                  className={inputCls}
                  placeholder="Rua / Rodovia"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {!precisaTransportadora && !showTransportadora && comCobranca && (
        <button
          type="button"
          onClick={() => setShowTransportadora(true)}
          className="text-[11px] font-bold text-purple-700 hover:text-purple-900 underline underline-offset-2"
        >
          + Informar transportadora (opcional)
        </button>
      )}

      {/* Veículo + volumes */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowVolumes(!showVolumes)}
            className="flex items-center justify-between w-full text-left text-[10px] sm:text-[11px] font-black uppercase text-slate-600 tracking-wide"
          >
            <span>Veículo & volumes (pesos)</span>
            {showVolumes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {Boolean(totalQuantidade) && (
            <button
              type="button"
              onClick={suggestPeso}
              title="Preencher peso com base na quantidade total dos itens (1 TON = 1000 kg)"
              className="w-full sm:w-auto sm:ml-2 shrink-0 text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg px-2 py-2 sm:py-1"
            >
              Estimar peso
            </button>
          )}
        </div>

        {showVolumes && (
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-4 gap-3 animate-in fade-in duration-150">
            <div className="space-y-1">
              <label className={labelCls}>Placa do veículo</label>
              <input
                type="text"
                value={value.veiculo?.placa || ''}
                onChange={(e) => update({ veiculo: { ...(value.veiculo || {}), placa: e.target.value.toUpperCase() } })}
                className={`${inputCls} font-mono text-center uppercase`}
                placeholder="ABC1D23"
                maxLength={8}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>UF placa</label>
              <input
                type="text"
                maxLength={2}
                value={value.veiculo?.uf || ''}
                onChange={(e) => update({ veiculo: { ...(value.veiculo || {}), uf: e.target.value.toUpperCase() } })}
                className={`${inputCls} text-center uppercase`}
                placeholder="PA"
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Qtd. volumes</label>
              <input
                type="number"
                min="1"
                step="1"
                value={value.volumes?.quantidade ?? ''}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  update({ volumes: { ...(value.volumes || {}), quantidade: Number.isFinite(n) && n >= 1 ? n : undefined } });
                }}
                className={`${inputCls} text-center`}
                placeholder="1"
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Espécie</label>
              <input
                type="text"
                value={value.volumes?.especie || ''}
                onChange={(e) => update({ volumes: { ...(value.volumes || {}), especie: e.target.value.toUpperCase() } })}
                className={`${inputCls} uppercase`}
                placeholder="GRANEL"
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Peso líquido (kg)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={value.volumes?.pesoLiquido ?? ''}
                onChange={(e) => update({ volumes: { ...(value.volumes || {}), pesoLiquido: parseFloat(e.target.value) || undefined } })}
                className={`${inputCls} text-right`}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Peso bruto (kg)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={value.volumes?.pesoBruto ?? ''}
                onChange={(e) => update({ volumes: { ...(value.volumes || {}), pesoBruto: parseFloat(e.target.value) || undefined } })}
                className={`${inputCls} text-right`}
                placeholder="0"
              />
            </div>
            <div className="space-y-1 min-[380px]:col-span-2">
              <label className={labelCls}>Marca / Observação do volume</label>
              <input
                type="text"
                value={value.volumes?.marca || ''}
                onChange={(e) => update({ volumes: { ...(value.volumes || {}), marca: e.target.value } })}
                className={inputCls}
                placeholder="Ex: Carreta basculante"
              />
            </div>
          </div>
        )}

        {!showVolumes && (
          <p className="text-[10px] text-slate-400">
            {valor > 0 || value.veiculo?.placa || value.volumes?.pesoBruto
              ? `Frete R$ ${valor.toFixed(2)} · ${value.volumes?.pesoBruto ? `${value.volumes.pesoBruto} kg bruto` : 'sem peso informado'}${value.veiculo?.placa ? ` · Placa ${value.veiculo.placa}` : ''}`
              : 'Opcional: placa do caminhão, quantidade de volumes e pesos líquido/bruto (saem no DANFE).'}
          </p>
        )}
      </div>

      {!compact && comCobranca && valor <= 0 && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Modalidade com frete selecionada, mas valor zerado — a nota sairá sem <b>vFrete</b>. Informe o valor se o frete for cobrado na nota.
        </p>
      )}
    </div>
  );
};
