import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNfeXml } from '../nfeDocumentParser';
import {
  buildCashProjection,
  buildInstallmentsFromNf,
  findDuplicateNfeTransactions,
  findUnprojectedOrders,
  generateInstallmentsFromPreset
} from './payablesReceivables';
import {
  AccountType,
  FinancialAccount,
  OrderStatus,
  SaleOrder,
  Transaction,
  TransactionStatus,
  TransactionType
} from '../../types';

const SAMPLE_XML_WITH_DUPLICATAS = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe15261012345678000199550010000145201000145209" versao="4.00">
      <ide>
        <nNF>14520</nNF>
        <serie>1</serie>
        <dhEmi>2026-10-20T10:00:00-03:00</dhEmi>
        <natOp>VENDA DE COMBUSTIVEL E LUBRIFICANTES</natOp>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>DISTRIBUIDORA AMAZONIA DE DIESEL LTDA</xNome>
        <IE>151234567</IE>
        <enderEmit>
          <xLgr>Rodovia BR 163</xLgr>
          <nro>1000</nro>
          <xBairro>Industrial</xBairro>
          <xMun>Santarem</xMun>
          <UF>PA</UF>
          <CEP>68000000</CEP>
        </enderEmit>
      </emit>
      <dest>
        <CNPJ>10375218000150</CNPJ>
        <xNome>CALCARIOFLOW MINERACAO LTDA</xNome>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>DSL-S10</cProd>
          <xProd>OLEO DIESEL B S10</xProd>
          <NCM>27101921</NCM>
          <CFOP>5656</CFOP>
          <uCom>L</uCom>
          <qCom>5000</qCom>
          <vUnCom>6.00</vUnCom>
          <vProd>30000.00</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vProd>30000.00</vProd>
          <vNF>30000.00</vNF>
        </ICMSTot>
      </total>
      <cobr>
        <fat>
          <nFat>14520</nFat>
          <vOrig>30000.00</vOrig>
          <vLiq>30000.00</vLiq>
        </fat>
        <dup>
          <nDup>001</nDup>
          <dVenc>2026-11-19</dVenc>
          <vDup>15000.00</vDup>
        </dup>
        <dup>
          <nDup>002</nDup>
          <dVenc>2026-12-19</dVenc>
          <vDup>15000.00</vDup>
        </dup>
      </cobr>
      <pag>
        <detPag>
          <tPag>15</tPag>
          <vPag>30000.00</vPag>
        </detPag>
      </pag>
    </infNFe>
  </NFe>
</nfeProc>`;

test('parseNfeXml extrai duplicatas, forma de pagamento e sugere categoria/centro de custo', () => {
  const parsed = parseNfeXml(SAMPLE_XML_WITH_DUPLICATAS);
  assert.equal(parsed.nfNumber, '14520');
  assert.equal(parsed.accessKey, '15261012345678000199550010000145201000145209');
  assert.equal(parsed.supplierDocument, '12345678000199');
  assert.equal(parsed.paymentMethod, 'Boleto Bancário');
  assert.equal(parsed.suggestedCategory, 'Combustível (Diesel S10 / S500)');
  assert.equal(parsed.suggestedCostCenterId, 'cc3');
  assert.equal(parsed.duplicatas?.length, 2);
  assert.deepEqual(parsed.duplicatas?.[0], {
    nDup: '001',
    dVenc: '2026-11-19',
    vDup: 15000
  });

  const built = buildInstallmentsFromNf(parsed, '2026-10-20');
  assert.equal(built.fromXmlDuplicatas, true);
  assert.equal(built.installments.length, 2);
  assert.equal(built.installments[0].dueDate, '2026-11-19');
  assert.equal(built.installments[1].dueDate, '2026-12-19');
});

test('generateInstallmentsFromPreset divide centavos exatamente na ultima parcela', () => {
  const list = generateInstallmentsFromPreset(100, '2026-10-20', '30_60_90');
  assert.equal(list.length, 3);
  assert.equal(list[0].amount, 33.33);
  assert.equal(list[1].amount, 33.33);
  assert.equal(list[2].amount, 33.34);
  assert.equal(Number((list[0].amount + list[1].amount + list[2].amount).toFixed(2)), 100);
});

test('findDuplicateNfeTransactions detecta nota ja lancada pela chave ou numero+CNPJ', () => {
  const parsed = parseNfeXml(SAMPLE_XML_WITH_DUPLICATAS);
  const existing: Transaction[] = [
    {
      id: 'tx-1',
      accountId: 'acc-1',
      date: '2026-10-20',
      dueDate: '2026-11-19',
      type: TransactionType.PURCHASE,
      status: TransactionStatus.PENDENTE,
      description: 'NF 14520',
      category: 'Combustível',
      amount: 15000,
      paidAmount: 0,
      nfeChave: '15261012345678000199550010000145201000145209'
    }
  ];
  const dups = findDuplicateNfeTransactions(existing, parsed);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].id, 'tx-1');
});

test('buildCashProjection calcula saldo disponivel, a receber, a pagar e saldo projetado', () => {
  const accounts: FinancialAccount[] = [
    { id: 'acc-1', name: 'Banco', type: AccountType.BANCO, initialBalance: 10000 }
  ];
  const txs: Transaction[] = [
    {
      id: 'tx-rec-1',
      accountId: 'acc-1',
      date: '2026-10-22',
      dueDate: '2026-10-25',
      type: TransactionType.SALE,
      status: TransactionStatus.PENDENTE,
      description: 'Venda #1',
      category: 'Venda',
      amount: 8000,
      paidAmount: 0
    },
    {
      id: 'tx-pay-1',
      accountId: 'acc-1',
      date: '2026-10-22',
      dueDate: '2026-10-28',
      type: TransactionType.PURCHASE,
      status: TransactionStatus.PENDENTE,
      description: 'NF Diesel',
      category: 'Combustível',
      amount: 5000,
      paidAmount: 1000
    }
  ];

  const proj = buildCashProjection(accounts, txs, '2026-10-22', '2026-11-22', true);
  // 10000 inicial - 1000 já pago parcial (sem array payments, status PARCIAL ou PENDENTE: status é PENDENTE então 10000)
  assert.equal(proj.availableBalance, 10000);
  assert.equal(proj.totalReceivablesInHorizon, 8000);
  assert.equal(proj.totalPayablesInHorizon, 4000);
  assert.equal(proj.projectedFinalBalance, 14000);
});

test('findUnprojectedOrders retorna vendas finalizadas sem transacao vinculada', () => {
  const orders: SaleOrder[] = [
    {
      id: 'ord-1',
      reference: 'PED-001',
      customerId: 'c1',
      sellerName: 'Vendedor',
      date: '2026-10-22',
      withoutFinance: true,
      items: [],
      subtotal: 5000,
      discount: 0,
      shipping: 0,
      total: 5000,
      status: OrderStatus.FINALIZED,
      payments: []
    }
  ];
  const unprojected = findUnprojectedOrders(orders, []);
  assert.equal(unprojected.length, 1);
  assert.equal(unprojected[0].id, 'ord-1');
});
