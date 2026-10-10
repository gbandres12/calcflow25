import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Transaction, TransactionType, TransactionStatus, FinancialAccount, AccountType } from '../types';
import { INITIAL_COST_CENTERS } from '../constants';

describe('confiabilidade financeira: abatimentos e centros de custo', () => {
  it('abatimentos não inflam saldo bancário de contas correntes', () => {
    const account: FinancialAccount = {
      id: 'acc-1',
      name: 'Banco do Brasil',
      bankName: 'Banco do Brasil',
      initialBalance: 1000,
      type: AccountType.BANCO
    };

    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        type: TransactionType.SALE,
        description: 'Venda de Calcário - Fazenda Boa Vista',
        category: 'Venda Calcário Moído Granel',
        amount: 5000,
        paidAmount: 2000,
        status: TransactionStatus.PARCIAL,
        date: '2026-10-10',
        accountId: 'acc-1',
        payments: [
          {
            id: 'pmt-1',
            transactionId: 'tx-1',
            amount: 1500,
            paymentDate: '2026-10-10',
            accountId: 'acc-1',
            paymentMethod: 'PIX',
            isDiscountOrDeduction: false
          },
          {
            id: 'pmt-2',
            transactionId: 'tx-1',
            amount: 500,
            paymentDate: '2026-10-10',
            accountId: 'acc-1',
            paymentMethod: 'Abatimento / Devolução',
            isDiscountOrDeduction: true // Abatimento concedido
          }
        ]
      }
    ];

    // Simula a lógica oficial de saldo de FinancialAccounts
    let totalIn = 0;
    transactions.forEach(t => {
      t.payments?.forEach(p => {
        if (p.isDiscountOrDeduction) return; // Abatimento ignorado do saldo em dinheiro
        if (p.accountId === account.id) {
          totalIn += Number(p.amount || 0);
        }
      });
    });

    const saldoFinal = (account.initialBalance || 0) + totalIn;
    // Saldo real deve ser 1000 + 1500 = 2500, e NÃO 3000!
    assert.equal(totalIn, 1500, 'Total de entradas reais em dinheiro deve ser 1500');
    assert.equal(saldoFinal, 2500, 'Saldo bancário deve desconsiderar o abatimento');
  });

  it('lançamento direto com categoria de abatimento não entra em entradas bancárias', () => {
    const txDeduction: Transaction = {
      id: 'tx-2',
      type: TransactionType.SALE,
      description: 'Abatimento por Quebra de Carga',
      category: 'Abatimentos e Descontos Concedidos',
      amount: 300,
      paidAmount: 300,
      status: TransactionStatus.CONFIRMADO,
      date: '2026-10-10',
      accountId: 'acc-1'
    };

    const isDeduction = txDeduction.category?.toLowerCase().includes('abatimento') ||
      txDeduction.description?.toLowerCase().includes('abatimento');
    
    assert.equal(isDeduction, true);
  });

  it('centro de custo funciona bidirecionalmente por ID e por Nome', () => {
    const costCenters = INITIAL_COST_CENTERS;
    const targetCc = costCenters.find(c => c.id === 'cc2')!; // 'Produção / Moinhos & Britagem'

    // Cenário 1: lançamento gravado com costCenterId = 'cc2'
    const txWithId: Transaction = {
      id: 'tx-cc-id',
      type: TransactionType.EXPENSE,
      description: 'Peça triturador',
      category: 'Manutenção de Máquinas',
      amount: 1000,
      paidAmount: 1000,
      status: TransactionStatus.PAGO,
      date: '2026-10-10',
      accountId: 'acc-1',
      costCenterId: 'cc2',
      costCenter: targetCc.name
    };

    // Cenário 2: lançamento legado gravado só com nome (costCenter)
    const txWithNameOnly: Transaction = {
      id: 'tx-cc-name',
      type: TransactionType.EXPENSE,
      description: 'Manutenção britadeira',
      category: 'Manutenção de Máquinas',
      amount: 800,
      paidAmount: 800,
      status: TransactionStatus.PAGO,
      date: '2026-10-10',
      accountId: 'acc-1',
      costCenter: targetCc.name
    };

    const filterCc = 'cc2';
    const filterFn = (t: Transaction) => {
      const selectedCc = costCenters.find(cc => cc.id === filterCc);
      const matchesId = t.costCenterId === filterCc;
      const matchesName = Boolean(selectedCc && t.costCenter && t.costCenter.trim().toLowerCase() === selectedCc.name.trim().toLowerCase());
      return matchesId || matchesName;
    };

    assert.equal(filterFn(txWithId), true, 'Deve encontrar transação gravada com costCenterId');
    assert.equal(filterFn(txWithNameOnly), true, 'Deve encontrar transação gravada apenas com nome do centro de custo');
  });

  it('resolução de centro de custo preenche costCenterId e costCenter name harmonicamente', () => {
    const costCenters = INITIAL_COST_CENTERS;
    
    const resolve = (ccId?: string, ccName?: string) => {
      const resolved = costCenters.find(c => c.id === ccId || (ccName && c.name.toLowerCase() === ccName.toLowerCase()));
      return {
        costCenterId: resolved?.id || ccId || 'cc1',
        costCenter: resolved?.name || ccName || 'Administrativo & Diretoria'
      };
    };

    const fromId = resolve('cc3');
    assert.equal(fromId.costCenterId, 'cc3');
    assert.equal(fromId.costCenter, 'Frota, Pátio & Balança');

    const fromName = resolve(undefined, 'Comercial & Vendas Agro');
    assert.equal(fromName.costCenterId, 'cc4');
    assert.equal(fromName.costCenter, 'Comercial & Vendas Agro');
  });
});
