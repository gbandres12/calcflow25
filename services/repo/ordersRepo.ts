import type { SaleOrder, SaleOrderItem, SaleOrderLinkedNfe, OrderWithdrawal, PaymentReceipt } from '../../types';

export function assembleOrder(
  header: any,
  items: any[] = [],
  installments: any[] = [],
  receipts: any[] = [],
  withdrawals: any[] = [],
  nfes: any[] = []
): SaleOrder {
  const extra = header.extra || {};

  const mappedItems: SaleOrderItem[] = items.map((it) => ({
    productId: it.product_id || it.extra?.productId || '',
    productCode: it.product_code || it.extra?.productCode || '',
    productName: it.product_name,
    unit: it.unit || 'Ton',
    quantity: Number(it.quantity || 0),
    unitPrice: Number(it.unit_price || 0),
    discount: Number(it.discount || 0),
    total: Number(it.total || 0),
    ncm: it.ncm || it.extra?.ncm,
    cst: it.cst || it.extra?.cst,
    cfop: it.cfop || it.extra?.cfop,
    ...(it.extra || {})
  }));

  const mappedInstallments = installments.map((inst) => ({
    id: inst.id,
    amount: Number(inst.amount || 0),
    dueDate: inst.due_date,
    status: inst.status,
    paidAmount: Number(inst.paid_amount || 0),
    paymentMethod: inst.payment_method,
    receiptId: inst.receipt_id,
    ...(inst.extra || {})
  }));

  const mappedReceipts: PaymentReceipt[] = receipts.map((rec) => ({
    id: rec.id,
    orderId: rec.order_id,
    orderReference: rec.order_reference,
    customerId: rec.customer_id,
    amount: Number(rec.amount || 0),
    date: rec.payment_date,
    paymentMethod: rec.payment_method,
    accountId: rec.account_id,
    receivedBy: rec.received_by,
    notes: rec.notes,
    createdAt: rec.created_at,
    ...(rec.extra || {})
  }));

  const mappedWithdrawals: OrderWithdrawal[] = withdrawals.map((w) => ({
    id: w.id,
    date: w.date,
    netWeight: Number(w.net_weight || 0),
    truckPlate: w.truck_plate,
    driverName: w.driver_name,
    carrierName: w.carrier_name,
    ticketNumber: w.ticket_number,
    notes: w.notes,
    createdAt: w.created_at,
    ...(w.extra || {})
  }));

  const mappedNfes: SaleOrderLinkedNfe[] = nfes.map((n) => ({
    id: n.id,
    tipo: n.extra?.tipo || 'pedido',
    reference: header.reference || '',
    items: n.extra?.items || mappedItems,
    subtotal: Number(n.extra?.subtotal || header.subtotal || 0),
    discount: Number(n.extra?.discount || header.discount || 0),
    shipping: Number(n.extra?.shipping || header.extra?.shipping || 0),
    total: Number(n.extra?.total || header.total || 0),
    nfeStatus: n.status,
    nfeId: n.id,
    nfeChave: n.chave,
    nfeNumero: n.numero,
    nfeSerie: n.serie,
    nfeProtocolo: n.protocolo,
    nfeDanfeUrl: n.danfe_url,
    nfeXmlUrl: n.xml_url,
    nfeEmissao: n.emissao,
    nfePayload: n.nfe_payload,
    nfeRawResponse: n.nfe_response,
    createdAt: n.created_at,
    ...(n.extra || {})
  }));

  return {
    ...extra,
    id: header.id,
    companyId: header.company_id,
    reference: header.reference || '',
    customerId: header.customer_id,
    customerName: header.customer_name || extra.customerName || (extra.nfePayload?.dest?.nome),
    customerDocument: header.customer_document || extra.customerDocument,
    date: header.date,
    updatedAt: header.updated_at || extra.updatedAt,
    status: header.status,
    subtotal: Number(header.subtotal || 0),
    discount: Number(header.discount || 0),
    total: Number(header.total || 0),
    sellerName: header.seller_name || extra.sellerName || '',
    withoutFinance: Boolean(header.without_finance),
    paymentMethod: header.payment_method,
    isAvulsa: Boolean(header.is_avulsa),
    shipping: Number(extra.shipping || 0),
    frete: header.frete || extra.frete,
    items: mappedItems,
    payments: mappedInstallments,
    receipts: mappedReceipts,
    withdrawals: mappedWithdrawals,
    nfes: mappedNfes.length > 0 ? mappedNfes : extra.nfes
  };
}

