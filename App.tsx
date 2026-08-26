
import React, { useState, useEffect } from 'react';
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
import CategorySettings from './components/CategorySettings';
import { FiscalManagement } from './components/FiscalManagement';
import Login from './components/Login';
import { OnboardingModal } from './components/OnboardingModal';
import { RefreshCw, Sparkles } from 'lucide-react';
import { 
  View, 
  InventoryItem, 
  Transaction, 
  Customer, 
  TransactionType, 
  TransactionStatus,
  FinancialAccount,
  AccountType,
  SaleOrder,
  OrderStatus,
  SalePayment,
  PaymentReceipt,
  CostCenter,
  Machine,
  StoreItem,
  MaintenanceRecord,
  FuelRecord,
  FuelPurchase,
  User,
  UserRole,
  Category
} from './types';
import { 
  INITIAL_COST_CENTERS,
  COMPANY_INFO
} from './constants';
import { financeService, userService, inventoryService, orderService, db } from './services/dataService';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [syncing, setSyncing] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  
  // App State
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
  const [categories, setCategories] = useState<Category[]>([]);

  // Check if current user needs onboarding upon login
  useEffect(() => {
    if (currentUser && currentUser.onboardingCompleted === false) {
      setShowOnboardingModal(true);
    }
  }, [currentUser]);

  // ID isolado da empresa / tenant SaaS atual
  const activeCompanyId = currentUser?.companyId || (currentUser?.email === 'admin@calcarioflow.com.br' ? 'matriz-demo' : (currentUser ? `comp-${currentUser.id}` : 'matriz-demo'));

  // Carregamento de dados unificado com auto-seed
  useEffect(() => {
    if (!currentUser) return;

    const loadAllData = async () => {
      setSyncing(true);
      try {
        const [
          savedTxs, savedInv, savedCust, 
          savedOrders, savedMachines, savedStore, 
          savedMaint, savedFuel, savedFuelPurchases, savedAccounts,
          savedCategories, savedUsers
        ] = await Promise.all([
          financeService.getTransactions(activeCompanyId),
          inventoryService.getInventory(activeCompanyId),
          db.getTable('customers', activeCompanyId),
          orderService.getOrders(activeCompanyId),
          db.getTable('machines', activeCompanyId),
          db.getTable('store_items', activeCompanyId),
          db.getTable('maintenance_records', activeCompanyId),
          db.getTable('fuel_records', activeCompanyId),
          db.getTable('fuel_purchases', activeCompanyId),
          db.getTable('financial_accounts', activeCompanyId),
          db.getTable('categories', activeCompanyId),
          userService.getAll()
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
        setAccounts(savedAccounts);
        setCategories(savedCategories);
        setUsers(savedUsers);

      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      } finally {
        setSyncing(false);
      }
    };

    loadAllData();
  }, [currentUser, activeCompanyId]);

  // Handlers para Categorias
  const handleAddCategory = (name: string, type: 'INFLOW' | 'OUTFLOW') => {
    const newCat: Category = { id: `cat-${Date.now()}`, name, type };
    setCategories(prev => [...prev, newCat]);
    db.upsert('categories', activeCompanyId, newCat);
  };

  const handleDeleteCategory = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    db.delete('categories', activeCompanyId, id);
  };

  // Handlers de Maquinário
  const handleAddMachine = (machineData: Omit<Machine, 'id'>) => {
    const newMachine: Machine = { ...machineData, id: `mach-${Date.now()}` };
    setMachines(prev => [...prev, newMachine]);
    db.upsert('machines', activeCompanyId, newMachine);
  };

  const handleUpdateHorimeter = (machineId: string, newHorimeter: number) => {
    setMachines(prev => prev.map(m => {
      if (m.id === machineId) {
        const updated = { ...m, currentHorimeter: newHorimeter };
        db.upsert('machines', activeCompanyId, updated);
        return updated;
      }
      return m;
    }));
  };

  // Handlers de Combustível
  const handleAddFuel = (fuelData: Omit<FuelRecord, 'id'>) => {
    const newFuel: FuelRecord = { ...fuelData, id: `fuel-${Date.now()}` };
    setFuelRecords(prev => [...prev, newFuel]);
    db.upsert('fuel_records', activeCompanyId, newFuel);
    handleUpdateHorimeter(fuelData.machineId, fuelData.horimeter);
    handleAddTransaction({
      accountId: accounts[0]?.id || 'acc-1',
      costCenterId: 'cc3',
      date: fuelData.date,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.CONFIRMADO,
      description: `Abastecimento (${fuelData.fuelType}): ${machines.find(m => m.id === fuelData.machineId)?.name || 'Máquina'}`,
      category: 'Combustível (Diesel S10 / S500)',
      amount: fuelData.totalCost,
      paidAmount: fuelData.totalCost
    });
  };

  const handleAddFuelPurchase = (purchaseData: Omit<FuelPurchase, 'id'>) => {
    const newPurchase: FuelPurchase = { ...purchaseData, id: `pur-${Date.now()}` };
    setFuelPurchases(prev => [...prev, newPurchase]);
    db.upsert('fuel_purchases', activeCompanyId, newPurchase);
    handleAddTransaction({
      accountId: accounts[0]?.id || 'acc-1',
      costCenterId: 'cc3',
      date: purchaseData.date,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.CONFIRMADO,
      description: `Compra Carga Diesel ${purchaseData.fuelType} (${purchaseData.liters}L) - ${purchaseData.supplier}`,
      category: 'Combustível (Diesel S10 / S500)',
      amount: purchaseData.totalCost,
      paidAmount: purchaseData.totalCost
    });
  };

  // Manutenções
  const handleAddMaintenance = (maintData: Omit<MaintenanceRecord, 'id'>) => {
    const newMaint: MaintenanceRecord = { ...maintData, id: `maint-${Date.now()}` };
    setMaintenances(prev => [...prev, newMaint]);
    db.upsert('maintenance_records', activeCompanyId, newMaint);
    handleAddTransaction({
      accountId: accounts[0]?.id || 'acc-1',
      costCenterId: 'cc5',
      date: maintData.date,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.CONFIRMADO,
      description: `Manutenção: ${machines.find(m => m.id === maintData.machineId)?.name || 'Equipamento'}`,
      category: 'Manutenção de Britador e Moinho',
      amount: maintData.cost,
      paidAmount: maintData.cost
    });
  };

  // Almoxarifado / Peças
  const handleAddStoreItem = (itemData: Omit<StoreItem, 'id'>) => {
    const newItem: StoreItem = { ...itemData, id: `store-${Date.now()}` };
    setStoreItems(prev => [...prev, newItem]);
    db.upsert('store_items', activeCompanyId, newItem);
  };

  const handleUpdateStoreItem = (item: StoreItem) => {
    setStoreItems(prev => prev.map(s => s.id === item.id ? item : s));
    db.upsert('store_items', activeCompanyId, item);
  };

  // Contas Financeiras
  const handleUpdateAccount = (updatedAccount: FinancialAccount) => {
    setAccounts(prev => prev.map(acc => acc.id === updatedAccount.id ? updatedAccount : acc));
    db.upsert('financial_accounts', activeCompanyId, updatedAccount);
  };

  // Transações Financeiras
  const handleAddTransaction = (newTx: Omit<Transaction, 'id'>) => {
    const tx: Transaction = { ...newTx, id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}` };
    setTransactions(prev => {
      const updated = [tx, ...prev];
      financeService.saveTransactions(activeCompanyId, updated);
      return updated;
    });
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
    setTransactions(prev => {
      const updated = prev.map(t => t.id === updatedTx.id ? updatedTx : t);
      financeService.saveTransactions(activeCompanyId, updated);
      return updated;
    });
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
    db.delete('transactions', activeCompanyId, id);
  };

  // Clientes
  const handleImportCustomers = (newCustomers: Omit<Customer, 'id' | 'totalSpent'>[]) => {
    const formatted = newCustomers.map(c => ({
      ...c,
      id: `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      totalSpent: 0
    }));
    setCustomers(prev => [...prev, ...formatted]);
    db.upsert('customers', activeCompanyId, formatted);
  };

  const handleAddCustomer = (newCustomer: Omit<Customer, 'id' | 'totalSpent'>) => {
    const customer: Customer = {
      ...newCustomer,
      id: `cust-${Date.now()}`,
      totalSpent: 0
    };
    setCustomers(prev => [...prev, customer]);
    db.upsert('customers', activeCompanyId, customer);
  };

  // Estoque
  const processStockChange = (productId: string, quantity: number) => {
    setInventory(prev => {
      const newList = prev.map(item => 
        (item.id === productId) ? { ...item, quantity: Math.max(0, item.quantity + quantity) } : item
      );
      const updatedItem = newList.find(i => i.id === productId);
      if (updatedItem) inventoryService.updateStock(activeCompanyId, productId, updatedItem.quantity);
      return newList;
    });
  };

  const handleAddInventoryItem = (item: Omit<InventoryItem, 'id'> & { id?: string }) => {
    const newItem: InventoryItem = { ...item, id: item.id || `prod-${Date.now()}` };
    setInventory(prev => [...prev, newItem]);
    db.upsert('inventory', activeCompanyId, newItem);
  };

  // Usuários
  const handleAddUser = (userData: Omit<User, 'id'>) => {
    const newUser: User = { ...userData, id: `u-${Date.now()}`, status: 'Ativo' };
    setUsers(prev => [...prev, newUser]);
    userService.saveUser(newUser);
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    userService.saveUser(updatedUser);
  };

  // Pedidos e Vendas
  const handleAddOrder = (orderData: Omit<SaleOrder, 'id' | 'reference'>) => {
    const reference = `PED-${new Date().getFullYear()}-${(orders.length + 1).toString().padStart(4, '0')}`;
    const newOrder: SaleOrder = { ...orderData, id: `ord-${Date.now()}`, reference };
    setOrders(prev => [...prev, newOrder]);
    orderService.saveOrders(activeCompanyId, [...orders, newOrder]);
    if (newOrder.status === OrderStatus.FINALIZED) {
      finalizeSale(newOrder, newOrder.payments);
    }
  };

  const finalizeSale = (order: SaleOrder, payments: SalePayment[]) => {
    order.items.forEach(item => processStockChange(item.productId, -item.quantity));
    payments.forEach(payment => {
      let actualPaid = 0;
      if (payment.status === TransactionStatus.CONFIRMADO || payment.status === TransactionStatus.PAGO) {
        actualPaid = payment.amount;
      } else if (payment.status === TransactionStatus.PARCIAL) {
        actualPaid = payment.paidAmount || 0;
      }

      handleAddTransaction({
        accountId: payment.accountId || accounts[0]?.id || 'acc-1',
        costCenterId: 'cc4',
        date: payment.date,
        type: TransactionType.SALE,
        status: payment.status,
        description: `Venda Faturada #${order.reference}`,
        category: 'Venda Calcário Moído Granel',
        amount: payment.amount,
        paidAmount: actualPaid,
        customerId: order.customerId,
        orderId: order.id
      });
    });
    setCustomers(prev => {
      const updatedList = prev.map(c => {
        if (c.id === order.customerId) {
          const updatedCustomer = { 
            ...c, 
            totalSpent: Number(c.totalSpent || 0) + order.total,
            status: 'Ativo' as const
          };
          db.upsert('customers', activeCompanyId, updatedCustomer);
          return updatedCustomer;
        }
        return c;
      });
      return updatedList;
    });
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, payments, status: OrderStatus.FINALIZED } : o));
  };

  const handlePaymentReceived = (receipt: PaymentReceipt, _updatedOrder: SaleOrder) => {
    handleAddTransaction({
      accountId: receipt.accountId || accounts[0]?.id || 'acc-1',
      costCenterId: 'cc4',
      date: receipt.date,
      type: TransactionType.SALE,
      status: TransactionStatus.CONFIRMADO,
      description: `${receipt.description} - ${receipt.customerName}`,
      category: 'Venda Calcário Moído Granel',
      amount: receipt.amount,
      paidAmount: receipt.amount,
      customerId: receipt.customerId,
      orderId: receipt.orderId,
      receiptId: receipt.id,
      paymentMethod: receipt.paymentMethod,
      notes: receipt.notes
    });
  };

  const handleUpdateOrder = (updatedOrder: SaleOrder) => {
    const originalOrder = orders.find(o => o.id === updatedOrder.id);
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    orderService.saveOrders(activeCompanyId, orders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    if (originalOrder && originalOrder.status === OrderStatus.BUDGET && updatedOrder.status === OrderStatus.FINALIZED) {
      finalizeSale(updatedOrder, updatedOrder.payments);
    }
  };

  // Resetar empresa para banco 100% limpo
  const handleResetCompanyDatabase = async () => {
    if (!window.confirm(`Tem certeza que deseja zerar todos os registros de "${currentUser.companyName || 'sua empresa'}" e deixar a base 100% limpa?`)) {
      return;
    }
    setSyncing(true);
    await db.resetCompanyToClean(activeCompanyId);
    setTransactions([]);
    setCustomers([]);
    setOrders([]);
    setMachines([]);
    setStoreItems([]);
    setMaintenances([]);
    setFuelRecords([]);
    setFuelPurchases([]);
    setAccounts([{ id: 'acc-1', name: 'Conta Principal / Caixa Geral', type: AccountType.BANCO, initialBalance: 0, bankName: 'Banco Principal', accountNumber: '0001-0' }]);
    setInventory([
      { id: 'moido', name: 'Calcário Agrícola Moído (Granel)', unit: 'Ton', quantity: 0, minStock: 200, unitPrice: 180 },
      { id: 'britado', name: 'Calcário Britado (Matéria-Prima)', unit: 'Ton', quantity: 0, minStock: 500, unitPrice: 90 },
      { id: 'filler', name: 'Calcário Filler Ultrafino', unit: 'Ton', quantity: 0, minStock: 50, unitPrice: 240 }
    ]);
    setSyncing(false);
  };

  // Carregar dados de demonstração para testes
  const handleLoadDemoData = async () => {
    if (!window.confirm("Deseja carregar dados de demonstração para teste nesta empresa?")) return;
    setSyncing(true);
    await db.loadDemoDataForCompany(activeCompanyId);
    const [
      savedTxs, savedInv, savedCust, 
      savedOrders, savedMachines, savedStore, 
      savedMaint, savedFuel, savedFuelPurchases, savedAccounts
    ] = await Promise.all([
      financeService.getTransactions(activeCompanyId),
      inventoryService.getInventory(activeCompanyId),
      db.getTable('customers', activeCompanyId),
      orderService.getOrders(activeCompanyId),
      db.getTable('machines', activeCompanyId),
      db.getTable('store_items', activeCompanyId),
      db.getTable('maintenance_records', activeCompanyId),
      db.getTable('fuel_records', activeCompanyId),
      db.getTable('fuel_purchases', activeCompanyId),
      db.getTable('financial_accounts', activeCompanyId)
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
    setAccounts(savedAccounts);
    setSyncing(false);
  };

  const handleCompleteOnboarding = async (updatedUser: User) => {
    setCurrentUser(updatedUser);
    setShowOnboardingModal(false);

    try {
      const [savedInv, savedAccs, savedUsers] = await Promise.all([
        inventoryService.getInventory(activeCompanyId),
        db.getTable('financial_accounts', activeCompanyId),
        userService.getAll()
      ]);
      if (savedInv?.length) setInventory(savedInv);
      if (savedAccs?.length) setAccounts(savedAccs);
      if (savedUsers?.length) setUsers(savedUsers);
    } catch (e) {
      console.error("Erro ao atualizar estado pós onboarding:", e);
    }
  };

  if (!currentUser) return <Login onLoginSuccess={setCurrentUser} />;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        user={currentUser}
        onLogout={() => setCurrentUser(null)}
      />
      <main className="flex-1 ml-64 p-8 transition-all duration-300 print:ml-0 print:p-0">
        <div className="max-w-7xl mx-auto pb-20 print:max-w-none">
          <div className="flex justify-between items-center mb-6 print:hidden">
             <div className="flex items-center gap-2.5 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
               {syncing ? (
                 <>
                   <RefreshCw size={14} className="text-purple-600 animate-spin" />
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sincronizando Sistema...</span>
                 </>
               ) : (
                 <>
                   <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                   <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                     {currentUser.companyName || COMPANY_INFO.name} • {currentUser.city || COMPANY_INFO.city}-{currentUser.state || COMPANY_INFO.state}
                   </span>
                 </>
               )}
             </div>
             
             <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1.5 bg-white px-3 py-2 rounded-2xl border border-slate-200 shadow-sm text-[10px]">
                  <span className="font-bold text-slate-400">Base:</span>
                  <span className={`font-black uppercase px-2 py-0.5 rounded-lg ${activeCompanyId === 'matriz-demo' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                    {activeCompanyId === 'matriz-demo' ? 'Demonstração' : 'Produção SaaS'}
                  </span>
                  {activeCompanyId !== 'matriz-demo' && (
                    <button
                      onClick={handleResetCompanyDatabase}
                      title="Zerar todos os dados e deixar a base limpa"
                      className="ml-1 px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-black transition-colors border border-rose-200"
                    >
                      Limpar
                    </button>
                  )}
                  {activeCompanyId !== 'matriz-demo' && orders.length === 0 && customers.length === 0 && (
                    <button
                      onClick={handleLoadDemoData}
                      title="Carregar registros de demonstração para testes rápidos"
                      className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-black transition-colors border border-purple-200"
                    >
                      Testar Demo
                    </button>
                  )}
                </div>

                {currentUser.onboardingCompleted === false && (
                  <button
                    onClick={() => setShowOnboardingModal(true)}
                    className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md shadow-amber-200 active:scale-95 animate-pulse"
                  >
                    <Sparkles size={13} />
                    Completar Configuração da Usina
                  </button>
                )}

                <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-200">
                   <div className="text-right">
                      <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{currentUser.name}</p>
                      <p className="text-[9px] font-bold text-purple-600 uppercase tracking-wider">{currentUser.role}</p>
                   </div>
                   <button 
                     onClick={() => setCurrentUser(null)} 
                     className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase transition-colors"
                   >
                     Sair
                   </button>
                </div>
             </div>
          </div>
          
          {currentView === 'dashboard' && (
            <Dashboard 
              transactions={transactions} 
              inventory={inventory} 
              customers={customers} 
              orders={orders}
              accounts={accounts}
              user={currentUser}
              onNavigate={setCurrentView} 
              onOpenOnboardingModal={() => setShowOnboardingModal(true)}
            />
          )}
          {currentView === 'orders' && (
            <SalesOrders 
              orders={orders} 
              customers={customers} 
              inventory={inventory} 
              accounts={accounts} 
              company={COMPANY_INFO} 
              onAddOrder={handleAddOrder} 
              onUpdateOrder={handleUpdateOrder} 
              onDeleteOrder={(id) => db.delete('sales_orders', activeCompanyId, id)} 
              onFinalizeOrder={(oid, p) => finalizeSale(orders.find(o => o.id === oid)!, p)} 
              onPaymentReceived={handlePaymentReceived}
            />
          )}
          {currentView === 'fiscal' && (
            <FiscalManagement 
              orders={orders} 
              customers={customers} 
              company={COMPANY_INFO} 
              onUpdateOrder={handleUpdateOrder} 
            />
          )}
          {currentView === 'inventory' && (
            <Inventory 
              inventory={inventory} 
              customers={customers} 
              onPurchase={(q, c) => { 
                processStockChange('britado', q); 
                handleAddTransaction({ 
                  accountId: accounts[0]?.id || 'acc-1', 
                  date: new Date().toISOString().split('T')[0], 
                  type: TransactionType.PURCHASE, 
                  status: TransactionStatus.CONFIRMADO, 
                  description: `Compra Minério Bruto / Brita (${q}T)`, 
                  category: 'Compra de Brita / Minério Bruto', 
                  amount: q * c, 
                  paidAmount: q * c 
                }); 
              }} 
              onSale={(q, p, c) => handleAddOrder({ 
                customerId: c, 
                sellerName: currentUser.name, 
                date: new Date().toISOString().split('T')[0], 
                total: q * p, 
                subtotal: q * p, 
                discount: 0, 
                shipping: 0, 
                status: OrderStatus.FINALIZED, 
                items: [{ productId: 'moido', productCode: 'CALC-MOI', productName: 'Calcário Agrícola Moído (Granel)', unit: 'Ton', quantity: q, unitPrice: p, discount: 0, total: q * p }], 
                payments: [{ id: `pay-${Date.now()}`, amount: q * p, paidAmount: q * p, date: new Date().toISOString().split('T')[0], status: TransactionStatus.CONFIRMADO, accountId: accounts[0]?.id || 'acc-1', description: 'Venda Direta de Pátio' }] 
              })} 
              onAddProduct={handleAddInventoryItem} 
            />
          )}
          {currentView === 'milling' && (
            <MillingProcess 
              onMilling={(i, o) => { 
                processStockChange('britado', -i); 
                processStockChange('moido', o); 
              }} 
              availableBritado={inventory.find(it => it.id === 'britado')?.quantity || 0} 
            />
          )}
          {currentView === 'accounts' && (
            <FinancialAccounts 
              accounts={accounts} 
              transactions={transactions} 
              onUpdateAccount={handleUpdateAccount} 
              onAddTransaction={handleAddTransaction} 
            />
          )}
          {currentView === 'transactions' && (
            <TransactionsArea 
              transactions={transactions} 
              accounts={accounts} 
              costCenters={costCenters} 
              categories={categories} 
              company={COMPANY_INFO}
              customers={customers}
              onAddTransaction={handleAddTransaction} 
              onUpdateTransaction={handleUpdateTransaction} 
              onDeleteTransaction={handleDeleteTransaction} 
            />
          )}
          {currentView === 'customers' && (
            <Customers 
              customers={customers} 
              orders={orders}
              transactions={transactions}
              onImportCustomers={handleImportCustomers} 
              onAddCustomer={handleAddCustomer} 
            />
          )}
          {currentView === 'cashflow' && (
            <CashFlow 
              transactions={transactions} 
              categories={categories} 
            />
          )}
          {currentView === 'users' && (
            <UserManagement 
              users={users} 
              currentUser={currentUser}
              onAddUser={handleAddUser} 
              onUpdateUser={handleUpdateUser} 
              onOpenOnboarding={() => setShowOnboardingModal(true)}
            />
          )}
          {currentView === 'fleet' && (
            <FleetManagement 
              machines={machines} 
              onAddMachine={handleAddMachine} 
              onUpdateHorimeter={handleUpdateHorimeter} 
            />
          )}
          {currentView === 'fuel' && (
            <FuelManagement 
              machines={machines} 
              fuelRecords={fuelRecords} 
              fuelPurchases={fuelPurchases} 
              onAddFuel={handleAddFuel} 
              onAddFuelPurchase={handleAddFuelPurchase} 
            />
          )}
          {currentView === 'yard' && (
            <YardManagement 
              machines={machines} 
              storeItems={storeItems} 
              maintenances={maintenances} 
              onAddMaintenance={handleAddMaintenance} 
              onAddStoreItem={handleAddStoreItem} 
              onUpdateStoreItem={handleUpdateStoreItem} 
            />
          )}
          {currentView === 'settings' && (
            <CategorySettings 
              categories={categories} 
              onAddCategory={handleAddCategory} 
              onDeleteCategory={handleDeleteCategory} 
            />
          )}
        </div>
      </main>

      {/* Assistente de Onboarding / Setup Inicial */}
      {showOnboardingModal && currentUser && (
        <OnboardingModal
          user={currentUser}
          onComplete={handleCompleteOnboarding}
          onClose={() => setShowOnboardingModal(false)}
        />
      )}
    </div>
  );
};

export default App;

