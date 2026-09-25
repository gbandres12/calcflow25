import React, { useState, useRef, useEffect, useMemo } from 'react';
import { SaleOrder, SaleOrderItem, SaleOrderLinkedNfe, Customer, FiscalConfig, Company, FreteInfo, FRETE_MODALIDADES, Transportador } from '../types';
import { fiscalService, freteValorCompoeTotalNota, mergeNfeConsulta, resolveFreteModalidade } from '../services/fiscalService';
import { db } from '../services/dataService';
import { newId } from '../services/ids';
import {
  avulsaExternalRef,
  buildLinkedNfe,
  remainingQuantityByProduct,
  saleItemKey,
  upsertLinkedNfe,
} from '../services/saleNfe';
import { FreteNfeSection } from './FreteNfeSection';
import { 
  X, Send, ShieldCheck, AlertCircle, CheckCircle2, 
  Building, User, FileText, Hash, MapPin, Truck, Sparkles, Settings,
  Edit3, Save, Search, RefreshCw, Key, Check, Database, Eye, ArrowLeft
} from 'lucide-react';
import { CompanyFiscalSettingsModal } from './CompanyFiscalSettingsModal';
import { DatabaseStatusModal } from './DatabaseStatusModal';
import { NfeDraftPdfPreview } from './NfeDraftPdfPreview';
import { FlowSheet, FlowSection } from './ui/FlowSheet';
import { fetchAddressByCep, formatCep, fetchIbgeByCityUf } from '../services/cepService';
import { normalizeCustomer } from '../utils/customerUtils';

