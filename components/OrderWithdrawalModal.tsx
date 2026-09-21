import React, { useState } from 'react';
import { SaleOrder, OrderWithdrawal, Customer, Company, FiscalConfig } from '../types';
import { Truck, Printer, X, CheckCircle, Scale, Calendar, User, FileText, Package, Loader2, AlertCircle } from 'lucide-react';
import { FlowSheet } from './ui/FlowSheet';
import { fiscalService } from '../services/fiscalService';

interface OrderWithdrawalModalProps {
  order: SaleOrder;
  customer?: Customer;
  company: Company;
  fiscalConfig?: FiscalConfig;
  onSaveWithdrawal: (withdrawal: OrderWithdrawal) => void;
  onClose: () => void;
}

export const OrderWithdrawalModal: React.FC<OrderWithdrawalModalProps> = ({
  order,
  customer,
  company,
  fiscalConfig,
  onSaveWithdrawal,
  onClose
}) => {
  const totalOrderQty = order.items.reduce((acc, it) => acc + (it.quantity || 0), 0);
  const alreadyWithdrawn = (order.withdrawals || []).reduce((acc, w) => acc + (w.quantityWithdrawn || 0), 0);
  const remainingToWithdraw = Math.max(0, totalOrderQty - alreadyWithdrawn);

  const [driverName, setDriverName] = useState('');
  const [driverCpf, setDriverCpf] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [truckModel, setTruckModel] = useState('');
  const [quantity, setQuantity] = useState(remainingToWithdraw > 0 ? (remainingToWithdraw > 35 ? '32' : remainingToWithdraw.toString()) : '0');
  const [weighTicket, setWeighTicket] = useState(`PES-${Math.floor(100000 + Math.random() * 900000)}`);
  const [loadedBy, setLoadedBy] = useState('Balança / Expedição');
  const [notes, setNotes] = useState('');
  const [savedWithdrawal, setSavedWithdrawal] = useState<OrderWithdrawal | null>(null);
  const [formError, setFormError] = useState('');

  const qtyNum = parseFloat(quantity) || 0;
  const newBalance = Math.max(0, remainingToWithdraw - qtyNum);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (qtyNum <= 0) {
      setFormError('Informe uma quantidade válida de toneladas para retirada.');
      return;
    }
    if (qtyNum > remainingToWithdraw + 0.01) {
      setFormError(`Quantidade informada (${qtyNum} Ton) excede o saldo restante do pedido (${remainingToWithdraw.toFixed(1)} Ton).`);
      return;
    }
    setFormError('');

    const withdrawal: OrderWithdrawal = {
      id: `RET-${Date.now()}`,
      orderId: order.id,
      orderReference: order.reference,
      date: new Date().toISOString().split('T')[0],
      driverName: driverName.trim(),
      driverCpf: driverCpf.trim(),
      plateNumber: plateNumber.trim().toUpperCase(),
      truckModel: truckModel.trim(),
      quantityWithdrawn: qtyNum,
      productName: order.items[0]?.productName || 'Calcário Agrícola Moído',
      weighTicketNumber: weighTicket.trim(),
      totalOrderQuantity: totalOrderQty,
      totalWithdrawnSoFar: alreadyWithdrawn + qtyNum,
      remainingBalanceQuantity: newBalance,
      loadedBy: loadedBy.trim(),
      notes: notes.trim()
    };

    onSaveWithdrawal(withdrawal);
    setSavedWithdrawal(withdrawal);
  };

  const handlePrint = () => {
    window.print();
  };

  const [isEmittingNfe, setIsEmittingNfe] = useState(false);
  const [nfeError, setNfeError] = useState<string | null>(null);

  const handleEmitirNfeWithdrawal = async () => {
    if (!savedWithdrawal || isEmittingNfe) return;
    if (!customer) {
      alert('Dados cadastrais do cliente não encontrados para emissão da NF-e.');
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
    <FlowSheet
      title={savedWithdrawal ? 'Ticket de retirada' : 'Registrar retirada'}
      printSafe
      zIndexClass="z-[200]"
      onClose={onClose}
      subtitle={`${order.reference} · ${customer?.name || 'Cliente'}`}
      footer={
        savedWithdrawal ? (
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 min-h-11 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">
              Fechar
            </button>
            <button type="button" onClick={handlePrint} className="flex-1 min-h-11 bg-emerald-600 text-white font-bold text-xs rounded-xl inline-flex items-center justify-center gap-1.5">
              <Printer size={14} /> Imprimir ticket
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 min-h-11 text-xs font-bold uppercase text-slate-500">
              Cancelar
            </button>
            <button
              type="submit"
              form="order-withdrawal-form"
              className="flex-1 min-h-11 bg-emerald-600 text-white font-bold text-xs uppercase rounded-xl inline-flex items-center justify-center gap-2"
            >
              <CheckCircle size={16} /> Confirmar e gerar ticket
            </button>
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
                    <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">NF-e Vinculada ao Carregamento</span>
                    <p className="text-sm font-black text-slate-900">Nota Fiscal Nº {savedWithdrawal.nfeNumero}</p>
                    {savedWithdrawal.nfeChave && (
                      <p className="text-[9px] font-mono text-slate-500 truncate max-w-xs md:max-w-md">Chave: {savedWithdrawal.nfeChave}</p>
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
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Destinatário / Fazenda</span>
                <p className="font-black text-slate-800 uppercase">{customer?.name}</p>
                <p className="text-slate-500">Doc: {customer?.document}</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pedido de Venda</span>
                <p className="font-black text-purple-700">REF: {order.reference}</p>
                <p className="text-slate-500">Produto: {savedWithdrawal.productName}</p>
              </div>
            </div>

            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                <Scale size={14} /> Dados do Veículo e Pesagem
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-slate-800">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Placa / Veículo</span>
                  <p className="font-black text-base">{savedWithdrawal.plateNumber} {savedWithdrawal.truckModel && `(${savedWithdrawal.truckModel})`}</p>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Motorista</span>
                  <p className="font-black text-base">{savedWithdrawal.driverName || 'Não Informado'}</p>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Carga Retirada</span>
                  <p className="font-black text-xl text-emerald-700">{savedWithdrawal.quantityWithdrawn} TON</p>
                </div>
              </div>
            </div>

            {/* Controle de Saldo de Retirada */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total do Pedido</span>
                <p className="text-sm font-bold text-slate-700">{savedWithdrawal.totalOrderQuantity} TON</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Já Retirado</span>
                <p className="text-sm font-bold text-emerald-600">{savedWithdrawal.totalWithdrawnSoFar} TON</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Saldo Restante a Retirar</span>
                <p className="text-sm font-black text-rose-600">{savedWithdrawal.remainingBalanceQuantity} TON</p>
              </div>
            </div>

            {/* Assinaturas */}
            <div className="grid grid-cols-2 gap-8 pt-8">
              <div className="text-center space-y-1">
                <div className="border-t border-slate-400 pt-2 mx-4" />
                <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{savedWithdrawal.driverName || 'Motorista'}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase">Assinatura do Motorista / Transportador</p>
              </div>
              <div className="text-center space-y-1">
                <div className="border-t border-slate-400 pt-2 mx-4" />
                <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{savedWithdrawal.loadedBy || 'Expedição'}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase">Operador de Balança / Expedição</p>
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
                  <button
                    type="button"
                    onClick={handleEmitirNfeWithdrawal}
                    className="w-full sm:w-auto px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <FileText size={15} /> Emitir NF-e Deste Carregamento ({savedWithdrawal.quantityWithdrawn} Ton)
                  </button>
                ) : (
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle size={14} /> NF-e Nº {savedWithdrawal.nfeNumero} emitida
                  </span>
                )}
              </div>

              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all">
                  Fechar
                </button>
                <button onClick={handlePrint} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-200 transition-all flex items-center gap-1.5">
                  <Printer size={14} /> Imprimir Ticket
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Formulário de Registro de Retirada */
          <form id="order-withdrawal-form" onSubmit={handleSubmit} className="space-y-4">
            
            {/* Resumo de Saldos */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Comprado</span>
                <p className="text-base font-black text-slate-800">{totalOrderQty.toFixed(1)} TON</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Já Retirado</span>
                <p className="text-base font-black text-emerald-600">{alreadyWithdrawn.toFixed(1)} TON</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Disponível p/ Retirada</span>
                <p className="text-base font-black text-purple-600">{remainingToWithdraw.toFixed(1)} TON</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantidade a Retirar (TON)</label>
                  <input
                    required
                    type="number"
                    step="0.1"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    max={remainingToWithdraw}
                    className="w-full p-3.5 bg-emerald-50/50 border border-emerald-200 text-emerald-900 rounded-2xl outline-none font-black text-lg focus:border-emerald-500"
                    placeholder="Ex: 32.5"
                  />
                  <span className="text-[10px] text-slate-400 font-bold">
                    Saldo restante após esta saída: <strong className="text-slate-700">{newBalance.toFixed(1)} Ton</strong>
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nº Ticket / Romaneio</label>
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Placa do Caminhão</label>
                  <input
                    required
                    type="text"
                    value={plateNumber}
                    onChange={e => setPlateNumber(e.target.value.toUpperCase())}
                    placeholder="Ex: ABC-1D23"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-sm uppercase focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Modelo / Tipo Veículo</label>
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Motorista</label>
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CPF do Motorista (Opcional)</label>
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
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observações da Expedição</label>
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
    </FlowSheet>
  );
};
