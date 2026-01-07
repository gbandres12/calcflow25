
import React, { useState, useMemo, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Customers from './components/Customers';
import CashFlow from './components/CashFlow';
import MillingProcess from './components/MillingProcess';
import FinancialAccounts from './components/FinancialAccounts';
import SalesOrders from './components/SalesOrders';
import TransactionsArea from './components/Transactions';
import FleetManagement from './components/FleetManagement';
import YardManagement from './components/YardManagement';
import FuelManagement from './components/FuelManagement';
import UserManagement from './components/UserManagement';
import Login from './components/Login';
import { Database, CloudCheck, RefreshCw } from 'lucide-react';
import { 
  View, 
  InventoryItem, 
  Transaction, 
  Customer, 
  TransactionType, 
  TransactionStatus,
  FinancialAccount,
  Company,
  SaleOrder,
  OrderStatus,
  SalePayment,
  CostCenter,
  Machine,
  StoreItem,
  MaintenanceRecord,
  FuelRecord,
  FuelPurchase,
  User,
  UserRole
} from './types';
import { 
  INITIAL_INVENTORY, 
  INITIAL_TRANSACTIONS, 
  INITIAL_CUSTOMERS,
  INITIAL_COMPANIES,
  INITIAL_ACCOUNTS,
  INITIAL_COST_CENTERS,
  INITIAL_USERS
} from './constants';
import { financeService, userService, inventoryService, orderService, db } from './services/dataService';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(INITIAL_COMPANIES[0].id);
  const [syncing, setSyncing] = useState(false);
  
  // States Locais (limpos a cada troca de filial)
  const [companies, setCompanies] = useState<Company[]>(INITIAL_COMPANIES);
  const [costCenters] = useState<CostCenter[]>(INITIAL_COST_CENTERS);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceRecord[]>([]);
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [fuelPurchases, setFuelPurchases] = useState<FuelPurchase[]>([]);

  // Carregamento de dados RESTRITO à filial selecionada
  useEffect(() => {
    if (!currentUser) return;

    const loadCompanyData = async () => {
      setSyncing(true);
      const cid = selectedCompanyId;
      try {
        const [
          savedTxs, savedInv, savedCust, 
          savedOrders, savedMachines, savedStore, 
          savedMaint, savedFuel, savedFuelPurchases, savedAccounts
        ] = await Promise.all([
          financeService.getTransactions(cid),
          inventoryService.getInventory(cid),
          db.getTable('customers', cid),
          orderService.getOrders(cid),
          db.getTable('machines', cid),
          db.getTable('store_items', cid),
          db.getTable('maintenance_records', cid),
          db.getTable('fuel_records', cid),
          db.getTable('fuel_purchases', cid),
          db.getTable('financial_accounts', cid)
        ]);

        setTransactions(savedTxs);
        setInventory(savedInv);
        setCustomers(savedCust);
        setOrders(savedOrders);
        setMachines(savedMachines);
        setStoreItems(savedStore);
        setMaintenances(savedMaint);
        setFuelRecords(savedFuel);
        setFuelPurchases(savedFuelPurchases);
        setAccounts(savedAccounts.length > 0 ? savedAccounts : INITIAL_ACCOUNTS.filter(a => a.companyId === cid));

      } catch (error) {
        console.error("Erro ao carregar filial:", error);
      } finally {
        setSyncing(false);
      }
    };

    loadCompanyData();
  }, [selectedCompanyId, currentUser]);

  // Ao logar, define a filial inicial baseada na role
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role !== UserRole.ADMIN && currentUser.companyId) {
        setSelectedCompanyId(currentUser.companyId);
      }
      // Carrega lista de usuários apenas para Admin
      if (currentUser.role === UserRole.ADMIN) {
        userService.getAll().then(setUsers);
      }
    }
  }, [currentUser]);

  const activeCompany = useMemo(() => 
    companies.find(c => c.id === selectedCompanyId) || companies[0], 
  [companies, selectedCompanyId]);

  // Handlers (Sempre injetando selectedCompanyId)
  const handleAddMachine = (machineData: Omit<Machine, 'id' | 'companyId'>) => {
    const newMachine: Machine = { ...machineData, id: `mach-${Date.now()}`, companyId: selectedCompanyId };
    setMachines(prev => [...prev, newMachine]);
    db.upsert('machines', selectedCompanyId, newMachine);
  };

  const handleUpdateHorimeter = (machineId: string, newHorimeter: number) => {
    setMachines(prev => prev.map(m => {
      if (m.id === machineId) {
        const updated = { ...m, currentHorimeter: newHorimeter };
        db.upsert('machines', selectedCompanyId, updated);
        return updated;
      }
      return m;
    }));
  };

  const handleAddFuel = (fuelData: Omit<FuelRecord, 'id' | 'companyId'>) => {
    const newFuel: FuelRecord = { ...fuelData, id: `fuel-${Date.now()}`, companyId: selectedCompanyId };
    setFuelRecords(prev => [...prev, newFuel]);
    db.upsert('fuel_records', selectedCompanyId, newFuel);
    handleUpdateHorimeter(fuelData.machineId, fuelData.horimeter);
    handleAddTransaction({
      accountId: accounts[0]?.id || '',
      costCenterId: 'cc3',
      date: fuelData.date,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.CONFIRMADO,
      description: `Abastecimento (${fuelData.fuelType}): ${machines.find(m => m.id === fuelData.machineId)?.name}`,
      category: 'Combustível',
      amount: fuelData.totalCost,
      paidAmount: fuelData.totalCost
    });
  };

  const handleAddFuelPurchase = (purchaseData: Omit<FuelPurchase, 'id' | 'companyId'>) => {
    const newPurchase: FuelPurchase = { ...purchaseData, id: `pur-${Date.now()}`, companyId: selectedCompanyId };
    setFuelPurchases(prev => [...prev, newPurchase]);
    db.upsert('fuel_purchases', selectedCompanyId, newPurchase);
    handleAddTransaction({
      accountId: accounts[0]?.id || '',
      costCenterId: 'cc3',
      date: purchaseData.date,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.CONFIRMADO,
      description: `Compra Diesel ${purchaseData.fuelType} (${purchaseData.liters}L) - ${purchaseData.supplier}`,
      category: 'Combustível',
      amount: purchaseData.totalCost,
      paidAmount: purchaseData.totalCost
    });
  };

  const handleAddMaintenance = (maintData: Omit<MaintenanceRecord, 'id' | 'companyId'>) => {
    const newMaint: MaintenanceRecord = { ...maintData, id: `maint-${Date.now()}`, companyId: selectedCompanyId };
    setMaintenances(prev => [...prev, newMaint]);
    db.upsert('maintenance_records', selectedCompanyId, newMaint);
    handleAddTransaction({
      accountId: accounts[0]?.id || '',
      costCenterId: 'cc3',
      date: maintData.date,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.CONFIRMADO,
      description: `Manutenção: ${machines.find(m => m.id === maintData.machineId)?.name}`,
      category: 'Manutenção Veículos',
      amount: maintData.cost,
      paidAmount: maintData.cost
    });
  };

  const handleAddStoreItem = (itemData: Omit<StoreItem, 'id' | 'companyId'>) => {
    const newItem: StoreItem = { ...itemData, id: `store-${Date.now()}`, companyId: selectedCompanyId };
    setStoreItems(prev => [...prev, newItem]);
    db.upsert('store_items', selectedCompanyId, newItem);
  };

  const handleUpdateStoreItem = (item: StoreItem) => {
    setStoreItems(prev => prev.map(s => s.id === item.id ? item : s));
    db.upsert('store_items', selectedCompanyId, item);
  };

  const handleUpdateAccount = (updatedAccount: FinancialAccount) => {
    setAccounts(prev => prev.map(acc => acc.id === updatedAccount.id ? updatedAccount : acc));
    db.upsert('financial_accounts', selectedCompanyId, updatedAccount);
  };

  const handleAddTransaction = (newTx: Omit<Transaction, 'id' | 'companyId'>) => {
    const tx = { ...newTx, id: `tx-${Date.now()}-${Math.random()}`, companyId: selectedCompanyId };
    setTransactions(prev => [...prev, tx]);
    financeService.saveTransactions(selectedCompanyId, [...transactions, tx]);
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
    setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t));
    financeService.saveTransactions(selectedCompanyId, transactions.map(t => t.id === updatedTx.id ? updatedTx : t));
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
    db.delete('transactions', selectedCompanyId, id);
  };

  const handleImportCustomers = (newCustomers: Omit<Customer, 'id' | 'companyId' | 'totalSpent'>[]) => {
    const formatted = newCustomers.map(c => ({
      ...c,
      id: `cust-${Date.now()}-${Math.random()}`,
      companyId: selectedCompanyId,
      totalSpent: 0
    }));
    setCustomers(prev => [...prev, ...formatted]);
    db.upsert('customers', selectedCompanyId, formatted);
  };

  const processStockChange = (productId: string, quantity: number) => {
    setInventory(prev => {
      const newList = prev.map(item => 
        (item.id === productId) ? { ...item, quantity: item.quantity + quantity } : item
      );
      const updatedItem = newList.find(i => i.id === productId);
      if (updatedItem) inventoryService.updateStock(selectedCompanyId, productId, updatedItem.quantity);
      return newList;
    });
  };

  const handleAddInventoryItem = (item: Omit<InventoryItem, 'id' | 'companyId'> & { id?: string }) => {
    const newItem: InventoryItem = { ...item, id: item.id || `prod-${Date.now()}`, companyId: selectedCompanyId };
    setInventory(prev => [...prev, newItem]);
    db.upsert('inventory', selectedCompanyId, newItem);
  };

  const handleAddUser = (userData: Omit<User, 'id'>) => {
    const newUser: User = { ...userData, id: `u-${Date.now()}`, status: 'Ativo' };
    setUsers(prev => [...prev, newUser]);
    userService.sync([...users, newUser]);
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    userService.sync(users.map(u => u.id === updatedUser.id ? updatedUser : u));
  };

  const handleAddOrder = (orderData: Omit<SaleOrder, 'id' | 'companyId' | 'reference'>) => {
    const reference = `${new Date().getFullYear()}${(orders.length + 1).toString().padStart(4, '0')}`;
    const newOrder: SaleOrder = { ...orderData, id: `ord-${Date.now()}`, reference, companyId: selectedCompanyId };
    setOrders(prev => [...prev, newOrder]);
    orderService.saveOrders(selectedCompanyId, [...orders, newOrder]);
    if (newOrder.status === OrderStatus.FINALIZED) finalizeSale(newOrder, newOrder.payments);
  };

  const finalizeSale = (order: SaleOrder, payments: SalePayment[]) => {
    order.items.forEach(item => processStockChange(item.productId, -item.quantity));
    payments.forEach(payment => {
      let actualPaid = 0;
      if (payment.status === TransactionStatus.CONFIRMADO || payment.status === TransactionStatus.PAGO) actualPaid = payment.amount;
      else if (payment.status === TransactionStatus.PARCIAL) actualPaid = payment.paidAmount || 0;

      handleAddTransaction({
        accountId: payment.accountId,
        costCenterId: 'cc4',
        date: payment.date,
        type: TransactionType.SALE,
        status: payment.status,
        description: `Venda #${order.reference}`,
        category: 'Vendas',
        amount: payment.amount,
        paidAmount: actualPaid,
        customerId: order.customerId,
        orderId: order.id
      });
    });
    setCustomers(prev => prev.map(c => c.id === order.customerId ? { ...c, totalSpent: Number(c.totalSpent) + order.total } : c));
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, payments, status: OrderStatus.FINALIZED } : o));
  };

  const handleUpdateOrder = (updatedOrder: SaleOrder) => {
    const originalOrder = orders.find(o => o.id === updatedOrder.id);
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    orderService.saveOrders(selectedCompanyId, orders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    if (originalOrder && originalOrder.status === OrderStatus.BUDGET && updatedOrder.status === OrderStatus.FINALIZED) {
      finalizeSale(updatedOrder, updatedOrder.payments);
    }
  };

  if (!currentUser) return <Login onLoginSuccess={setCurrentUser} />;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        companies={companies} 
        selectedCompanyId={selectedCompanyId} 
        onSelectCompany={setSelectedCompanyId} 
        user={currentUser}
      />
      <main className="flex-1 ml-64 p-8 transition-all duration-300 print:ml-0 print:p-0">
        <div className="max-w-7xl mx-auto pb-20 print:max-w-none">
          <div className="flex justify-between items-center mb-6 print:hidden">
             <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border shadow-sm">
               {syncing ? (
                 <>
                   <RefreshCw size={14} className="text-blue-500 animate-spin" />
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acessando {activeCompany.name}...</span>
                 </>
               ) : (
                 <>
                   <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base {activeCompany.code} Ativa</span>
                 </>
               )}
             </div>
             <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl shadow-sm border">
                <div className="text-right">
                   <p className="text-[10px] font-black text-slate-800 uppercase tracking-tighter">{currentUser.name}</p>
                   <p className="text-[9px] font-bold text-purple-600 uppercase">{currentUser.role} • {activeCompany.code}</p>
                </div>
                <button onClick={() => setCurrentUser(null)} className="text-[10px] font-black text-rose-500 uppercase hover:underline">Sair</button>
             </div>
          </div>
          
          {currentView === 'dashboard' && <Dashboard transactions={transactions} inventory={inventory} customers={customers} onNavigate={setCurrentView} />}
          {currentView === 'orders' && <SalesOrders orders={orders} customers={customers} inventory={inventory} accounts={accounts} company={activeCompany} onAddOrder={handleAddOrder} onUpdateOrder={handleUpdateOrder} onDeleteOrder={(id) => db.delete('sales_orders', selectedCompanyId, id)} onFinalizeOrder={(oid, p) => finalizeSale(orders.find(o => o.id === oid)!, p)} />}
          {currentView === 'inventory' && <Inventory inventory={inventory} customers={customers} onPurchase={(q, c) => { processStockChange('britado', q); handleAddTransaction({ accountId: accounts[0]?.id || '', date: new Date().toISOString().split('T')[0], type: TransactionType.PURCHASE, status: TransactionStatus.CONFIRMADO, description: `Compra Material (${q}T)`, category: 'Matéria Prima', amount: q * c, paidAmount: q * c }); }} onSale={(q, p, c) => handleAddOrder({ customerId: c, sellerName: currentUser.name, date: new Date().toISOString().split('T')[0], total: q * p, subtotal: q * p, discount: 0, shipping: 0, status: OrderStatus.FINALIZED, items: [{ productId: 'moido', productCode: '001', productName: 'Calcário Moído', unit: 'TON', quantity: q, unitPrice: p, discount: 0, total: q * p }], payments: [{ id: `pay-${Date.now()}`, amount: q * p, paidAmount: q * p, date: new Date().toISOString().split('T')[0], status: TransactionStatus.CONFIRMADO, accountId: accounts[0]?.id || '', description: 'Venda à Vista' }] })} onAddProduct={handleAddInventoryItem} />}
          {currentView === 'milling' && <MillingProcess onMilling={(i, o) => { processStockChange('britado', -i); processStockChange('moido', o); }} availableBritado={inventory.find(it => it.id === 'britado')?.quantity || 0} />}
          {currentView === 'accounts' && <FinancialAccounts accounts={accounts} transactions={transactions} onUpdateAccount={handleUpdateAccount} onAddTransaction={handleAddTransaction} />}
          {currentView === 'transactions' && <TransactionsArea transactions={transactions} accounts={accounts} costCenters={costCenters} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} onDeleteTransaction={handleDeleteTransaction} />}
          {currentView === 'customers' && <Customers customers={customers} onImportCustomers={handleImportCustomers} />}
          {currentView === 'cashflow' && <CashFlow transactions={transactions} />}
          {currentView === 'users' && <UserManagement users={users} companies={companies} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} />}
          {currentView === 'fleet' && <FleetManagement machines={machines} onAddMachine={handleAddMachine} onUpdateHorimeter={handleUpdateHorimeter} />}
          {currentView === 'fuel' && <FuelManagement machines={machines} fuelRecords={fuelRecords} fuelPurchases={fuelPurchases} onAddFuel={handleAddFuel} onAddFuelPurchase={handleAddFuelPurchase} />}
          {currentView === 'yard' && <YardManagement machines={machines} storeItems={storeItems} maintenances={maintenances} onAddMaintenance={handleAddMaintenance} onAddStoreItem={handleAddStoreItem} onUpdateStoreItem={handleUpdateStoreItem} />}
        </div>
      </main>
    </div>
  );
};

export default App;