interface EmitirNfeModalProps {
  order: SaleOrder;
  customer: Customer;
  config: FiscalConfig;
  company: Company;
  onClose: () => void;
  onSuccess: (updatedOrder: SaleOrder) => void;
  onDraftSaved?: (updatedOrder: SaleOrder) => void;
  draftNfe?: SaleOrderLinkedNfe;
  initialStep?: 'edit' | 'preview';
  transportadores?: Transportador[];
  onAddTransportador?: (data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => Transportador | void;
  devolutionChave?: string;
  transferencia?: boolean;
  modo?: 'pedido' | 'avulsa';
}

export const EmitirNfeModal: React.FC<EmitirNfeModalProps> = ({
  order,
  customer,
  config,
  company,
  onClose,
  onSuccess,
  onDraftSaved,
  draftNfe,
  initialStep,
  transportadores = [],
  onAddTransportador,
  devolutionChave,
  transferencia,
  modo = 'pedido',
}) => {
  const safeCustomer = normalizeCustomer(customer, order.customerId);
  const orderItems = Array.isArray(order.items) ? order.items : [];

  const [currentConfig, setCurrentConfig] = useState<FiscalConfig>(config);
  const [activeCustomer, setActiveCustomer] = useState<Customer>(safeCustomer);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draftSavedMsg, setDraftSavedMsg] = useState<string | null>(null);
  const [step, setStep] = useState<'edit' | 'preview'>(
    initialStep || (draftNfe?.nfeStatus === 'rascunho' ? 'preview' : 'edit')
  );
  const [draftLinkedId, setDraftLinkedId] = useState<string | null>(draftNfe?.id || null);
  const [chaveDevolucao, setChaveDevolucao] = useState(devolutionChave || order.nfeChave || '');
  const [quickApiKey, setQuickApiKey] = useState(config.apiKey || '');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySavedSuccess, setKeySavedSuccess] = useState(false);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [cepFeedback, setCepFeedback] = useState<string | null>(null);
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);

  useEffect(() => {
    setActiveCustomer(normalizeCustomer(customer, order.customerId));
  }, [customer, order.customerId]);

  const isSubmittingRef = useRef(false);
  const isDevolucao = Boolean(devolutionChave);
  const isTransferencia = Boolean(transferencia) && !isDevolucao;
  const isAvulsa = modo === 'avulsa' && !isDevolucao && !isTransferencia;
  const isInterestadual = Boolean(safeCustomer.state && safeCustomer.state !== 'PA');
  const cfopSugerido = isDevolucao
    ? (isInterestadual ? '6202' : '5202')
    : isTransferencia
      ? (isInterestadual ? (config.cfopTransferenciaInterestadual || '6152') : (config.cfopTransferenciaEstadual || '5152'))
      : (isInterestadual ? (config.cfopPadraoInterestadual || '6101') : (config.cfopPadraoEstadual || '5101'));

  // Itens com CFOP e CST editáveis. Na avulsa, quantidade limitada ao saldo não faturado.
  const [items, setItems] = useState<(SaleOrderItem & { maxQuantity?: number })[]>(() => {
    const remaining = remainingQuantityByProduct(order);
    const useRemaining = !isDevolucao && !isTransferencia;
    const sourceItems = draftNfe?.items?.length ? draftNfe.items : orderItems;
    return sourceItems.map((it) => {
      const rem = remaining.get(saleItemKey(it));
      const qty = draftNfe?.items?.length
        ? (Number(it.quantity) || 0)
        : (useRemaining ? (rem ?? it.quantity) : it.quantity);
      const orig = orderItems.find((o) => saleItemKey(o) === saleItemKey(it));
      const origQty = Number(orig?.quantity) || Number(it.quantity) || 1;
      const ratio = origQty ? qty / origQty : 1;
      const discount = draftNfe?.items?.length
        ? (Number(it.discount) || 0)
        : (Number(orig?.discount ?? it.discount) || 0) * ratio;
      const unitPrice = Number(it.unitPrice) || 0;
      return {
        ...it,
        quantity: qty,
        discount,
        total: Math.max(0, qty * unitPrice - discount),
        maxQuantity: rem ?? it.quantity,
        cfop: it.cfop || cfopSugerido,
        cst: it.cst || it.csosn || config.cstIcmsPadrao || '40'
      };
    }).filter((it) => isDevolucao || isTransferencia || (Number(it.quantity) || 0) > 0);
  });

  const [naturezaOperacao, setNaturezaOperacao] = useState(
    draftNfe?.nfeNaturezaOperacao || order.nfeNaturezaOperacao || (isDevolucao ? 'Devolucao de mercadoria' : isTransferencia ? 'Transferencia de estoque' : (config.naturezaOperacaoPadrao || 'Venda de producao do estabelecimento'))
  );

  // Frete / transporte (modFrete SEFAZ): sem frete (9) · CIF remetente (0) · FOB destinatário (1) · 2/3/4
  const [frete, setFrete] = useState<FreteInfo>(() => {
    if (draftNfe?.frete) return { ...draftNfe.frete };
    if (order.frete) return { ...order.frete };
    const base = { ...(order.frete || {}) };
    const shippingVal = Number(draftNfe?.shipping ?? order.shipping) || 0;
    return {
      ...base,
      modalidade: resolveFreteModalidade({ ...order, frete: base, shipping: shippingVal }),
      valor: shippingVal > 0 && freteValorCompoeTotalNota(resolveFreteModalidade(order), shippingVal)
        ? shippingVal
        : Math.max(0, Number(base.valor) || 0),
    };
  });

  const freteValorEfetivo = useMemo(() => {
    const mod = Number(frete.modalidade ?? 9);
    if (isDevolucao || isTransferencia || mod === 9) return 0;
    if (!freteValorCompoeTotalNota(mod, frete.valor)) return 0;
    return Math.max(0, Number(frete.valor) || 0);
  }, [frete, isDevolucao, isTransferencia]);

  const totalQuantidade = useMemo(() => items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0), [items]);

  const itemsSubtotal = useMemo(() => items.reduce((acc, it) => acc + (Number(it.total) || 0), 0), [items]);
  const discountEfetivo = useMemo(() => {
    if (isDevolucao || isTransferencia) return Number(order.discount) || 0;
    const origSub = Number(order.subtotal) || 0;
    if (origSub <= 0) return Number(order.discount) || 0;
    return (Number(order.discount) || 0) * (itemsSubtotal / origSub);
  }, [isDevolucao, isTransferencia, order.discount, order.subtotal, itemsSubtotal]);

  const totalComFrete = useMemo(() => {
    return Math.max(0, itemsSubtotal - discountEfetivo + freteValorEfetivo);
  }, [itemsSubtotal, discountEfetivo, freteValorEfetivo]);

  // Informações Complementares pré-definidas do produto + padrão
  const productComplementares = orderItems
    .map(it => it.informacoesComplementares)
    .filter((txt): txt is string => Boolean(txt && txt.trim()));
  const initialInfCpl = draftNfe?.nfeInfCpl || order.nfeInfCpl || [
    config.observacoesFiscaisPadrao,
    ...Array.from(new Set(productComplementares))
  ].filter(Boolean).join(' | ');

  const [infCpl, setInfCpl] = useState(initialInfCpl);

  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const validation = fiscalService.validarDadosFiscais(
    { ...order, items, shipping: freteValorEfetivo, total: totalComFrete, discount: discountEfetivo, frete },
    activeCustomer
  );

  const handleUpdateItem = (index: number, field: string, value: any) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity') {
        const raw = parseFloat(value);
        const qty = Number.isFinite(raw) ? raw : 0;
        const max = item.maxQuantity ?? qty;
        updated.quantity = isAvulsa ? Math.min(Math.max(0, qty), max) : qty;
        const orig = order.items.find(o => saleItemKey(o) === saleItemKey(item));
        const origQty = Number(orig?.quantity) || item.maxQuantity || updated.quantity || 1;
        const ratio = origQty ? updated.quantity / origQty : 1;
        updated.discount = (Number(orig?.discount) || 0) * ratio;
        updated.total = Math.max(0, updated.quantity * (Number(updated.unitPrice) || 0) - updated.discount);
      }
      return updated;
    }));
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  };

  // Safety unlock in case of unforeseen lockups
  useEffect(() => {
    const timer = setTimeout(() => {
      isSubmittingRef.current = false;
    }, 12000);
    return () => clearTimeout(timer);
  }, [loading]);

  const handleCepLookup = async (cepValue: string) => {
    const cleanCep = (cepValue || '').replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setCepFeedback('CEP deve conter 8 dígitos.');
      return;
    }

    setIsLoadingCep(true);
    setCepFeedback('Consultando ViaCEP...');

    try {
      const data = await fetchAddressByCep(cleanCep);
      if (data && !data.erro) {
        let ibge = data.ibge || '';
        if (!ibge && data.localidade && data.uf) {
          ibge = (await fetchIbgeByCityUf(data.localidade, data.uf)) || '';
        }

        setActiveCustomer(prev => ({
          ...prev,
          zipCode: formatCep(cleanCep),
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
          ibgeCode: ibge || prev.ibgeCode
        }));

        setCepFeedback(`Localizado: ${data.localidade}/${data.uf} (IBGE: ${ibge || '1506807'})`);
      } else {
        setCepFeedback('CEP não encontrado na base dos Correios.');
      }
    } catch {
      setCepFeedback('Erro ao consultar CEP. Preencha manualmente.');
    } finally {
      setIsLoadingCep(false);
    }
  };

  const handleSaveCustomerFiscalData = async () => {
    try {
      const compId = order.companyId || company.id;
      await db.upsert('customers', compId, activeCustomer);
      setIsEditingCustomer(false);
      setCepFeedback(null);
    } catch (err: any) {
      console.warn('Erro ao salvar cliente no Supabase:', err);
      setIsEditingCustomer(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!quickApiKey.trim()) return;
    setIsSavingKey(true);
    try {
      const updated = await fiscalService.saveConfig({
        ...currentConfig,
        apiKey: quickApiKey.trim(),
        modoEmissao: 'api_real'
      }, order.companyId || company.id);
      setCurrentConfig(updated);
      setKeySavedSuccess(true);
      setTimeout(() => setKeySavedSuccess(false), 2500);
    } catch (err: any) {
      setErrorMsg(`Erro ao salvar chave: ${err.message}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  const resolveTipo = (): 'pedido' | 'avulsa' | 'devolucao' | 'transferencia' =>
    isDevolucao ? 'devolucao' : isTransferencia ? 'transferencia' : isAvulsa ? 'avulsa' : 'pedido';

  const buildOrderWithEdits = (emitItems: SaleOrderItem[], referenciaExterna: string): SaleOrder => ({
    ...order,
    items: emitItems,
    discount: discountEfetivo,
    shipping: freteValorEfetivo,
    total: totalComFrete,
    subtotal: itemsSubtotal,
    frete: {
      ...frete,
      modalidade: (isDevolucao || isTransferencia)
        ? 9
        : (resolveFreteModalidade({ ...order, frete, shipping: freteValorEfetivo }) as FreteInfo['modalidade']),
      valor: freteValorEfetivo,
    },
    nfeNaturezaOperacao: naturezaOperacao,
    nfeInfCpl: infCpl,
    nfeReferenciaExterna: referenciaExterna,
  });

  const persistDraft = (): SaleOrder | null => {
    const emitItems = items.filter((it) => (Number(it.quantity) || 0) > 0);
    if (emitItems.length === 0) {
      setErrorMsg('Informe a quantidade de pelo menos um item para salvar o rascunho.');
      return null;
    }

    const tipo = resolveTipo();
    const linkedId = draftLinkedId || newId(isAvulsa ? 'nfa' : isDevolucao ? 'nfd' : isTransferencia ? 'nft' : 'nfp');
    const referenciaExterna = isAvulsa
      ? avulsaExternalRef(order.reference, linkedId)
      : (order.nfeReferenciaExterna || order.reference);
    const orderWithEdits = buildOrderWithEdits(emitItems, referenciaExterna);
    let payloadSent: any = undefined;
    try {
      const opts = isDevolucao
        ? { devolucao: { chaveAcesso: chaveDevolucao, nItem: 1 } }
        : isTransferencia
          ? { transferencia: true }
          : undefined;
      payloadSent = fiscalService.montarPayloadNotaAs(orderWithEdits, activeCustomer, currentConfig, opts);
    } catch {
      payloadSent = undefined;
    }

    const linked = buildLinkedNfe({
      id: linkedId,
      tipo,
      reference: referenciaExterna,
      order: orderWithEdits,
      items: emitItems,
      subtotal: itemsSubtotal,
      discount: discountEfetivo,
      shipping: freteValorEfetivo,
      total: totalComFrete,
      nfeStatus: 'rascunho',
      nfeNaturezaOperacao: naturezaOperacao,
      nfeInfCpl: infCpl,
      nfePayload: payloadSent,
      nfeErro: undefined,
    });

    const sourceKeepItems: SaleOrder = {
      ...order,
      nfePayload: isAvulsa ? order.nfePayload : payloadSent,
    };
    const updatedOrder = upsertLinkedNfe(
      isAvulsa
        ? sourceKeepItems
        : {
            ...sourceKeepItems,
            items: order.items,
            subtotal: order.subtotal,
            discount: order.discount,
            shipping: order.shipping,
            total: order.total,
            frete: orderWithEdits.frete,
          },
      linked
    );

    setDraftLinkedId(linkedId);
    return updatedOrder;
  };

  const persistDraftToDb = async (updated: SaleOrder) => {
    const persistCompanyId = order.companyId || company.id;
    await db.upsert('sales_orders', persistCompanyId, { ...updated, companyId: persistCompanyId });
  };

  const handleSalvarRascunho = async () => {
    if (savingDraft || loading) return;
    setSavingDraft(true);
    setErrorMsg(null);
    setDraftSavedMsg(null);
    try {
      const updated = persistDraft();
      if (!updated) return;
      await persistDraftToDb(updated);
      if (onDraftSaved) onDraftSaved(updated);
      else onSuccess(updated);
      setDraftSavedMsg('Rascunho salvo. Você pode revisar a prévia e emitir depois sem preencher de novo.');
      setTimeout(() => setDraftSavedMsg(null), 4000);
    } catch (e: any) {
      setErrorMsg(e.message || 'Não foi possível salvar o rascunho.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleIrParaPrevia = async () => {
    const emitItems = items.filter((it) => (Number(it.quantity) || 0) > 0);
    if (emitItems.length === 0) {
      setErrorMsg('Informe a quantidade de pelo menos um item para revisar a prévia.');
      return;
    }
    setErrorMsg(null);
    const updated = persistDraft();
    if (updated) {
      try {
        await persistDraftToDb(updated);
      } catch (e: any) {
        setErrorMsg(e.message || 'Rascunho ficou na tela, mas o banco não confirmou o salvamento.');
      }
      if (onDraftSaved) onDraftSaved(updated);
    }
    setStep('preview');
  };

  const handleEmitir = async () => {
    if (isSubmittingRef.current || loading) {
      console.warn('⚠️ [EMISSÃO] Ação em processamento...');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setErrorMsg(null);

    try {
      const emitItems = items.filter((it) => (Number(it.quantity) || 0) > 0);
      if (emitItems.length === 0) {
        setErrorMsg('Informe a quantidade de pelo menos um item para emitir a nota.');
        isSubmittingRef.current = false;
        setLoading(false);
        return;
      }

      const linkedId = draftLinkedId || newId(isAvulsa ? 'nfa' : isDevolucao ? 'nfd' : isTransferencia ? 'nft' : 'nfp');
      const referenciaExterna = isAvulsa
        ? avulsaExternalRef(order.reference, linkedId)
        : (order.nfeReferenciaExterna || order.reference);

      const orderWithEdits = buildOrderWithEdits(emitItems, referenciaExterna);

      const opts = isDevolucao
        ? { devolucao: { chaveAcesso: chaveDevolucao, nItem: 1 } }
        : isTransferencia
          ? { transferencia: true }
          : undefined;

      const payloadSent = fiscalService.montarPayloadNotaAs(orderWithEdits, activeCustomer, currentConfig, opts);
      const result = await fiscalService.emitirNFe(
        { ...orderWithEdits, companyId: order.companyId || company.id },
        activeCustomer,
        currentConfig,
        order.companyId || company.id,
        opts
      );

      if (result.success || result.nfeId) {
        const tipo = resolveTipo();
        let resultFields = {
          nfeStatus: result.nfeStatus,
          nfeId: result.nfeId,
          nfeChave: result.nfeChave,
          nfeNumero: result.nfeNumero,
          nfeSerie: result.nfeSerie,
          nfeProtocolo: result.nfeProtocolo,
          nfeDanfeUrl: result.nfeDanfeUrl,
          nfeXmlUrl: result.nfeXmlUrl,
          nfeEmissao: result.nfeEmissao,
          nfeErro: result.nfeErro,
          nfeNaturezaOperacao: result.naturezaOperacao,
        };

        if (result.nfeId) {
          const pollResult = await fiscalService.consultarEAtualizarStatusProcessamento(result.nfeId, currentConfig, 8, 2500);
          if (pollResult.status && pollResult.status !== 'nao_emitida') {
            const polled = mergeNfeConsulta({ ...orderWithEdits, ...resultFields }, pollResult);
            resultFields = {
              nfeStatus: polled.nfeStatus || resultFields.nfeStatus,
              nfeId: polled.nfeId,
              nfeChave: polled.nfeChave,
              nfeNumero: polled.nfeNumero,
              nfeSerie: polled.nfeSerie,
              nfeProtocolo: polled.nfeProtocolo,
              nfeDanfeUrl: polled.nfeDanfeUrl,
              nfeXmlUrl: polled.nfeXmlUrl,
              nfeEmissao: polled.nfeEmissao,
              nfeErro: polled.nfeErro,
              nfeNaturezaOperacao: polled.nfeNaturezaOperacao || resultFields.nfeNaturezaOperacao,
            };
          }
        }

        const linked = buildLinkedNfe({
          id: linkedId,
          tipo,
          reference: referenciaExterna,
          order: orderWithEdits,
          items: emitItems,
          subtotal: itemsSubtotal,
          discount: discountEfetivo,
          shipping: freteValorEfetivo,
          total: totalComFrete,
          ...resultFields,
          nfeInfCpl: infCpl,
          nfePayload: payloadSent,
          nfeRawResponse: result.rawResponse,
        });

        const sourceKeepItems: SaleOrder = {
          ...order,
          nfePayload: isAvulsa ? order.nfePayload : payloadSent,
          nfeRawResponse: isAvulsa ? order.nfeRawResponse : result.rawResponse,
        };
        const updatedOrder = upsertLinkedNfe(
          isAvulsa ? sourceKeepItems : { ...sourceKeepItems, items: order.items, subtotal: order.subtotal, discount: order.discount, shipping: order.shipping, total: order.total, frete: orderWithEdits.frete },
          linked
        );

        const persistCompanyId = order.companyId || company.id;
        try {
          await db.upsert('sales_orders', persistCompanyId, { ...updatedOrder, companyId: persistCompanyId });
        } catch (persistErr: any) {
          setErrorMsg(
            persistErr?.message
              ? `NF-e transmitida, mas o banco não confirmou o pedido: ${persistErr.message}. Não feche nem limpe o navegador — toque em Reenviar agora.`
              : 'NF-e transmitida, mas o banco não confirmou o pedido. Não feche nem limpe o navegador.'
          );
          return;
        }

        onSuccess(updatedOrder);
      } else {
        setErrorMsg(result.nfeErro || 'Rejeição na emissão da NF-e pela SEFAZ.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro de comunicação com o serviço fiscal.');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const hasApiKey = Boolean((currentConfig.apiKey || '').trim());
  const isPreview = step === 'preview';
  const previewOrder: SaleOrder = useMemo(() => ({
    ...buildOrderWithEdits(
      items.filter((it) => (Number(it.quantity) || 0) > 0),
      order.nfeReferenciaExterna || order.reference
    ),
    nfeStatus: 'rascunho',
    nfeNumero: String(currentConfig.proxNumeroNFe || order.nfeNumero || ''),
    nfeSerie: String(currentConfig.serieNFe || order.nfeSerie || '1'),
  }), [
    items,
    discountEfetivo,
    freteValorEfetivo,
    totalComFrete,
    itemsSubtotal,
    frete,
    naturezaOperacao,
    infCpl,
    order,
    isDevolucao,
    isTransferencia,
    currentConfig.proxNumeroNFe,
    currentConfig.serieNFe,
  ]);
  const nfeTitle = isPreview
    ? 'Prévia do rascunho da NF-e'
    : isDevolucao
      ? 'Devolução NF-e'
      : isTransferencia
        ? 'Transferência NF-e'
        : isAvulsa
          ? 'NF-e avulsa'
          : 'Emitir NF-e';

  return (
    <FlowSheet
      wide
      zIndexClass="z-[150]"
      title={nfeTitle}
      subtitle={
        <>
          {order.reference} · Nº {currentConfig.proxNumeroNFe || 1042} / série {currentConfig.serieNFe || 1}
          {' · '}
          {currentConfig.environment === 'production' ? 'Produção' : 'Homologação'}
          {isPreview ? ' · revise os dados antes de transmitir' : ''}
        </>
      }
      onClose={onClose}
      footer={(
        <div className="flex items-center gap-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total</p>
            <p className="text-base font-black text-slate-900 leading-none">{formatBRL(totalComFrete)}</p>
          </div>
          {isPreview ? (
            <>
              <button
                type="button"
                onClick={() => setStep('edit')}
                disabled={loading}
                className="min-h-12 px-4 py-3 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl disabled:opacity-50 flex items-center gap-2"
              >
                <ArrowLeft size={16} /> Editar
              </button>
              <button
                disabled={loading || !validation.valid || items.length === 0 || totalQuantidade <= 0}
                onClick={handleEmitir}
                className="min-h-12 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Send size={16} /> Confirmar e emitir
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSalvarRascunho}
                disabled={loading || savingDraft || items.length === 0 || totalQuantidade <= 0}
                className="min-h-12 px-4 py-3 bg-white border border-amber-300 text-amber-900 font-bold text-sm rounded-2xl disabled:opacity-50 flex items-center gap-2"
              >
                {savingDraft ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Save size={16} /> Salvar rascunho
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleIrParaPrevia}
                disabled={loading || savingDraft || items.length === 0 || totalQuantidade <= 0}
                className="min-h-12 px-4 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-2xl disabled:opacity-50 flex items-center gap-2"
              >
                <Eye size={16} /> Revisar prévia
              </button>
              <button
                disabled={loading || !validation.valid || items.length === 0 || totalQuantidade <= 0}
                onClick={handleEmitir}
                className="min-h-12 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Send size={16} /> Transmitir
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    >
          {(draftLinkedId || draftNfe) && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                Rascunho
              </span>
            </div>
          )}
          {draftSavedMsg && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-bold flex items-center gap-2 mb-3">
              <Save size={14} className="text-amber-600 shrink-0" /> {draftSavedMsg}
            </div>
          )}
          {isPreview && (
            <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-950 mb-3">
              <p className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <Eye size={14} /> Prévia em PDF do rascunho — revise antes de transmitir
              </p>
              <p className="text-xs font-medium mt-1">
                {items.length} item(ns) · Total {formatBRL(totalComFrete)} · {naturezaOperacao}
              </p>
              <p className="text-xs text-emerald-800 mt-1">
                Este PDF é uma prévia interna (RASCUNHO / SEM VALOR FISCAL). O DANFE oficial só existe depois da autorização da SEFAZ.
              </p>
            </div>
          )}
          {!hasApiKey && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-xs text-amber-900 mb-3">
              <p className="font-bold">Project Key da NotaAs obrigatória</p>
              <div className="flex flex-col gap-2">
                <input
                  type="password"
                  placeholder="Cole a chave ntaas_..."
                  value={quickApiKey}
                  onChange={(e) => setQuickApiKey(e.target.value)}
                  className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  disabled={isSavingKey || !quickApiKey.trim()}
                  className="min-h-11 px-3 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {isSavingKey ? <RefreshCw size={13} className="animate-spin" /> : keySavedSuccess ? <Check size={13} /> : <Save size={13} />}
                  <span>{keySavedSuccess ? 'Salvo' : 'Salvar chave'}</span>
                </button>
              </div>
            </div>
          )}

          <div className={`mb-3 p-3 rounded-2xl border flex items-start gap-2.5 ${
            validation.valid ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-rose-50/80 border-rose-200 text-rose-950'
          }`}>
            {validation.valid ? (
              <CheckCircle2 className="text-emerald-600 mt-0.5 shrink-0" size={16} />
            ) : (
              <AlertCircle className="text-rose-600 mt-0.5 shrink-0" size={16} />
            )}
            <div className="text-xs space-y-1 flex-1 min-w-0">
              <p className="font-bold">
                {validation.valid ? 'Pronto para transmitir' : 'Falta dado fiscal'}
              </p>
              {!validation.valid && (
                <ul className="list-disc pl-4 space-y-0.5 text-rose-700 font-medium">
                  {validation.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              )}
              {validation.warnings && validation.warnings.length > 0 && (
                <ul className="list-disc pl-4 text-xs text-amber-800">
                  {validation.warnings.map((w, idx) => (
                    <li key={`w-${idx}`}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {isPreview && (
            <div className="mb-3">
              <NfeDraftPdfPreview
                order={previewOrder}
                customer={activeCustomer}
                config={currentConfig}
                company={company}
              />
            </div>
          )}

          {!isPreview && (
          <div className="space-y-2.5">
            <FlowSection
              title="Emitente"
              summary={currentConfig.razaoSocial || company.name}
              defaultOpen={false}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-800">{currentConfig.razaoSocial || company.name}</p>
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-[11px] font-bold uppercase"
                >
                  <Settings size={11} /> Configurar
                </button>
              </div>
              <p className="text-xs text-slate-600">CNPJ: <b>{currentConfig.cnpjEmitente || company.cnpj}</b> · IE: <b>{currentConfig.inscricaoEstadual || company.stateRegistration || '—'}</b></p>
              <p className="text-xs text-slate-500">
                {currentConfig.logradouroEmitente
                  ? `${currentConfig.logradouroEmitente}, ${currentConfig.numeroEmitente || 'S/N'} — ${currentConfig.cidadeEmitente || 'Santarém'}/${currentConfig.ufEmitente || 'PA'}`
                  : 'Santarém/PA'}
              </p>
            </FlowSection>

            <FlowSection
              title="Destinatário"
              summary={activeCustomer.name}
              defaultOpen={!validation.valid}
              badge={
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsEditingCustomer((v) => !v);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold uppercase"
                >
                  <Edit3 size={11} /> {isEditingCustomer ? 'Fechar' : 'Editar'}
                </button>
              }
            >
              {!isEditingCustomer ? (
                <>
                  <p className="text-xs font-bold text-slate-800">{activeCustomer.name}</p>
                  <p className="text-xs text-slate-600">Doc: <b>{activeCustomer.document || '—'}</b> · IE: <b>{activeCustomer.isentoIE ? 'Isento' : (activeCustomer.ie || '—')}</b></p>
                  <p className="text-xs text-slate-500">
                    {activeCustomer.street || 'Zona Rural'}, {activeCustomer.number || 'SN'} — {activeCustomer.city || 'Santarém'}/{activeCustomer.state || 'PA'}
                  </p>
                </>
              ) : (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-black uppercase text-slate-500">CPF / CNPJ</label>
                      <input
                        type="text"
                        value={activeCustomer.document}
                        onChange={(e) => setActiveCustomer(prev => ({ ...prev, document: e.target.value }))}
                        className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-black uppercase text-slate-500">IE</label>
                      <input
                        type="text"
                        disabled={activeCustomer.isentoIE}
                        value={activeCustomer.isentoIE ? 'ISENTO' : (activeCustomer.ie || '')}
                        onChange={(e) => setActiveCustomer(prev => ({ ...prev, ie: e.target.value }))}
                        className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-500">CEP</label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={activeCustomer.zipCode || ''}
                        onChange={(e) => setActiveCustomer(prev => ({ ...prev, zipCode: e.target.value }))}
                        onBlur={(e) => {
                          if (e.target.value.replace(/\D/g, '').length === 8) handleCepLookup(e.target.value);
                        }}
                        className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono font-bold"
                      />
                      <button type="button" onClick={() => handleCepLookup(activeCustomer.zipCode || '')} disabled={isLoadingCep} className="p-2 bg-slate-200 rounded-lg min-w-11">
                        <Search size={14} className={isLoadingCep ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-500">Endereço</label>
                    <input
                      type="text"
                      value={activeCustomer.street || ''}
                      onChange={(e) => setActiveCustomer(prev => ({ ...prev, street: e.target.value }))}
                      className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] font-black uppercase text-slate-500">Nº</label>
                      <input type="text" value={activeCustomer.number || ''} onChange={(e) => setActiveCustomer(prev => ({ ...prev, number: e.target.value }))} className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold" />
                    </div>
                    <div>
                      <label className="text-[11px] font-black uppercase text-slate-500">Bairro</label>
                      <input type="text" value={activeCustomer.neighborhood || ''} onChange={(e) => setActiveCustomer(prev => ({ ...prev, neighborhood: e.target.value }))} className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold" />
                    </div>
                    <div>
                      <label className="text-[11px] font-black uppercase text-slate-500">UF</label>
                      <input type="text" maxLength={2} value={activeCustomer.state || ''} onChange={(e) => setActiveCustomer(prev => ({ ...prev, state: e.target.value.toUpperCase() }))} className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-center" />
                    </div>
                  </div>
                  {cepFeedback && <p className="text-xs text-emerald-700 font-bold">{cepFeedback}</p>}
                  <button type="button" onClick={handleSaveCustomerFiscalData} className="w-full min-h-11 px-3 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1">
                    <Save size={12} /> Salvar destinatário
                  </button>
                </div>
              )}
            </FlowSection>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Natureza da operação</label>
              <input
                type="text"
                value={naturezaOperacao}
                onChange={e => setNaturezaOperacao(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-emerald-600"
              />
            </div>

            {isAvulsa && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                Parcial desta venda — o saldo não faturado continua no pedido.
              </p>
            )}
            {isTransferencia && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                Transferência · CFOP {(activeCustomer.state && activeCustomer.state !== 'PA') ? (config.cfopTransferenciaInterestadual || '6152') : (config.cfopTransferenciaEstadual || '5152')} · sem cobrança.
              </p>
            )}
            {isDevolucao && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase text-slate-500">Chave da NF-e original</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={chaveDevolucao}
                  onChange={(e) => setChaveDevolucao(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold"
                />
              </div>
            )}

            {!isDevolucao && !isTransferencia ? (
              <FlowSection
                title="Frete"
                summary={FRETE_MODALIDADES.find(m => m.value === Number(frete.modalidade ?? 9))?.label || 'Sem frete'}
                defaultOpen={Number(frete.modalidade ?? 9) !== 9}
              >
                <FreteNfeSection
                  compact
                  value={frete}
                  onChange={setFrete}
                  totalQuantidade={totalQuantidade}
                  transportadores={transportadores}
                  onAddTransportador={onAddTransportador}
                />
              </FlowSection>
            ) : (
              <p className="text-xs text-slate-500 px-1">Sem frete (modFrete 9).</p>
            )}

            <FlowSection
              title={`Itens (${items.length})`}
              summary={items.map(it => `${it.productName} ${it.quantity}${it.unit ? ' ' + it.unit : ''}`).join(' · ')}
              defaultOpen
            >
              <div className="space-y-2 sm:hidden">
                {items.map((it, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 p-3 space-y-2">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 leading-tight">{it.productName}</p>
                        <p className="text-xs text-slate-500">{it.productCode}</p>
                      </div>
                      <p className="text-sm font-black text-slate-900 shrink-0">{formatBRL(it.total)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-bold text-slate-500">NCM</label>
                        <input type="text" inputMode="numeric" value={it.ncm || '25171000'} onChange={e => handleUpdateItem(idx, 'ncm', e.target.value)} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500">Qtd {it.unit || ''}</label>
                        {isAvulsa ? (
                          <input type="number" inputMode="decimal" min={0} max={it.maxQuantity} step="0.01" value={it.quantity} onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" />
                        ) : (
                          <p className="px-2 py-2 text-sm font-bold">{it.quantity}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-bold text-purple-700">CFOP</label>
                        <input type="text" inputMode="numeric" value={it.cfop || ''} onChange={e => handleUpdateItem(idx, 'cfop', e.target.value)} className="w-full px-2 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm font-mono font-black" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-blue-700">CST</label>
                        <input type="text" value={it.cst || ''} onChange={e => handleUpdateItem(idx, 'cst', e.target.value)} className="w-full px-2 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-mono font-bold" />
                      </div>
                    </div>
                    {isAvulsa && items.length > 1 && (
                      <button type="button" onClick={() => handleRemoveItem(idx)} className="text-xs text-rose-600 font-bold">Remover item</button>
                    )}
                  </div>
                ))}
              </div>

              <div className="hidden sm:block border border-slate-200 rounded-2xl overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px]">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">NCM</th>
                      <th className="px-3 py-2">CFOP</th>
                      <th className="px-3 py-2">CST</th>
                      <th className="px-3 py-2 text-center">Qtd</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <p className="font-bold text-slate-800">{it.productName}</p>
                          <p className="text-xs text-slate-500">{it.productCode}</p>
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={it.ncm || '25171000'} onChange={e => handleUpdateItem(idx, 'ncm', e.target.value)} className="w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={it.cfop || ''} onChange={e => handleUpdateItem(idx, 'cfop', e.target.value)} className="w-20 px-2 py-1 bg-purple-50 border border-purple-200 rounded-lg text-xs font-mono font-black" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={it.cst || ''} onChange={e => handleUpdateItem(idx, 'cst', e.target.value)} className="w-16 px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs font-mono font-bold" />
                        </td>
                        <td className="px-3 py-2 text-center font-bold">
                          {isAvulsa ? (
                            <input type="number" min={0} max={it.maxQuantity} step="0.01" value={it.quantity} onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)} className="w-20 px-2 py-1 bg-purple-50 border border-purple-200 rounded-lg text-xs font-black text-center" />
                          ) : (
                            <>{it.quantity} {it.unit}</>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-black">{formatBRL(it.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FlowSection>

            <FlowSection title="Informações complementares" summary={infCpl ? infCpl.slice(0, 72) : 'Vazio'} defaultOpen={false}>
              <textarea
                rows={3}
                value={infCpl}
                onChange={e => setInfCpl(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none resize-none"
              />
            </FlowSection>
          </div>
          )}

          {errorMsg && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 space-y-2">
              <p className="font-bold text-rose-900">A SEFAZ não autorizou</p>
              <p className="font-mono bg-white/80 p-2 rounded-lg border border-rose-200 text-xs break-words">{errorMsg}</p>
              <button type="button" onClick={() => setShowDatabaseModal(true)} className="px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5">
                <Database size={13} /> Status do banco
              </button>
            </div>
          )}

      <CompanyFiscalSettingsModal
        isOpen={showCompanyModal}
        onClose={() => setShowCompanyModal(false)}
        config={currentConfig}
        companyId={order.companyId || company.id}
        onSaveSuccess={(updated) => {
          setCurrentConfig(updated);
        }}
      />

      <DatabaseStatusModal
        isOpen={showDatabaseModal}
        onClose={() => setShowDatabaseModal(false)}
      />
    </FlowSheet>
  );
};
