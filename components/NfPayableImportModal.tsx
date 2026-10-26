import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  FileText,
  FileUp,
  Layers,
  Loader2,
  PackagePlus,
  Plus,
  Sparkles,
  Trash2,
  Truck,
  X
} from 'lucide-react';
import {
  parseNfeFileContent,
  ParsedNfDocument
} from '../services/nfeDocumentParser';
import {
  addDaysISO,
  buildInstallmentsFromNf,
  findDuplicateNfeTransactions,
  generateInstallmentsFromPreset,
  InstallmentDraft,
  InstallmentPreset,
  matchSupplierCustomer,
  splitAmountIntoInstallments
} from '../services/domain/payablesReceivables';
import { matchStoreItem } from '../services/storeItemMatch';
import { nextTransferCode, newId } from '../services/ids';
import {
  Category,
  Company,
  CostCenter,
  Customer,
  FinancialAccount,
  StoreItem,
  StoreItemCategory,
  Transaction,
  TransactionStatus,
  TransactionType,
  TransferShipment,
  User
} from '../types';
import { OUTFLOW_CATEGORIES } from '../constants';
import { dateISOBR } from '../utils/dateFilterUtils';

export type NfStockIntegrationMode = 'FINANCE_ONLY' | 'DIRECT_STORE' | 'TRANSFER_SHIPMENT';

interface NfPayableImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  accounts: FinancialAccount[];
  costCenters: CostCenter[];
  categories: Category[];
  customers: Customer[];
  storeItems?: StoreItem[];
  transfers?: TransferShipment[];
  currentUser?: User;
  company: Company;
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'companyId'>) => Promise<void> | void;
  onAddCustomer?: (customer: Customer) => Promise<Customer | void> | Customer | void;
  onUpsertStoreItem?: (item: StoreItem) => Promise<void> | void;
  onAddTransfer?: (shipment: Omit<TransferShipment, 'id'>) => Promise<void> | void;
}

