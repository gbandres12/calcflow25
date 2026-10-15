import React, { useState, useEffect } from 'react';
import { Transportador, TransportadorContratacao, TransportadorTipoServico } from '../types';
import { FlowSheet } from './ui/FlowSheet';
import { Truck, AlertCircle, Plus, Check } from 'lucide-react';

export interface QuickDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (driver: Transportador) => void;
  onAddTransportador?: (data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => Transportador | Promise<Transportador>;
  initialDriverName?: string;
  initialPlate?: string;
}

const onlyDigits = (val: string) => String(val || '').replace(/\D/g, '');

export const QuickDriverModal: React.FC<QuickDriverModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onAddTransportador,
  initialDriverName = '',
  initialPlate = ''
}) => {
  const [nome, setNome] = useState(initialDriverName);
  const [documento, setDocumento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [placa, setPlaca] = useState(initialPlate);
  const [ufPlaca, setUfPlaca] = useState('PA');
  const [modeloVeiculo, setModeloVeiculo] = useState('');
  const [cnh, setCnh] = useState('');
  const [categoriaCnh, setCategoriaCnh] = useState('E');
  const [rntrc, setRntrc] = useState('');
  const [tipoServico, setTipoServico] = useState<TransportadorTipoServico>('ENTREGA');
  const [contratacao, setContratacao] = useState<TransportadorContratacao>('AMBOS');
  const [cidade, setCidade] = useState('Itaituba');
  const [uf, setUf] = useState('PA');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialDriverName) setNome(initialDriverName);
      if (initialPlate) setPlaca(initialPlate.toUpperCase().replace(/[^A-Z0-9]/g, ''));
      setError('');
    }
  }, [isOpen, initialDriverName, initialPlate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNome = nome.trim();
    const cleanDoc = onlyDigits(documento);

    if (cleanNome.length < 2) {
      setError('Informe o nome do motorista ou da transportadora.');
      return;
    }

    if (cleanDoc && cleanDoc.length !== 11 && cleanDoc.length !== 14) {
      setError('O CPF deve ter 11 dígitos ou o CNPJ deve ter 14 dígitos.');
      return;
    }

    const cleanPlaca = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanPlaca && cleanPlaca.length < 7) {
      setError('A placa deve ter pelo menos 7 caracteres (Ex: ABC1D23 ou ABC1234).');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> = {
        nome: cleanNome,
        documento: cleanDoc,
        telefone: telefone.trim(),
        email: '',
        ie: '',
        rntrc: rntrc.trim(),
        cnh: cnh.trim(),
        categoriaCnh: categoriaCnh.trim().toUpperCase(),
        validadeCnh: '',
        placa: cleanPlaca,
        ufPlaca: ufPlaca.trim().toUpperCase(),
        modeloVeiculo: modeloVeiculo.trim(),
        tipoServico,
        contratacao,
        endereco: '',
        cidade: cidade.trim(),
        uf: uf.trim().toUpperCase(),
        ativo: true,
        observacoes: 'Cadastrado via Operação Fluvial / Balança Cross-Docking'
      };

      if (onAddTransportador) {
        const created = await onAddTransportador(data);
        onSuccess(created);
      } else {
        const mock: Transportador = {
          ...data,
          id: `transp-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        onSuccess(mock);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao cadastrar motorista.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 min-h-11';
  const labelClass = 'mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500';

  return (
    <FlowSheet
      title="Cadastro Rápido de Motorista"
      subtitle="Cadastre o caminhoneiro para carregar direto no caminhão"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelClass}>Nome do Motorista / Transportador *</label>
            <input
              type="text"
              required
              autoFocus
              className={fieldClass}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: João da Silva / Transportes Tapajós"
            />
          </div>

          <div>
            <label className={labelClass}>CPF / CNPJ</label>
            <input
              type="text"
              inputMode="numeric"
              className={fieldClass}
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="Somente dígitos"
            />
          </div>

          <div>
            <label className={labelClass}>Telefone / WhatsApp</label>
            <input
              type="tel"
              inputMode="tel"
              className={fieldClass}
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(93) 99999-9999"
            />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-200/80 space-y-3">
          <p className="text-[11px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
            <Truck size={14} /> Dados do Veículo
          </p>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className={labelClass}>Placa do Caminhão</label>
              <input
                type="text"
                className={fieldClass}
                value={placa}
                onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                placeholder="Ex: ABC1D23"
                maxLength={8}
              />
            </div>
            <div>
              <label className={labelClass}>UF Placa</label>
              <input
                type="text"
                className={fieldClass}
                value={ufPlaca}
                onChange={(e) => setUfPlaca(e.target.value.toUpperCase())}
                placeholder="PA"
                maxLength={2}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Modelo / Carroceria</label>
              <input
                type="text"
                className={fieldClass}
                value={modeloVeiculo}
                onChange={(e) => setModeloVeiculo(e.target.value)}
                placeholder="Ex: Volvo FH / Basculante 4 Eixos"
              />
            </div>
            <div>
              <label className={labelClass}>RNTRC / ANTT</label>
              <input
                type="text"
                className={fieldClass}
                value={rntrc}
                onChange={(e) => setRntrc(e.target.value)}
                placeholder="Registro na ANTT"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>CNH do Motorista</label>
            <input
              type="text"
              className={fieldClass}
              value={cnh}
              onChange={(e) => setCnh(e.target.value)}
              placeholder="Número da CNH"
            />
          </div>
          <div>
            <label className={labelClass}>Categoria CNH</label>
            <select
              className={fieldClass}
              value={categoriaCnh}
              onChange={(e) => setCategoriaCnh(e.target.value)}
            >
              <option value="E">Categoria E (Carreta/Bitrem)</option>
              <option value="D">Categoria D (Caminhão Pesado)</option>
              <option value="C">Categoria C (Caminhão)</option>
              <option value="B">Categoria B</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Cidade Base</label>
            <input
              type="text"
              className={fieldClass}
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Itaituba"
            />
          </div>
          <div>
            <label className={labelClass}>UF</label>
            <input
              type="text"
              className={fieldClass}
              value={uf}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
              placeholder="PA"
              maxLength={2}
            />
          </div>
        </div>

        <div className="pt-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-12 border border-slate-200 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 min-h-12 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-extrabold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Check size={18} /> Confirmar Cadastro
          </button>
        </div>
      </form>
    </FlowSheet>
  );
};

export default QuickDriverModal;
