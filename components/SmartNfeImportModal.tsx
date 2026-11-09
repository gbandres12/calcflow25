import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  FileText,
  FileUp,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  Truck,
  X
} from 'lucide-react';
import {
  Company,
  Customer,
  FiscalConfig,
  SaleOrder,
  StoreItem,
  StoreItemCategory,
  TransferShipment,
  User
} from '../types';
import { parseNfeFileContent, parseNfeXml, ParsedNfDocument } from '../services/nfeDocumentParser';
import {
  SmartImportAnalysis,
  SmartImportIntent,
  SmartImportItemRow,
  analyzeImportedNfe,
  applyImportCommand,
  buildDefaultInfCpl,
  buildFiscalOrderFromImport,
  buildTransferShipmentFromImport,
  resolveOrBuildCustomerFromImportedNfe,
  switchImportIntent
} from '../services/domain/nfeSmartImport';

const STORE_CATEGORIES: StoreItemCategory[] = [
  'Peças',
  'Lubrificantes',
  'EPI',
  'Ferramentas',
  'Insumos',
  'Outros'
];

interface SmartNfeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultIntent?: SmartImportIntent;
  company?: Company;
  config?: FiscalConfig | null;
  currentUser?: User;
  customers?: Customer[];
  orders?: SaleOrder[];
  storeItems?: StoreItem[];
  transfers?: TransferShipment[];
  onStartFiscalEmission?: (params: {
    order: SaleOrder;
    customer: Customer;
    isNewCustomer: boolean;
    intent: 'devolucao_nfe' | 'transferencia_nfe';
    devolutionChave?: string;
  }) => void;
  onCreateTransferShipment?: (shipment: Omit<TransferShipment, 'id'>) => void;
}

