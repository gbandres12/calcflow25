import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { OrderStatus, SaleOrder } from '../../types';
import { buildSalesOrderPdf } from './salesOrderPdf';

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

describe('PDF do pedido: layout oficial do ERP', () => {
  it('gera A4 com as mesmas seções do documento de impressão', async () => {
    const order = {
      id: 'ord-1',
      reference: 'PED-2026-0008',
      customerId: 'cust-1',
      sellerName: 'Gabriel',
      date: '2026-09-19',
      deliveryDate: '2026-09-22',
      items: [
        {
          productId: 'moido',
          productCode: '001',
          productName: 'Calcário Agrícola Moído (Granel)',
          productDescription: 'Calcário Agrícola Moído (Granel)',
          unit: 'Ton',
          quantity: 50,
          unitPrice: 160,
          discount: 0,
          total: 8000
        }
      ],
      productSheetTitle: 'Calcário dolomítico',
      productSheetBody: 'PRNT mínimo garantido: 80%\nMgO mínimo garantido: 14%',
      subtotal: 8000,
      discount: 0,
      shipping: 120,
      total: 8120,
      status: OrderStatus.FINALIZED,
      paymentMethod: 'PIX',
      payments: [],
      notes: 'Entregar na sede da fazenda.'
    } as SaleOrder;

    const bytes = await buildSalesOrderPdf({
      order,
      customer: {
        id: 'cust-1',
        name: 'Fazenda Boa Vista',
        document: '12.345.678/0001-90',
        street: 'Rodovia PA-370',
        number: 'SN',
        neighborhood: 'Zona Rural',
        city: 'Santarém',
        state: 'PA',
        phone: '(93) 99999-0000',
        email: 'fazenda@example.com'
      } as any,
      brand: {
        razaoSocial: 'CBA Mineração Ltda',
        cnpjEmitente: '00.000.000/0001-00',
        cidadeEmitente: 'Santarém',
        ufEmitente: 'PA',
        telefoneEmitente: '(93) 3511-0000'
      },
      printedAt: '19/09/2026, 19:40'
    });

    assert.equal(Buffer.from(bytes.subarray(0, 4)).toString(), '%PDF');
    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 1);
    const size = loaded.getPage(0).getSize();
    assert.ok(Math.abs(size.width - 595.28) < 1);
    assert.ok(Math.abs(size.height - 841.89) < 1);
    const text = inflatePdfStreams(bytes).replace(/\s+/g, '');
    for (const marker of [
      'DADOSDOCLIENTE',
      'DADOSDOPEDIDO',
      'RESUMODOPEDIDO',
      'ASSINATURADOCLIENTE',
      'PED-2026-0008',
      'FazendaBoaVista',
      'Totalgeral'
    ]) {
      assert.match(text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });
});
