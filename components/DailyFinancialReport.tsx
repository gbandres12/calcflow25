import React, { useState, useMemo } from 'react';
import { 
  Printer, Share2, Calendar, TrendingUp, TrendingDown, 
  DollarSign, CheckCircle2, Tag, ArrowUpRight, ArrowDownLeft,
  X, Filter, FileText, Download, Building, Landmark, MessageSquare
} from 'lucide-react';
import { 
  Transaction, 
  TransactionType, 
  FinancialAccount, 
  Company, 
  TransactionPayment 
} from '../types';

interface DailyFinancialReportProps {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  company: Company;
  isOpen: boolean;
  onClose: () => void;
}

export const DailyFinancialReport: React.FC<DailyFinancialReportProps> = ({
  transactions,
  accounts,
  company,
  isOpen,
  onClose
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');

  if (!isOpen) return null;

  const formatBRL = (val?: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDateBR = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  // Coleta todas as entradas de pagamento do dia selecionado (Fonte da Verdade = TransactionPayment)
  const reportData = useMemo(() => {
    const entries: {
      id: string;
      transactionId: string;
      description: string;
      category: string;
      type: 'INCOME' | 'EXPENSE' | 'DEDUCTION';
      amount: number;
      accountId: string;
      accountName: string;
      paymentMethod: string;
      notes?: string;
      time?: string;
    }[] = [];

    transactions.forEach(t => {
      // Se tiver pagamentos detalhados (TransactionPayment)
      if (t.payments && t.payments.length > 0) {
        t.payments.forEach(p => {
          if (p.paymentDate === selectedDate) {
            if (selectedAccountId !== 'ALL' && p.accountId !== selectedAccountId) {
              return;
            }

            const acc = accounts.find(a => a.id === p.accountId);
            const isDeduction = p.isDiscountOrDeduction || 
              t.category?.toLowerCase().includes('abatimento') || 
              t.category?.toLowerCase().includes('devolu') ||
              p.paymentMethod?.toLowerCase().includes('abatimento');

            let itemType: 'INCOME' | 'EXPENSE' | 'DEDUCTION' = 'INCOME';
            if (isDeduction) {
              itemType = 'DEDUCTION';
            } else if (t.type === TransactionType.SALE) {
              itemType = 'INCOME';
            } else {
              itemType = 'EXPENSE';
            }

            entries.push({
              id: p.id,
              transactionId: t.id,
              description: t.description,
              category: t.category,
              type: itemType,
              amount: p.amount,
              accountId: p.accountId,
              accountName: acc?.name || 'Caixa/Banco',
              paymentMethod: p.paymentMethod || 'PIX',
              notes: p.notes || t.notes
            });
          }
        });
      } else {
        // Fallback de transações legadas sem pagamentos filhos
        const effectiveDate = t.paymentDate || t.date;
        if (effectiveDate === selectedDate && t.paidAmount > 0) {
          if (selectedAccountId !== 'ALL' && t.accountId !== selectedAccountId) {
            return;
          }

          const acc = accounts.find(a => a.id === t.accountId);
          const isDeduction = t.category?.toLowerCase().includes('abatimento') || 
            t.category?.toLowerCase().includes('devolu') || 
            t.description?.toLowerCase().includes('abatimento');

          let itemType: 'INCOME' | 'EXPENSE' | 'DEDUCTION' = 'INCOME';
          if (isDeduction) {
            itemType = 'DEDUCTION';
          } else if (t.type === TransactionType.SALE) {
            itemType = 'INCOME';
          } else {
            itemType = 'EXPENSE';
          }

          entries.push({
            id: `leg-${t.id}`,
            transactionId: t.id,
            description: t.description,
            category: t.category,
            type: itemType,
            amount: t.paidAmount,
            accountId: t.accountId,
            accountName: acc?.name || 'Caixa/Banco',
            paymentMethod: t.paymentMethod || 'Dinheiro',
            notes: t.notes
          });
        }
      }
    });

    const incomes = entries.filter(e => e.type === 'INCOME');
    const expenses = entries.filter(e => e.type === 'EXPENSE');
    const deductions = entries.filter(e => e.type === 'DEDUCTION');

    const totalIncome = incomes.reduce((s, e) => s + e.amount, 0);
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
    const totalDeduction = deductions.reduce((s, e) => s + e.amount, 0);

    // Saldo Final Atual das contas selecionadas
    const currentFinalBalance = accounts
      .filter(a => selectedAccountId === 'ALL' || a.id === selectedAccountId)
      .reduce((s, a) => s + Number(a.initialBalance || 0), 0);

    // Saldo Inicial = Saldo Final - Entradas + Saídas
    const initialBalance = currentFinalBalance - totalIncome + totalExpense;

    return {
      incomes,
      expenses,
      deductions,
      totalIncome,
      totalExpense,
      totalDeduction,
      initialBalance,
      finalBalance: currentFinalBalance,
      netDayResult: totalIncome - totalExpense
    };
  }, [transactions, accounts, selectedDate, selectedAccountId]);

  const handlePrint = () => {
    window.print();
  };

  const handleSendWhatsApp = () => {
    const text = `*RELATÓRIO DIÁRIO DE CAIXA* 📊%0A` +
      `*Empresa:* ${company.name}%0A` +
      `*Data de Movimento:* ${formatDateBR(selectedDate)}%0A` +
      `------------------------------------%0A` +
      `💰 *Saldo Inicial:* ${formatBRL(reportData.initialBalance)}%0A` +
      `📥 *Total Entradas:* ${formatBRL(reportData.totalIncome)}%0A` +
      `📤 *Total Saídas:* ${formatBRL(reportData.totalExpense)}%0A` +
      (reportData.totalDeduction > 0 ? `🏷️ *Abatimentos / Devoluções:* ${formatBRL(reportData.totalDeduction)}%0A` : '') +
      `📈 *Resultado do Dia:* ${formatBRL(reportData.netDayResult)}%0A` +
      `🏦 *Saldo Final:* ${formatBRL(reportData.finalBalance)}%0A` +
      `------------------------------------%0A%0A` +
      `*📥 Entradas (${reportData.incomes.length}):*%0A` +
      reportData.incomes.slice(0, 10).map(i => `• ${i.description}: ${formatBRL(i.amount)} (${i.paymentMethod})`).join('%0A') +
      (reportData.incomes.length > 10 ? `%0A_...e mais ${reportData.incomes.length - 10} lançamentos_` : '') +
      `%0A%0A*📤 Saídas (${reportData.expenses.length}):*%0A` +
      reportData.expenses.slice(0, 10).map(e => `• ${e.description}: ${formatBRL(e.amount)} (${e.paymentMethod})`).join('%0A') +
      (reportData.expenses.length > 10 ? `%0A_...e mais ${reportData.expenses.length - 10} lançamentos_` : '') +
      `%0A%0A_Gerado via CalcárioFlow ERP em ${new Date().toLocaleString('pt-BR')}_`;

    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[150] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden my-auto border border-slate-100 flex flex-col max-h-[94vh]">
        
        {/* Barra de Topo / Controles */}
        <div className="p-6 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
              <FileText size={22} />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight">Relatório Diário de Caixa</h3>
              <p className="text-xs text-slate-400 font-medium">
                Fonte da Verdade: Liquidações Reais (TransactionPayment)
              </p>
            </div>
          </div>

          {/* Filtros de Data e Conta */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold">
              <Calendar size={14} className="text-amber-400 mr-2" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white outline-none cursor-pointer text-xs font-bold"
              />
            </div>

            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-1.5 text-xs font-bold outline-none"
            >
              <option value="ALL">Todas as Contas / Caixa</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>

            <button
              onClick={handleSendWhatsApp}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md"
              title="Compartilhar no WhatsApp"
            >
              <Share2 size={13} /> WhatsApp
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md"
            >
              <Printer size={13} /> Imprimir A4
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Conteúdo do Relatório (Estilizado para visualização na tela e impressão A4) */}
        <div className="p-8 overflow-y-auto flex-1 custom-scrollbar space-y-6 print:p-0 print:overflow-visible">
          
          {/* Cabeçalho do Relatório */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-5">
            <div>
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block">
                {company.name}
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Fechamento Diário de Caixa & Movimento
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Data de Competência: <strong className="text-slate-800">{formatDateBR(selectedDate)}</strong> • CNPJ: {company.document}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-black">
                <CheckCircle2 size={12} className="text-emerald-600" /> Relatório Auditado
              </span>
              <p className="text-[10px] text-slate-400 mt-1 font-mono">
                Emissão: {new Date().toLocaleTimeString('pt-BR')}
              </p>
            </div>
          </div>

          {/* KPIs Resumo do Dia */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Saldo Inicial</span>
              <strong className="text-sm font-black text-slate-700">{formatBRL(reportData.initialBalance)}</strong>
            </div>
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block flex items-center gap-1">
                📥 Entradas
              </span>
              <strong className="text-sm font-black text-emerald-700">+{formatBRL(reportData.totalIncome)}</strong>
            </div>
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl">
              <span className="text-[9px] font-black text-rose-700 uppercase tracking-widest block flex items-center gap-1">
                📤 Saídas
              </span>
              <strong className="text-sm font-black text-rose-700">-{formatBRL(reportData.totalExpense)}</strong>
            </div>
            <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-2xl">
              <span className="text-[9px] font-black text-purple-700 uppercase tracking-widest block flex items-center gap-1">
                🏷️ Abatimentos
              </span>
              <strong className="text-sm font-black text-purple-700">{formatBRL(reportData.totalDeduction)}</strong>
            </div>
            <div className="p-3.5 bg-slate-900 text-white rounded-2xl col-span-2 md:col-span-1">
              <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block">Saldo Final</span>
              <strong className="text-sm font-black text-white">{formatBRL(reportData.finalBalance)}</strong>
            </div>
          </div>

          {/* Tabela de Entradas (📥) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <span className="p-1 bg-emerald-100 text-emerald-700 rounded-md">📥</span> 
                Entradas / Recebimentos ({reportData.incomes.length})
              </h4>
              <span className="text-xs font-black text-emerald-600">{formatBRL(reportData.totalIncome)}</span>
            </div>

            {reportData.incomes.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">Nenhum recebimento registrado nesta data.</p>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase">
                    <tr>
                      <th className="p-3">Descrição</th>
                      <th className="p-3">Categoria</th>
                      <th className="p-3">Conta / Caixa</th>
                      <th className="p-3">Meio</th>
                      <th className="p-3 text-right">Valor Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {reportData.incomes.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{item.description}</td>
                        <td className="p-3 text-slate-500">{item.category}</td>
                        <td className="p-3 text-slate-600">{item.accountName}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-500">{item.paymentMethod}</td>
                        <td className="p-3 text-right font-black text-emerald-600">+{formatBRL(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tabela de Saídas (📤) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <span className="p-1 bg-rose-100 text-rose-700 rounded-md">📤</span> 
                Saídas / Pagamentos ({reportData.expenses.length})
              </h4>
              <span className="text-xs font-black text-rose-600">{formatBRL(reportData.totalExpense)}</span>
            </div>

            {reportData.expenses.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">Nenhum pagamento registrado nesta data.</p>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase">
                    <tr>
                      <th className="p-3">Descrição</th>
                      <th className="p-3">Categoria</th>
                      <th className="p-3">Conta / Caixa</th>
                      <th className="p-3">Meio</th>
                      <th className="p-3 text-right">Valor Pago</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {reportData.expenses.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{item.description}</td>
                        <td className="p-3 text-slate-500">{item.category}</td>
                        <td className="p-3 text-slate-600">{item.accountName}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-500">{item.paymentMethod}</td>
                        <td className="p-3 text-right font-black text-rose-600">-{formatBRL(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Seção Própria de Abatimentos / Devoluções (🏷️) */}
          {reportData.deductions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                <h4 className="text-xs font-black text-purple-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="p-1 bg-purple-100 text-purple-700 rounded-md">🏷️</span> 
                  Abatimentos & Devoluções ({reportData.deductions.length})
                </h4>
                <span className="text-xs font-black text-purple-700">{formatBRL(reportData.totalDeduction)}</span>
              </div>

              <div className="border border-purple-200 bg-purple-50/40 rounded-2xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-purple-100/50 text-[10px] font-black text-purple-800 uppercase">
                    <tr>
                      <th className="p-3">Origem / Referência</th>
                      <th className="p-3">Categoria</th>
                      <th className="p-3">Observações / Motivo</th>
                      <th className="p-3 text-right">Valor Abatido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-100 font-medium text-slate-700">
                    {reportData.deductions.map(item => (
                      <tr key={item.id} className="hover:bg-purple-50/80">
                        <td className="p-3 font-bold text-slate-900">{item.description}</td>
                        <td className="p-3 text-slate-500">{item.category}</td>
                        <td className="p-3 text-slate-600 italic">{item.notes || 'Abatimento direto'}</td>
                        <td className="p-3 text-right font-black text-purple-700">{formatBRL(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Assinatura / Fechamento Responsável */}
          <div className="pt-8 border-t border-slate-200 grid grid-cols-2 gap-8 text-center text-xs text-slate-500">
            <div>
              <div className="border-b border-slate-300 pb-1 mb-1 font-bold text-slate-800">
                Operador do Caixa / Balança
              </div>
              <span>Conferência de Lançamentos Diários</span>
            </div>
            <div>
              <div className="border-b border-slate-300 pb-1 mb-1 font-bold text-slate-800">
                Gerência Financeira / Controladoria
              </div>
              <span>Aprovação e Conciliação Bancária</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