const formatBRL = (val?: number) =>
  (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const SmartNfeImportModal: React.FC<SmartNfeImportModalProps> = ({
  isOpen,
  onClose,
  defaultIntent = 'devolucao_nfe',
  company,
  config,
  currentUser,
  customers = [],
  orders = [],
  storeItems = [],
  transfers = [],
  onStartFiscalEmission,
  onCreateTransferShipment
}) => {
  const [parsedDoc, setParsedDoc] = useState<ParsedNfDocument | null>(null);
  const [analysis, setAnalysis] = useState<SmartImportAnalysis | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [commandInput, setCommandInput] = useState('');
  const [showPasteXml, setShowPasteXml] = useState(false);
  const [rawXmlText, setRawXmlText] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setParsedDoc(null);
      setAnalysis(null);
      setFileName('');
      setLoading(false);
      setError('');
      setCommandInput('');
      setShowPasteXml(false);
      setRawXmlText('');
    }
  }, [isOpen]);

  const loadDocument = (doc: ParsedNfDocument, sourceLabel: string) => {
    setParsedDoc(doc);
    setFileName(sourceLabel);
    const nextAnalysis = analyzeImportedNfe({
      doc,
      company,
      config,
      storeItems,
      initialIntent: defaultIntent
    });
    setAnalysis(nextAnalysis);
  };

  const handleFileChange = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const doc = await parseNfeFileContent(file);
      if (!doc.items.length) {
        setError(
          'O arquivo foi lido, mas não encontramos itens claros da NF-e. Prefira enviar o arquivo .XML oficial da nota.'
        );
        return;
      }
      loadDocument(doc, file.name);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível ler o arquivo da NF-e.');
    } finally {
      setLoading(false);
    }
  };

  const handleParsePastedXml = () => {
    const trimmed = rawXmlText.trim();
    if (!trimmed) return;
    setError('');
    try {
      const doc = parseNfeXml(trimmed);
      if (!doc.items.length) {
        setError('Não encontramos itens (<det>) nesse XML. Confira se colou o XML completo da NF-e.');
        return;
      }
      loadDocument(doc, `XML colado (${doc.nfNumber || 'NF-e'})`);
      setShowPasteXml(false);
    } catch {
      setError('XML inválido. Cole o conteúdo completo do arquivo .xml da NF-e.');
    }
  };

  const handleIntentChange = (nextIntent: SmartImportIntent) => {
    if (!analysis || !parsedDoc) return;
    setError('');
    setAnalysis(switchImportIntent(analysis, parsedDoc, nextIntent));
  };

  const handleRunCommand = (customCmd?: string) => {
    if (!analysis || !parsedDoc) return;
    const text = (customCmd ?? commandInput).trim();
    if (!text) return;
    setError('');
    const updated = applyImportCommand(analysis, parsedDoc, text);
    setAnalysis(updated);
    if (!customCmd) setCommandInput('');
  };

  const updateRow = (id: string, patch: Partial<SmartImportItemRow>) => {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      rows: analysis.rows.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
          const qty = Math.max(0, Number(next.quantity) || 0);
          const price = Math.max(0, Number(next.unitPrice) || 0);
          next.quantity = qty;
          next.unitPrice = price;
          next.total = Number((qty * price).toFixed(2));
        }
        return next;
      })
    });
  };

  const selectedRows = useMemo(
    () => (analysis?.rows || []).filter((r) => r.included && r.quantity > 0),
    [analysis]
  );

  const selectedTotal = useMemo(
    () => selectedRows.reduce((sum, r) => sum + (Number(r.total) || 0), 0),
    [selectedRows]
  );

  const handleConfirm = () => {
    if (!analysis || !parsedDoc) return;
    if (selectedRows.length === 0) {
      setError('Selecione pelo menos 1 item com quantidade maior que zero para continuar.');
      return;
    }

    if (analysis.intent === 'remessa_interna') {
      if (!onCreateTransferShipment) {
        setError('A criação de remessa interna não está disponível nesta visualização.');
        return;
      }
      if (!analysis.driverName.trim() || !analysis.vehiclePlate.trim()) {
        setError('Para gerar a Remessa Interna, informe o Motorista/Portador e a Placa do veículo (ou digite no comando).');
        return;
      }
      const shipment = buildTransferShipmentFromImport({
        doc: parsedDoc,
        analysis,
        existingTransfers: transfers,
        sentBy: currentUser?.name || 'Operador Fiscal',
        fileName
      });
      onCreateTransferShipment(shipment);
      onClose();
      return;
    }

    // NF-e de Devolução ou NF-e de Transferência (SEFAZ)
    if (analysis.intent === 'devolucao_nfe') {
      const digitsKey = (analysis.accessKey || '').replace(/\D/g, '');
      if (digitsKey.length !== 44) {
        setError(
          'Para emitir NF-e de Devolução na SEFAZ, a Chave de Acesso referenciada precisa ter exatamente 44 dígitos.'
        );
        return;
      }
    }

    if (!onStartFiscalEmission) {
      setError('Abra pela tela de Notas Fiscais para iniciar a emissão na SEFAZ.');
      return;
    }

    const { customer, isNew } = resolveOrBuildCustomerFromImportedNfe({
      doc: parsedDoc,
      analysis,
      customers,
      companyId: company?.id
    });

    const fiscalOrder = buildFiscalOrderFromImport({
      doc: parsedDoc,
      analysis,
      customer,
      existingOrders: orders,
      sellerName: currentUser?.name || 'Fiscal',
      companyId: company?.id
    });

    onStartFiscalEmission({
      order: fiscalOrder,
      customer,
      isNewCustomer: isNew,
      intent: analysis.intent,
      devolutionChave:
        analysis.intent === 'devolucao_nfe'
          ? (analysis.accessKey || '').replace(/\D/g, '')
          : undefined
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[220] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden border border-[#D5E3DC] max-h-[94vh] flex flex-col">
        {/* Cabeçalho */}
        <header className="px-5 sm:px-6 py-4 border-b border-[#D5E3DC] bg-[#F7F8F3] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0F5948] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#0F2E28]">
                Importação Inteligente de NF-e (Devolução & Transferência)
              </h3>
              <p className="text-xs text-[#5E7067]">
                Suba o XML ou PDF da nota, use os comandos rápidos ou a análise automática para gerar Devolução Fiscal, Transferência SEFAZ ou Remessa Interna.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white text-slate-500 transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        {/* Corpo */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Área de Upload / Seleção de Arquivo */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <label className="flex-1 flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-[#0F5948]/35 rounded-xl py-5 px-4 cursor-pointer hover:border-[#0F5948] bg-[#F8FAF8] transition-colors">
              {loading ? (
                <Loader2 className="animate-spin text-[#0F5948]" size={22} />
              ) : (
                <FileUp className="text-[#0F5948]" size={22} />
              )}
              <span className="text-sm font-semibold text-[#0F5948]">
                {fileName ? `Arquivo carregado: ${fileName}` : 'Clique para enviar o XML ou PDF da NF-e'}
              </span>
              <span className="text-xs text-slate-500">
                Extrai automaticamente emitente, chave de 44 dígitos, itens, NCM, CFOP e valores
              </span>
              <input
                type="file"
                accept=".xml,.pdf,application/xml,application/pdf,text/xml"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />
            </label>

            <button
              type="button"
              onClick={() => setShowPasteXml((prev) => !prev)}
              className="px-4 py-3 rounded-xl border border-[#D5E3DC] bg-white hover:bg-[#F7F8F3] text-xs font-semibold text-[#163C35] flex sm:flex-col items-center justify-center gap-1.5 shrink-0"
            >
              <FileText size={18} className="text-[#0F5948]" />
              <span>{showPasteXml ? 'Ocultar campo XML' : 'Colar XML texto'}</span>
            </button>
          </div>

          {showPasteXml && (
            <div className="p-4 rounded-xl border border-[#D5E3DC] bg-[#F8FAF8] space-y-2.5">
              <label className="block text-xs font-semibold text-[#163C35]">
                Cole abaixo o conteúdo completo do arquivo XML da NF-e:
              </label>
              <textarea
                rows={4}
                value={rawXmlText}
                onChange={(e) => setRawXmlText(e.target.value)}
                placeholder="<nfeProc>...<infNFe Id='NFe...'></infNFe></nfeProc>"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParsePastedXml}
                  className="px-4 py-2 rounded-lg bg-[#0F5948] text-white text-xs font-semibold hover:bg-[#0c4639]"
                >
                  Analisar XML colado
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs font-medium text-rose-900 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {analysis && parsedDoc && (
            <>
              {/* 1. Diagnóstico Inteligente da Nota */}
              <div className="rounded-xl border border-[#CFE0D6] bg-[#F4F8F5] p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-[#0F5948]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#0F5948]">
                      Diagnóstico da Nota Importada · NF {analysis.nfNumber || 'S/N'} (Série {analysis.series})
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white border border-[#CFE0D6] text-[#163C35]">
                    {analysis.isInterestadual
                      ? `Interestadual (${analysis.emitterUf} → ${analysis.companyUf})`
                      : `Operação Interna (${analysis.companyUf})`}
                  </span>
                </div>

                <ul className="space-y-1 text-xs text-[#2C423B]">
                  {analysis.summaryPoints.map((pt, idx) => (
                    <li key={idx}>• {pt}</li>
                  ))}
                </ul>

                {analysis.warnings.length > 0 && (
                  <div className="pt-1 space-y-1">
                    {analysis.warnings.map((w, idx) => (
                      <p
                        key={idx}
                        className="text-xs text-amber-900 bg-amber-50/90 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-2"
                      >
                        <AlertTriangle size={13} className="shrink-0 text-amber-600" />
                        <span>{w}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Escolha Rápida do Tipo de Operação */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#163C35]">
                  O que você deseja fazer com esta NF-e?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {onStartFiscalEmission && (
                    <button
                      type="button"
                      onClick={() => handleIntentChange('devolucao_nfe')}
                      className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                        analysis.intent === 'devolucao_nfe'
                          ? 'border-[#0F5948] bg-[#E8F1EC] text-[#0F2E28] ring-2 ring-[#0F5948]/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <RotateCcw
                        size={18}
                        className={`mt-0.5 shrink-0 ${
                          analysis.intent === 'devolucao_nfe' ? 'text-[#0F5948]' : 'text-slate-400'
                        }`}
                      />
                      <div>
                        <p className="text-xs font-bold">NF-e de Devolução (SEFAZ)</p>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          CFOP {analysis.cfopDevolucaoSugerido} · finNFe=4 · Referencia a chave de 44 dígitos
                        </p>
                      </div>
                    </button>
                  )}

                  {onStartFiscalEmission && (
                    <button
                      type="button"
                      onClick={() => handleIntentChange('transferencia_nfe')}
                      className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                        analysis.intent === 'transferencia_nfe'
                          ? 'border-[#0F5948] bg-[#E8F1EC] text-[#0F2E28] ring-2 ring-[#0F5948]/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <ArrowRightLeft
                        size={18}
                        className={`mt-0.5 shrink-0 ${
                          analysis.intent === 'transferencia_nfe' ? 'text-[#0F5948]' : 'text-slate-400'
                        }`}
                      />
                      <div>
                        <p className="text-xs font-bold">NF-e de Transferência (SEFAZ)</p>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          CFOP {analysis.cfopTransferenciaSugerido} · Emite nova NF-e fiscal de transferência
                        </p>
                      </div>
                    </button>
                  )}

                  {onCreateTransferShipment && (
                    <button
                      type="button"
                      onClick={() => handleIntentChange('remessa_interna')}
                      className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                        analysis.intent === 'remessa_interna'
                          ? 'border-[#0F5948] bg-[#E8F1EC] text-[#0F2E28] ring-2 ring-[#0F5948]/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Truck
                        size={18}
                        className={`mt-0.5 shrink-0 ${
                          analysis.intent === 'remessa_interna' ? 'text-[#0F5948]' : 'text-slate-400'
                        }`}
                      />
                      <div>
                        <p className="text-xs font-bold">Remessa Interna (Pátio / Fazenda)</p>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Gera romaneio Santarém → Fazenda para conferência no almoxarifado
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* 3. Barra de Comando / IA */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs font-semibold text-[#163C35] flex items-center gap-1.5">
                    <Sparkles size={14} className="text-[#0F5948]" />
                    <span>Comando Rápido / Instrução para a Nota:</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleRunCommand('Fazer devolução total desta nota')}
                      className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-[#0F5948] text-[11px] font-medium text-slate-700"
                    >
                      Devolução total
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleRunCommand('Devolver 1 un do item 1 motivo mercadoria com defeito')
                      }
                      className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-[#0F5948] text-[11px] font-medium text-slate-700"
                    >
                      Devolver 1º item parcial
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleRunCommand('Emitir NF-e de transferência na SEFAZ de todos os itens')
                      }
                      className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-[#0F5948] text-[11px] font-medium text-slate-700"
                    >
                      NF-e Transferência total
                    </button>
                    {onCreateTransferShipment && (
                      <button
                        type="button"
                        onClick={() =>
                          handleRunCommand('Gerar remessa interna para a fazenda com todos os itens')
                        }
                        className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-[#0F5948] text-[11px] font-medium text-slate-700"
                      >
                        Remessa p/ Fazenda
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleRunCommand();
                      }
                    }}
                    placeholder='Ex: "Devolver 2 un do item 1 motivo avaria" ou "Transferir para fazenda placa QVA1B23 motorista Carlos"'
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleRunCommand()}
                    className="px-4 py-2 rounded-lg bg-[#0F5948] hover:bg-[#0c4639] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    <Send size={13} />
                    <span>Aplicar comando</span>
                  </button>
                </div>

                {analysis.commandFeedback && (
                  <p className="text-xs font-medium text-[#0F5948] bg-[#E8F1EC] rounded-lg px-3 py-1.5">
                    ✓ {analysis.commandFeedback}
                  </p>
                )}
              </div>

              {/* 4. Parâmetros Fiscais / Logísticos */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Chave de Acesso Referenciada (44 dígitos da NF original)
                  </label>
                  <input
                    type="text"
                    value={analysis.accessKey}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, '').slice(0, 44);
                      setAnalysis({
                        ...analysis,
                        accessKey: clean,
                        accessKeyValid: clean.length === 44
                      });
                    }}
                    placeholder="44 dígitos numéricos da NF-e de origem"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Natureza da Operação
                  </label>
                  <input
                    type="text"
                    value={analysis.naturezaOperacao}
                    onChange={(e) =>
                      setAnalysis({ ...analysis, naturezaOperacao: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Motorista / Portador
                  </label>
                  <input
                    type="text"
                    value={analysis.driverName}
                    onChange={(e) => setAnalysis({ ...analysis, driverName: e.target.value })}
                    placeholder="Ex: Carlos Caminhoneiro"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Placa do Veículo
                  </label>
                  <input
                    type="text"
                    value={analysis.vehiclePlate}
                    onChange={(e) =>
                      setAnalysis({ ...analysis, vehiclePlate: e.target.value.toUpperCase() })
                    }
                    placeholder="ABC1D23"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Motivo da Devolução / Observação
                  </label>
                  <input
                    type="text"
                    value={analysis.reason}
                    onChange={(e) => {
                      const nextReason = e.target.value;
                      setAnalysis({
                        ...analysis,
                        reason: nextReason,
                        infCpl: buildDefaultInfCpl(analysis.intent, parsedDoc, nextReason)
                      });
                    }}
                    placeholder="Ex: Mercadoria em desacordo / avaria"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {/* 5. Tabela de Itens da Nota */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Itens da NF-e ({selectedRows.length} de {analysis.rows.length} selecionados)
                  </span>
                  <span className="text-xs font-bold text-[#0F5948]">
                    Total selecionado: {formatBRL(selectedTotal)}
                  </span>
                </div>

                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100/80 text-slate-600 sticky top-0">
                      <tr>
                        <th className="p-2.5 text-left w-8">
                          <input
                            type="checkbox"
                            checked={analysis.rows.every((r) => r.included)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setAnalysis({
                                ...analysis,
                                rows: analysis.rows.map((r) => ({ ...r, included: checked }))
                              });
                            }}
                          />
                        </th>
                        <th className="p-2.5 text-left">#</th>
                        <th className="p-2.5 text-left">Produto</th>
                        <th className="p-2.5 text-left w-24">NCM</th>
                        <th className="p-2.5 text-left w-20">CFOP</th>
                        <th className="p-2.5 text-right w-24">Qtd</th>
                        <th className="p-2.5 text-left w-16">Un</th>
                        <th className="p-2.5 text-right w-28">V. Unit</th>
                        <th className="p-2.5 text-right w-28">Subtotal</th>
                        {analysis.intent === 'remessa_interna' && (
                          <th className="p-2.5 text-left w-36">Categoria Almox.</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analysis.rows.map((row) => (
                        <tr
                          key={row.id}
                          className={row.included ? 'bg-white' : 'bg-slate-50/60 opacity-55'}
                        >
                          <td className="p-2.5">
                            <input
                              type="checkbox"
                              checked={row.included}
                              onChange={(e) => updateRow(row.id, { included: e.target.checked })}
                            />
                          </td>
                          <td className="p-2.5 font-mono text-slate-500">{row.nItem}</td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={row.productName}
                              onChange={(e) => updateRow(row.id, { productName: e.target.value })}
                              className="w-full rounded border border-slate-200 px-2 py-1 font-medium text-slate-800"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={row.ncm}
                              onChange={(e) => updateRow(row.id, { ncm: e.target.value })}
                              className="w-20 rounded border border-slate-200 px-2 py-1 font-mono"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={row.cfop}
                              onChange={(e) => updateRow(row.id, { cfop: e.target.value })}
                              className="w-16 rounded border border-slate-200 px-2 py-1 font-mono font-semibold text-[#0F5948]"
                            />
                          </td>
                          <td className="p-2.5 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={row.quantity}
                              onChange={(e) =>
                                updateRow(row.id, { quantity: Number(e.target.value) })
                              }
                              className="w-20 rounded border border-slate-200 px-2 py-1 text-right font-semibold"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={row.unit}
                              onChange={(e) =>
                                updateRow(row.id, { unit: e.target.value.toUpperCase() })
                              }
                              className="w-14 rounded border border-slate-200 px-2 py-1 uppercase"
                            />
                          </td>
                          <td className="p-2.5 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.unitPrice}
                              onChange={(e) =>
                                updateRow(row.id, { unitPrice: Number(e.target.value) })
                              }
                              className="w-24 rounded border border-slate-200 px-2 py-1 text-right"
                            />
                          </td>
                          <td className="p-2.5 text-right font-semibold text-slate-800">
                            {formatBRL(row.total)}
                          </td>
                          {analysis.intent === 'remessa_interna' && (
                            <td className="p-2.5">
                              <select
                                value={row.category}
                                onChange={(e) =>
                                  updateRow(row.id, {
                                    category: e.target.value as StoreItemCategory
                                  })
                                }
                                className="w-full rounded border border-slate-200 px-2 py-1"
                              >
                                {STORE_CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Rodapé */}
        <footer className="px-5 sm:px-6 py-4 border-t border-[#D5E3DC] bg-[#F7F8F3] flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-600">
            {analysis ? (
              <span>
                <strong>{selectedRows.length}</strong> item(ns) selecionado(s) · Total:{' '}
                <strong className="text-[#0F5948]">{formatBRL(selectedTotal)}</strong>
              </span>
            ) : (
              <span>Envie o XML ou PDF da nota fiscal para iniciar a análise.</span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!analysis || selectedRows.length === 0}
              onClick={handleConfirm}
              className="px-5 py-2.5 rounded-xl bg-[#0F5948] hover:bg-[#0c4639] text-white text-xs font-semibold disabled:opacity-40 flex items-center gap-2 shadow-sm"
            >
              {analysis?.intent === 'devolucao_nfe' ? (
                <>
                  <RotateCcw size={15} />
                  <span>Continuar p/ Emitir NF-e de Devolução</span>
                </>
              ) : analysis?.intent === 'transferencia_nfe' ? (
                <>
                  <ArrowRightLeft size={15} />
                  <span>Continuar p/ Emitir NF-e de Transferência</span>
                </>
              ) : (
                <>
                  <Truck size={15} />
                  <span>Gerar Remessa de Transferência</span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
