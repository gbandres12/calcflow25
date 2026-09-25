import React, { useState } from 'react';
import { SaleOrder, OrderWithdrawal, Customer, Company, FiscalConfig, Transportador } from '../types';
import { formatTons, localIsoDate, roundTons, sumTons } from '../services/domain/loadings';
import { printThermalTicket } from '../services/domain/thermalTicket';
import { Truck, Printer, X, CheckCircle, Scale, Calendar, User, FileText, Package, Loader2, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useToast } from './ui/Toast';
import { fiscalService } from '../services/fiscalService';

interface OrderWithdrawalModalProps {
  order: SaleOrder;
  customer?: Customer;
  company: Company;
  fiscalConfig?: FiscalConfig;
  /** Sugestões pro campo transportador/placa — dá pra digitar quem não está cadastrado. */
  transportadores?: Transportador[];
  operatorName?: string;
  onSaveWithdrawal: (withdrawal: OrderWithdrawal) => void;
  onClose: () => void;
}

export const OrderWithdrawalModal: React.FC<OrderWithdrawalModalProps> = ({
  order,
  customer,
  company,
  fiscalConfig,
  transportadores = [],
  operatorName,
  onSaveWithdrawal,
  onClose
}) => {
  const toast = useToast();
  const totalOrderQty = sumTons(order.items.map((it) => it.quantity || 0));
  const alreadyWithdrawn = sumTons((order.withdrawals || []).map((w) => w.quantityWithdrawn || 0));
  const remainingToWithdraw = Math.max(0, roundTons(totalOrderQty - alreadyWithdrawn));

  const [driverName, setDriverName] = useState('');
  const [driverCpf, setDriverCpf] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [truckModel, setTruckModel] = useState('');
  // Sem valor sugerido: a nota e a balança são valores reais, fracionados.
  const [quantity, setQuantity] = useState('');
  const [netWeight, setNetWeight] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [weighTicket, setWeighTicket] = useState(`PES-${Math.floor(100000 + Math.random() * 900000)}`);
  const [loadedBy, setLoadedBy] = useState(operatorName || 'Balança / Expedição');
  const [notes, setNotes] = useState('');
  const [savedWithdrawal, setSavedWithdrawal] = useState<OrderWithdrawal | null>(null);
  const [formError, setFormError] = useState('');

  const parseTons = (raw: string) => roundTons(parseFloat(String(raw).replace(',', '.')) || 0);
  const qtyNum = parseTons(quantity);
  const netWeightNum = parseTons(netWeight);
  const newBalance = Math.max(0, roundTons(remainingToWithdraw - qtyNum));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (qtyNum <= 0) {
      setFormError('Informe a quantidade da nota em toneladas.');
      return;
    }
    if (netWeightNum <= 0) {
      setFormError('Informe o peso líquido da balança.');
      return;
    }
    if (qtyNum > remainingToWithdraw + 0.01) {
      setFormError(`Quantidade da nota (${formatTons(qtyNum)} t) passa do saldo do pedido (${formatTons(remainingToWithdraw)} t).`);
      return;
    }
    setFormError('');

    const withdrawal: OrderWithdrawal = {
      id: `RET-${Date.now()}`,
      orderId: order.id,
      orderReference: order.reference,
      date: localIsoDate(),
      driverName: driverName.trim(),
      driverCpf: driverCpf.trim(),
      plateNumber: plateNumber.trim().toUpperCase(),
      truckModel: truckModel.trim(),
      quantityWithdrawn: qtyNum,
      netWeight: netWeightNum,
      transporterName: transporterName.trim() || undefined,
      productName: order.items[0]?.productName || 'Calcário Agrícola Moído',
      weighTicketNumber: weighTicket.trim(),
      totalOrderQuantity: totalOrderQty,
      totalWithdrawnSoFar: roundTons(alreadyWithdrawn + qtyNum),
      remainingBalanceQuantity: newBalance,
      loadedBy: loadedBy.trim(),
      notes: notes.trim()
    };

    onSaveWithdrawal(withdrawal);
    setSavedWithdrawal(withdrawal);
  };

  const handlePrint = () => {
    if (!savedWithdrawal) return;
    printThermalTicket({
      companyName: company.name,
      companyCity: [company.city, company.state].filter(Boolean).join('-'),
      ticketNumber: savedWithdrawal.weighTicketNumber || savedWithdrawal.id,
      date: savedWithdrawal.date,
      customerName: customer?.name || 'Cliente',
      customerDocument: customer?.document,
      orderReference: order.reference,
      productName: savedWithdrawal.productName || '',
      transporterName: savedWithdrawal.transporterName,
      driverName: savedWithdrawal.driverName,
      driverCpf: savedWithdrawal.driverCpf,
      plateNumber: savedWithdrawal.plateNumber,
      quantity: savedWithdrawal.quantityWithdrawn,
      netWeight: savedWithdrawal.netWeight,
      nfeNumero: savedWithdrawal.nfeNumero,
      totalOrder: savedWithdrawal.totalOrderQuantity,
      remaining: savedWithdrawal.remainingBalanceQuantity,
      operatorName: savedWithdrawal.loadedBy
    });
  };

  const [isEmittingNfe, setIsEmittingNfe] = useState(false);
  const [nfeError, setNfeError] = useState<string | null>(null);

  const handleEmitirNfeWithdrawal = async () => {
    if (!savedWithdrawal || isEmittingNfe) return;
    if (!customer) {
      toast.push('Dados cadastrais do cliente não encontrados para emissão da NF-e.', 'danger');
      return;
    }
    setIsEmittingNfe(true);
    setNfeError(null);

    try {
      const config = fiscalConfig || await fiscalService.getConfig(company.id);
      const unitPrice = order.items[0]?.unitPrice || 0;
      const withdrawalTotal = Number((savedWithdrawal.quantityWithdrawn * unitPrice).toFixed(2));
      const firstItem = order.items[0];

      // Pedido de payload exclusivo deste carregamento (sem financeiro, sem pagamento)
      const withdrawalOrderPayload: SaleOrder = {
        ...order,
        reference: `${order.reference}-${savedWithdrawal.weighTicketNumber || 'CARGA'}`,
        isAvulsa: false,
        withoutFinance: true,
        total: withdrawalTotal,
        subtotal: withdrawalTotal,
        shipping: 0,
        discount: 0,
        items: [{
          productId: firstItem?.productId || 'moido',
          productCode: firstItem?.productCode || 'CALC-01',
          productName: firstItem?.productName || 'Calcário Agrícola Corretivo',
          unit: firstItem?.unit || 'TON',
          quantity: savedWithdrawal.quantityWithdrawn,
          unitPrice: unitPrice,
          discount: 0,
          total: withdrawalTotal,
          ncm: firstItem?.ncm || '2517.10.00',
          cfop: firstItem?.cfop,
          cst: firstItem?.cst,
          informacoesComplementares: `Carregamento Parcial: ${savedWithdrawal.quantityWithdrawn} Ton. Ticket de Balança: ${savedWithdrawal.weighTicketNumber}. Placa: ${savedWithdrawal.plateNumber}. Motorista: ${savedWithdrawal.driverName || 'N/I'}. Saldo Restante: ${savedWithdrawal.remainingBalanceQuantity} Ton.`
        }],
        payments: []
      };

      const result = await fiscalService.emitirNFe(
        withdrawalOrderPayload,
        customer,
        config,
        company.id,
        {
          semPagamento: true,
          carregamento: {
            ticketPesagem: savedWithdrawal.weighTicketNumber,
            placa: savedWithdrawal.plateNumber,
            motorista: savedWithdrawal.driverName,
            driverCpf: savedWithdrawal.driverCpf
          }
        }
      );

      if (result.success) {
        let finalStatus = result.nfeStatus;
        if (result.nfeStatus === 'processando' && result.nfeId) {
          const pollResult = await fiscalService.consultarEAtualizarStatusProcessamento(result.nfeId, config, 3, 2000);
          if (pollResult.success && pollResult.status && pollResult.status !== 'nao_emitida') {
            finalStatus = pollResult.status;
          }
        }

        const updatedWithdrawal: OrderWithdrawal = {
          ...savedWithdrawal,
          nfeStatus: finalStatus,
          nfeId: result.nfeId,
          nfeChave: result.nfeChave,
          nfeNumero: result.nfeNumero,
          nfeSerie: result.nfeSerie,
          nfeProtocolo: result.nfeProtocolo,
          nfeDanfeUrl: result.nfeDanfeUrl,
          nfeXmlUrl: result.nfeXmlUrl,
          nfeEmissao: result.nfeEmissao
        };

        setSavedWithdrawal(updatedWithdrawal);
        onSaveWithdrawal(updatedWithdrawal);
      } else {
        setNfeError(result.nfeErro || 'Rejeição na emissão da NF-e.');
      }
    } catch (err: any) {
      setNfeError(err.message || 'Erro ao emitir NF-e.');
    } finally {
      setIsEmittingNfe(false);
    }
  };

  return (
    <Modal
      title={savedWithdrawal ? 'Ticket de retirada' : 'Registrar retirada'}
      printSafe
      onClose={onClose}
      subtitle={`${order.reference} · ${customer?.name || 'Cliente'}`}
      footer={
        savedWithdrawal ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Button className="flex-1" onClick={handlePrint}>
              <Printer size={16} /> Imprimir ticket
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" form="order-withdrawal-form" className="flex-1">
              <CheckCircle size={16} /> Confirmar e gerar ticket
            </Button>
          </div>
        )
      }
    >

        {savedWithdrawal ? (
          /* Visualização de Impressão do Romaneio de Retirada */
          <div className="space-y-5 text-slate-800 bg-white" id="printable-ticket">
            <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">{company.name}</h2>
                <p className="text-xs text-slate-500 font-bold">Ticket de Pesagem & Expedição de Calcário</p>
                <p className="text-xs text-slate-500">Unidade: {company.city}-{company.state}</p>
              </div>
              <div className="text-right">
                <span className="px-3 py-1 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-lg">
                  TICKET Nº {savedWithdrawal.weighTicketNumber}
                </span>
                <p className="text-xs font-bold text-slate-500 pt-1">Data: {savedWithdrawal.date}</p>
              </div>
            </div>

            {/* Bloco Fiscal do Carregamento */}
            {savedWithdrawal.nfeNumero && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-600 text-white rounded-xl">
                    <CheckCircle size={18} />
                  </div>
                  <div>
                    <span className="text-[11px] font-black uppercase text-emerald-800 tracking-wider">NF-e Vinculada ao Carregamento</span>
                    <p className="text-sm font-black text-slate-900">Nota Fiscal Nº {savedWithdrawal.nfeNumero}</p>
                    {savedWithdrawal.nfeChave && (
                      <p className="text-xs font-mono text-slate-500 truncate max-w-xs md:max-w-md">Chave: {savedWithdrawal.nfeChave}</p>
                    )}
                  </div>
                </div>
                {savedWithdrawal.nfeDanfeUrl && (
                  <a
                    href={savedWithdrawal.nfeDanfeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 self-start sm:self-auto shrink-0"
                  >
                    <FileText size={14} /> Abrir DANFE (PDF)
                  </a>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs">
              <div>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Destinatário / Fazenda</span>
                <p className="font-black text-slate-800 uppercase">{customer?.name}</p>
                <p className="text-slate-500">Doc: {customer?.document}</p>
              </div>
              <div>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Pedido de Venda</span>
                <p className="font-black text-purple-700">REF: {order.reference}</p>
                <p className="text-slate-500">Produto: {savedWithdrawal.productName}</p>
              </div>
            </div>

            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <span className="text-[11px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                <Scale size={14} /> Dados do Veículo e Pesagem
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-slate-800">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Placa / Veículo</span>
                  <p className="font-black text-base">{savedWithdrawal.plateNumber} {savedWithdrawal.truckModel && `(${savedWithdrawal.truckModel})`}</p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Motorista</span>
                  <p className="font-black text-base">{savedWithdrawal.driverName || 'Não Informado'}</p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Quant. da nota</span>
                  <p className="font-black text-xl text-emerald-700">{formatTons(savedWithdrawal.quantityWithdrawn)} t</p>
                  {savedWithdrawal.netWeight != null && (
                    <p className="text-xs font-bold text-slate-500">Peso líquido: {formatTons(savedWithdrawal.netWeight)} t</p>
                  )}
                </div>
                {savedWithdrawal.transporterName && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Transportador</span>
                    <p className="font-black text-base">{savedWithdrawal.transporterName}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Controle de Saldo de Retirada */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <div>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Total do Pedido</span>
                <p className="text-sm font-bold text-slate-700">{formatTons(savedWithdrawal.totalOrderQuantity)} t</p>
              </div>
              <div>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Total Já Retirado</span>
                <p className="text-sm font-bold text-emerald-600">{formatTons(savedWithdrawal.totalWithdrawnSoFar)} t</p>
              </div>
              <div>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Saldo Restante a Retirar</span>
                <p className="text-sm font-black text-rose-600">{formatTons(savedWithdrawal.remainingBalanceQuantity)} t</p>
              </div>
            </div>

            {/* Assinaturas */}
            <div className="grid grid-cols-2 gap-8 pt-8">
              <div className="text-center space-y-1">
                <div className="border-t border-slate-400 pt-2 mx-4" />
                <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{savedWithdrawal.driverName || 'Motorista'}</p>
                <p className="text-[11px] text-slate-500 font-bold uppercase">Assinatura do Motorista / Transportador</p>
              </div>
              <div className="text-center space-y-1">
                <div className="border-t border-slate-400 pt-2 mx-4" />
                <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{savedWithdrawal.loadedBy || 'Expedição'}</p>
                <p className="text-[11px] text-slate-500 font-bold uppercase">Operador de Balança / Expedição</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-6 border-t border-slate-100 print:hidden">
              <div className="w-full sm:w-auto">
                {isEmittingNfe ? (
                  <div className="flex items-center gap-2 text-purple-700 bg-purple-50 px-4 py-2.5 rounded-xl border border-purple-200 text-xs font-bold">
                    <Loader2 size={16} className="animate-spin" /> Transmitindo NF-e à SEFAZ...
                  </div>
                ) : nfeError ? (
                  <div className="flex items-center gap-2 text-rose-700 bg-rose-50 px-4 py-2 rounded-xl border border-rose-200 text-xs font-bold">
                    <AlertCircle size={16} /> {nfeError}
                  </div>
                ) : !savedWithdrawal.nfeNumero ? (
                  <Button type="button" onClick={handleEmitirNfeWithdrawal}>
                    <FileText size={16} /> Emitir NF-e deste carregamento ({savedWithdrawal.quantityWithdrawn} t)
                  </Button>
                ) : (
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle size={14} /> NF-e Nº {savedWithdrawal.nfeNumero} emitida
                  </span>
                )}
              </div>

              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <Button variant="secondary" onClick={onClose}>
                  Fechar
                </Button>
                <Button onClick={handlePrint}>
                  <Printer size={16} /> Imprimir ticket
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Formulário de Registro de Retirada */
          <form id="order-withdrawal-form" onSubmit={handleSubmit} className="space-y-4">
            
            {/* Resumo de Saldos */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <div>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Total Comprado</span>
                <p className="text-base font-black text-slate-800">{formatTons(totalOrderQty)} t</p>
              </div>
              <div>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Já Retirado</span>
                <p className="text-base font-black text-emerald-600">{formatTons(alreadyWithdrawn)} t</p>
              </div>
              <div>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Disponível p/ Retirada</span>
                <p className="text-base font-black text-purple-600">{formatTons(remainingToWithdraw)} t</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Quantidade da nota (t)</label>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="w-full p-3.5 bg-emerald-50/50 border border-emerald-200 text-emerald-900 rounded-2xl outline-none font-black text-lg focus:border-emerald-500"
                    placeholder="Ex: 46,23"
                  />
                  <span className="text-xs text-slate-500 font-bold">
                    Saldo do pedido depois desta carga: <strong className="text-slate-700">{formatTons(newBalance)} t</strong>
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Peso líquido da balança (t)</label>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    value={netWeight}
                    onChange={e => setNetWeight(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-lg focus:border-emerald-500"
                    placeholder="Ex: 50,98"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Transportador</label>
                  <input
                    type="text"
                    list="withdrawal-transporters"
                    value={transporterName}
                    onChange={e => setTransporterName(e.target.value)}
                    placeholder="Nome de quem transporta (ex: CBA, Lodi Transportes)"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
                  />
                  <datalist id="withdrawal-transporters">
                    {transportadores.map((t) => <option key={t.id} value={t.nome} />)}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Nº Ticket / Romaneio</label>
                  <input
                    required
                    type="text"
                    value={weighTicket}
                    onChange={e => setWeighTicket(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Placa do Caminhão</label>
                  <input
                    required
                    type="text"
                    value={plateNumber}
                    onChange={e => setPlateNumber(e.target.value.toUpperCase())}
                    list="withdrawal-plates"
                    placeholder="Ex: ABC-1D23"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-sm uppercase focus:border-purple-500"
                  />
                  <datalist id="withdrawal-plates">
                    {Array.from(new Set(
                      [...transportadores.map((t) => t.placa), ...(order.withdrawals || []).map((w) => w.plateNumber)]
                        .filter(Boolean)
                        .map((p) => String(p).toUpperCase())
                    )).map((placa) => <option key={placa} value={placa} />)}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Modelo / Tipo Veículo</label>
                  <input
                    type="text"
                    value={truckModel}
                    onChange={e => setTruckModel(e.target.value)}
                    placeholder="Ex: Scania Bi-trem, Caçamba Truco"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Nome do Motorista</label>
                  <input
                    required
                    type="text"
                    value={driverName}
                    onChange={e => setDriverName(e.target.value)}
                    placeholder="Nome completo do motorista"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">CPF do Motorista (Opcional)</label>
                  <input
                    type="text"
                    value={driverCpf}
                    onChange={e => setDriverCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Observações da Expedição</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ex: Carga com lona amarrada, lacre nº 4819..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-sm focus:border-purple-500 resize-none h-16"
                />
              </div>
            </div>

            {formError ? <p className="text-xs font-bold text-rose-600">{formError}</p> : null}
          </form>
        )}
    </Modal>
  );
};
