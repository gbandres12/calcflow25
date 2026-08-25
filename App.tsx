
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
import { RefreshCw } from 'lucide-react';
import { 
  View, 
  InventoryItem, 
  Transaction, 
  Customer, 
  TransactionType, 
  TransactionStatus,
  FinancialAccount,
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
          financeService.getTransactions(),
          inventoryService.getInventory(),
          db.getTable('customers'),
          orderService.getOrders(),
          db.getTable('machines'),
          db.getTable('store_items'),
          db.getTable('maintenance_records'),
          db.getTable('fuel_records'),
          db.getTable('fuel_purchases'),
          db.getTable('financial_accounts'),
          db.getTable('categories'),
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
  }, [currentUser]);

  // Handlers para Categorias
  const handleAddCategory = (name: string, type: 'INFLOW' | 'OUTFLOW') => {
    const newCat: Category = { id: `cat-${Date.now()}`, name, type };
    setCategories(prev => [...prev, newCat]);
    db.upsert('categories', 'main', newCat);
  };

  const handleDeleteCategory = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    db.delete('categories', 'main', id);
  };

  // Handlers de Maquinário
  const handleAddMachine = (machineData: Omit<Machine, 'id'>) => {
    const newMachine: Machine = { ...machineData, id: `mach-${Date.now()}` };
    setMachines(prev => [...prev, newMachine]);
    db.upsert('machines', 'main', newMachine);
  };

  const handleUpdateHorimeter = (machineId: string, newHorimeter: number) => {
    setMachines(prev => prev.map(m => {
      if (m.id === machineId) {
        const updated = { ...m, currentHorimeter: newHorimeter };
        db.upsert('machines', 'main', updated);
        return updated;
      }
      return m;
    }));
  };

  // Handlers de Combustível
  const handleAddFuel = (fuelData: Omit<FuelRecord, 'id'>) => {
    const newFuel: FuelRecord = { ...fuelData, id: `fuel-${Date.now()}` };
    setFuelRecords(prev => [...prev, newFuel]);
    db.upsert('fuel_records', 'main', newFuel);
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
    db.upsert('fuel_purchases', 'main', newPurchase);
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
    db.upsert('maintenance_records', 'main', newMaint);
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
    db.upsert('store_items', 'main', newItem);
  };

  const handleUpdateStoreItem = (item: StoreItem) => {
    setStoreItems(prev => prev.map(s => s.id === item.id ? item : s));
    db.upsert('store_items', 'main', item);
  };

  // Contas Financeiras
  const handleUpdateAccount = (updatedAccount: FinancialAccount) => {
    setAccounts(prev => prev.map(acc => acc.id === updatedAccount.id ? updatedAccount : acc));
    db.upsert('financial_accounts', 'main', updatedAccount);
  };

  // Transações Financeiras
  const handleAddTransaction = (newTx: Omit<Transaction, 'id'>) => {
    const tx: Transaction = { ...newTx, id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}` };
    setTransactions(prev => {
      const updated = [tx, ...prev];
      financeService.saveTransactions('main', updated);
      return updated;
    });
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
    setTransactions(prev => {
      const updated = prev.map(t => t.id === updatedTx.id ? updatedTx : t);
      financeService.saveTransactions('main', updated);
      return updated;
    });
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
    db.delete('transactions', 'main', id);
  };

  // Clientes
  const handleImportCustomers = (newCustomers: Omit<Customer, 'id' | 'totalSpent'>[]) => {
    const formatted = newCustomers.map(c => ({
      ...c,
      id: `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      totalSpent: 0
    }));
    setCustomers(prev => [...prev, ...formatted]);
    db.upsert('customers', 'main', formatted);
  };

  const handleAddCustomer = (newCustomer: Omit<Customer, 'id' | 'totalSpent'>) => {
    const customer: Customer = {
      ...newCustomer,
      id: `cust-${Date.now()}`,
      totalSpent: 0
    };
    setCustomers(prev => [...prev, customer]);
    db.upsert('customers', 'main', customer);
  };

  // Estoque
  const processStockChange = (productId: string, quantity: number) => {
    setInventory(prev => {
      const newList = prev.map(item => 
        (item.id === productId) ? { ...item, quantity: Math.max(0, item.quantity + quantity) } : item
      );
      const updatedItem = newList.find(i => i.id === productId);
      if (updatedItem) inventoryService.updateStock('main', productId, updatedItem.quantity);
      return newList;
    });
  };

  const handleAddInventoryItem = (item: Omit<InventoryItem, 'id'> & { id?: string }) => {
    const newItem: InventoryItem = { ...item, id: item.id || `prod-${Date.now()}` };
    setInventory(prev => [...prev, newItem]);
    db.upsert('inventory', 'main', newItem);
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
    orderService.saveOrders('main', [...orders, newOrder]);
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
    setCustomers(prev => prev.map(c => c.id === order.customerId ? { ...c, totalSpent: Number(c.totalSpent) + order.total } : c));
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
    orderService.saveOrders('main', orders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
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
                     {COMPANY_INFO.name} • {COMPANY_INFO.city}-{COMPANY_INFO.state}
                   </span>
                 </>
               )}
             </div>
             
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
          
          {currentView === 'dashboard' && (
            <Dashboard 
              transactions={transactions} 
              inventory={inventory} 
              customers={customers} 
              onNavigate={setCurrentView} 
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
              onDeleteOrder={(id) => db.delete('sales_orders', 'main', id)} 
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
              onAddUser={handleAddUser} 
              onUpdateUser={handleUpdateUser} 
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
    </div>
  );
};

export default App;

