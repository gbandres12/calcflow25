
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Customers from './components/Customers';
import CashFlow from './components/CashFlow';
import { DailyFinancialManagement } from './components/DailyFinancialManagement';
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
import { FiscalConfigView } from './components/FiscalConfigView';
import TransferManagement from './components/TransferManagement';
import Login from './components/Login';
import { OnboardingModal } from './components/OnboardingModal';
import { DatabaseStatusModal } from './components/DatabaseStatusModal';
import { Sparkles, Menu, LayoutDashboard, FileText, Scale, Package, Bell, ChevronDown, MapPin } from 'lucide-react';
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
  Category,
  Company,
  TransferShipment
} from './types';
import { 
  INITIAL_COST_CENTERS,
  COMPANY_INFO
} from './constants';
import { financeService, userService, inventoryService, orderService, db } from './services/dataService';
import { toPublicUser } from './services/authLogic';
import { newId, nextOrderReference } from './services/ids';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('calcarioflow_active_session_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleSetCurrentUser = (user: User | null) => {
    const safe = user ? toPublicUser(user) : null;
    setCurrentUser(safe);
    if (safe) {
      try {
        localStorage.setItem('calcarioflow_active_session_user', JSON.stringify(safe));
      } catch {}
    } else {
      try {
        localStorage.removeItem('calcarioflow_active_session_user');
      } catch {}
    }
  };
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [syncing, setSyncing] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showDbModal, setShowDbModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
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
  const [transfers, setTransfers] = useState<TransferShipment[]>([]);

  // Check if current user needs onboarding upon login
  useEffect(() => {
    if (currentUser && currentUser.onboardingCompleted === false) {
      setShowOnboardingModal(true);
    }
  }, [currentUser]);

  // ID isolado da empresa / tenant SaaS atual
  const activeCompanyId = currentUser?.companyId || (currentUser?.email === 'admin@calcarioflow.com.br' ? 'matriz-demo' : (currentUser ? `comp-${currentUser.id}` : 'matriz-demo'));

  const verifyCurrentUserPassword = async (password: string) => {
    if (!currentUser?.email || !password) return false;
    try {
      await userService.authenticate(currentUser.email, password);
      return true;
    } catch {
      return false;
    }
  };

  const persistCloud = (tableName: string, record: any) => {
    db.upsert(tableName, activeCompanyId, record).catch((err) => {
      console.warn('[PERSISTÊNCIA] Aviso ao sincronizar com nuvem (dado salvo localmente com segurança):', tableName, err);
    });
  };

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
          savedCategories, savedUsers, savedTransfers
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
          userService.getAll(activeCompanyId),
          db.getTable('transfers', activeCompanyId)
        ]);

        setTransactions(Array.isArray(savedTxs) ? savedTxs : []);
        setInventory(Array.isArray(savedInv) ? savedInv : []);
        setCustomers(Array.isArray(savedCust) ? savedCust.filter(c => c && typeof c === 'object') : []);
        setOrders(Array.isArray(savedOrders) ? savedOrders : []);
        setMachines(Array.isArray(savedMachines) ? savedMachines : []);
        setStoreItems(Array.isArray(savedStore) ? savedStore : []);
        setMaintenances(Array.isArray(savedMaint) ? savedMaint : []);
        setFuelRecords(Array.isArray(savedFuel) ? savedFuel : []);
        setFuelPurchases(Array.isArray(savedFuelPurchases) ? savedFuelPurchases : []);
        setAccounts(Array.isArray(savedAccounts) ? savedAccounts : []);
        setCategories(Array.isArray(savedCategories) ? savedCategories : []);
        setUsers(Array.isArray(savedUsers) ? savedUsers : []);
        setTransfers(Array.isArray(savedTransfers) ? savedTransfers.filter(t => t && typeof t === 'object') : []);

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
    const newCat: Category = { id: newId('cat'), name, type, companyId: activeCompanyId };
    setCategories(prev => [...prev, newCat]);
    persistCloud('categories', newCat);
  };

  const handleDeleteCategory = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    db.delete('categories', activeCompanyId, id);
  };

  // Handlers de Maquinário
  const handleAddMachine = (machineData: Omit<Machine, 'id'>) => {
    const newMachine: Machine = { ...machineData, id: newId('mach'), companyId: activeCompanyId };
    setMachines(prev => [...prev, newMachine]);
    persistCloud('machines', newMachine);
  };

  const handleUpdateHorimeter = (machineId: string, newHorimeter: number) => {
    setMachines(prev => prev.map(m => {
      if (m.id === machineId) {
        const updated = { ...m, currentHorimeter: newHorimeter };
        persistCloud('machines', updated);
        return updated;
      }
      return m;
    }));
  };

  // Handlers de Combustível
  const handleAddFuel = (fuelData: Omit<FuelRecord, 'id'>) => {
    const newFuel: FuelRecord = { ...fuelData, id: newId('fuel'), companyId: activeCompanyId };
    setFuelRecords(prev => [...prev, newFuel]);
    persistCloud('fuel_records', newFuel);
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
    const newPurchase: FuelPurchase = { ...purchaseData, id: newId('pur'), companyId: activeCompanyId };
    setFuelPurchases(prev => [...prev, newPurchase]);
    persistCloud('fuel_purchases', newPurchase);
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
    const newMaint: MaintenanceRecord = { ...maintData, id: newId('maint'), companyId: activeCompanyId };
    setMaintenances(prev => [...prev, newMaint]);
    persistCloud('maintenance_records', newMaint);
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
    const newItem: StoreItem = { ...itemData, id: newId('store'), companyId: activeCompanyId };
    setStoreItems(prev => [...prev, newItem]);
    persistCloud('store_items', newItem);
  };

  const handleUpdateStoreItem = (item: StoreItem) => {
    setStoreItems(prev => prev.map(s => s.id === item.id ? item : s));
    persistCloud('store_items', item);
  };

  // Transferências & Remessas (Santarém ➔ Fazenda Matriz)
  const handleAddTransfer = (transferData: Omit<TransferShipment, 'id'>) => {
    const newTransfer: TransferShipment = { ...transferData, id: newId('trf'), companyId: activeCompanyId };
    setTransfers(prev => [newTransfer, ...prev]);
    persistCloud('transfers', newTransfer);
  };

  const handleUpdateTransfer = (updated: TransferShipment) => {
    const tagged = { ...updated, companyId: updated.companyId || activeCompanyId };
    setTransfers(prev => prev.map(t => t.id === tagged.id ? tagged : t));
    persistCloud('transfers', tagged);
  };

  const handleDeleteTransfer = (id: string) => {
    setTransfers(prev => prev.filter(t => t.id !== id));
    db.delete('transfers', activeCompanyId, id).catch(() => {});
  };

  const handleIntegrateTransferredItemsWithStore = (items: { name: string; category: any; quantity: number; unit: string }[]) => {
    items.forEach(incoming => {
      setStoreItems(prev => {
        const existingIndex = prev.findIndex(s => s.name.trim().toLowerCase() === incoming.name.trim().toLowerCase());
        if (existingIndex >= 0) {
          const updated = [...prev];
          const current = updated[existingIndex];
          const updatedItem: StoreItem = {
            ...current,
            quantity: Number(current.quantity || 0) + Number(incoming.quantity || 0)
          };
          updated[existingIndex] = updatedItem;
          persistCloud('store_items', updatedItem);
          return updated;
        } else {
          const newItem: StoreItem = {
            id: newId('store'),
            name: incoming.name,
            category: incoming.category || 'Peças',
            quantity: Number(incoming.quantity || 0),
            unit: incoming.unit || 'UN',
            minStock: 2,
            companyId: activeCompanyId
          };
          persistCloud('store_items', newItem);
          return [...prev, newItem];
        }
      });
    });
  };

  // Contas Financeiras
  const handleUpdateAccount = (updatedAccount: FinancialAccount) => {
    setAccounts(prev => prev.map(acc => acc.id === updatedAccount.id ? updatedAccount : acc));
    persistCloud('financial_accounts', updatedAccount);
  };

  // Transações Financeiras
  const handleAddTransaction = (newTx: Omit<Transaction, 'id'>) => {
    const id = newId('tx');
    const tx: Transaction = {
      ...newTx,
      id,
      companyId: activeCompanyId,
      payments: (newTx.payments || []).map(payment => ({ ...payment, transactionId: id }))
    };
    setTransactions(prev => [tx, ...prev]);
    persistCloud('transactions', tx);
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
    const tagged = { ...updatedTx, companyId: updatedTx.companyId || activeCompanyId };
    setTransactions(prev => prev.map(t => t.id === tagged.id ? tagged : t));
    persistCloud('transactions', tagged);
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
    db.delete('transactions', activeCompanyId, id);
  };

  // Clientes
  const handleImportCustomers = (newCustomers: Omit<Customer, 'id' | 'totalSpent'>[]) => {
    const formatted = newCustomers.map(c => ({
      ...c,
      id: newId('cust'),
      companyId: activeCompanyId,
      totalSpent: 0
    }));
    setCustomers(prev => [...prev, ...formatted]);
    persistCloud('customers', formatted);
  };

  const handleAddCustomer = (newCustomer: Omit<Customer, 'id' | 'totalSpent'>): Customer => {
    const customer: Customer = {
      ...newCustomer,
      id: newId('cust'),
      companyId: activeCompanyId,
      totalSpent: 0
    };
    setCustomers(prev => [...prev, customer]);
    persistCloud('customers', customer);
    return customer;
  };

  const handleUpdateCustomer = (updatedCustomer: Customer) => {
    const tagged = { ...updatedCustomer, companyId: updatedCustomer.companyId || activeCompanyId };
    setCustomers(prev => prev.map(c => c.id === tagged.id ? tagged : c));
    persistCloud('customers', tagged);
  };

  const handleDeleteCustomer = (id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
    db.delete('customers', activeCompanyId, id).catch(() => {});
  };

  // Estoque
  const processStockChange = (productId: string, quantity: number) => {
    setInventory(prev => {
      const newList = prev.map(item => 
        (item.id === productId) ? { ...item, quantity: Math.max(0, item.quantity + quantity) } : item
      );
      const updatedItem = newList.find(i => i.id === productId);
      if (updatedItem) persistCloud('inventory', updatedItem);
      return newList;
    });
  };

  const handleAddInventoryItem = (item: Omit<InventoryItem, 'id'> & { id?: string }) => {
    const newItem: InventoryItem = { ...item, id: item.id || newId('prod'), companyId: activeCompanyId };
    setInventory(prev => [...prev, newItem]);
    persistCloud('inventory', newItem);
  };

  const handleUpdateInventoryItem = (item: InventoryItem) => {
    setInventory(prev => prev.map(i => i.id === item.id ? item : i));
    persistCloud('inventory', item);
  };

  const handleDeleteInventoryItem = (id: string) => {
    setInventory(prev => prev.filter(i => i.id !== id));
    db.delete('inventory', activeCompanyId, id);
  };

  // Usuários
  const handleAddUser = async (userData: Omit<User, 'id'> & { password?: string }): Promise<User> => {
    const rawPassword = (userData.password || '').trim() || '123456';
    const { password: _password, ...rest } = userData as Omit<User, 'id'> & { password?: string };
    const newUser = await userService.inviteUser({
      ...rest,
      email: (userData.email || '').trim().toLowerCase(),
      password: rawPassword,
      status: 'Ativo',
      companyId: currentUser?.companyId || activeCompanyId,
      companyName: currentUser?.companyName || 'Sua Empresa'
    });
    const publicUser = toPublicUser(newUser);
    setUsers(prev => [...prev, publicUser]);
    return publicUser;
  };

  const handleUpdateUser = (updatedUser: User) => {
    const tagged = {
      ...updatedUser,
      email: (updatedUser.email || '').trim().toLowerCase(),
      companyId: updatedUser.companyId || activeCompanyId
    };
    setUsers(prev => prev.map(u => u.id === tagged.id ? toPublicUser(tagged) : u));
    userService.saveUser(tagged);
  };

  const handleDeleteUser = async (userId: string) => {
    setUsers(prev => prev.filter(u => u.id !== userId));
    try {
      await userService.deleteUser(userId, activeCompanyId);
    } catch (error) {
      console.warn('[USUÁRIOS] Falha ao remover acesso:', error);
      const currentUsers = await userService.getAll(activeCompanyId).catch(() => []);
      if (currentUsers.length) setUsers(currentUsers.map(toPublicUser));
    }
  };

  // Pedidos e Vendas
  const handleAddOrder = (orderData: Omit<SaleOrder, 'id' | 'reference'>) => {
    const reference = nextOrderReference(orders);
    const newOrder: SaleOrder = {
      ...orderData,
      id: newId('ord'),
      reference,
      companyId: activeCompanyId,
      sellerName: orderData.sellerName || currentUser?.name || 'Vendedor'
    };
    setOrders(prev => [...prev, newOrder]);
    persistCloud('sales_orders', newOrder);
    if (newOrder.status === OrderStatus.FINALIZED) {
      finalizeSale(newOrder, newOrder.payments || []);
      (newOrder.receipts || []).forEach((receipt) => applyReceiptToFinance(receipt, newOrder));
    }
  };

  const finalizeSale = (order: SaleOrder, payments: SalePayment[]) => {
    order.items.forEach(item => processStockChange(item.productId, -item.quantity));
    const scheduledTotal = (payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const balanceWithoutSchedule = Math.max(0, Number(order.total || 0) - scheduledTotal);
    const financialSchedule: SalePayment[] = [
      ...(payments || []),
      ...(balanceWithoutSchedule > 0.01 ? [{
        id: newId('pay'),
        amount: balanceWithoutSchedule,
        paidAmount: 0,
        date: order.date,
        status: TransactionStatus.PENDENTE,
        accountId: accounts[0]?.id || 'acc-1',
        description: 'Saldo em aberto da venda'
      }] : [])
    ];

    financialSchedule.forEach(payment => {
      let actualPaid = 0;
      if (payment.status === TransactionStatus.CONFIRMADO || payment.status === TransactionStatus.PAGO) {
        actualPaid = payment.amount;
      } else if (payment.status === TransactionStatus.PARCIAL) {
        actualPaid = payment.paidAmount || 0;
      }

      const accId = payment.accountId || accounts[0]?.id || 'acc-1';
      const txId = newId('tx');
      handleAddTransaction({
        accountId: accId,
        costCenterId: 'cc4',
        date: payment.date,
        type: TransactionType.SALE,
        status: payment.status,
        description: `Venda Faturada #${order.reference}`,
        category: 'Venda Calcário Moído Granel',
        amount: payment.amount,
        paidAmount: actualPaid,
        customerId: order.customerId,
        orderId: order.id,
        payments: actualPaid > 0 ? [{
          id: newId('pmt'),
          transactionId: txId,
          amount: actualPaid,
          paymentDate: payment.date,
          accountId: accId,
          paymentMethod: payment.paymentMethod || 'PIX',
          notes: `Recebimento da venda #${order.reference}`
        }] : []
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
          persistCloud('customers', updatedCustomer);
          return updatedCustomer;
        }
        return c;
      });
      return updatedList;
    });
    const finalizedOrder = { ...order, payments: financialSchedule, status: OrderStatus.FINALIZED, companyId: order.companyId || activeCompanyId };
    setOrders(prev => {
      const exists = prev.some(o => o.id === order.id);
      return exists ? prev.map(o => o.id === order.id ? finalizedOrder : o) : [...prev, finalizedOrder];
    });
    persistCloud('sales_orders', finalizedOrder);
  };

  const applyReceiptToFinance = (receipt: PaymentReceipt, order: SaleOrder) => {
    const accId = receipt.accountId || accounts[0]?.id || 'acc-1';
    setTransactions(prev => {
      const orderTxs = prev.filter(t => t.orderId === (receipt.orderId || order.id) && t.type === TransactionType.SALE);
      const alreadyReceipt = orderTxs.some(t => t.receiptId === receipt.id);
      if (alreadyReceipt) return prev;

      let remainingReceipt = Number(receipt.amount || 0);
      const updatedTransactions = prev.map(transaction => {
        if (transaction.orderId !== (receipt.orderId || order.id) || transaction.type !== TransactionType.SALE || remainingReceipt <= 0.01) {
          return transaction;
        }

        const outstanding = Math.max(0, Number(transaction.amount || 0) - Number(transaction.paidAmount || 0));
        if (outstanding <= 0.01) return transaction;

        const appliedAmount = Math.min(outstanding, remainingReceipt);
        remainingReceipt -= appliedAmount;
        const paidAmount = Number(transaction.paidAmount || 0) + appliedAmount;
        const updated: Transaction = {
          ...transaction,
          paidAmount,
          status: paidAmount >= Number(transaction.amount || 0) - 0.01 ? TransactionStatus.PAGO : TransactionStatus.PARCIAL,
          receiptId: receipt.id,
          paymentDate: receipt.date,
          paymentMethod: receipt.paymentMethod || transaction.paymentMethod,
          payments: [
            ...(transaction.payments || []),
            {
              id: newId('pmt'),
              transactionId: transaction.id,
              amount: appliedAmount,
              paymentDate: receipt.date,
              accountId: accId,
              paymentMethod: receipt.paymentMethod || 'PIX',
              notes: receipt.notes || `Recibo #${receipt.id.slice(-6)}`
            }
          ]
        };
        persistCloud('transactions', updated);
        return updated;
      });

      if (remainingReceipt <= 0.01) return updatedTransactions;

      const tx: Transaction = {
        id: newId('tx'),
        accountId: accId,
        costCenterId: 'cc4',
        date: receipt.date,
        type: TransactionType.SALE,
        status: TransactionStatus.CONFIRMADO,
        description: `${receipt.description} - ${receipt.customerName}`,
        category: 'Venda Calcário Moído Granel',
        amount: remainingReceipt,
        paidAmount: remainingReceipt,
        customerId: receipt.customerId,
        orderId: receipt.orderId || order.id,
        receiptId: receipt.id,
        paymentMethod: receipt.paymentMethod,
        notes: receipt.notes,
        companyId: activeCompanyId,
        payments: [{
          id: newId('pmt'),
          transactionId: '',
          amount: remainingReceipt,
          paymentDate: receipt.date,
          accountId: accId,
          paymentMethod: receipt.paymentMethod || 'PIX',
          notes: receipt.notes || `Recibo #${receipt.id.slice(-6)}`
        }]
      };
      tx.payments![0].transactionId = tx.id;
      persistCloud('transactions', tx);
      return [tx, ...updatedTransactions];
    });
  };

  const handlePaymentReceived = (receipt: PaymentReceipt, updatedOrder: SaleOrder) => {
    applyReceiptToFinance(receipt, updatedOrder);
  };

  const handleDeleteOrder = (orderId: string) => {
    const order = orders.find(item => item.id === orderId);
    if (!order) return;

    if (order.nfeStatus === 'autorizada') {
      window.alert('Esta venda possui NF-e autorizada. Cancele o documento fiscal antes de excluir a venda.');
      return;
    }

    if (order.status === OrderStatus.FINALIZED) {
      order.items.forEach(item => processStockChange(item.productId, item.quantity));
      const linkedTransactions = transactions.filter(transaction => transaction.orderId === orderId);
      setTransactions(prev => prev.filter(transaction => transaction.orderId !== orderId));
      linkedTransactions.forEach(transaction => {
        db.delete('transactions', activeCompanyId, transaction.id).catch(() => {});
      });
    }
    setOrders(prev => prev.filter(o => o.id !== orderId));
    db.delete('sales_orders', activeCompanyId, orderId).catch(() => {});
  };

  const handleUpdateOrder = (updatedOrder: SaleOrder) => {
    const originalOrder = orders.find(o => o.id === updatedOrder.id);
    const tagged = { ...updatedOrder, companyId: updatedOrder.companyId || activeCompanyId };
    setOrders(prev => prev.map(o => o.id === tagged.id ? tagged : o));
    persistCloud('sales_orders', tagged);
    if (originalOrder && originalOrder.status === OrderStatus.BUDGET && tagged.status === OrderStatus.FINALIZED) {
      finalizeSale(tagged, tagged.payments || []);
      (tagged.receipts || []).forEach((receipt) => applyReceiptToFinance(receipt, tagged));
    }
  };

  // Resetar empresa para banco 100% limpo
  const handleResetCompanyDatabase = async () => {
    if (activeCompanyId !== 'matriz-demo' && activeCompanyId !== 'demo') {
      window.alert('Reset de base está bloqueado em produção para não perder pedidos reais.');
      return;
    }
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
    handleSetCurrentUser(updatedUser);
    setShowOnboardingModal(false);
    const companyId = updatedUser.companyId || activeCompanyId;

    try {
      const [savedInv, savedAccs, savedUsers] = await Promise.all([
        inventoryService.getInventory(companyId),
        db.getTable('financial_accounts', companyId),
        userService.getAll(companyId)
      ]);
      if (savedInv?.length) setInventory(savedInv);
      if (savedAccs?.length) setAccounts(savedAccs);
      if (savedUsers?.length) setUsers(savedUsers);
    } catch (e) {
      console.error("Erro ao atualizar estado pós onboarding:", e);
    }
  };

  if (!currentUser) return <Login onLoginSuccess={handleSetCurrentUser} />;

  const operatingCompany: Company = {
    id: activeCompanyId,
    name: currentUser.companyName || COMPANY_INFO.name,
    code: activeCompanyId === 'matriz-demo' ? COMPANY_INFO.code : activeCompanyId,
    document: currentUser.cnpj || COMPANY_INFO.document,
    city: currentUser.city || COMPANY_INFO.city,
    state: currentUser.state || COMPANY_INFO.state,
    phone: currentUser.phone || COMPANY_INFO.phone,
    address: COMPANY_INFO.address,
    isActive: true
  };

  const displayUsers = activeCompanyId === 'matriz-demo' 
    ? users 
    : users.filter(u => u.companyId === currentUser?.companyId || u.companyId === activeCompanyId || u.id === currentUser?.id || u.email === currentUser?.email);

  return (
    <div className="cf-app-shell min-h-screen flex flex-col lg:flex-row">
      <Sidebar 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        user={currentUser}
        onLogout={() => handleSetCurrentUser(null)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenDatabaseModal={() => setShowDbModal(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full lg:ml-[276px] p-3 sm:p-6 lg:p-8 transition-all duration-300 print:ml-0 print:p-0 min-h-screen pb-24 lg:pb-8">
        <div className="max-w-[1440px] mx-auto print:max-w-none">
          {/* Topbar com suporte Mobile e Desktop */}
          <header className="cf-topbar print:hidden">
            <div className="flex items-center min-w-0 gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 bg-white border border-[#DDE6DE] rounded-lg text-[#36574E] hover:bg-[#ECF1EB] lg:hidden flex items-center justify-center"
                title="Abrir Menu Lateral"
              >
                <Menu size={18} />
              </button>
              <span className="cf-topbar-company" title={currentUser.companyName || COMPANY_INFO.name}>
                {syncing ? 'Sincronizando dados…' : (currentUser.companyName || COMPANY_INFO.name)}
              </span>
            </div>

            <div className="cf-topbar-actions">
              <div className="cf-topbar-pill hidden sm:inline-flex">
                <MapPin size={14} className="text-[#0F5948]" />
                <span>{activeCompanyId === 'matriz-demo' ? 'Unidade Matriz' : 'Unidade ativa'}</span>
                <ChevronDown size={13} />
              </div>

              {currentUser.onboardingCompleted === false && (
                <button
                  onClick={() => setShowOnboardingModal(true)}
                  className="cf-topbar-pill hidden md:inline-flex text-[#80611D] bg-[#FAF1D9] border-[#EAD9A8]"
                >
                  <Sparkles size={13} />
                  <span>Completar setup</span>
                </button>
              )}

              <div className="cf-topbar-divider hidden sm:block" />
              <button className="cf-topbar-pill hidden sm:inline-flex" title="Notificações" aria-label="Notificações">
                <Bell size={15} className="text-[#36574E]" />
              </button>

              <div className="cf-user-chip">
                <div className="cf-user-avatar">{currentUser.name.split(' (')[0].split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
                <div className="cf-user-meta hidden sm:block">
                  <strong>{currentUser.name.split(' (')[0]}</strong>
                  <span>{currentUser.role}</span>
                </div>
                <button
                  onClick={() => handleSetCurrentUser(null)}
                  className="p-2 text-[#36574E] hover:text-[#0F5948]"
                  title="Sair"
                  aria-label="Sair"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          </header>
          
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
          {(currentView === 'orders' || currentView === 'quotes') && (
            <SalesOrders 
              orders={orders} 
              customers={customers} 
              inventory={inventory} 
              accounts={accounts} 
              company={operatingCompany}
              companyId={activeCompanyId}
              onAddOrder={handleAddOrder} 
              onAddCustomer={handleAddCustomer}
              onUpdateOrder={handleUpdateOrder} 
              onDeleteOrder={handleDeleteOrder}
              onVerifyDeletionPassword={verifyCurrentUserPassword}
              onFinalizeOrder={(oid, p) => {
                const order = orders.find(o => o.id === oid);
                if (order) finalizeSale(order, p);
              }} 
              onPaymentReceived={handlePaymentReceived}
              mode={currentView === 'quotes' ? 'quotes' : 'orders'}
            />
          )}
          {currentView === 'fiscal' && (
            <FiscalManagement 
              orders={orders} 
              customers={customers} 
              company={operatingCompany}
              companyId={activeCompanyId}
              onUpdateOrder={handleUpdateOrder} 
              onNavigate={setCurrentView}
            />
          )}
          {currentView === 'fiscal_config' && (
            <FiscalConfigView 
              company={operatingCompany}
              companyId={activeCompanyId}
              onNavigate={setCurrentView}
            />
          )}
          {currentView === 'inventory' && (
            <Inventory 
              inventory={inventory} 
              customers={customers} 
              onPurchase={(q, c, details) => {
                const total = q * c;
                const paidAmount = Math.min(total, Number(details.initialPayment || 0));
                const status = paidAmount >= total - 0.01
                  ? TransactionStatus.PAGO
                  : paidAmount > 0
                    ? TransactionStatus.PARCIAL
                    : TransactionStatus.PENDENTE;
                const date = new Date().toISOString().split('T')[0];
                processStockChange('britado', q); 
                handleAddTransaction({ 
                  accountId: accounts[0]?.id || 'acc-1', 
                  costCenterId: 'cc2',
                  date,
                  dueDate: details.dueDate,
                  paymentDate: paidAmount > 0 ? date : undefined,
                  type: TransactionType.PURCHASE, 
                  status,
                  description: `Compra Minério Bruto / Brita (${q}T)`, 
                  category: 'Compra de Brita / Minério Bruto', 
                  amount: total,
                  paidAmount,
                  contactName: details.supplier,
                  paymentMethod: details.paymentMethod,
                  notes: details.notes,
                  payments: paidAmount > 0 ? [{
                    id: newId('pmt'),
                    transactionId: '',
                    amount: paidAmount,
                    paymentDate: date,
                    accountId: accounts[0]?.id || 'acc-1',
                    paymentMethod: details.paymentMethod,
                    notes: 'Entrada registrada na compra'
                  }] : []
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
              onUpdateProduct={handleUpdateInventoryItem}
              onDeleteProduct={handleDeleteInventoryItem}
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
              onVerifyPassword={verifyCurrentUserPassword}
            />
          )}
          {currentView === 'transactions' && (
            <TransactionsArea 
              transactions={transactions} 
              accounts={accounts} 
              costCenters={costCenters} 
              categories={categories} 
              company={operatingCompany}
              customers={customers}
              onAddTransaction={handleAddTransaction} 
              onUpdateTransaction={handleUpdateTransaction} 
              onDeleteTransaction={handleDeleteTransaction} 
              onVerifyDeletionPassword={verifyCurrentUserPassword}
            />
          )}
          {currentView === 'customers' && (
            <Customers 
              customers={customers} 
              orders={orders}
              transactions={transactions}
              onImportCustomers={handleImportCustomers} 
              onAddCustomer={handleAddCustomer} 
              onUpdateCustomer={handleUpdateCustomer}
              onDeleteCustomer={handleDeleteCustomer}
            />
          )}
          {currentView === 'cashflow' && (
            <CashFlow 
              transactions={transactions} 
              categories={categories} 
            />
          )}
          {currentView === 'daily' && (
            <DailyFinancialManagement 
              transactions={transactions} 
              accounts={accounts} 
              customers={customers}
              orders={orders}
              company={operatingCompany}
              onAddTransaction={handleAddTransaction} 
              onUpdateTransaction={handleUpdateTransaction} 
              onDeleteTransaction={handleDeleteTransaction} 
              onVerifyDeletionPassword={verifyCurrentUserPassword}
            />
          )}
          {currentView === 'users' && (
            <UserManagement 
              users={displayUsers} 
              currentUser={currentUser}
              onAddUser={handleAddUser} 
              onUpdateUser={handleUpdateUser} 
              onDeleteUser={handleDeleteUser}
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
              orders={orders}
              customers={customers}
              company={operatingCompany}
              onAddMaintenance={handleAddMaintenance} 
              onAddStoreItem={handleAddStoreItem} 
              onUpdateStoreItem={handleUpdateStoreItem} 
              onUpdateOrder={handleUpdateOrder}
            />
          )}
          {currentView === 'transfers' && (
            <TransferManagement 
              transfers={transfers}
              storeItems={storeItems}
              company={operatingCompany}
              currentUser={currentUser || undefined}
              onAddTransfer={handleAddTransfer}
              onUpdateTransfer={handleUpdateTransfer}
              onDeleteTransfer={handleDeleteTransfer}
              onIntegrateWithStoreItems={handleIntegrateTransferredItemsWithStore}
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

      {/* Barra de Navegação Inferior Rápida para Celular (PWA / Mobile) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0F5948] border-t border-[#1B6B58] px-2 py-2 flex items-center justify-around z-40 print:hidden shadow-2xl">
        <button
          onClick={() => setCurrentView('dashboard')}
          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
            currentView === 'dashboard' ? 'text-[#F1D67A] font-bold' : 'text-[#D5E3DC] hover:text-white'
          }`}
        >
          <LayoutDashboard size={18} />
          <span className="text-[10px] tracking-tight">Início</span>
        </button>

        <button
          onClick={() => setCurrentView('orders')}
          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
            currentView === 'orders' ? 'text-[#F1D67A] font-bold' : 'text-[#D5E3DC] hover:text-white'
          }`}
        >
          <FileText size={18} />
          <span className="text-[10px] tracking-tight">Vendas</span>
        </button>

        <button
          onClick={() => setCurrentView('yard')}
          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
            currentView === 'yard' ? 'text-[#F1D67A] font-bold' : 'text-[#D5E3DC] hover:text-white'
          }`}
        >
          <Scale size={18} />
          <span className="text-[10px] tracking-tight">Balança</span>
        </button>

        <button
          onClick={() => setCurrentView('inventory')}
          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
            currentView === 'inventory' ? 'text-[#F1D67A] font-bold' : 'text-[#D5E3DC] hover:text-white'
          }`}
        >
          <Package size={18} />
          <span className="text-[10px] tracking-tight">Estoque</span>
        </button>

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-1 p-1.5 rounded-xl text-[#D5E3DC] hover:text-white"
        >
          <Menu size={18} />
          <span className="text-[10px] tracking-tight">Menu</span>
        </button>
      </div>

      {/* Assistente de Onboarding / Setup Inicial */}
      {showOnboardingModal && currentUser && (
        <OnboardingModal
          user={currentUser}
          onComplete={handleCompleteOnboarding}
          onClose={() => setShowOnboardingModal(false)}
        />
      )}

      {/* Modal de Diagnóstico e Configuração do Supabase */}
      <DatabaseStatusModal
        isOpen={showDbModal}
        onClose={() => setShowDbModal(false)}
      />
    </div>
  );
};

export default App;
