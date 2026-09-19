import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Customer, FiscalConfig, OrderStatus, SaleOrder } from '../../types';
import { avaliarAptidaoNfe, simplifyNotaasError } from './telegramNfe';

const baseCustomer = (): Customer =>
  ({
    id: 'cust-1',
    name: 'Fazenda Teste',
    document: '12345678000190',
    street: 'Rodovia BR-163',
    city: 'Santarém',
    state: 'PA',
    zipCode: '68000000'
  }) as Customer;

const baseOrder = (overrides: Partial<SaleOrder> = {}): SaleOrder =>
  ({
    id: 'ord-1',
    reference: 'PED-2026-0001',
    customerId: 'cust-1',
    sellerName: 'Vendedor',
    date: '2026-09-19',
    items: [
      {
        productId: 'moido',
        productName: 'Moído',
        unit: 'Ton',
        quantity: 10,
        unitPrice: 180,
        discount: 0,
        total: 1800,
        cfop: '5101',
        ncm: '25171000'
      }
    ],
    subtotal: 1800,
    discount: 0,
    shipping: 0,
    total: 1800,
    status: OrderStatus.FINALIZED,
    payments: [],
    receipts: [],
    nfeStatus: 'nao_emitida',
    ...overrides
  }) as SaleOrder;

const baseConfig = (overrides: Partial<FiscalConfig> = {}): FiscalConfig =>
  ({
    id: 'fiscal-1',
    apiKey: 'ntaas_abc',
    naturezaOperacaoPadrao: 'Venda de produção do estabelecimento',
    cfopPadraoEstadual: '5101',
    cfopPadraoInterestadual: '6101',
    ufEmitente: 'PA',
    ...overrides
  }) as FiscalConfig;

describe('telegramNfe: aptidão', () => {
  it('recusa orçamento não confirmado', () => {
    const aptidao = avaliarAptidaoNfe({
      order: baseOrder({ status: OrderStatus.BUDGET }),
      customer: baseCustomer(),
      config: baseConfig()
    });
    assert.equal(aptidao.apto, false);
    assert.match(aptidao.faltas.join(' '), /confirmado/);
  });

  it('recusa pedido já autorizado (idempotência)', () => {
    const aptidao = avaliarAptidaoNfe({
      order: baseOrder({ nfeStatus: 'autorizada', nfeNumero: '100' }),
      customer: baseCustomer(),
      config: baseConfig()
    });
    assert.equal(aptidao.apto, false);
    assert.match(aptidao.faltas.join(' '), /já tem NF-e autorizada/);
  });

  it('recusa pedido em processamento', () => {
    const aptidao = avaliarAptidaoNfe({
      order: baseOrder({ nfeStatus: 'processando' }),
      customer: baseCustomer(),
      config: baseConfig()
    });
    assert.equal(aptidao.apto, false);
    assert.match(aptidao.faltas.join(' '), /processamento/);
  });

  it('lista falta de apiKey e documento', () => {
    const aptidao = avaliarAptidaoNfe({
      order: baseOrder(),
      customer: { ...baseCustomer(), document: '' },
      config: baseConfig({ apiKey: '' })
    });
    assert.equal(aptidao.apto, false);
    assert.match(aptidao.faltas.join(' '), /Project Key/);
    assert.match(aptidao.faltas.join(' '), /CPF\/CNPJ/);
  });

  it('aprova pedido confirmado com cadastro e config ok', () => {
    const aptidao = avaliarAptidaoNfe({
      order: baseOrder(),
      customer: baseCustomer(),
      config: baseConfig()
    });
    assert.equal(aptidao.apto, true);
    assert.equal(aptidao.cfopDisponivel, '5101');
  });
});

describe('telegramNfe: erros amigáveis', () => {
  it('simplifica timeout e 401', () => {
    assert.match(simplifyNotaasError('timeout: não respondeu'), /demorou/);
    assert.match(simplifyNotaasError('HTTP 401 chave rejeitada'), /Project Key/);
  });
});
