import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeItemTaxes,
  computeOrderTaxes,
  isIcmsTributado,
  isIpiTributado,
  rateioFrete,
} from './nfeTaxes';
import { fiscalService } from './fiscalService';
import { buildNfeDuplicateDraft } from './nfeDuplicate';
import { DEFAULT_FISCAL_CONFIG } from '../constants';
import { Customer, OrderStatus, SaleOrder, SaleOrderItem } from '../types';

describe('nfeTaxes: regras de destaque de ICMS e IPI', () => {
  it('identifica corretamente CSTs tributados de ICMS e IPI', () => {
    assert.equal(isIcmsTributado('00'), true);
    assert.equal(isIcmsTributado('10'), true);
    assert.equal(isIcmsTributado('20'), true);
    assert.equal(isIcmsTributado('51'), true);
    assert.equal(isIcmsTributado('90'), true);
    assert.equal(isIcmsTributado('900'), true); // CSOSN Simples
    assert.equal(isIcmsTributado('40'), false);
    assert.equal(isIcmsTributado('41'), false);
    assert.equal(isIcmsTributado('102'), false);

    assert.equal(isIpiTributado('50'), true);
    assert.equal(isIpiTributado('99'), true);
    assert.equal(isIpiTributado('00'), true);
    assert.equal(isIpiTributado('51'), false);
    assert.equal(isIpiTributado('52'), false);
    assert.equal(isIpiTributado('53'), false);
  });

  it('calcula ICMS integral para CST 00 (Base = Produto, Valor = Base x Aliq)', () => {
    const item: SaleOrderItem = {
      productId: 'p1',
      productCode: '001',
      productName: 'Brita Industrial',
      unit: 'TON',
      quantity: 10,
      unitPrice: 100,
      discount: 0,
      total: 1000,
      cst: '00',
      aliquotaIcms: 12,
    };
    const tax = computeItemTaxes(item);
    assert.equal(tax.icmsTributado, true);
    assert.equal(tax.aliquotaIcms, 12);
    assert.equal(tax.baseCalculoIcms, 1000);
    assert.equal(tax.valorIcms, 120);
  });

  it('aplica redução de base de cálculo para CST 20', () => {
    const item: SaleOrderItem = {
      productId: 'p1',
      productCode: '001',
      productName: 'Produto com Redução',
      unit: 'UN',
      quantity: 1,
      unitPrice: 1000,
      discount: 0,
      total: 1000,
      cst: '20',
      aliquotaIcms: 18,
      reducaoBcIcms: 33.33,
    };
    const tax = computeItemTaxes(item);
    assert.equal(tax.icmsTributado, true);
    assert.equal(tax.reducaoBcIcms, 33.33);
    assert.equal(tax.baseCalculoIcms, 666.7);
    assert.equal(tax.valorIcms, 120.01);
  });

  it('rateia frete proporcionalmente aos itens e compõe base do ICMS', () => {
    const items: SaleOrderItem[] = [
      {
        productId: 'p1',
        productCode: '01',
        productName: 'Item 1',
        unit: 'TON',
        quantity: 10,
        unitPrice: 100,
        discount: 0,
        total: 1000,
        cst: '00',
        aliquotaIcms: 12,
      },
      {
        productId: 'p2',
        productCode: '02',
        productName: 'Item 2',
        unit: 'TON',
        quantity: 10,
        unitPrice: 300,
        discount: 0,
        total: 3000,
        cst: '00',
        aliquotaIcms: 12,
      },
    ];
    const rateio = rateioFrete(items, 400);
    assert.equal(rateio[0], 100);
    assert.equal(rateio[1], 300);

    const orderTax = computeOrderTaxes(items, { frete: 400 });
    assert.equal(orderTax.items[0].baseCalculoIcms, 1100); // 1000 + 100 de frete
    assert.equal(orderTax.items[0].valorIcms, 132); // 1100 * 12%
    assert.equal(orderTax.items[1].baseCalculoIcms, 3300); // 3000 + 300 de frete
    assert.equal(orderTax.items[1].valorIcms, 396); // 3300 * 12%
    assert.equal(orderTax.totals.baseCalculoIcms, 4400);
    assert.equal(orderTax.totals.valorIcms, 528);
  });

  it('calcula destaque de IPI quando selecionado no item', () => {
    const item: SaleOrderItem = {
      productId: 'p1',
      productCode: '001',
      productName: 'Produto Industrializado',
      unit: 'UN',
      quantity: 5,
      unitPrice: 200,
      discount: 0,
      total: 1000,
      cst: '00',
      aliquotaIcms: 12,
      destacarIpi: true,
      cstIpi: '50',
      aliquotaIpi: 5,
      cEnqIpi: '999',
    };
    const tax = computeItemTaxes(item);
    assert.equal(tax.destacarIpi, true);
    assert.equal(tax.ipiTributado, true);
    assert.equal(tax.cstIpi, '50');
    assert.equal(tax.cEnqIpi, '999');
    assert.equal(tax.aliquotaIpi, 5);
    assert.equal(tax.baseCalculoIpi, 1000);
    assert.equal(tax.valorIpi, 50);
  });

  it('soma IPI no valor total da nota fiscal (vNF)', () => {
    const items: SaleOrderItem[] = [
      {
        productId: 'p1',
        productCode: '001',
        productName: 'Produto Industrial',
        unit: 'UN',
        quantity: 1,
        unitPrice: 1000,
        discount: 0,
        total: 1000,
        cst: '00',
        aliquotaIcms: 12,
        destacarIpi: true,
        cstIpi: '50',
        aliquotaIpi: 10, // 100 R$ de IPI
      },
    ];
    const res = computeOrderTaxes(items, { frete: 50, desconto: 0 });
    assert.equal(res.totals.valorProdutos, 1000);
    assert.equal(res.totals.valorFrete, 50);
    assert.equal(res.totals.valorIpi, 100);
    assert.equal(res.totals.valorTotalNota, 1150); // 1000 + 50 frete + 100 IPI
  });

  it('monta payload fiscal com blocos icms e ipi completos para a NotaAs / SEFAZ', () => {
    const order: SaleOrder = {
      id: 'ord-tax-1',
      reference: 'PV-TAX-01',
      customerId: 'cust-1',
      sellerName: 'Gabriel',
      date: '2026-11-11',
      items: [
        {
          productId: 'p1',
          productCode: '001',
          productName: 'Calcário Moído Especial',
          unit: 'TON',
          quantity: 20,
          unitPrice: 100,
          discount: 0,
          total: 2000,
          ncm: '25171000',
          cfop: '5101',
          cst: '00',
          aliquotaIcms: 12,
          destacarIpi: true,
          cstIpi: '50',
          aliquotaIpi: 5,
          cEnqIpi: '999',
        },
      ],
      subtotal: 2000,
      discount: 0,
      shipping: 200,
      total: 2200,
      frete: { modalidade: 0, valor: 200 }, // CIF: frete compõe a nota e a BC
      status: OrderStatus.FINALIZED,
      paymentMethod: 'PIX',
      payments: [],
    };

    const customer: Customer = {
      id: 'cust-1',
      name: 'Agropecuária Fazenda Real Ltda',
      document: '04123456000189',
      tipoPessoa: 'PJ',
      email: 'fiscal@fazendareal.com.br',
      phone: '93991234567',
      totalSpent: 0,
      street: 'Rodovia Transamazônica',
      number: 'Km 12',
      neighborhood: 'Zona Rural',
      city: 'Santarém',
      state: 'PA',
      zipCode: '68000000',
      ibgeCode: '1506807',
      ie: '151234567',
    };

    const payload = fiscalService.montarPayloadNotaAs(order, customer, DEFAULT_FISCAL_CONFIG);
    const item0 = payload.items[0];

    // ICMS destacado
    assert.equal(item0.cst, '00');
    assert.equal(item0.aliquotaIcms, 12);
    assert.equal(item0.baseCalculoIcms, 2200); // 2000 + 200 frete CIF
    assert.equal(item0.valorIcms, 264); // 2200 * 12%
    assert.equal(item0.modalidadeBaseCalculoIcms, 3);
    assert.deepEqual(item0.icms, {
      cst: '00',
      modalidadeBaseCalculo: 3,
      baseCalculo: 2200,
      aliquota: 12,
      valor: 264,
    });

    // IPI destacado
    assert.equal(item0.cstIpi, '50');
    assert.equal(item0.codigoEnquadramentoIpi, '999');
    assert.equal(item0.aliquotaIpi, 5);
    assert.equal(item0.baseCalculoIpi, 2000);
    assert.equal(item0.valorIpi, 100);
    assert.deepEqual(item0.ipi, {
      cst: '50',
      codigoEnquadramento: '999',
      vBC: 2000,
      pIPI: 5,
      vIPI: 100,
    });

    // Totais e Pagamentos
    assert.equal(payload.totais?.baseCalculoIcms, 2200);
    assert.equal(payload.totais?.valorIcms, 264);
    assert.equal(payload.totais?.valorIpi, 100);
    assert.equal(payload.totais?.valorTotal, 2300); // 2000 produtos + 200 frete + 100 IPI
    assert.equal(payload.pagamentos[0].valor, 2300);
  });

  it('duplicação de nota preserva campos de ICMS e IPI', () => {
    const originalOrder: SaleOrder = {
      id: 'ord-orig',
      reference: 'PV-ORIG',
      customerId: 'cust-1',
      sellerName: 'Gabriel',
      date: '2026-11-11',
      items: [
        {
          productId: 'p1',
          productCode: '001',
          productName: 'Calcário Especial',
          unit: 'TON',
          quantity: 10,
          unitPrice: 150,
          discount: 0,
          total: 1500,
          cst: '00',
          cfop: '5101',
          ncm: '25171000',
          aliquotaIcms: 12,
          reducaoBcIcms: 10,
          destacarIpi: true,
          cstIpi: '50',
          aliquotaIpi: 5,
          cEnqIpi: '999',
        },
      ],
      subtotal: 1500,
      discount: 0,
      shipping: 0,
      total: 1500,
      status: OrderStatus.FINALIZED,
      payments: [],
    };

    const draft = buildNfeDuplicateDraft(originalOrder);
    const item = draft.items[0];
    assert.equal(item.cst, '00');
    assert.equal(item.aliquotaIcms, 12);
    assert.equal(item.reducaoBcIcms, 10);
    assert.equal(item.destacarIpi, true);
    assert.equal(item.cstIpi, '50');
    assert.equal(item.aliquotaIpi, 5);
    assert.equal(item.cEnqIpi, '999');
  });

  it('calcula e monta payload exato do caso de devolução (Bomba Weichai, Frete R$42, Desconto R$51,93, ICMS 4%)', () => {
    const chaveOriginal = '15261110375218000184550010000072111265883172';
    const devolucaoOrder: SaleOrder = {
      id: 'ord-dev-weichai',
      reference: 'DEV-WEICHAI-01',
      customerId: 'cust-1',
      sellerName: 'Gabriel',
      date: '2026-11-11',
      nfeNaturezaOperacao: 'Devolução de compra para industrialização',
      nfeChave: chaveOriginal,
      items: [
        {
          productId: 'prod-weichai',
          productCode: '12159770',
          productName: "Bomba d'água motor Weichai WP4/WP6 35X65/M18X1,25/52",
          unit: 'Unid',
          quantity: 1,
          unitPrice: 519.3,
          discount: 51.93,
          total: 467.37,
          ncm: '84133090',
          cfop: '6202',
          cst: '00',
          aliquotaIcms: 4,
        },
      ],
      subtotal: 519.3,
      discount: 51.93,
      shipping: 42,
      total: 509.37,
      frete: { modalidade: 0, valor: 42 }, // CIF: frete compõe a nota e a base do ICMS
      status: OrderStatus.FINALIZED,
      paymentMethod: 'Sem Pagamento',
      payments: [],
    };

    const customer: Customer = {
      id: 'cust-1',
      name: 'Fornecedor Weichai Motores S/A',
      document: '04123456000189',
      tipoPessoa: 'PJ',
      email: 'fiscal@weichai.com.br',
      phone: '11999999999',
      totalSpent: 0,
      street: 'Av Industrial',
      number: '1000',
      neighborhood: 'Distrito Industrial',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01000000',
      ibgeCode: '3550308',
      ie: '111222333444',
    };

    const payload = fiscalService.montarPayloadNotaAs(devolucaoOrder, customer, DEFAULT_FISCAL_CONFIG, {
      devolucao: { chaveAcesso: chaveOriginal, nItem: 1 },
    });

    assert.equal(payload.finalidade, 4, 'Finalidade deve ser 4 (devolução)');
    assert.equal(payload.tipoOperacao, 1, 'CFOP 6202 é saída (1)');
    assert.equal(payload.valorFrete, 42);
    assert.equal(payload.valorDesconto, 51.93);

    const item0 = payload.items[0];
    assert.equal(item0.cfop, '6202');
    assert.equal(item0.cst, '00');
    assert.equal(item0.quantidade, 1);
    assert.equal(item0.valorUnitario, 519.3);
    assert.equal(item0.valorTotal, 519.3, 'vProd do item deve ser 519,30');
    assert.equal(item0.valorDesconto, 51.93, 'vDesc do item deve ser 51,93');
    assert.equal(item0.aliquotaIcms, 4);
    assert.equal(item0.baseCalculoIcms, 509.37, 'Base de cálculo do ICMS deve ser 509,37 (519,30 - 51,93 + 42,00)');
    assert.equal(item0.valorIcms, 20.37, 'Valor do ICMS deve ser 20,37 (509,37 * 4%)');

    assert.equal(payload.totais?.valorProdutos, 519.3);
    assert.equal(payload.totais?.valorDesconto, 51.93);
    assert.equal(payload.totais?.valorFrete, 42);
    assert.equal(payload.totais?.baseCalculoIcms, 509.37);
    assert.equal(payload.totais?.valorIcms, 20.37);
    assert.equal(payload.totais?.valorTotal, 509.37, 'Total da NF-e deve ser exatamente 509,37');
  });
});
