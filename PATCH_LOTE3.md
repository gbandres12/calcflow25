# Lote 3 — aplicar em `App.tsx`

## 1. Trocar os handlers de transação

De:

```
setTransactions(prev => {
  const updated = [tx, ...prev];
  financeService.saveTransactions(activeCompanyId, updated);
  return updated;
});
```

Para:

```
setTransactions(prev => [tx, ...prev]);
persistCloud('transactions', tx);
```

O mesmo em `handleUpdateTransaction`: `persistCloud('transactions', updatedTx)`.

## 2. Depois de `handleUpdateOrder`, adicionar

```
const handleDeleteOrder = (id: string) => {
  setOrders(prev => prev.filter(o => o.id !== id));
  db.delete('sales_orders', activeCompanyId, id).catch((err) => {
    console.warn('[PERSISTÊNCIA] Falha ao excluir pedido:', id, err);
  });
};
```

## 3. No JSX de SalesOrders

De: `onDeleteOrder={(id) => db.delete('sales_orders', activeCompanyId, id)}`

Para: `onDeleteOrder={handleDeleteOrder}`