const formatBRL = (val?: number) =>
  (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const digits = (value?: string) => (value || '').replace(/\D/g, '');

const PAYMENT_METHODS = [
  'Boleto Bancário',
  'PIX',
  'Transferência Bancária (TED)',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Dinheiro Físico',
  'Cheque'
];

export const NfPayableImportModal: React.FC<NfPayableImportModalProps> = ({
  isOpen,
  onClose,
  transactions,
  accounts,
  costCenters,
  categories,
  customers,
  storeItems = [],
  transfers = [],
  currentUser,
  company,
  onAddTransaction,
  onAddCustomer,
  onUpsertStoreItem,
  onAddTransfer
}) => {
  const todayStr = dateISOBR();

  const [parsed, setParsed] = useState<ParsedNfDocument | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Cabeçalho editável (permite ajustar mesmo em PDF parcial)
  const [nfNumber, setNfNumber] = useState('');
  const [nfSeries, setNfSeries] = useState('');
  const [issuedDate, setIssuedDate] = useState(todayStr);
  const [totalAmountStr, setTotalAmountStr] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierDoc, setSupplierDoc] = useState('');
  const [accessKey, setAccessKey] = useState('');

  // Fornecedor & Classificação
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [autoRegisterSupplier, setAutoRegisterSupplier] = useState(true);
  const [category, setCategory] = useState(OUTFLOW_CATEGORIES[0]);
  const [costCenterId, setCostCenterId] = useState(costCenters[0]?.id || 'cc1');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState('Boleto Bancário');
  const [txType, setTxType] = useState<TransactionType>(TransactionType.PURCHASE);

  // Parcelas / Duplicatas
  const [installments, setInstallments] = useState<InstallmentDraft[]>([]);
  const [fromXmlDuplicatas, setFromXmlDuplicatas] = useState(false);
  const [activePreset, setActivePreset] = useState<InstallmentPreset | 'XML'>('30');

  // Integração física opcional (Almoxarifado / Transferência)
  const [stockMode, setStockMode] = useState<NfStockIntegrationMode>('FINANCE_ONLY');
  const [driverName, setDriverName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');

  const outflowCategories = useMemo(() => {
    const custom = categories.filter((c) => c.type === 'OUTFLOW').map((c) => c.name);
    return Array.from(new Set([...custom, ...OUTFLOW_CATEGORIES]));
  }, [categories]);

  useEffect(() => {
    if (!isOpen) {
      setParsed(null);
      setFileName('');
      setLoading(false);
      setSaving(false);
      setError('');
      setNfNumber('');
      setNfSeries('');
      setIssuedDate(todayStr);
      setTotalAmountStr('');
      setSupplierName('');
      setSupplierDoc('');
      setAccessKey('');
      setSelectedCustomerId('');
      setAutoRegisterSupplier(true);
      setInstallments([]);
      setFromXmlDuplicatas(false);
      setStockMode('FINANCE_ONLY');
      setDriverName('');
      setVehiclePlate('');
    }
  }, [isOpen, todayStr]);

  const duplicateTxs = useMemo(
    () =>
      findDuplicateNfeTransactions(transactions, {
        ...(parsed || { source: 'xml', items: [] }),
        accessKey: accessKey || parsed?.accessKey,
        nfNumber: nfNumber || parsed?.nfNumber,
        supplierDocument: supplierDoc || parsed?.supplierDocument
      }),
    [transactions, parsed, accessKey, nfNumber, supplierDoc]
  );

  const destMismatch = useMemo(() => {
    const companyCnpj = digits(company?.cnpj || company?.document);
    const dest = digits(parsed?.destDocument);
    if (!companyCnpj || !dest) return false;
    return companyCnpj !== dest;
  }, [company, parsed]);

  const handleFileUpload = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError('');
    setFileName(file.name);

    try {
      const doc = await parseNfeFileContent(file);
      setParsed(doc);

      const issueIso = (doc.issuedAt || '').slice(0, 10) || todayStr;
      const totalVal = Number(doc.vNF || doc.vProd || 0);

      setNfNumber(doc.nfNumber || '');
      setNfSeries(doc.series || '');
      setIssuedDate(issueIso);
      setTotalAmountStr(totalVal > 0 ? totalVal.toFixed(2) : '');
      setSupplierName(doc.supplier || doc.supplierTradeName || '');
      setSupplierDoc(doc.supplierDocument || '');
      setAccessKey(doc.accessKey || '');
      setDriverName(doc.carrierName || '');
      setVehiclePlate((doc.vehiclePlate || '').toUpperCase());

      if (doc.suggestedCategory) setCategory(doc.suggestedCategory);
      if (doc.suggestedCostCenterId) setCostCenterId(doc.suggestedCostCenterId);
      if (doc.paymentMethod) setDefaultPaymentMethod(doc.paymentMethod);

      // Tenta vincular fornecedor existente
      const matchedCust = matchSupplierCustomer(customers, doc);
      if (matchedCust) {
        setSelectedCustomerId(matchedCust.id);
        setAutoRegisterSupplier(false);
      } else {
        setSelectedCustomerId('');
        setAutoRegisterSupplier(Boolean(doc.supplier || doc.supplierDocument));
      }

      // Constrói duplicatas do XML/PDF ou sugere 30 dias
      const built = buildInstallmentsFromNf(doc, issueIso);
      setInstallments(built.installments);
      setFromXmlDuplicatas(built.fromXmlDuplicatas);
      setActivePreset(built.fromXmlDuplicatas ? 'XML' : '30');
    } catch {
      setError('Não foi possível ler o arquivo enviado. Verifique se é um XML ou PDF válido.');
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: InstallmentPreset) => {
    const total = parseFloat(totalAmountStr) || 0;
    setActivePreset(preset);
    setFromXmlDuplicatas(false);
    const next = generateInstallmentsFromPreset(
      total,
      issuedDate || todayStr,
      preset,
      defaultPaymentMethod
    );
    if (preset === 'AVISTA' && next.length === 1) {
      next[0].dueDate = issuedDate || todayStr;
    }
    setInstallments(next);
  };

  const handleRecalculateAmounts = (newTotalStr: string) => {
    setTotalAmountStr(newTotalStr);
    const total = parseFloat(newTotalStr) || 0;
    if (installments.length > 0 && !fromXmlDuplicatas) {
      const split = splitAmountIntoInstallments(total, installments.length);
      setInstallments((prev) =>
        prev.map((inst, idx) => ({ ...inst, amount: split[idx] ?? inst.amount }))
      );
    }
  };

  const handleAddInstallment = () => {
    const nextNum = installments.length + 1;
    const lastDue = installments[installments.length - 1]?.dueDate || issuedDate || todayStr;
    const nextDue = addDaysISO(lastDue, 30);
    const total = parseFloat(totalAmountStr) || 0;
    const split = splitAmountIntoInstallments(total, nextNum);

    setFromXmlDuplicatas(false);
    setActivePreset('CUSTOM');
    setInstallments((prev) => [
      ...prev.map((item, idx) => ({ ...item, amount: split[idx] })),
      {
        id: `inst-${nextNum}-${Date.now()}`,
        number: nextNum,
        dupCode: String(nextNum).padStart(3, '0'),
        dueDate: nextDue,
        amount: split[nextNum - 1],
        status: TransactionStatus.PENDENTE,
        paymentMethod: defaultPaymentMethod
      }
    ]);
  };

  const handleRemoveInstallment = (id: string) => {
    if (installments.length <= 1) return;
    const remaining = installments.filter((i) => i.id !== id);
    const total = parseFloat(totalAmountStr) || 0;
    const split = splitAmountIntoInstallments(total, remaining.length);
    setFromXmlDuplicatas(false);
    setInstallments(
      remaining.map((item, idx) => ({
        ...item,
        number: idx + 1,
        dupCode: String(idx + 1).padStart(3, '0'),
        amount: split[idx]
      }))
    );
  };

  const updateInstallment = (id: string, patch: Partial<InstallmentDraft>) => {
    setInstallments((prev) =>
      prev.map((inst) => (inst.id === id ? { ...inst, ...patch } : inst))
    );
  };

  const installmentsSum = useMemo(
    () => Number(installments.reduce((s, i) => s + Number(i.amount || 0), 0).toFixed(2)),
    [installments]
  );

  const totalNfNum = parseFloat(totalAmountStr) || 0;
  const sumDiff = Number((totalNfNum - installmentsSum).toFixed(2));

  const handleConfirmImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (installments.length === 0 || installmentsSum <= 0) {
      setError('Defina ao menos uma parcela com valor maior que zero.');
      return;
    }
    if (!supplierName.trim() && !selectedCustomerId) {
      setError('Informe o nome do Fornecedor / Emitente da nota.');
      return;
    }
    if (stockMode === 'TRANSFER_SHIPMENT' && (!driverName.trim() || !vehiclePlate.trim())) {
      setError('Para gerar remessa em trânsito, informe o motorista e a placa do veículo.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      let finalCustomerId = selectedCustomerId;
      let finalContactName = supplierName.trim();

      const existingCust = customers.find((c) => c.id === selectedCustomerId);
      if (existingCust) {
        finalContactName = existingCust.name;
      } else if (autoRegisterSupplier && onAddCustomer && supplierName.trim()) {
        const cleanDoc = digits(supplierDoc);
        const newCust: Customer = {
          id: newId('cust'),
          name: supplierName.trim(),
          document: supplierDoc.trim() || 'ISENTO',
          email: parsed?.supplierEmail || '',
          phone: parsed?.supplierPhone || '',
          totalSpent: 0,
          companyId: company.id,
          tipoPessoa: cleanDoc.length === 11 ? 'PF' : 'PJ',
          ie: parsed?.supplierIe,
          street: parsed?.supplierStreet,
          number: parsed?.supplierNumber,
          neighborhood: parsed?.supplierNeighborhood,
          city: parsed?.supplierCity,
          state: parsed?.supplierState,
          zipCode: parsed?.supplierZipCode,
          ibgeCode: parsed?.supplierIbgeCode
        };
        const created = await onAddCustomer(newCust);
        finalCustomerId = (created && typeof created === 'object' && 'id' in created && created.id) ? created.id : newCust.id;
      }

      const itemsSummary =
        parsed?.items && parsed.items.length > 0
          ? parsed.items
              .slice(0, 3)
              .map((i) => i.productName)
              .join(', ') + (parsed.items.length > 3 ? ` (+${parsed.items.length - 3} itens)` : '')
          : '';

      const totalInstallments = installments.length;

      for (let i = 0; i < installments.length; i++) {
        const inst = installments[i];
        const parcelLabel =
          totalInstallments > 1 ? ` (Parcela ${inst.number}/${totalInstallments})` : '';
        const nfPrefix = nfNumber.trim() ? `NF ${nfNumber.trim()}` : 'Nota de Entrada';
        const description = `${nfPrefix} · ${finalContactName}${parcelLabel}`;

        const docNumber = nfNumber.trim()
          ? `NF ${nfNumber.trim()}${nfSeries ? `/${nfSeries}` : ''} - Dup ${inst.dupCode}`
          : `Dup ${inst.dupCode}`;

        const noteLines = [
          nfNumber ? `NF-e Nº ${nfNumber}${nfSeries ? ` (Série ${nfSeries})` : ''}` : '',
          accessKey ? `Chave NF-e: ${accessKey}` : '',
          itemsSummary ? `Itens: ${itemsSummary}` : '',
          fileName ? `Arquivo: ${fileName}` : '',
          inst.notes || ''
        ]
          .filter(Boolean)
          .join(' | ');

        const isPaid = inst.status === TransactionStatus.PAGO;

        await onAddTransaction({
          accountId: isPaid ? accountId || accounts[0]?.id || '' : accountId || '',
          costCenterId,
          date: issuedDate || todayStr,
          dueDate: inst.dueDate || issuedDate || todayStr,
          paymentDate: isPaid ? inst.dueDate || issuedDate || todayStr : undefined,
          type: txType,
          status: inst.status,
          description,
          category,
          amount: Number(inst.amount),
          originalAmount: Number(inst.amount),
          paidAmount: isPaid ? Number(inst.amount) : 0,
          customerId: finalCustomerId || undefined,
          contactId: finalCustomerId || undefined,
          contactName: finalContactName,
          paymentMethod: inst.paymentMethod || defaultPaymentMethod,
          notes: noteLines,
          nfeChave: accessKey || undefined,
          nfeNumero: nfNumber || undefined,
          nfeSerie: nfSeries || undefined,
          documentNumber: docNumber,
          installmentNumber: inst.number,
          installmentTotal: totalInstallments,
          supplierCnpj: digits(supplierDoc) || undefined,
          payments: isPaid
            ? [
                {
                  id: `pmt-${Date.now()}-${i}`,
                  transactionId: '',
                  amount: Number(inst.amount),
                  paymentDate: inst.dueDate || issuedDate || todayStr,
                  accountId: accountId || accounts[0]?.id || '',
                  paymentMethod: inst.paymentMethod || defaultPaymentMethod,
                  notes: `Baixa automática na importação da ${nfPrefix}`
                }
              ]
            : []
        });
      }

      // Integração opcional 1: Entrada direta no Almoxarifado (store_items)
      if (stockMode === 'DIRECT_STORE' && onUpsertStoreItem && parsed?.items?.length) {
        for (const it of parsed.items) {
          const matched = matchStoreItem(storeItems, {
            cProd: it.cProd,
            ncm: it.ncm,
            name: it.productName,
            supplierCnpj: supplierDoc
          });
          if (matched) {
            await onUpsertStoreItem({
              ...matched,
              quantity: Number(matched.quantity || 0) + Number(it.quantitySent || 0),
              unitCost: it.unitCost || matched.unitCost,
              lastNfNumber: nfNumber || matched.lastNfNumber,
              lastNfeChave: accessKey || matched.lastNfeChave
            });
          } else {
            await onUpsertStoreItem({
              id: newId('item'),
              name: it.productName,
              category: (it.category || 'Peças') as StoreItemCategory,
              quantity: Number(it.quantitySent || 0),
              unit: it.unit || 'UN',
              minStock: 2,
              companyId: company.id,
              supplierSku: it.cProd,
              supplierCnpj: digits(supplierDoc) || undefined,
              ncm: it.ncm,
              unitCost: it.unitCost,
              lastNfNumber: nfNumber || undefined,
              lastNfeChave: accessKey || undefined,
              status: 'ativo'
            });
          }
        }
      }

      // Integração opcional 2: Gerar remessa em trânsito (transfers)
      if (stockMode === 'TRANSFER_SHIPMENT' && onAddTransfer && parsed?.items?.length) {
        await onAddTransfer({
          code: nextTransferCode(transfers),
          originLocation: 'Polo de Compras Santarém',
          destinationLocation: 'Fazenda Usina Matriz',
          dateSent: issuedDate || todayStr,
          sentBy: currentUser?.name || 'Financeiro / Compras',
          carrierOrDriver: driverName.trim(),
          vehiclePlate: vehiclePlate.trim().toUpperCase(),
          notes: `Importado junto com Contas a Pagar · NF ${nfNumber || 'S/N'} · Fornecedor: ${finalContactName}`,
          items: parsed.items.map((it, idx) => {
            const matched = matchStoreItem(storeItems, {
              cProd: it.cProd,
              ncm: it.ncm,
              name: it.productName,
              supplierCnpj: supplierDoc
            });
            return {
              id: `nf-tr-${Date.now()}-${idx}`,
              productId: matched?.id,
              productName: it.productName,
              category: matched?.category || it.category,
              quantitySent: it.quantitySent,
              quantityReceived: 0,
              unit: it.unit || matched?.unit || 'UN',
              unitCost: it.unitCost,
              totalCost: it.totalCost,
              nfCompraNumber: nfNumber,
              supplier: finalContactName,
              conferido: false,
              cProd: it.cProd,
              ncm: it.ncm,
              cfop: it.cfop,
              infAdProd: it.infAdProd,
              included: true
            };
          }),
          status: 'EM_TRANSITO',
          stockIntegrated: false,
          createdAt: new Date().toISOString(),
          nfeChave: accessKey || undefined,
          nfeNumero: nfNumber || undefined,
          nfeSerie: nfSeries || undefined,
          nfeXml: parsed.rawXml,
          nfeXmlRef: accessKey || fileName,
          nfeFileName: fileName,
          supplierCnpj: digits(supplierDoc) || undefined,
          supplierName: finalContactName
        });
      }

      onClose();
    } catch (err) {
      console.error('Erro ao importar NF para Contas a Pagar:', err);
      setError('Ocorreu um erro ao salvar os títulos. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[220] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 max-h-[93vh] flex flex-col">
        {/* Header */}
        <header className="px-6 py-4 border-b border-slate-200 bg-[#F7F8F3] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0F5948] text-white flex items-center justify-center shadow-sm">
              <FileUp size={20} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[#163C35]">
                Dar Entrada de Nota Fiscal (XML / PDF) → Contas a Pagar
              </h3>
              <p className="text-xs text-slate-600">
                Extrai fornecedor, itens e duplicatas (<code className="font-mono">&lt;cobr&gt;&lt;dup&gt;</code>) automaticamente para projetar os vencimentos a pagar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white text-slate-500 transition-colors"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        {/* Body */}
        <form onSubmit={handleConfirmImport} className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Dropzone de Upload */}
          <label className="flex flex-col sm:flex-row items-center justify-between gap-4 border-2 border-dashed border-[#0F5948]/35 rounded-2xl px-6 py-5 cursor-pointer hover:border-[#0F5948] bg-[#F7F8F3]/70 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#E5EEE5] text-[#0F5948] flex items-center justify-center shrink-0">
                {loading ? <Loader2 className="animate-spin" size={24} /> : <FileUp size={24} />}
              </div>
              <div>
                <p className="text-sm font-extrabold text-[#163C35]">
                  {fileName ? `Arquivo carregado: ${fileName}` : 'Clique para selecionar o XML ou PDF da Nota Fiscal'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  O XML da NF-e preenche 100% das duplicatas, CNPJ do fornecedor, NCM e chave de acesso sem margem de erro.
                </p>
              </div>
            </div>
            <span className="px-4 py-2 rounded-xl bg-[#0F5948] text-white text-xs font-bold shrink-0">
              Escolher XML / PDF
            </span>
            <input
              type="file"
              accept=".xml,.pdf,application/xml,application/pdf,text/xml"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
            />
          </label>

          {/* Alertas de Validação / Duplicidade */}
          {(error || parsed?.warnings?.[0]) && (
            <div className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
              <span>{error || parsed?.warnings?.[0]}</span>
            </div>
          )}

          {duplicateTxs.length > 0 && (
            <div className="text-xs font-semibold text-rose-900 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="font-extrabold">Atenção: Esta Nota Fiscal já possui {duplicateTxs.length} lançamento(s) no financeiro!</p>
                <p className="text-rose-700 mt-0.5">
                  Encontramos registros anteriores para esta mesma chave/número de NF ({duplicateTxs[0]?.description}). Confirme apenas se desejar lançar parcelas complementares.
                </p>
              </div>
            </div>
          )}

          {destMismatch && (
            <div className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
              <span>
                O CNPJ destinatário na nota ({parsed?.destName || parsed?.destDocument}) é diferente do CNPJ da unidade atual ({company.name}).
              </span>
            </div>
          )}

          {/* Bloco 1: Dados da Nota e Fornecedor */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200">
            <div className="lg:col-span-12 flex items-center justify-between border-b border-slate-200/80 pb-2.5">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-[#0F5948]" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  1. Identificação da Nota & Fornecedor
                </h4>
              </div>
              {accessKey && (
                <span className="text-[11px] font-mono bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600">
                  Chave: {accessKey}
                </span>
              )}
            </div>

            <div className="lg:col-span-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Nº da NF *</label>
              <input
                type="text"
                value={nfNumber}
                onChange={(e) => setNfNumber(e.target.value)}
                placeholder="Ex: 14520"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div className="lg:col-span-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Série</label>
              <input
                type="text"
                value={nfSeries}
                onChange={(e) => setNfSeries(e.target.value)}
                placeholder="1"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Data de Emissão *</label>
              <input
                type="date"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Valor Total da Nota (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={totalAmountStr}
                onChange={(e) => handleRecalculateAmounts(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-emerald-800"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Tipo de Saída</label>
              <select
                value={txType}
                onChange={(e) => setTxType(e.target.value as TransactionType)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              >
                <option value={TransactionType.PURCHASE}>Compra / Insumo / Mercadoria</option>
                <option value={TransactionType.EXPENSE}>Despesa Operacional / Serviço</option>
              </select>
            </div>

            {/* Fornecedor */}
            <div className="lg:col-span-5">
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                Razão Social / Nome do Fornecedor *
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Ex: Petrobras Distribuidora / Sotreq S/A"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">CNPJ / CPF do Emitente</label>
              <input
                type="text"
                value={supplierDoc}
                onChange={(e) => setSupplierDoc(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-700"
              />
            </div>

            <div className="lg:col-span-4">
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                Vínculo no Cadastro de Clientes/Fornecedores
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  const found = customers.find((c) => c.id === e.target.value);
                  if (found) {
                    setSupplierName(found.name);
                    setSupplierDoc(found.document);
                  }
                }}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              >
                <option value="">
                  {autoRegisterSupplier ? '✨ Cadastrar novo fornecedor automaticamente' : 'Sem vínculo fixo'}
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.document ? `(${c.document})` : ''}
                  </option>
                ))}
              </select>
              {!selectedCustomerId && supplierName && (
                <label className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] text-[#0F5948] font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRegisterSupplier}
                    onChange={(e) => setAutoRegisterSupplier(e.target.checked)}
                    className="rounded border-slate-300 text-[#0F5948]"
                  />
                  Salvar fornecedor no cadastro com CNPJ e endereço do XML
                </label>
              )}
            </div>
          </div>

          {/* Bloco 2: Classificação Financeira */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-white p-4 rounded-2xl border border-slate-200">
            <div className="sm:col-span-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-amber-500" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  2. Classificação Financeira & Centro de Custo
                </h4>
              </div>
              {parsed?.suggestedCategory && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Sugerido pelos itens da NF: {parsed.suggestedCategory}
                </span>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Categoria de Despesa *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              >
                {outflowCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Centro de Custo *</label>
              <select
                value={costCenterId}
                onChange={(e) => setCostCenterId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              >
                {costCenters.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Forma de Pagamento Padrão</label>
              <select
                value={defaultPaymentMethod}
                onChange={(e) => {
                  const nextMethod = e.target.value;
                  setDefaultPaymentMethod(nextMethod);
                  setInstallments((prev) => prev.map((i) => ({ ...i, paymentMethod: nextMethod })));
                }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Conta / Banco Previsto</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              >
                <option value="">Definir na hora da baixa</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bloco 3: Duplicatas / Projeção de Vencimentos (Contas Certamente a Pagar) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-[#0F5948]" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  3. Duplicatas & Cronograma de Vencimentos (Contas a Pagar)
                </h4>
                {fromXmlDuplicatas && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    Extraído das duplicatas da NF-e ({installments.length}x)
                  </span>
                )}
              </div>

              {/* Botões rápidos de condição de pagamento */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400 mr-1">Gerar condição:</span>
                {(
                  [
                    { id: 'AVISTA', label: 'À Vista' },
                    { id: '30', label: '30 dias' },
                    { id: '30_60', label: '30/60d' },
                    { id: '30_60_90', label: '30/60/90d' },
                    { id: '15_30_45', label: '15/30/45d' }
                  ] as { id: InstallmentPreset; label: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                      activePreset === p.id && !fromXmlDuplicatas
                        ? 'bg-[#0F5948] text-white border-[#0F5948]'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddInstallment}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                >
                  <Plus size={12} /> + Parcela
                </button>
              </div>
            </div>

            {installments.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                Suba um XML/PDF acima ou informe o valor total e clique em uma condição de parcelamento (ex: 30/60/90d).
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-bold">Parcela</th>
                      <th className="py-2.5 px-3 text-left font-bold">Nº Duplicata / Boleto</th>
                      <th className="py-2.5 px-3 text-left font-bold">Vencimento *</th>
                      <th className="py-2.5 px-3 text-left font-bold">Valor (R$) *</th>
                      <th className="py-2.5 px-3 text-left font-bold">Meio de Pagto</th>
                      <th className="py-2.5 px-3 text-left font-bold">Status Inicial</th>
                      <th className="py-2.5 px-3 text-right font-bold">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {installments.map((inst) => (
                      <tr key={inst.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-black text-slate-700">
                          {inst.number}/{installments.length}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={inst.dupCode}
                            onChange={(e) => updateInstallment(inst.id, { dupCode: e.target.value })}
                            className="w-24 px-2 py-1 border border-slate-200 rounded-lg font-mono text-xs"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="date"
                            value={inst.dueDate}
                            onChange={(e) => updateInstallment(inst.id, { dueDate: e.target.value })}
                            className="px-2.5 py-1 border border-slate-200 rounded-lg font-bold text-slate-800"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={inst.amount}
                            onChange={(e) =>
                              updateInstallment(inst.id, { amount: parseFloat(e.target.value) || 0 })
                            }
                            className="w-32 px-2.5 py-1 border border-slate-200 rounded-lg font-black text-rose-700"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={inst.paymentMethod}
                            onChange={(e) => updateInstallment(inst.id, { paymentMethod: e.target.value })}
                            className="px-2 py-1 border border-slate-200 rounded-lg font-semibold text-slate-700"
                          >
                            {PAYMENT_METHODS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={inst.status}
                            onChange={(e) =>
                              updateInstallment(inst.id, {
                                status: e.target.value as TransactionStatus.PENDENTE | TransactionStatus.PAGO
                              })
                            }
                            className={`px-2.5 py-1 rounded-lg font-bold border ${
                              inst.status === TransactionStatus.PAGO
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            <option value={TransactionStatus.PENDENTE}>⏳ A Pagar (Projetado)</option>
                            <option value={TransactionStatus.PAGO}>✅ Já Pago à Vista</option>
                          </select>
                        </td>
                        <td className="py-2 px-3 text-right">
                          {installments.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveInstallment(inst.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                              title="Remover parcela"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Resumo de conferência da soma das parcelas */}
            {installments.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 rounded-xl text-xs">
                <span className="text-slate-600">
                  Soma das {installments.length} parcela(s):{' '}
                  <strong className="text-slate-900 font-black">{formatBRL(installmentsSum)}</strong>
                </span>
                {Math.abs(sumDiff) > 0.02 && totalNfNum > 0 ? (
                  <span className="text-amber-700 font-bold">
                    Diferença para o total da NF ({formatBRL(totalNfNum)}): {formatBRL(sumDiff)}
                  </span>
                ) : (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 size={14} /> Valores conferem com o total da Nota Fiscal
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Bloco 4: Destino dos Itens Físicos (se a NF tiver produtos) */}
          {parsed && parsed.items.length > 0 && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers size={15} className="text-[#0F5948]" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    4. Destino Físico dos {parsed.items.length} Item(ns) da Nota Fiscal
                  </h4>
                </div>
                <span className="text-[11px] text-slate-500">
                  Escolha se além do Contas a Pagar a nota deve movimentar o almoxarifado
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setStockMode('FINANCE_ONLY')}
                  className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                    stockMode === 'FINANCE_ONLY'
                      ? 'bg-white border-[#0F5948] ring-2 ring-[#0F5948]/15'
                      : 'bg-white/60 border-slate-200 hover:bg-white'
                  }`}
                >
                  <FileText size={18} className="text-[#0F5948] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-extrabold text-slate-800">Somente Contas a Pagar</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Lança apenas as parcelas no financeiro, sem alterar estoque/almoxarifado.
                    </p>
                  </div>
                </button>

                {onUpsertStoreItem && (
                  <button
                    type="button"
                    onClick={() => setStockMode('DIRECT_STORE')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                      stockMode === 'DIRECT_STORE'
                        ? 'bg-white border-[#0F5948] ring-2 ring-[#0F5948]/15'
                        : 'bg-white/60 border-slate-200 hover:bg-white'
                    }`}
                  >
                    <PackagePlus size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-extrabold text-slate-800">Financeiro + Almoxarifado Direto</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Soma imediatamente as quantidades compradas nas peças/suprimentos.
                      </p>
                    </div>
                  </button>
                )}

                {onAddTransfer && (
                  <button
                    type="button"
                    onClick={() => setStockMode('TRANSFER_SHIPMENT')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                      stockMode === 'TRANSFER_SHIPMENT'
                        ? 'bg-white border-[#0F5948] ring-2 ring-[#0F5948]/15'
                        : 'bg-white/60 border-slate-200 hover:bg-white'
                    }`}
                  >
                    <Truck size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-extrabold text-slate-800">Financeiro + Remessa em Trânsito</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Gera remessa de Santarém → Fazenda para conferência na chegada.
                      </p>
                    </div>
                  </button>
                )}
              </div>

              {stockMode === 'TRANSFER_SHIPMENT' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                      Motorista / Portador *
                    </label>
                    <input
                      type="text"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="Nome do motorista que leva para a fazenda"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                      Placa do Veículo *
                    </label>
                    <input
                      type="text"
                      value={vehiclePlate}
                      onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                      placeholder="QDA-4E90"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold uppercase"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <footer className="px-6 py-4 border-t border-slate-200 bg-[#F7F8F3] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            Serão gerados <strong>{installments.length} título(s)</strong> totalizando{' '}
            <strong className="text-rose-700 font-black">{formatBRL(installmentsSum)}</strong>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-white border border-transparent hover:border-slate-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || loading || installments.length === 0}
              onClick={handleConfirmImport}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F5948] hover:bg-[#163C35] text-white text-xs font-extrabold shadow-sm disabled:opacity-40 transition-all"
            >
              <CheckCircle2 size={16} />
              {saving
                ? 'Lançando títulos...'
                : `Confirmar Entrada (${installments.length} parcela${installments.length > 1 ? 's' : ''})`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default NfPayableImportModal;
