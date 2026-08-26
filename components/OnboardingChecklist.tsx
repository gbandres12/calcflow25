import React, { useState } from 'react';
import { Customer, SaleOrder, Transaction, FinancialAccount, User, View } from '../types';
import { 
  Sparkles, CheckCircle2, Circle, ChevronRight, X, 
  Rocket, Users, ShoppingCart, Truck, Wallet, FileText,
  HelpCircle, ExternalLink
} from 'lucide-react';

interface OnboardingChecklistProps {
  user: User;
  customers: Customer[];
  orders: SaleOrder[];
  transactions: Transaction[];
  accounts: FinancialAccount[];
  onNavigate?: (view: View) => void;
  onOpenOnboardingModal?: () => void;
}

export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
  user,
  customers,
  orders,
  transactions,
  accounts,
  onNavigate,
  onOpenOnboardingModal
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  // Calcula itens completos
  const tasks = [
    {
      id: 'company',
      title: 'Parametrização da Usina & Mineração',
      desc: 'Nome da usina, capacidade de moagem e dados fiscais',
      isDone: !!user.companyName,
      actionLabel: 'Revisar Configuração',
      onClick: () => onOpenOnboardingModal?.(),
      icon: Sparkles
    },
    {
      id: 'customer',
      title: 'Cadastrar Primeiro Cliente / Produtor',
      desc: 'Adicione compradores rurais ou revendas agrícolas',
      isDone: customers.length > 0,
      actionLabel: 'Cadastrar Cliente',
      onClick: () => onNavigate?.('customers'),
      icon: Users
    },
    {
      id: 'order',
      title: 'Emitir Primeiro Pedido de Venda',
      desc: 'Gere um orçamento ou venda confirmada com recibo',
      isDone: orders.length > 0,
      actionLabel: 'Nova Venda',
      onClick: () => onNavigate?.('orders'),
      icon: ShoppingCart
    },
    {
      id: 'withdrawal',
      title: 'Registrar Saída de Caminhão na Balança',
      desc: 'Emita um romaneio de pesagem física e carga de calcário',
      isDone: orders.some(o => (o.withdrawals || []).length > 0),
      actionLabel: 'Ir para Vendas & Romaneios',
      onClick: () => onNavigate?.('orders'),
      icon: Truck
    },
    {
      id: 'financial',
      title: 'Conciliar Caixa ou Conta Bancária',
      desc: 'Registre entradas de vendas e despesas de diesel',
      isDone: transactions.length > 0,
      actionLabel: 'Ver Transações',
      onClick: () => onNavigate?.('transactions'),
      icon: Wallet
    }
  ];

  const completedCount = tasks.filter(t => t.isDone).length;
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  // Se o usuário já completou 100% ou dispensou, não ocupa espaço excessivo
  if (isDismissed) {
    return (
      <div className="bg-purple-50/70 border border-purple-200/80 p-3 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-black text-purple-900">
          <Sparkles size={14} className="text-purple-600" />
          Guia de Início Rápido ({progressPercent}% concluído)
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsDismissed(false)}
            className="text-xs font-black text-purple-700 hover:underline"
          >
            Abrir Checklist
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950 text-white rounded-[2.5rem] p-6 md:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute -top-12 -right-12 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-purple-600/30 border border-purple-500/40 text-purple-300 rounded-2xl shadow-inner">
            <Rocket size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-black text-white tracking-tight">Guia de Ativação do SaaS</h3>
              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {progressPercent === 100 ? 'Usina 100% Pronta' : `${completedCount} de ${tasks.length} Concluídos`}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Siga os passos abaixo para dominar a gestão de mineração, pátio e comercial do CalcárioFlow.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          {/* Barra de Progresso */}
          <div className="w-36 space-y-1">
            <div className="flex justify-between text-[10px] font-black">
              <span className="text-slate-400 uppercase">Progresso</span>
              <span className="text-purple-400">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          <button 
            onClick={() => setIsDismissed(true)}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-all"
            title="Minimizar Guia"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Grid de Tarefas do Onboarding */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-6">
        {tasks.map(task => {
          const Icon = task.icon;
          return (
            <div 
              key={task.id}
              onClick={task.onClick}
              className={`p-4 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between gap-3 ${
                task.isDone 
                  ? 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800' 
                  : 'bg-slate-800/90 border-purple-500/30 hover:border-purple-400 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl shrink-0 ${task.isDone ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <h4 className={`text-xs font-black tracking-tight ${task.isDone ? 'text-slate-300' : 'text-white group-hover:text-purple-300'}`}>
                      {task.title}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-medium line-clamp-1">{task.desc}</p>
                  </div>
                </div>

                {task.isDone ? (
                  <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                ) : (
                  <Circle size={18} className="text-slate-600 group-hover:text-purple-400 shrink-0" />
                )}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-800/80 text-[10px] font-black">
                <span className={task.isDone ? 'text-emerald-400' : 'text-purple-400 group-hover:underline flex items-center gap-1'}>
                  {task.actionLabel}
                </span>
                <ChevronRight size={14} className="text-slate-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
