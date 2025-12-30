
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
import { financeService, userService } from './services/dataService';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(INITIAL_COMPANIES[0].id);
  
  // States
  const [companies] = useState<Company[]>(INITIAL_COMPANIES);
  const [costCenters] = useState<CostCenter[]>(INITIAL_COST_CENTERS);
  const [accounts, setAccounts] = useState<FinancialAccount[]>(INITIAL_ACCOUNTS);
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  
  const [machines, setMachines] = useState<Machine[]>([
    { id: 'm1', companyId: 'c1', name: 'Britador Primário', type: 'Britador', plateOrId: 'B-01', currentHorimeter: 1250.5, status: 'Operacional' },
    { id: 'm2', companyId: 'c1', name: 'Pá Carregadeira Volvo', type: 'Pá Carregadeira', plateOrId: 'PC-23', currentHorimeter: 4500.0, status: 'Operacional' }
  ]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([
    { id: 's1', companyId: 'c1', name: 'Graxa de Alta Temperatura', category: 'Lubrificantes', quantity: 15, unit: 'KG', minStock: 5 },
    { id: 's2', companyId: 'c1', name: 'Correia Transportadora 3/4', category: 'Peças', quantity: 2, unit: 'UN', minStock: 1 }
  ]);
  const [maintenances, setMaintenances] = useState<MaintenanceRecord[]>([]);
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);

  // Carregamento Inicial (Simulando busca no DB)
  useEffect(() => {
    const loadData = async () => {
      const savedTxs = await financeService.getTransactions();
      if (savedTxs.length > 0) setTransactions(savedTxs);
      
      const savedUsers = await userService.getAll();
      if (savedUsers.length > 0) setUsers(savedUsers);
    };
    loadData();
  }, []);

  // Sincronização Automática (Exemplo para Transações)
  useEffect(() => {
    if (transactions.length > 0) {
      financeService.saveTransactions(transactions);
    }
  }, [transactions]);

  // Derivations
  const filteredInventory = useMemo(() => inventory.filter(i => i.companyId === selectedCompanyId), [inventory, selectedCompanyId]);
  const filteredTransactions = useMemo(() => transactions.filter(t => t.companyId === selectedCompanyId), [transactions, selectedCompanyId]);
  const filteredCustomers = useMemo(() => customers.filter(c => c.companyId === selectedCompanyId), [customers, selectedCompanyId]);
  const filteredAccounts = useMemo(() => accounts.filter(a => a.companyId === selectedCompanyId), [accounts, selectedCompanyId]);
  const filteredOrders = useMemo(() => orders.filter(o => o.companyId === selectedCompanyId), [orders, selectedCompanyId]);
  const filteredMachines = useMemo(() => machines.filter(m => m.companyId === selectedCompanyId), [machines, selectedCompanyId]);
  const filteredStoreItems = useMemo(() => storeItems.filter(s => s.companyId === selectedCompanyId), [storeItems, selectedCompanyId]);
  const activeCompany = useMemo(() => companies.find(c => c.id === selectedCompanyId)!, [companies, selectedCompanyId]);

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
  };

  const processStockChange = (productId: string, quantity: number) => {
    setInventory(prev => prev.map(item => 
      (item.id === productId && item.companyId === selectedCompanyId) 
        ? { ...item, quantity: item.quantity + quantity } 
        : item
    ));
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

    if (newOrder.status === OrderStatus.FINALIZED) {
      finalizeSale(newOrder, [{
        id: `pay-${Date.now()}`,
        amount: newOrder.total,
        date: newOrder.date,
        status: TransactionStatus.CONFIRMADO,
        accountId: filteredAccounts[0].id,
        description: 'Recebimento à vista'
      }]);
    }
  };

  const finalizeSale = (order: SaleOrder, payments: SalePayment[]) => {
    order.items.forEach(item => processStockChange(item.productId, -item.quantity));

    payments.forEach(payment => {
      handleAddTransaction({
        accountId: payment.accountId,
        costCenterId: 'cc4',
        date: payment.date,
        type: TransactionType.SALE,
        status: payment.status,
        description: `Recebimento Pedido #${order.reference}`,
        category: 'Vendas Moído',
        amount: payment.amount,
        paidAmount: (payment.status === TransactionStatus.CONFIRMADO || payment.status === TransactionStatus.PAGO) ? payment.amount : 0,
        customerId: order.customerId,
        orderId: order.id,
        notes: payment.description
      });
    });

    setCustomers(prev => prev.map(c => 
      c.id === order.customerId ? { ...c, totalSpent: c.totalSpent + order.total } : c
    ));

    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, payments, status: OrderStatus.FINALIZED } : o));
  };

  // Fleet/Yard/Fuel Handlers
  const handleAddMachine = (machine: Omit<Machine, 'id' | 'companyId'>) => {
    setMachines(prev => [...prev, { ...machine, id: `m-${Date.now()}`, companyId: selectedCompanyId }]);
  };

  const handleUpdateHorimeter = (machineId: string, newHorimeter: number) => {
    setMachines(prev => prev.map(m => m.id === machineId ? { ...m, currentHorimeter: newHorimeter } : m));
  };

  const handleAddMaintenance = (record: Omit<MaintenanceRecord, 'id' | 'companyId'>) => {
    setMaintenances(prev => [...prev, { ...record, id: `mnt-${Date.now()}`, companyId: selectedCompanyId }]);
    handleAddTransaction({
      accountId: filteredAccounts[0].id,
      costCenterId: 'cc3',
      date: record.date,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.CONFIRMADO,
      description: `Manutenção: ${record.description}`,
      category: 'Manutenção de Frota',
      amount: record.cost,
      paidAmount: record.cost
    });
  };

  const handleAddFuel = (record: Omit<FuelRecord, 'id' | 'companyId'>) => {
    setFuelRecords(prev => [...prev, { ...record, id: `fuel-${Date.now()}`, companyId: selectedCompanyId }]);
    handleUpdateHorimeter(record.machineId, record.horimeter);
    handleAddTransaction({
      accountId: filteredAccounts[0].id,
      costCenterId: 'cc3',
      date: record.date,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.CONFIRMADO,
      description: `Abastecimento Máquina ID ${record.machineId}`,
      category: 'Combustível',
      amount: record.totalCost,
      paidAmount: record.totalCost
    });
  };

  const handleUpdateStoreItem = (item: StoreItem) => {
    setStoreItems(prev => prev.map(s => s.id === item.id ? item : s));
  };

  const handleAddStoreItem = (item: Omit<StoreItem, 'id' | 'companyId'>) => {
    setStoreItems(prev => [...prev, { ...item, id: `s-${Date.now()}`, companyId: selectedCompanyId }]);
  };

  // User Handlers
  const handleAddUser = (userData: Omit<User, 'id'>) => {
    const newUser = { ...userData, id: `u-${Date.now()}` };
    setUsers(prev => [...prev, newUser]);
    userService.sync([...users, newUser]);
  };

  const handleUpdateUser = (updatedUser: User) => {
    const updatedList = users.map(u => u.id === updatedUser.id ? updatedUser : u);
    setUsers(updatedList);
    userService.sync(updatedList);
  };

  if (!currentUser) {
    return <Login onLoginSuccess={setCurrentUser} />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard transactions={filteredTransactions} inventory={filteredInventory} customers={filteredCustomers} />;
      case 'orders': return (
        <SalesOrders 
          orders={filteredOrders} 
          customers={filteredCustomers} 
          inventory={filteredInventory} 
          accounts={filteredAccounts} 
          company={activeCompany} 
          onAddOrder={handleAddOrder} 
          onUpdateOrder={(o) => setOrders(prev => prev.map(x => x.id === o.id ? o : x))}
          onDeleteOrder={(id) => setOrders(prev => prev.filter(x => x.id !== id))}
          onFinalizeOrder={(orderId, payments) => {
            const order = orders.find(o => o.id === orderId);
            if (order) finalizeSale(order, payments);
          }} 
        />
      );
      case 'inventory': return <Inventory inventory={filteredInventory} customers={filteredCustomers} onPurchase={(q, c) => { processStockChange('britado', q); handleAddTransaction({ accountId: filteredAccounts[0].id, costCenterId: 'cc2', date: new Date().toISOString().split('T')[0], type: TransactionType.PURCHASE, status: TransactionStatus.CONFIRMADO, description: `Compra Britado (${q}T)`, category: 'Matéria Prima', amount: q * c, paidAmount: q * c }); }} onSale={(q, p, c) => { handleAddOrder({ customerId: c, sellerName: 'Vendedor', date: new Date().toISOString().split('T')[0], total: q * p, subtotal: q * p, discount: 0, shipping: 0, status: OrderStatus.FINALIZED, items: [{ productId: 'moido', productCode: '001', productName: 'Calcário Moído', unit: 'TON', quantity: q, unitPrice: p, discount: 0, total: q * p }], payments: [] }); }} />;
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
      case 'fleet': return <FleetManagement machines={filteredMachines} onAddMachine={handleAddMachine} onUpdateHorimeter={handleUpdateHorimeter} />;
      case 'yard': return <YardManagement machines={filteredMachines} storeItems={filteredStoreItems} maintenances={maintenances.filter(m => m.companyId === selectedCompanyId)} onAddMaintenance={handleAddMaintenance} onAddStoreItem={handleAddStoreItem} onUpdateStoreItem={handleUpdateStoreItem} />;
      case 'fuel': return <FuelManagement machines={filteredMachines} fuelRecords={fuelRecords.filter(f => f.companyId === selectedCompanyId)} onAddFuel={handleAddFuel} />;
      case 'users': return <UserManagement users={users} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} />;
      default: return <Dashboard transactions={filteredTransactions} inventory={filteredInventory} customers={filteredCustomers} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} />
      <main className="flex-1 ml-64 p-8 transition-all duration-300 print:ml-0 print:p-0">
        <div className="max-w-7xl mx-auto pb-20 print:max-w-none">
          <div className="flex justify-end mb-4 print:hidden">
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