export async function fetchOrdersFromErp(companyId: string, supabase: any): Promise<SaleOrder[]> {
  const [
    { data: headers, error: hErr },
    { data: items, error: iErr },
    { data: installments, error: instErr },
    { data: receipts, error: rErr },
    { data: withdrawals, error: wErr },
    { data: nfes, error: nErr }
  ] = await Promise.all([
    supabase.schema('erp').from('sales_orders').select('*').eq('company_id', companyId).is('deleted_at', null),
    supabase.schema('erp').from('sales_order_items').select('*').eq('company_id', companyId),
    supabase.schema('erp').from('sales_order_installments').select('*').eq('company_id', companyId),
    supabase.schema('erp').from('sales_order_receipts').select('*').eq('company_id', companyId),
    supabase.schema('erp').from('sales_order_withdrawals').select('*').eq('company_id', companyId),
    supabase.schema('erp').from('sales_order_nfes').select('*').eq('company_id', companyId)
  ]);

  if (hErr) throw hErr;
  if (iErr) console.warn('[OrdersRepo] Falha ao ler itens:', iErr);
  if (instErr) console.warn('[OrdersRepo] Falha ao ler parcelas:', instErr);
  if (rErr) console.warn('[OrdersRepo] Falha ao ler recibos:', rErr);
  if (wErr) console.warn('[OrdersRepo] Falha ao ler retiradas:', wErr);
  if (nErr) console.warn('[OrdersRepo] Falha ao ler nfes:', nErr);

  const itemsByOrder = new Map<string, any[]>();
  (items || []).forEach((it: any) => {
    const list = itemsByOrder.get(it.order_id) || [];
    list.push(it);
    itemsByOrder.set(it.order_id, list);
  });

  const instByOrder = new Map<string, any[]>();
  (installments || []).forEach((inst: any) => {
    const list = instByOrder.get(inst.order_id) || [];
    list.push(inst);
    instByOrder.set(inst.order_id, list);
  });

  const receiptsByOrder = new Map<string, any[]>();
  (receipts || []).forEach((rec: any) => {
    const list = receiptsByOrder.get(rec.order_id) || [];
    list.push(rec);
    receiptsByOrder.set(rec.order_id, list);
  });

  const withdrawalsByOrder = new Map<string, any[]>();
  (withdrawals || []).forEach((w: any) => {
    const list = withdrawalsByOrder.get(w.order_id) || [];
    list.push(w);
    withdrawalsByOrder.set(w.order_id, list);
  });

  const nfesByOrder = new Map<string, any[]>();
  (nfes || []).forEach((n: any) => {
    const list = nfesByOrder.get(n.order_id) || [];
    list.push(n);
    nfesByOrder.set(n.order_id, list);
  });

  const mappedOrders = (headers || []).map((h: any) =>
    assembleOrder(
      h,
      itemsByOrder.get(h.id) || [],
      instByOrder.get(h.id) || [],
      receiptsByOrder.get(h.id) || [],
      withdrawalsByOrder.get(h.id) || [],
      nfesByOrder.get(h.id) || []
    )
  );

  // Garantia absoluta: nenhuma NF-e existente pode ser perdida da listagem fiscal, mesmo que seu pedido tenha sido cancelado/excluído
  const orderIdsWithHeaders = new Set((headers || []).map((h: any) => h.id));
  const orphanNfes = (nfes || []).filter((n: any) => !orderIdsWithHeaders.has(n.order_id));
  if (orphanNfes.length > 0) {
    const orphanNfesByOrder = new Map<string, any[]>();
    orphanNfes.forEach((n: any) => {
      const list = orphanNfesByOrder.get(n.order_id) || [];
      list.push(n);
      orphanNfesByOrder.set(n.order_id, list);
    });
    orphanNfesByOrder.forEach((orphanList, oId) => {
      const firstNfe = orphanList[0];
      const stubHeader = {
        id: oId,
        company_id: companyId,
        reference: firstNfe.numero ? `NFA-${firstNfe.numero}` : `NFA-${oId}`,
        customer_id: 'sem-cliente',
        date: firstNfe.emissao || firstNfe.created_at || new Date().toISOString(),
        status: 'Venda Confirmada',
        subtotal: 0,
        discount: 0,
        total: 0,
        seller_name: '',
        without_finance: true,
        payment_method: null,
        is_avulsa: true,
        extra: {}
      };
      mappedOrders.push(assembleOrder(stubHeader, [], [], [], [], orphanList));
    });
  }

  return mappedOrders;
}

