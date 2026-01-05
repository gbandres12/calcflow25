
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
  User
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
  
  // States
  const [companies, setCompanies] = useState<Company[]>(INITIAL_COMPANIES);
  const [costCenters] = useState<CostCenter[]>(INITIAL_COST_CENTERS);
  const [accounts, setAccounts] = useState<FinancialAccount[]>(INITIAL_ACCOUNTS);
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  
  const [machines, setMachines] = useState<Machine[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceRecord[]>([]);
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);

  // Carregamento Inicial do Banco de Dados
  useEffect(() => {
    const loadData = async () => {
      setSyncing(true);
      try {
        const [
          savedTxs, savedUsers, savedInv, savedCust, 
          savedCompanies, savedOrders, savedMachines, 
          savedStore, savedMaint, savedFuel
        ] = await Promise.all([
          financeService.getTransactions(),
          userService.getAll(),
          inventoryService.getInventory(),
          db.getTable('customers'),
          db.getTable('companies'),
          orderService.getOrders(),
          db.getTable('machines'),
          db.getTable('store_items'),
          db.getTable('maintenance_records'),
          db.getTable('fuel_records')
        ]);

        if (savedCompanies && savedCompanies.length > 0) {
          setCompanies(savedCompanies.map((c: any) => ({
            ...c,
            isActive: c.is_active ?? true
          })));
        }

        if (savedTxs.length > 0) {
          setTransactions(savedTxs.map((t: any) => ({
            ...t,
            amount: Number(t.amount),
            paidAmount: Number(t.paidAmount)
          })));
        }
        
        if (savedUsers.length > 0) setUsers(savedUsers);
        if (savedOrders.length > 0) setOrders(savedOrders);
        if (savedMachines.length > 0) setMachines(savedMachines);
        if (savedStore.length > 0) setStoreItems(savedStore);
        if (savedMaint.length > 0) setMaintenances(savedMaint);
        if (savedFuel.length > 0) setFuelRecords(savedFuel);

        if (savedInv.length > 0) {
          setInventory(savedInv.map((i: any) => ({
            ...i,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            minStock: Number(i.minStock)
          })));
        }

        if (savedCust.length > 0) {
          setCustomers(savedCust.map((c: any) => ({
            ...c,
            totalSpent: Number(c.totalSpent)
          })));
        }
      } catch (error) {
        console.error("Erro ao carregar dados do Supabase:", error);
      } finally {
        setSyncing(false);
      }
    };
    loadData();
  }, []);

  // Sincronização Automática para transações e pedidos
  useEffect(() => {
    if (transactions.length > 0) financeService.saveTransactions(transactions);
  }, [transactions]);

  useEffect(() => {
    if (orders.length > 0) orderService.saveOrders(orders);
  }, [orders]);

  // Derivations filtradas por filial
  const filteredInventory = useMemo(() => inventory.filter(i => i.companyId === selectedCompanyId), [inventory, selectedCompanyId]);
  const filteredTransactions = useMemo(() => transactions.filter(t => t.companyId === selectedCompanyId), [transactions, selectedCompanyId]);
  const filteredCustomers = useMemo(() => customers.filter(c => c.companyId === selectedCompanyId), [customers, selectedCompanyId]);
  const filteredAccounts = useMemo(() => accounts.filter(a => a.companyId === selectedCompanyId), [accounts, selectedCompanyId]);
  const filteredOrders = useMemo(() => orders.filter(o => o.companyId === selectedCompanyId), [orders, selectedCompanyId]);
  const filteredMachines = useMemo(() => machines.filter(m => m.companyId === selectedCompanyId), [machines, selectedCompanyId]);
  const filteredStoreItems = useMemo(() => storeItems.filter(s => s.companyId === selectedCompanyId), [storeItems, selectedCompanyId]);
  const filteredMaintenances = useMemo(() => maintenances.filter(m => m.companyId === selectedCompanyId), [maintenances, selectedCompanyId]);
  const filteredFuelRecords = useMemo(() => fuelRecords.filter(f => f.companyId === selectedCompanyId), [fuelRecords, selectedCompanyId]);
  
  const activeCompany = useMemo(() => 
    companies.find(c => c.id === selectedCompanyId) || companies[0], 
  [companies, selectedCompanyId]);

  // Handlers Frota e Pátio
  const handleAddMachine = (machineData: Omit<Machine, 'id' | 'companyId'>) => {
    const newMachine: Machine = { ...machineData, id: `mach-${Date.now()}`, companyId: selectedCompanyId };
    setMachines(prev => [...prev, newMachine]);
    db.upsert('machines', newMachine);
  };

  const handleUpdateHorimeter = (machineId: string, newHorimeter: number) => {
    setMachines(prev => prev.map(m => {
      if (m.id === machineId) {
        const updated = { ...m, currentHorimeter: newHorimeter };
        db.upsert('machines', updated);
        return updated;
      }
      return m;
    }));
  };

  const handleAddFuel = (fuelData: Omit<FuelRecord, 'id' | 'companyId'>) => {
    const newFuel: FuelRecord = { ...fuelData, id: `fuel-${Date.now()}`, companyId: selectedCompanyId };
    setFuelRecords(prev => [...prev, newFuel]);
    db.upsert('fuel_records', newFuel);
    
    // Atualiza horímetro da máquina automaticamente
    handleUpdateHorimeter(fuelData.machineId, fuelData.horimeter);

    // Lança despesa no financeiro
    handleAddTransaction({
      accountId: filteredAccounts[0]?.id || '',
      costCenterId: 'cc3',
      date: fuelData.date,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.CONFIRMADO,
      description: `Abastecimento: ${machines.find(m => m.id === fuelData.machineId)?.name || 'Máquina'}`,
      category: 'Combustível',
      amount: fuelData.totalCost,
      paidAmount: fuelData.totalCost
    });
  };

  const handleAddMaintenance = (maintData: Omit<MaintenanceRecord, 'id' | 'companyId'>) => {
    const newMaint: MaintenanceRecord = { ...maintData, id: `maint-${Date.now()}`, companyId: selectedCompanyId };
    setMaintenances(prev => [...prev, newMaint]);
    db.upsert('maintenance_records', newMaint);

    // Lança despesa no financeiro
    handleAddTransaction({
      accountId: filteredAccounts[0]?.id || '',
      costCenterId: 'cc3',
      date: maintData.date,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.CONFIRMADO,
      description: `Manutenção: ${machines.find(m => m.id === maintData.machineId)?.name || 'Máquina'}`,
      category: 'Manutenção Veículos',
      amount: maintData.cost,
      paidAmount: maintData.cost
    });
  };

  const handleAddStoreItem = (itemData: Omit<StoreItem, 'id' | 'companyId'>) => {
    const newItem: StoreItem = { ...itemData, id: `store-${Date.now()}`, companyId: selectedCompanyId };
    setStoreItems(prev => [...prev, newItem]);
    db.upsert('store_items', newItem);
  };

  const handleUpdateStoreItem = (item: StoreItem) => {
    setStoreItems(prev => prev.map(s => s.id === item.id ? item : s));
    db.upsert('store_items', item);
  };

  // Handlers Financeiros
  const handleUpdateAccount = (updatedAccount: FinancialAccount) => {
    setAccounts(prev => prev.map(acc => acc.id === updatedAccount.id ? updatedAccount : acc));
  };

  const handleAddTransaction = (newTx: Omit<Transaction, 'id' | 'companyId'>) => {
    setTransactions(prev => [...prev, { ...newTx, id: `tx-${Date.now()}-${Math.random()}`, companyId: selectedCompanyId }]);
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
    setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t));
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const handleImportCustomers = (newCustomers: Omit<Customer, 'id' | 'companyId' | 'totalSpent'>[]) => {
    const formatted = newCustomers.map(c => ({
      ...c,
      id: `cust-${Date.now()}-${Math.random()}`,
      companyId: selectedCompanyId,
      totalSpent: 0
    }));
    setCustomers(prev => [...prev, ...formatted]);
    db.upsert('customers', formatted);
  };

  const processStockChange = (productId: string, quantity: number) => {
    setInventory(prev => {
      const newList = prev.map(item => 
        (item.id === productId && item.companyId === selectedCompanyId) 
          ? { ...item, quantity: item.quantity + quantity } 
          : item
      );
      const updatedItem = newList.find(i => i.id === productId && i.companyId === selectedCompanyId);
      if (updatedItem) inventoryService.updateStock(productId, updatedItem.quantity);
      return newList;
    });
  };

  const handleAddInventoryItem = (item: Omit<InventoryItem, 'id' | 'companyId'> & { id?: string }) => {
    const newItem: InventoryItem = {
      ...item,
      id: item.id || `prod-${Date.now()}`,
      companyId: selectedCompanyId
    };
    setInventory(prev => [...prev, newItem]);
    db.upsert('inventory', newItem);
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
    const newOrder: SaleOrder = {
      ...orderData,
      id: `ord-${Date.now()}`,
      reference,
      companyId: selectedCompanyId
    };
    setOrders(prev => [...prev, newOrder]);
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
        description: `Recebimento Pedido #${order.reference} (${payment.description || 'Parcela'})`,
        category: 'Vendas Moído',
        amount: payment.amount,
        paidAmount: actualPaid,
        customerId: order.customerId,
        orderId: order.id,
        notes: `Pedido de Venda: ${order.reference}`
      });
    });
    setCustomers(prev => prev.map(c => c.id === order.customerId ? { ...c, totalSpent: Number(c.totalSpent) + order.total } : c));
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, payments, status: OrderStatus.FINALIZED } : o));
  };

  const handleUpdateOrder = (updatedOrder: SaleOrder) => {
    const originalOrder = orders.find(o => o.id === updatedOrder.id);
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    if (originalOrder && originalOrder.status === OrderStatus.BUDGET && updatedOrder.status === OrderStatus.FINALIZED) {
      finalizeSale(updatedOrder, updatedOrder.payments);
    }
  };

  if (!currentUser) {
    return <Login onLoginSuccess={setCurrentUser} />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard transactions={filteredTransactions} inventory={filteredInventory} customers={filteredCustomers} onNavigate={setCurrentView} />;
      case 'orders': return (
        <SalesOrders 
          orders={filteredOrders} 
          customers={filteredCustomers} 
          inventory={filteredInventory} 
          accounts={filteredAccounts} 
          company={activeCompany} 
          onAddOrder={handleAddOrder} 
          onUpdateOrder={handleUpdateOrder}
          onDeleteOrder={(id) => setOrders(prev => prev.filter(x => x.id !== id))}
          onFinalizeOrder={(orderId, payments) => {
            const order = orders.find(o => o.id === orderId);
            if (order) finalizeSale(order, payments);
          }} 
        />
      );
      case 'inventory': return (
        <Inventory 
          inventory={filteredInventory} 
          customers={filteredCustomers} 
          onPurchase={(q, c) => { processStockChange('britado', q); handleAddTransaction({ accountId: filteredAccounts[0]?.id || '', costCenterId: 'cc2', date: new Date().toISOString().split('T')[0], type: TransactionType.PURCHASE, status: TransactionStatus.CONFIRMADO, description: `Compra Britado (${q}T)`, category: 'Matéria Prima', amount: q * c, paidAmount: q * c }); }} 
          onSale={(q, p, c) => { handleAddOrder({ customerId: c, sellerName: 'Vendedor', date: new Date().toISOString().split('T')[0], total: q * p, subtotal: q * p, discount: 0, shipping: 0, status: OrderStatus.FINALIZED, items: [{ productId: 'moido', productCode: '001', productName: 'Calcário Moído', unit: 'TON', quantity: q, unitPrice: p, discount: 0, total: q * p }], payments: [{ id: `pay-${Date.now()}`, amount: q * p, paidAmount: q * p, date: new Date().toISOString().split('T')[0], status: TransactionStatus.CONFIRMADO, accountId: filteredAccounts[0]?.id || '', description: 'Venda à Vista' }] }); }}
          onAddProduct={handleAddInventoryItem}
        />
      );
      case 'milling': return <MillingProcess onMilling={(i, o) => { processStockChange('britado', -i); processStockChange('moido', o); }} availableBritado={filteredInventory.find(it => it.id === 'britado')?.quantity || 0} />;
      case 'accounts': return <FinancialAccounts accounts={filteredAccounts} transactions={filteredTransactions} onUpdateAccount={handleUpdateAccount} onAddTransaction={handleAddTransaction} />;
      case 'transactions': return (
        <TransactionsArea 
          transactions={filteredTransactions} 
          accounts={filteredAccounts} 
          costCenters={costCenters} 
          onAddTransaction={handleAddTransaction}
          onUpdateTransaction={handleUpdateTransaction}
          onDeleteTransaction={handleDeleteTransaction}
        />
      );
      case 'customers': return <Customers customers={filteredCustomers} onImportCustomers={handleImportCustomers} />;
      case 'cashflow': return <CashFlow transactions={filteredTransactions} />;
      case 'users': return <UserManagement users={users} companies={companies} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} />;
      case 'fleet': return (
        <FleetManagement 
          machines={filteredMachines} 
          onAddMachine={handleAddMachine} 
          onUpdateHorimeter={handleUpdateHorimeter} 
        />
      );
      case 'fuel': return (
        <FuelManagement 
          machines={filteredMachines} 
          fuelRecords={filteredFuelRecords} 
          onAddFuel={handleAddFuel} 
        />
      );
      case 'yard': return (
        <YardManagement 
          machines={filteredMachines} 
          storeItems={filteredStoreItems} 
          maintenances={filteredMaintenances} 
          onAddMaintenance={handleAddMaintenance} 
          onAddStoreItem={handleAddStoreItem} 
          onUpdateStoreItem={handleUpdateStoreItem} 
        />
      );
      default: return <Dashboard transactions={filteredTransactions} inventory={filteredInventory} customers={filteredCustomers} onNavigate={setCurrentView} />;
    }
  };

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
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Banco...</span>
                 </>
               ) : (
                 <>
                   <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Banco Conectado</span>
                 </>
               )}
             </div>
             <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl shadow-sm border">
                <div className="text-right">
                   <p className="text-[10px] font-black text-slate-800 uppercase tracking-tighter">{currentUser.name}</p>
                   <p className="text-[9px] font-bold text-purple-600 uppercase">{currentUser.role}</p>
                </div>
                <button onClick={() => setCurrentUser(null)} className="text-[10px] font-black text-rose-500 uppercase hover:underline">Sair</button>
             </div>
          </div>
          {renderView()}
        </div>
      </main>
    </div>
  );
};

export default App;
