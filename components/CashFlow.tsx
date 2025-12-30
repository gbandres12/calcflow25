
import React from 'react';
import { Transaction, TransactionType } from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  Filter, 
  Download, 
  Calendar, 
  CheckCircle2, 
  Clock 
} from 'lucide-react';

interface CashFlowProps {
  transactions: Transaction[];
}

const CashFlow: React.FC<CashFlowProps> = ({ transactions }) => {
  const totalIn = transactions
    .filter(t => t.type === TransactionType.SALE)
    .reduce((acc, t) => acc + t.amount, 0);

  const totalOut = transactions
    .filter(t => t.type !== TransactionType.SALE)
    .reduce((acc, t) => acc + t.amount, 0);

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Fluxo de Caixa</h2>
          <p className="text-slate-500 text-sm">Gestão financeira e conciliação bancária</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all">
            <Calendar size={18} /> Período
          </button>
          <button className="bg-slate-900 text-white px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-800 transition-all">
            <Download size={18} /> Relatório
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-emerald-500">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Entradas</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-slate-800">R$ {totalIn.toLocaleString('pt-BR')}</h3>
            <div className="bg-emerald-50 p-2 rounded-full text-emerald-600"><TrendingUp size={20} /></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-rose-500">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Saídas</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-slate-800">R$ {totalOut.toLocaleString('pt-BR')}</h3>
            <div className="bg-rose-50 p-2 rounded-full text-rose-600"><TrendingDown size={20} /></div>
          </div>
        </div>
        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg border-l-4 border-l-amber-500">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Saldo Atual</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold">R$ {(totalIn - totalOut).toLocaleString('pt-BR')}</h3>
            <div className="bg-amber-500 p-2 rounded-full text-slate-900"><CheckCircle2 size={20} /></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Movimentações do Mês</h3>
          <button className="text-slate-400 hover:text-slate-600"><Filter size={20} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                <th className="px-8 py-4">Data</th>
                <th className="px-6 py-4">Descrição</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4 text-right">Valor</th>
                <th className="px-8 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transactions.slice().reverse().map(t => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-4 text-sm font-medium text-slate-600">{t.date}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-800">{t.description}</td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${
                      t.type === TransactionType.SALE ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {t.type === TransactionType.SALE ? 'Entrada' : 'Saída'}
                    </span>
                  </td>
                  <td className={`px-6 py-4 text-right font-bold text-sm ${
                    t.type === TransactionType.SALE ? 'text-emerald-600' : 'text-slate-800'
                  }`}>
                    {t.type === TransactionType.SALE ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex justify-center">
                      <Clock size={16} className="text-slate-300" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CashFlow;
