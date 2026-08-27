import React, { useState, useEffect, useRef } from 'react';
import { Customer } from '../types';
import { 
  UserPlus, X, MapPin, Loader2, CheckCircle2, AlertCircle, 
  Building2, User, Tractor, Phone, Mail, FileText, Sparkles
} from 'lucide-react';
import { fetchAddressByCep, formatCep } from '../services/cepService';

interface QuickCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCustomer: Customer) => void;
  initialName?: string;
  onAddCustomer?: (customerData: Omit<Customer, 'id' | 'companyId' | 'totalSpent'>) => Customer | void;
}

export const QuickCustomerModal: React.FC<QuickCustomerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialName = '',
  onAddCustomer
}) => {
  const [tipoPessoa, setTipoPessoa] = useState<'PRODUTOR' | 'PJ' | 'PF'>('PRODUTOR');
  const [name, setName] = useState(initialName);
  const [document, setDocument] = useState('');
  const [ie, setIe] = useState('');
  const [isentoIE, setIsentoIE] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  
  // Endereço e CEP
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [ibgeCode, setIbgeCode] = useState('');
  
  // Estados de CEP
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [cepMessage, setCepMessage] = useState('');

  const numberInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialName) setName(initialName);
    } else {
      // Reset form
      setName('');
      setDocument('');
      setIe('');
      setIsentoIE(false);
      setPhone('');
      setEmail('');
      setZipCode('');
      setStreet('');
      setNumber('');
      setNeighborhood('');
      setCity('');
      setState('');
      setIbgeCode('');
      setCepStatus('idle');
      setCepMessage('');
    }
  }, [isOpen, initialName]);

  // Handler de mudança de CEP com Busca Automática no ViaCEP
  const handleZipCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const formatted = formatCep(rawVal);
    setZipCode(formatted);

    const cleanCep = rawVal.replace(/\D/g, '');

    if (cleanCep.length === 8) {
      setIsLoadingCep(true);
      setCepStatus('idle');
      setCepMessage('Buscando endereço via CEP...');

      const addressData = await fetchAddressByCep(cleanCep);
      setIsLoadingCep(false);

      if (addressData) {
        setStreet(addressData.logradouro || '');
        setNeighborhood(addressData.bairro || '');
        setCity(addressData.localidade || '');
        setState(addressData.uf || '');
        if (addressData.ibge) setIbgeCode(addressData.ibge);

        setCepStatus('success');
        setCepMessage('Endereço localizado com sucesso!');
        
        // Foco automático no número
        setTimeout(() => {
          numberInputRef.current?.focus();
        }, 150);
      } else {
        setCepStatus('error');
        setCepMessage('CEP não encontrado. Preencha o endereço manualmente.');
      }
    } else {
      setCepStatus('idle');
      setCepMessage('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !document.trim()) return;

    const newCustomerData: Omit<Customer, 'id' | 'companyId' | 'totalSpent'> = {
      name: name.trim(),
      document: document.trim(),
      tipoPessoa,
      ie: isentoIE ? 'ISENTO' : ie.trim(),
      isentoIE,
      phone: phone.trim(),
      email: email.trim(),
      zipCode: zipCode.trim(),
      street: street.trim(),
      number: number.trim(),
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase(),
      ibgeCode: ibgeCode.trim()
    };

    let createdCustomer: Customer;
    if (onAddCustomer) {
      const result = onAddCustomer(newCustomerData);
      if (result && typeof result === 'object' && 'id' in result) {
        createdCustomer = result as Customer;
      } else {
        createdCustomer = {
          ...newCustomerData,
          id: `cust-${Date.now()}`,
          totalSpent: 0
        };
      }
    } else {
      createdCustomer = {
        ...newCustomerData,
        id: `cust-${Date.now()}`,
        totalSpent: 0
      };
    }

    onSuccess(createdCustomer);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[130] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 my-auto">
        
        {/* Cabeçalho */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-900 to-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-400/30">
              <UserPlus size={22} />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight flex items-center gap-2">
                Cadastro Rápido de Cliente
                <span className="text-[10px] bg-purple-500/30 text-purple-200 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                  Express
                </span>
              </h3>
              <p className="text-xs text-purple-200/80 font-medium">Cadastre e busque endereço automático via CEP</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Tipo de Pessoa */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Tipo de Perfil do Cliente
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTipoPessoa('PRODUTOR')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  tipoPessoa === 'PRODUTOR' 
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm' 
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Tractor size={15} className={tipoPessoa === 'PRODUTOR' ? 'text-emerald-600' : 'text-slate-400'} />
                Produtor Rural
              </button>

              <button
                type="button"
                onClick={() => setTipoPessoa('PJ')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  tipoPessoa === 'PJ' 
                    ? 'bg-purple-50 border-purple-500 text-purple-800 shadow-sm' 
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Building2 size={15} className={tipoPessoa === 'PJ' ? 'text-purple-600' : 'text-slate-400'} />
                Pessoa Jurídica (PJ)
              </button>

              <button
                type="button"
                onClick={() => setTipoPessoa('PF')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  tipoPessoa === 'PF' 
                    ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-sm' 
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <User size={15} className={tipoPessoa === 'PF' ? 'text-blue-600' : 'text-slate-400'} />
                Pessoa Física (PF)
              </button>
            </div>
          </div>

          {/* Dados Principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                Nome Completo / Razão Social *
              </label>
              <input
                required
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Fazenda Santa Maria / Gabriel Silva"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-bold text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                CPF / CNPJ *
              </label>
              <input
                required
                type="text"
                value={document}
                onChange={e => setDocument(e.target.value)}
                placeholder="000.000.000-00 ou 00.000.000/0001-00"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-mono font-bold text-sm"
              />
            </div>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                  Inscrição Estadual (IE)
                </label>
                <label className="text-[10px] text-slate-500 flex items-center gap-1 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={isentoIE}
                    onChange={e => setIsentoIE(e.target.checked)}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  Isento
                </label>
              </div>
              <input
                type="text"
                disabled={isentoIE}
                value={isentoIE ? 'ISENTO' : ie}
                onChange={e => setIe(e.target.value)}
                placeholder="Ex: 15.000000-0"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-bold text-sm disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block flex items-center gap-1">
                <Phone size={12} className="text-slate-400" /> Telefone / WhatsApp
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(93) 99999-9999"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-bold text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block flex items-center gap-1">
                <Mail size={12} className="text-slate-400" /> E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="produtor@fazenda.com"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-medium text-sm"
              />
            </div>
          </div>

          {/* Seção de Endereço Automático com ViaCEP */}
          <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <MapPin size={16} className="text-purple-600" />
                Endereço & Localização (ViaCEP Automático)
              </span>
              <span className="text-[10px] bg-white text-purple-700 px-2 py-0.5 rounded-full border border-purple-200 font-bold flex items-center gap-1">
                <Sparkles size={11} /> Auto-preenchimento
              </span>
            </div>

            {/* CEP Field */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-1">
                <label className="text-[10px] font-black text-purple-900 uppercase tracking-widest block">
                  CEP (Digite os 8 números)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={9}
                    value={zipCode}
                    onChange={handleZipCodeChange}
                    placeholder="00000-000"
                    className="w-full p-3 bg-white border border-purple-200 rounded-xl focus:border-purple-600 outline-none font-mono font-black text-sm text-purple-950 shadow-sm"
                  />
                  {isLoadingCep && (
                    <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-600 animate-spin" />
                  )}
                </div>
              </div>

              {/* Status Banner do CEP */}
              <div className="sm:col-span-2 flex items-center">
                {isLoadingCep && (
                  <div className="flex items-center gap-2 text-xs text-purple-700 font-bold bg-white p-2.5 rounded-xl border border-purple-200 w-full">
                    <Loader2 size={15} className="animate-spin text-purple-600 shrink-0" />
                    <span>Consultando CEP na API ViaCEP...</span>
                  </div>
                )}
                {!isLoadingCep && cepStatus === 'success' && (
                  <div className="flex items-center gap-2 text-xs text-emerald-800 font-bold bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 w-full">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>{cepMessage}</span>
                  </div>
                )}
                {!isLoadingCep && cepStatus === 'error' && (
                  <div className="flex items-center gap-2 text-xs text-rose-800 font-bold bg-rose-50 p-2.5 rounded-xl border border-rose-200 w-full">
                    <AlertCircle size={16} className="text-rose-600 shrink-0" />
                    <span>{cepMessage}</span>
                  </div>
                )}
                {!isLoadingCep && cepStatus === 'idle' && (
                  <p className="text-[11px] text-slate-500 font-medium leading-tight">
                    Digite o CEP para buscar rua, bairro, cidade e estado automaticamente.
                  </p>
                )}
              </div>
            </div>

            {/* Campos de Logradouro, Número, Bairro, Cidade, Estado */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-3 space-y-1">
                <label className="text-[10px] font-bold text-slate-600 block">Logradouro / Rua / Estrada</label>
                <input
                  type="text"
                  value={street}
                  onChange={e => setStreet(e.target.value)}
                  placeholder="Ex: Rodovia PA-160, Km 45"
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 block">Número *</label>
                <input
                  ref={numberInputRef}
                  type="text"
                  value={number}
                  onChange={e => setNumber(e.target.value)}
                  placeholder="Ex: 500 ou S/N"
                  className="w-full p-2.5 bg-white border border-purple-300 rounded-xl focus:border-purple-600 outline-none text-xs font-black text-purple-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 block">Bairro / Comunidade</label>
                <input
                  type="text"
                  value={neighborhood}
                  onChange={e => setNeighborhood(e.target.value)}
                  placeholder="Ex: Zona Rural / Centro"
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 block">Cidade</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="Ex: Itaituba"
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 block">Estado (UF)</label>
                <input
                  type="text"
                  maxLength={2}
                  value={state}
                  onChange={e => setState(e.target.value.toUpperCase())}
                  placeholder="PA"
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none text-xs font-black uppercase text-center"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 block">Código IBGE</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={7}
                  value={ibgeCode}
                  onChange={e => setIbgeCode(e.target.value.replace(/\D/g, '').slice(0, 7))}
                  placeholder="1506807"
                  title="Preenchido automaticamente pelo CEP. Digite só se a busca falhar (zona rural)."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-600 outline-none text-xs font-mono font-black text-center tracking-wider"
                />
              </div>
            </div>

          </div>

          {/* Rodapé e Ações */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 text-xs font-black uppercase tracking-wider text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-[2] py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-purple-200 hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={16} /> Salvar & Selecionar Cliente
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
