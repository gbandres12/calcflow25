import React, { useState } from 'react';
import { User, InventoryItem, FinancialAccount, AccountType, UserRole } from '../types';
import { 
  X, Sparkles, Factory, CheckCircle2, ArrowRight, ArrowLeft, 
  Package, Wallet, Users, Rocket, Building2, MapPin, 
  ShieldCheck, DollarSign, Scale, HelpCircle, Check, Award
} from 'lucide-react';
import { db, userService } from '../services/dataService';

interface OnboardingModalProps {
  user: User;
  isOpen?: boolean;
  onClose: () => void;
  onComplete: (updatedUser: User) => void;
  onProvisionData?: (data: {
    companyName: string;
    inventory?: InventoryItem[];
    accounts?: FinancialAccount[];
  }) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  user,
  isOpen = true,
  onClose,
  onComplete,
  onProvisionData
}) => {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Passo 1: Dados da Usina
  const [companyName, setCompanyName] = useState(user.companyName || 'Mineração & Calcário Vale Verde');
  const [cnpj, setCnpj] = useState(user.cnpj || '18.450.912/0001-33');
  const [stateLocation, setStateLocation] = useState('PA');
  const [cityLocation, setCityLocation] = useState('Santarém');
  const [monthlyCapacity, setMonthlyCapacity] = useState('15000'); // TON/mês

  // Passo 2: Produtos & Estoque
  const [productsConfig, setProductsConfig] = useState([
    { id: 'moido', name: 'Calcário Agrícola Dolomítico (Granel)', quantity: 2400, unitPrice: 95.0, active: true },
    { id: 'calcitico', name: 'Calcário Calcítico Premium', quantity: 1200, unitPrice: 110.0, active: true },
    { id: 'britado', name: 'Calcário Britado / Cascalho Industrial', quantity: 3500, unitPrice: 48.0, active: true },
    { id: 'filler', name: 'Calcário Fino / Filler Ensacado', quantity: 650, unitPrice: 145.0, active: true },
  ]);

  // Passo 3: Financeiro & Caixa
  const [bankName, setBankName] = useState('Banco do Brasil');
  const [accountNumber, setAccountNumber] = useState('45100-2');
  const [bankInitialBalance, setBankInitialBalance] = useState('75000');
  const [cashboxInitialBalance, setCashboxInitialBalance] = useState('5000');

  // Passo 4: Equipe Inicial
  const [teamMember, setTeamMember] = useState({
    name: 'José Balança (Operador)',
    email: 'balanca@calcarioflow.com.br',
    role: UserRole.OPERATOR
  });

  if (!isOpen) return null;

  const handleFinishOnboarding = async () => {
    setSaving(true);
    try {
      // 1. Atualiza dados do usuário
      const updatedUser: User = {
        ...user,
        companyName,
        cnpj,
        onboardingCompleted: true,
        onboardingStep: 5
      };
      await userService.saveUser(updatedUser);

      // 2. Cria ou atualiza o estoque inicial
      const activeProducts: InventoryItem[] = productsConfig
        .filter(p => p.active)
        .map(p => ({
          id: p.id,
          name: p.name,
          quantity: Number(p.quantity) || 0,
          unitPrice: Number(p.unitPrice) || 0,
          minStock: 200,
          unit: 'Ton',
          companyId: 'main'
        }));
      await db.upsert('inventory', 'main', activeProducts);

      // 3. Cria contas bancárias iniciais
      const initialAccounts: FinancialAccount[] = [
        {
          id: `acc-bank-${Date.now()}`,
          name: `Conta Corrente - ${bankName}`,
          type: AccountType.BANCO,
          bankName,
          accountNumber,
          initialBalance: Number(bankInitialBalance) || 0,
          companyId: 'main'
        },
        {
          id: `acc-cash-${Date.now()}`,
          name: 'Caixa Físico da Usina / Balança',
          type: AccountType.CAIXA,
          initialBalance: Number(cashboxInitialBalance) || 0,
          companyId: 'main'
        }
      ];
      await db.upsert('financial_accounts', 'main', initialAccounts);

      // 4. Cria operador adicional se preenchido
      if (teamMember.name && teamMember.email) {
        const newOp: User = {
          id: `usr-op-${Date.now()}`,
          name: teamMember.name,
          email: teamMember.email.toLowerCase(),
          role: teamMember.role,
          status: 'Ativo',
          companyName,
          lastAccess: new Date().toISOString()
        };
        await db.upsert('users', 'main', newOp);
      }

      if (onProvisionData) {
        onProvisionData({
          companyName,
          inventory: activeProducts,
          accounts: initialAccounts
        });
      }

      onComplete(updatedUser);
    } catch (e) {
      console.error("Erro ao salvar onboarding:", e);
    } finally {
      setSaving(false);
    }
  };

  const stepsList = [
    { num: 1, title: 'Usina & Mineração', icon: Factory },
    { num: 2, title: 'Produtos & Pátio', icon: Package },
    { num: 3, title: 'Bancos & Caixa', icon: Wallet },
    { num: 4, title: 'Equipe & Balança', icon: Users },
    { num: 5, title: 'Pronto para Operar!', icon: Rocket },
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-lg z-[150] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-100 animate-in zoom-in-95">
        
        {/* Header com Progresso do Onboarding */}
        <div className="bg-slate-900 text-white p-6 md:p-8 relative">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all"
            title="Pular / Concluir depois"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-2 text-purple-400 text-xs font-black uppercase tracking-widest mb-2">
            <Sparkles size={14} /> Assistente de Configuração Inicial SaaS
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                Bem-vindo ao CalcárioFlow, {user.name.split(' ')[0]}!
              </h2>
              <p className="text-xs md:text-sm text-slate-400 font-medium">
                Vamos parametrizar sua usina em menos de 2 minutos para liberar todas as operações.
              </p>
            </div>
            <div className="bg-purple-600/20 border border-purple-500/30 px-4 py-2 rounded-2xl text-right">
              <span className="text-[10px] font-black text-purple-300 uppercase tracking-widest block">Passo Atual</span>
              <span className="text-sm font-black text-white">{step} de 5</span>
            </div>
          </div>

          {/* Barra de Passos Interativa */}
          <div className="grid grid-cols-5 gap-2 mt-6 pt-4 border-t border-slate-800">
            {stepsList.map(s => {
              const Icon = s.icon;
              const isDone = s.num < step;
              const isCurrent = s.num === step;
              return (
                <div 
                  key={s.num}
                  onClick={() => s.num < step && setStep(s.num)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all cursor-pointer ${
                    isCurrent 
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30 font-black' 
                      : isDone 
                      ? 'bg-slate-800/80 text-emerald-400 font-bold' 
                      : 'text-slate-500 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {isDone ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                    <span className="text-[10px] hidden sm:inline">{s.title}</span>
                  </div>
                  <div className={`h-1 w-full rounded-full ${isCurrent ? 'bg-white' : isDone ? 'bg-emerald-400' : 'bg-slate-700'}`}></div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Corpo do Wizard */}
        <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          
          {/* PASSO 1: DADOS DA USINA & MINERAÇÃO */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                  <Factory size={26} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">1. Identidade da Usina e Planta Industrial</h3>
                  <p className="text-xs text-slate-500 font-medium">Nome fantasia, localização física e capacidade produtiva mensal</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome da Usina / Mineração</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Ex: Mineração Calcário Vale Verde"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-purple-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CNPJ da Empresa</label>
                  <input
                    type="text"
                    value={cnpj}
                    onChange={e => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-purple-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capacidade Nominal de Moagem</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={monthlyCapacity}
                      onChange={e => setMonthlyCapacity(e.target.value)}
                      placeholder="15000"
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-purple-500"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">TON / Mês</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cidade do Pátio / Jazida</label>
                  <input
                    type="text"
                    value={cityLocation}
                    onChange={e => setCityLocation(e.target.value)}
                    placeholder="Santarém"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado (UF)</label>
                  <select
                    value={stateLocation}
                    onChange={e => setStateLocation(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-purple-500"
                  >
                    <option value="PA">Pará (PA)</option>
                    <option value="MT">Mato Grosso (MT)</option>
                    <option value="GO">Goiás (GO)</option>
                    <option value="TO">Tocantins (TO)</option>
                    <option value="MS">Mato Grosso do Sul (MS)</option>
                    <option value="MA">Maranhão (MA)</option>
                    <option value="BA">Bahia (BA)</option>
                    <option value="MG">Minas Gerais (MG)</option>
                    <option value="PR">Paraná (PR)</option>
                    <option value="SP">São Paulo (SP)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 2: PRODUTOS & ESTOQUE */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <Package size={26} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">2. Produtos de Calcário & Estoque de Largada</h3>
                  <p className="text-xs text-slate-500 font-medium">Selecione os tipos de minério que sua usina processa e os saldos em pátio</p>
                </div>
              </div>

              <div className="space-y-3">
                {productsConfig.map((prod, idx) => (
                  <div 
                    key={prod.id} 
                    className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                      prod.active ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-100/40 border-slate-200/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={prod.active}
                        onChange={e => {
                          const updated = [...productsConfig];
                          updated[idx].active = e.target.checked;
                          setProductsConfig(updated);
                        }}
                        className="w-5 h-5 rounded-lg text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                      <div>
                        <p className="font-black text-sm text-slate-800">{prod.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Unidade Padrão: Tonelada (TON)</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <div className="w-1/2 md:w-32">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Estoque Inicial (T)</label>
                        <input
                          type="number"
                          value={prod.quantity}
                          disabled={!prod.active}
                          onChange={e => {
                            const updated = [...productsConfig];
                            updated[idx].quantity = Number(e.target.value) || 0;
                            setProductsConfig(updated);
                          }}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none"
                        />
                      </div>
                      <div className="w-1/2 md:w-32">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Preço Sugerido (R$/T)</label>
                        <input
                          type="number"
                          value={prod.unitPrice}
                          disabled={!prod.active}
                          onChange={e => {
                            const updated = [...productsConfig];
                            updated[idx].unitPrice = Number(e.target.value) || 0;
                            setProductsConfig(updated);
                          }}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASSO 3: BANCOS & CAIXA */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <Wallet size={26} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">3. Contas Bancárias & Caixa de Operação</h3>
                  <p className="text-xs text-slate-500 font-medium">Parametrize a conta bancária principal e o saldo em caixa da usina</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-3xl space-y-3">
                  <div className="flex items-center gap-2 text-slate-800 font-black text-sm">
                    <Building2 size={18} className="text-blue-600" />
                    Conta Corrente Principal
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Instituição Bancária</label>
                    <select
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                      className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl font-bold text-sm"
                    >
                      <option value="Banco do Brasil">Banco do Brasil</option>
                      <option value="Sicredi">Sicredi</option>
                      <option value="Sicoob">Sicoob</option>
                      <option value="Bradesco">Bradesco</option>
                      <option value="Itaú">Itaú</option>
                      <option value="Santander">Santander</option>
                      <option value="Caixa Econômica">Caixa Econômica</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Número da Conta / Agência</label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={e => setAccountNumber(e.target.value)}
                      placeholder="Ag: 0142-5 / CC: 45100-2"
                      className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo de Abertura (R$)</label>
                    <input
                      type="number"
                      value={bankInitialBalance}
                      onChange={e => setBankInitialBalance(e.target.value)}
                      placeholder="75000"
                      className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none text-blue-700"
                    />
                  </div>
                </div>

                <div className="p-5 bg-slate-50 border border-slate-200 rounded-3xl space-y-3">
                  <div className="flex items-center gap-2 text-slate-800 font-black text-sm">
                    <DollarSign size={18} className="text-emerald-600" />
                    Caixa Local da Usina / Balança
                  </div>

                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Utilizado para receber pagamentos em dinheiro vivo ou troco de freteiros na portaria e balança física.
                  </p>

                  <div className="space-y-1.5 pt-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Inicial em Caixa Físico (R$)</label>
                    <input
                      type="number"
                      value={cashboxInitialBalance}
                      onChange={e => setCashboxInitialBalance(e.target.value)}
                      placeholder="5000"
                      className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none text-emerald-700"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 4: EQUIPE & BALANÇA */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                  <Users size={26} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">4. Primeiro Operador de Balança / Pátio</h3>
                  <p className="text-xs text-slate-500 font-medium">Cadastre o responsável pela pesagem e liberação de caminhões</p>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Operador</label>
                    <input
                      type="text"
                      value={teamMember.name}
                      onChange={e => setTeamMember({ ...teamMember, name: e.target.value })}
                      placeholder="Ex: José Balança"
                      className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl font-bold text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail de Login do Operador</label>
                    <input
                      type="email"
                      value={teamMember.email}
                      onChange={e => setTeamMember({ ...teamMember, email: e.target.value })}
                      placeholder="balanca@calcarioflow.com.br"
                      className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl font-bold text-sm"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nível de Acesso Inicial</label>
                    <select
                      value={teamMember.role}
                      onChange={e => setTeamMember({ ...teamMember, role: e.target.value as UserRole })}
                      className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl font-bold text-sm"
                    >
                      <option value={UserRole.OPERATOR}>Operador (Acesso restrito à Balança, Moagem e Pátio)</option>
                      <option value={UserRole.MANAGER}>Gerente (Acesso a Vendas, Faturamento e Produção)</option>
                      <option value={UserRole.ADMIN}>Administrador (Acesso Irrestrito)</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 bg-amber-100/50 border border-amber-200 rounded-2xl flex items-center gap-3">
                  <ShieldCheck size={20} className="text-amber-700 shrink-0" />
                  <p className="text-xs text-amber-900 font-bold">
                    A senha provisória de acesso para novos operadores é <strong>123456</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 5: CONCLUSÃO & ATIVAÇÃO */}
          {step === 5 && (
            <div className="space-y-6 text-center py-4 animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-200">
                <Rocket size={40} />
              </div>

              <div className="space-y-2 max-w-md mx-auto">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  Tudo Pronto para Moer e Faturar!
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Sua usina <strong>{companyName}</strong> foi parametrizada com sucesso no CalcárioFlow ERP.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-2xl mx-auto">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Capacidade</span>
                  <p className="text-sm font-black text-slate-800">{Number(monthlyCapacity).toLocaleString('pt-BR')} T/mês</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Bancos & Caixa</span>
                  <p className="text-sm font-black text-emerald-600">
                    R$ {(Number(bankInitialBalance) + Number(cashboxInitialBalance)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Plano Ativo</span>
                  <p className="text-sm font-black text-purple-700 flex items-center gap-1">
                    <Award size={14} /> SaaS PRO
                  </p>
                </div>
              </div>

              <div className="p-5 bg-purple-50 border border-purple-100 rounded-3xl text-left max-w-2xl mx-auto space-y-2">
                <h4 className="font-black text-purple-950 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-purple-600" /> Próximos Passos Recomendados:
                </h4>
                <ul className="text-xs text-purple-900 font-bold space-y-1.5">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-purple-600" /> Emitir seu primeiro Pedido de Venda e Recibo
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-purple-600" /> Registrar uma pesagem de caminhão no Pátio
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-purple-600" /> Acompanhar o DRE e Fluxo de Caixa Diário
                  </li>
                </ul>
              </div>
            </div>
          )}

        </div>

        {/* Rodapé de Navegação do Wizard */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 md:px-8 py-5 flex justify-between items-center">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-2xl text-xs font-black uppercase transition-all flex items-center gap-2"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
          ) : (
            <div></div>
          )}

          {step < 5 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-8 py-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-xl shadow-purple-200 flex items-center gap-2 active:scale-95"
            >
              Próximo Passo <ArrowRight size={16} />
            </button>
          ) : (
            <button
              disabled={saving}
              onClick={handleFinishOnboarding}
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-xl shadow-emerald-200 flex items-center gap-2 active:scale-95"
            >
              {saving ? 'Configurando Usina...' : 'Concluir & Entrar no ERP'} <ArrowRight size={16} />
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
