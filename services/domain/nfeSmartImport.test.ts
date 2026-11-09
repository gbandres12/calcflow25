import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeImportedNfe,
  applyImportCommand,
  buildFiscalOrderFromImport,
  buildTransferShipmentFromImport,
  resolveOrBuildCustomerFromImportedNfe
} from './nfeSmartImport.js';
import { ParsedNfDocument } from '../nfeDocumentParser.js';

const sampleDoc = (overrides: Partial<ParsedNfDocument> = {}): ParsedNfDocument => ({
  source: 'xml',
  nfNumber: '4589',
  series: '1',
  issuedAt: '2026-11-08T10:00:00-03:00',
  nature: 'Venda de mercadoria',
  supplier: 'Tratores & Peças Tapajós LTDA',
  supplierDocument: '12345678000199',
  supplierIe: '153334445',
  supplierCity: 'Santarém',
  supplierState: 'PA',
  supplierStreet: 'Av. Cuiabá',
  supplierNumber: '1200',
  supplierNeighborhood: 'Sale',
  supplierZipCode: '68040000',
  supplierIbgeCode: '1506807',
  accessKey: '15261112345678000199550010000045891000045890',
  vNF: 2500,
  items: [
    {
      nItem: 1,
      cProd: 'ROL-01',
      productName: 'Rolamento Cônico Britador',
      ncm: '84822010',
      cfop: '5102',
      quantitySent: 4,
      unit: 'UN',
      unitCost: 500,
      totalCost: 2000,
      category: 'Peças'
    },
    {
      nItem: 2,
      cProd: 'RET-02',
      productName: 'Retentor de Vedação Industrial',
      ncm: '40169300',
      cfop: '5102',
      quantitySent: 5,
      unit: 'UN',
      unitCost: 100,
      totalCost: 500,
      category: 'Peças'
    }
  ],
  ...overrides
});

describe('importação inteligente de NF-e (Devolução / Transferência / Remessa)', () => {
  it('detecta operação estadual vs interestadual e sugere CFOPs 5202/5152 ou 6202/6152', () => {
    const intra = analyzeImportedNfe({ doc: sampleDoc({ supplierState: 'PA' }) });
    assert.equal(intra.isInterestadual, false);
    assert.equal(intra.cfopDevolucaoSugerido, '5202');
    assert.equal(intra.cfopTransferenciaSugerido, '5152');
    assert.equal(intra.accessKeyValid, true);

    const inter = analyzeImportedNfe({ doc: sampleDoc({ supplierState: 'SP' }) });
    assert.equal(inter.isInterestadual, true);
    assert.equal(inter.cfopDevolucaoSugerido, '6202');
    assert.equal(inter.cfopTransferenciaSugerido, '6152');
  });

  it('interpreta comando natural para devolução parcial de item específico com motivo', () => {
    const doc = sampleDoc();
    const initial = analyzeImportedNfe({ doc });
    const updated = applyImportCommand(
      initial,
      doc,
      'Devolver 2 un do item 1 motivo peça com defeito no rolamento'
    );

    assert.equal(updated.intent, 'devolucao_nfe');
    assert.equal(updated.rows[0].included, true);
    assert.equal(updated.rows[0].quantity, 2);
    assert.equal(updated.rows[0].total, 1000);
    assert.equal(updated.rows[1].included, false);
    assert.match(updated.infCpl, /Devolução de mercadoria referente à NF-e nº 4589/);
    assert.match(updated.infCpl, /peça com defeito/);
  });

  it('interpreta comando natural para transferência SEFAZ ou remessa interna com placa e motorista', () => {
    const doc = sampleDoc({ supplierState: 'MT' });
    const initial = analyzeImportedNfe({ doc });

    const transfSefaz = applyImportCommand(
      initial,
      doc,
      'Emitir NF-e de transferência na SEFAZ apenas do item 2'
    );
    assert.equal(transfSefaz.intent, 'transferencia_nfe');
    assert.equal(transfSefaz.rows[0].included, false);
    assert.equal(transfSefaz.rows[1].included, true);
    assert.equal(transfSefaz.rows[1].cfop, '6152');

    const remessa = applyImportCommand(
      initial,
      doc,
      'Gerar remessa para a fazenda com todos os itens placa QVA1B23 motorista Carlos Silva'
    );
    assert.equal(remessa.intent, 'remessa_interna');
    assert.equal(remessa.vehiclePlate, 'QVA1B23');
    assert.equal(remessa.driverName, 'Carlos Silva');
    assert.ok(remessa.rows.every((r) => r.included));
  });

  it('monta SaleOrder fiscal (Devolução / Transferência) e TransferShipment (Remessa Interna)', () => {
    const doc = sampleDoc();
    const analysis = applyImportCommand(
      analyzeImportedNfe({ doc }),
      doc,
      'Devolver 1 un do item 1 por avaria no transporte'
    );

    const { customer, isNew } = resolveOrBuildCustomerFromImportedNfe({
      doc,
      analysis,
      customers: [],
      companyId: 'comp-1'
    });
    assert.equal(isNew, true);
    assert.equal(customer.document, '12345678000199');

    const fiscalOrder = buildFiscalOrderFromImport({
      doc,
      analysis,
      customer,
      existingOrders: [],
      sellerName: 'Gabriel',
      companyId: 'comp-1'
    });
    assert.equal(fiscalOrder.isAvulsa, true);
    assert.equal(fiscalOrder.items.length, 1);
    assert.equal(fiscalOrder.items[0].quantity, 1);
    assert.equal(fiscalOrder.items[0].cfop, '5202');
    assert.equal(fiscalOrder.total, 500);
    assert.equal(fiscalOrder.nfeChave, doc.accessKey);

    const shipment = buildTransferShipmentFromImport({
      doc,
      analysis: applyImportCommand(analysis, doc, 'Transferir tudo para fazenda placa ABC1D23 motorista João'),
      existingTransfers: [],
      sentBy: 'Gabriel',
      fileName: 'nfe-4589.xml'
    });
    assert.equal(shipment.items.length, 2);
    assert.equal(shipment.vehiclePlate, 'ABC1D23');
    assert.equal(shipment.carrierOrDriver, 'João');
    assert.equal(shipment.nfeChave, doc.accessKey);
  });
});
