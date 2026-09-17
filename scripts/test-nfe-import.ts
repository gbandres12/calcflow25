import { parseNfeXml } from '../services/nfeDocumentParser';
import { applyStoreIntegration, isMineralNcm, matchStoreItem, normalizeName } from '../services/storeItemMatch';
import { nextTransferCode } from '../services/ids';
import { StoreItem } from '../types';

const KEY = '35240111222333000188550010000012341234567890';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe Id="NFe${KEY}">
      <ide>
        <cUF>15</cUF>
        <nNF>4421</nNF>
        <serie>1</serie>
        <dhEmi>2026-09-17T10:00:00-03:00</dhEmi>
        <natOp>Venda de pecas</natOp>
      </ide>
      <emit>
        <CNPJ>11222333000188</CNPJ>
        <xNome>Casa dos Rolamentos Santarem</xNome>
        <IE>123</IE>
        <enderEmit><xMun>Santarem</xMun></enderEmit>
      </emit>
      <dest>
        <CNPJ>10375218000150</CNPJ>
        <xNome>CBA Mineracao Ltda</xNome>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>ROL-22220</cProd>
          <xProd>Rolamento 22220 E</xProd>
          <NCM>84821010</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>4.0000</qCom>
          <vUnCom>650.00</vUnCom>
          <vProd>2600.00</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>LUVA-VAQ</cProd>
          <xProd>Luva de Vaqueta Misto</xProd>
          <NCM>42032900</NCM>
          <CFOP>5102</CFOP>
          <uCom>PAR</uCom>
          <qCom>20</qCom>
          <vUnCom>35.00</vUnCom>
          <vProd>700.00</vProd>
        </prod>
        <infAdProd>Uso interno fazenda</infAdProd>
      </det>
      <total><ICMSTot><vProd>3300.00</vProd><vFrete>0</vFrete><vNF>3300.00</vNF></ICMSTot></total>
      <transp>
        <transporta><xNome>Manoel Silva</xNome></transporta>
        <veicTransp><placa>QDA4E90</placa></veicTransp>
      </transp>
    </infNFe>
  </NFe>
</nfeProc>`;

const assert = (cond: unknown, message: string) => {
  if (!cond) throw new Error(message);
};

const parsed = parseNfeXml(SAMPLE_XML);
assert(parsed.supplier === 'Casa dos Rolamentos Santarem', `emitente errado: ${parsed.supplier}`);
assert(parsed.destName === 'CBA Mineracao Ltda', `dest errado: ${parsed.destName}`);
assert(parsed.accessKey === KEY, `chave ${parsed.accessKey}`);
assert(parsed.items.length === 2, 'itens');
assert(parsed.items[0].cProd === 'ROL-22220', 'cProd');
assert(parsed.items[1].infAdProd === 'Uso interno fazenda', 'infAdProd');
assert(parsed.vehiclePlate === 'QDA4E90', `placa ${parsed.vehiclePlate}`);
assert(parsed.nfNumber === '4421', 'nNF');
assert(parsed.series === '1', 'serie');
assert(!isMineralNcm(parsed.items[0].ncm), 'nao e minerio');
assert(isMineralNcm('25171000'), 'ncm minerio');
assert(normalizeName('Rolamento  22220 É') === 'rolamento 22220 e', 'normalize');

const store: StoreItem[] = [{
  id: 'store-1',
  name: 'Rolamento 22220 E',
  category: 'Peças',
  quantity: 1,
  unit: 'UN',
  minStock: 1,
  supplierSku: 'ROL-22220',
  supplierCnpj: '11222333000188',
  ncm: '84821010'
}];
const matched = matchStoreItem(store, {
  cProd: 'ROL-22220',
  ncm: '84821010',
  name: 'Rolamento 22220 E',
  supplierCnpj: '11.222.333/0001-88'
});
assert(matched?.id === 'store-1', 'match cProd');

const integrated = applyStoreIntegration(store, {
  name: 'Rolamento 22220 E',
  category: 'Peças',
  quantity: 4,
  unit: 'UN',
  productId: 'store-1',
  cProd: 'ROL-22220',
  nfeChave: KEY
}, 'store-new');
assert(integrated.touched.quantity === 5, 'soma so na conferencia');
assert(integrated.created === false, 'nao duplicar');
assert(nextTransferCode([{ code: 'TRF-2026-001' }, { code: 'TRF-2026-002' }], 2026) === 'TRF-2026-003', 'seq');

console.log('ok: parser, match e sequencia de remessa');