export async function upsertOrderToErp(companyId: string, order: any, supabase: any): Promise<void> {
  const {
    id, reference, customerId, sellerName, date,
    subtotal, discount, total, withoutFinance,
    paymentMethod, isAvulsa, shipping, frete, status,
    items, payments, receipts, withdrawals, nfes,
    ...extra
  } = order;

  // 1. Garantir que customer exista para não violar FK
  if (customerId && customerId !== 'sem-cliente') {
    const { data: custExists } = await supabase
      .schema('erp')
      .from('customers')
      .select('id')
      .eq('company_id', companyId)
      .eq('id', customerId)
      .maybeSingle();

    if (!custExists) {
      // Tenta buscar os dados reais do cliente em app_records ou no próprio pedido
      const { data: appCustRecord } = await supabase
        .from('app_records')
        .select('data')
        .eq('company_id', companyId)
        .eq('table_name', 'customers')
        .eq('id', customerId)
        .maybeSingle();

      const realData = appCustRecord?.data || {};
      const custName =
        realData.name ||
        order.customerName ||
        order.nfePayload?.dest?.nome ||
        order.linkedNfe?.destinatario ||
        `Cliente ${customerId}`;

      await supabase
        .schema('erp')
        .from('customers')
        .insert({
          company_id: companyId,
          id: customerId,
          name: custName,
          document: realData.document || order.nfePayload?.dest?.cpf || order.nfePayload?.dest?.cnpj || '',
          tipo_pessoa: realData.tipoPessoa || 'PF',
          ie: realData.ie || order.nfePayload?.dest?.ie || null,
          isento_ie: Boolean(realData.isentoIE),
          phone: realData.phone || null,
          email: realData.email || null,
          street: realData.street || order.nfePayload?.dest?.enderDest?.xLgr || null,
          number: realData.number || order.nfePayload?.dest?.enderDest?.nro || null,
          neighborhood: realData.neighborhood || order.nfePayload?.dest?.enderDest?.xBairro || null,
          city: realData.city || order.nfePayload?.dest?.enderDest?.xMun || null,
          state: realData.state || order.nfePayload?.dest?.enderDest?.UF || null,
          zip_code: realData.zipCode || order.nfePayload?.dest?.enderDest?.CEP || null,
          ibge_code: realData.ibgeCode || order.nfePayload?.dest?.enderDest?.cMun || null,
          status: realData.status || 'Ativo',
          notes: realData.notes || null,
          total_spent: Number(realData.totalSpent || 0),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .maybeSingle();
    }
  }

  // 2. Upsert do cabeçalho do pedido
  const { error: hErr } = await supabase
    .schema('erp')
    .from('sales_orders')
    .upsert({
      company_id: companyId,
      id: String(id),
      reference: reference || null,
      customer_id: customerId || 'sem-cliente',
      seller_name: sellerName || null,
      date: date || new Date().toISOString(),
      status: status || 'Orçamento',
      subtotal: Number(subtotal || 0),
      discount: Number(discount || 0),
      total: Number(total || 0),
      without_finance: Boolean(withoutFinance),
      payment_method: paymentMethod || null,
      is_avulsa: Boolean(isAvulsa),
      shipping: shipping != null ? { valor: shipping } : null,
      frete: frete || null,
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });

  if (hErr) throw hErr;

  // 3. Upsert de itens
  if (Array.isArray(items) && items.length > 0) {
    const itemRows = items.map((it: any, idx: number) => {
      const {
        productId, productCode, productName, quantity,
        unit, unitPrice, discount: itDisc, total: itTot,
        ncm, cst, cfop, ...itExtra
      } = it;
      return {
        company_id: companyId,
        id: `${id}_item_${idx + 1}`,
        order_id: String(id),
        product_id: productId || null,
        product_code: productCode || null,
        product_name: productName || 'Produto',
        quantity: Number(quantity || 0),
        unit: unit || 'Ton',
        unit_price: Number(unitPrice || 0),
        discount: Number(itDisc || 0),
        total: Number(itTot || 0),
        ncm: ncm || null,
        cst: cst || null,
        cfop: cfop || null,
        extra: itExtra || {}
      };
    });

    const keepIds = itemRows.map((r: any) => r.id);
    await supabase.schema('erp').from('sales_order_items').delete()
      .eq('company_id', companyId)
      .eq('order_id', String(id))
      .not('id', 'in', `(${keepIds.map((i: any) => `"${i}"`).join(',')})`);

    const { error: itErr } = await supabase
      .schema('erp')
      .from('sales_order_items')
      .upsert(itemRows, { onConflict: 'company_id,id' });

    if (itErr) console.warn('[OrdersRepo] Falha ao upsert em sales_order_items:', itErr);
  } else if (Array.isArray(items) && items.length === 0) {
    await supabase.schema('erp').from('sales_order_items').delete()
      .eq('company_id', companyId)
      .eq('order_id', String(id));
  }

  // 4. Upsert de parcelas
  if (Array.isArray(payments) && payments.length > 0) {
    const instRows = payments.map((inst: any, idx: number) => {
      const {
        id: instId, amount, dueDate, date: pDate, status: instStatus,
        paidAmount, paymentMethod: instPm, receiptId, ...instExtra
      } = inst;
      return {
        company_id: companyId,
        id: String(instId || `${id}_inst_${idx + 1}`),
        order_id: String(id),
        amount: Number(amount || 0),
        due_date: dueDate || pDate || new Date().toISOString().slice(0, 10),
        status: instStatus || 'PENDENTE',
        paid_amount: Number(paidAmount || 0),
        payment_method: instPm || null,
        receipt_id: receiptId || null,
        extra: instExtra || {}
      };
    });

    const keepIds = instRows.map((r: any) => r.id);
    await supabase.schema('erp').from('sales_order_installments').delete()
      .eq('company_id', companyId)
      .eq('order_id', String(id))
      .not('id', 'in', `(${keepIds.map((i: any) => `"${i}"`).join(',')})`);

    const { error: instErr } = await supabase
      .schema('erp')
      .from('sales_order_installments')
      .upsert(instRows, { onConflict: 'company_id,id' });

    if (instErr) console.warn('[OrdersRepo] Falha ao upsert em sales_order_installments:', instErr);
  } else if (Array.isArray(payments) && payments.length === 0) {
    await supabase.schema('erp').from('sales_order_installments').delete()
      .eq('company_id', companyId)
      .eq('order_id', String(id));
  }

  // 5. Upsert de recibos
  if (Array.isArray(receipts) && receipts.length > 0) {
    const recRows = receipts.map((rec: any, idx: number) => {
      const {
        id: recId, customerId: rCust, orderReference, amount,
        date: rDate, paymentMethod: rPm, accountId, receivedBy,
        notes, createdAt, ...recExtra
      } = rec;
      return {
        company_id: companyId,
        id: String(recId || `${id}_rec_${idx + 1}`),
        order_id: String(id),
        customer_id: rCust || customerId || null,
        order_reference: orderReference || reference || null,
        amount: Number(amount || 0),
        payment_date: rDate || new Date().toISOString().slice(0, 10),
        payment_method: rPm || 'PIX',
        account_id: accountId || null,
        received_by: receivedBy || null,
        notes: notes || null,
        created_at: createdAt || new Date().toISOString(),
        extra: recExtra || {}
      };
    });

    const keepIds = recRows.map((r: any) => r.id);
    await supabase.schema('erp').from('sales_order_receipts').delete()
      .eq('company_id', companyId)
      .eq('order_id', String(id))
      .not('id', 'in', `(${keepIds.map((i: any) => `"${i}"`).join(',')})`);

    const { error: recErr } = await supabase
      .schema('erp')
      .from('sales_order_receipts')
      .upsert(recRows, { onConflict: 'company_id,id' });

    if (recErr) console.warn('[OrdersRepo] Falha ao upsert em sales_order_receipts:', recErr);
  } else if (Array.isArray(receipts) && receipts.length === 0) {
    await supabase.schema('erp').from('sales_order_receipts').delete()
      .eq('company_id', companyId)
      .eq('order_id', String(id));
  }

  // 6. Upsert de retiradas / pesagens
  if (Array.isArray(withdrawals) && withdrawals.length > 0) {
    const wthRows = withdrawals.map((w: any, idx: number) => {
      const {
        id: wId, date: wDate, netWeight, quantity: wQty, truckPlate,
        driverName, carrierName, ticketNumber, notes: wNotes,
        createdAt: wCreated, ...wExtra
      } = w;
      return {
        company_id: companyId,
        id: String(wId || `${id}_wth_${idx + 1}`),
        order_id: String(id),
        date: wDate || new Date().toISOString(),
        net_weight: Number(netWeight != null ? netWeight : (wQty || 0)),
        truck_plate: truckPlate || null,
        driver_name: driverName || null,
        carrier_name: carrierName || null,
        ticket_number: ticketNumber || null,
        notes: wNotes || null,
        created_at: wCreated || new Date().toISOString(),
        extra: wExtra || {}
      };
    });

    const { error: wthErr } = await supabase
      .schema('erp')
      .from('sales_order_withdrawals')
      .upsert(wthRows, { onConflict: 'company_id,id' });

    if (wthErr) console.warn('[OrdersRepo] Falha ao upsert em sales_order_withdrawals:', wthErr);
  }

  // 7. Upsert de nfes
  if (Array.isArray(nfes) && nfes.length > 0) {
    const nfeRows = nfes.map((n: any, idx: number) => {
      const {
        id: nId, nfeId, chave, nfeChave, numero, nfeNumero,
        serie, nfeSerie, status: nStatus, nfeStatus, emissao, nfeEmissao,
        protocolo, nfeProtocolo, danfeUrl, nfeDanfeUrl, xmlUrl, nfeXmlUrl,
        nfePayload, nfeRawResponse, nfeResponse, createdAt: nCreated, updatedAt: nUpdated
      } = n;
      return {
        company_id: companyId,
        id: String(nId || nfeId || `${id}_nfe_${idx + 1}`),
        order_id: String(id),
        chave: chave || nfeChave || null,
        numero: numero || nfeNumero || null,
        serie: serie || nfeSerie || null,
        status: nStatus || nfeStatus || 'draft',
        emissao: emissao || nfeEmissao || null,
        protocolo: protocolo || nfeProtocolo || null,
        danfe_url: danfeUrl || nfeDanfeUrl || null,
        xml_url: xmlUrl || nfeXmlUrl || null,
        nfe_payload: nfePayload || null,
        nfe_response: nfeResponse || nfeRawResponse || null,
        created_at: nCreated || new Date().toISOString(),
        updated_at: nUpdated || new Date().toISOString()
      };
    });

    const { error: nfeErr } = await supabase
      .schema('erp')
      .from('sales_order_nfes')
      .upsert(nfeRows, { onConflict: 'company_id,id' });

    if (nfeErr) console.warn('[OrdersRepo] Falha ao upsert em sales_order_nfes:', nfeErr);
  }
}

export async function deleteOrderFromErp(companyId: string, id: string, supabase: any): Promise<void> {
  // 1. Garantir que nenhuma venda com NF-e autorizada possa ser excluída
  const { data: authorizedNfe } = await supabase
    .schema('erp')
    .from('sales_order_nfes')
    .select('id, numero, chave')
    .eq('company_id', companyId)
    .eq('order_id', id)
    .eq('status', 'autorizada')
    .limit(1)
    .maybeSingle();

  if (authorizedNfe) {
    throw new Error(`Esta venda possui NF-e autorizada (Nº ${authorizedNfe.numero || authorizedNfe.chave || authorizedNfe.id}). Cancele o documento fiscal antes de excluir a venda.`);
  }

  const { error } = await supabase
    .schema('erp')
    .from('sales_orders')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);

  if (error) throw error;
}
