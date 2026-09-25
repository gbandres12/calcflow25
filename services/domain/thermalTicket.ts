export interface ThermalTicketInput {
  companyName: string;
  companyCity?: string;
  ticketNumber: string;
  date: string;
  printedAt?: Date;
  customerName: string;
  customerDocument?: string;
  orderReference: string;
  productName: string;
  transporterName?: string;
  driverName: string;
  driverCpf?: string;
  plateNumber: string;
  quantity: number;
  netWeight?: number | null;
  nfeNumero?: string;
  totalOrder?: number;
  remaining?: number;
  operatorName?: string;
}

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const tons = (value: number | null | undefined) =>
  value == null ? '—' : `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} t`;

const brDate = (iso: string) => {
  const [y, m, d] = String(iso || '').split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

const row = (label: string, value: string) =>
  value ? `<div class="row"><span>${esc(label)}</span><b>${esc(value)}</b></div>` : '';

/** Ticket de balança pra impressora térmica de 80 mm (área útil ~72 mm). */
export function buildThermalTicketHtml(input: ThermalTicketInput): string {
  const printedAt = (input.printedAt || new Date()).toLocaleString('pt-BR');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ticket ${esc(input.ticketNumber)}</title>
<style>
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
body { width: 72mm; margin: 0 auto; padding: 3mm 0 6mm; font: 11px/1.35 'Courier New', monospace; color: #000; }
h1 { font-size: 13px; margin: 0; text-align: center; text-transform: uppercase; }
.center { text-align: center; }
.sep { border-top: 1px dashed #000; margin: 5px 0; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.row span { flex-shrink: 0; }
.row b { text-align: right; word-break: break-word; }
.big { font-size: 15px; font-weight: bold; text-align: center; margin: 4px 0; }
.sign { margin-top: 26px; border-top: 1px solid #000; text-align: center; font-size: 10px; padding-top: 2px; }
</style></head><body>
<h1>${esc(input.companyName)}</h1>
${input.companyCity ? `<div class="center">${esc(input.companyCity)}</div>` : ''}
<div class="center">TICKET DE PESAGEM / EXPEDIÇÃO</div>
<div class="sep"></div>
${row('Ticket', input.ticketNumber)}
${row('Data', brDate(input.date))}
${row('Pedido', input.orderReference)}
${input.nfeNumero ? row('NF-e', input.nfeNumero) : ''}
<div class="sep"></div>
${row('Cliente', input.customerName)}
${row('Doc', input.customerDocument || '')}
${row('Produto', input.productName)}
<div class="sep"></div>
${row('Transp.', input.transporterName || '')}
${row('Motorista', input.driverName)}
${row('CPF', input.driverCpf || '')}
${row('Placa', input.plateNumber)}
<div class="sep"></div>
<div class="center">QUANTIDADE DA NOTA</div>
<div class="big">${esc(tons(input.quantity))}</div>
${input.netWeight != null ? row('Peso líquido', tons(input.netWeight)) : ''}
${input.totalOrder != null ? row('Total pedido', tons(input.totalOrder)) : ''}
${input.remaining != null ? row('Saldo a retirar', tons(input.remaining)) : ''}
<div class="sign">Motorista</div>
<div class="sign">${esc(input.operatorName || 'Balança / Expedição')}</div>
<div class="sep"></div>
<div class="center" style="font-size:9px">Impresso em ${esc(printedAt)}</div>
</body></html>`;
}

/** Imprime num iframe isolado — o CSS da tela não interfere e a tela não muda. */
export function printThermalTicket(input: ThermalTicketInput): void {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(buildThermalTicketHtml(input));
  doc.close();
  const win = frame.contentWindow;
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  win.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    win.focus();
    win.print();
    cleanup();
  }, 150);
}
