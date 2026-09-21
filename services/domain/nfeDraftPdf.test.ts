import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { OrderStatus, SaleOrder } from '../../types';
import { buildNfeDraftPdf, draftPdfFileName } from './nfeDraftPdf';

function inflatePdfStreams(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const chunks: string[] = [];
  let offset = 0;
  while (true) {
    const start = raw.indexOf(Buffer.from('stream'), offset);
    if (start < 0) break;
    let dataStart = start + 6;
    if (raw[dataStart] === 0x0d) dataStart += 1;
    if (raw[dataStart] === 0x0a) dataStart += 1;
    const end = raw.indexOf(Buffer.from('endstream'), dataStart);
    if (end < 0) break;
    const payload = raw.subarray(dataStart, end - (raw[end - 1] === 0x0a ? 1 : 0));
    try {
      chunks.push(inflateSync(payload).toString('latin1'));
    } catch {
      chunks.push(payload.toString('latin1'));
    }
    offset = end + 9;
  }
  return chunks
    .join('\n')
    .replace(/<([0-9A-Fa-f]+)>/g, (_, hex) => Buffer.from(hex, 'hex').toString('latin1'))
    .replace(/\(([^)]*)\)/g, '$1');
}

describe('PDF de previa do rascunho da NF-e', () => {
  it('gera A4 marcado como rascunho sem valor fiscal', async () => {
    const order = {
      id: 'ord-draft-1',
      reference: 'PED-2026-0044',
      customerId: 'cust-1',
      sellerName: 'Gabriel',
      date: '2026-09-21',
      items: [
        {
          productId: 'moido',
          productCode: '001',
          productName: 'Calcario Agricola Moido',
          unit: 'Ton',
          quantity: 20,
          unitPrice: 160,
          discount: 0,
          total: 3200,
          ncm: '2517.10.00',
          cfop: '5101',
          cst: '40',
        },
      ],
      subtotal: 3200,
      discount: 0,
      shipping: 80,
      total: 3280,
      status: OrderStatus.FINALIZED,
      paymentMethod: 'PIX',
      payments: [],
      nfeStatus: 'rascunho',
      nfeNaturezaOperacao: 'Venda de producao do estabelecimento',
      nfeInfCpl: 'Clausula cadastrada no produto. Sem texto automatico.',
      nfeNumero: '1048',
      nfeSerie: '1',
      frete: { modalidade: 0, valor: 80, transportadora: { nome: 'Trans Para', documento: '11222333000144' } },
    } as SaleOrder;

    const bytes = await buildNfeDraftPdf({
      order,
      customer: {
        id: 'cust-1',
        name: 'Fazenda Boa Vista',
        document: '12.345.678/0001-90',
        ie: '123456789',
        street: 'Rodovia PA-370',
        number: 'SN',
        city: 'Santarem',
        state: 'PA',
        email: '',
        phone: '',
        totalSpent: 0,
      },
      config: {
        id: 'cfg-1',
        apiKey: '',
        environment: 'sandbox',
        cnpjEmitente: '00.000.000/0001-00',
        inscricaoEstadual: '151234567',
        razaoSocial: 'CBA Mineracao Ltda',
        nomeFantasia: 'CBA',
        cidadeEmitente: 'Santarem',
        ufEmitente: 'PA',
        regimeTributario: '1',
        serieNFe: '1',
        proxNumeroNFe: 1048,
        naturezaOperacaoPadrao: 'Venda',
        cfopPadraoEstadual: '5101',
        cfopPadraoInterestadual: '6101',
      },
      printedAt: '21/09/2026, 11:40',
    });

    assert.equal(Buffer.from(bytes.subarray(0, 4)).toString(), '%PDF');
    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 1);
    const size = loaded.getPage(0).getSize();
    assert.ok(Math.abs(size.width - 595.28) < 1);
    assert.ok(Math.abs(size.height - 841.89) < 1);
    const text = inflatePdfStreams(bytes).replace(/\s+/g, '');
    for (const marker of [
      'RASCUNHO',
      'SEMVALORFISCAL',
      'DANFE',
      'FazendaBoaVista',
      'CalcarioAgricolaMoido',
      'Venda de producao'.replace(/\s+/g, ''),
      'Clausulacadastradanoproduto',
      'TransPara',
      'PED-2026-0044',
      '1048',
    ]) {
      assert.match(text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.equal(draftPdfFileName(order), 'RASCUNHO_NFe_1048.pdf');
  });
});
