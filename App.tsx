
import React, { useState, useEffect, useRef } from 'react';
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
import Transportadores from './components/Transportadores';
import ErrorBoundary from './components/ErrorBoundary';
import TransfersPage from './components/TransfersPage';
import Login from './components/Login';
import { OnboardingModal } from './components/OnboardingModal';
import { DatabaseStatusModal } from './components/DatabaseStatusModal';
import { Sparkles, Menu, LayoutDashboard, FileText, Scale, Package, Bell, ChevronDown, MapPin, ArrowRightLeft, FileCheck, Search } from 'lucide-react';
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
  TransferShipment,
  Transportador,
  UserRole,
  CompanyMembership
} from './types';
import {
  INITIAL_COST_CENTERS,
  COMPANY_INFO
} from './constants';
import { financeService, userService, inventoryService, orderService, db, isDemoCompany, waitForAuthUser, listMyMemberships } from './services/dataService';
import { mergeRecordsByUpdatedAt } from './services/persistSeed';
import { toPublicUser, isDemoEmail, visibleCompanyUsers } from './services/authLogic';
import { newId, nextAvulsaReference, nextOrderReference } from './services/ids';
import { hasAuthorizedFiscalDocument, isFiscalOnlyOrder, hasCancelledNfe, cancelledNfeAmountKeys } from './services/saleNfe';
import { applyStoreIntegration, StoreIntegrationIncoming } from './services/storeItemMatch';
import CompanyBranches from './components/CompanyBranches';
import SetNewPassword from './components/SetNewPassword';
import Loadings from './components/Loadings';
import CommandPalette from './components/CommandPalette';
import { isViewAllowed } from './services/viewAccess';
import { useToast } from './components/ui/Toast';
import { useConfirm } from './components/ui/ConfirmDialog';
import { getSupabase, initialAuthRedirect } from './services/supabaseClient';

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
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [syncing, setSyncing] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showDbModal, setShowDbModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Link "Esqueci minha senha" do e-mail: antes, ele só logava a pessoa sem
  // nunca pedir a senha nova. Agora prende a tela até ela definir uma.
  const [passwordRecovery, setPasswordRecovery] = useState(initialAuthRedirect.type === 'recovery');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Ctrl+K / Cmd+K abre a busca de qualquer tela.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const authLinkError = initialAuthRedirect.error
    ? 'O link do e-mail expirou ou já foi usado. Peça um novo em "Esqueci minha senha".'
    : undefined;

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  
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
  const [transportadores, setTransportadores] = useState<Transportador[]>([]);

  // Check if current user needs onboarding upon login
  useEffect(() => {
    if (currentUser && currentUser.onboardingCompleted === false) {
      setShowOnboardingModal(true);
    }
  }, [currentUser]);

  // ID isolado da empresa / tenant SaaS atual — a empresa "de login" continua
  // sendo a mesma de sempre; selectedCompanyId só existe quando o usuário
  // troca pra outra empresa (matriz/filial) no seletor do topo.
  const defaultCompanyId = currentUser?.companyId || (currentUser?.email === 'admin@calcarioflow.com.br' ? 'matriz-demo' : (currentUser ? `comp-${currentUser.id}` : 'matriz-demo'));
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<CompanyMembership[]>([]);
  const [companySwitcherOpen, setCompanySwitcherOpen] = useState(false);
  const activeCompanyId = (selectedCompanyId && memberships.some((m) => m.companyId === selectedCompanyId))
    ? selectedCompanyId
    : defaultCompanyId;
  const activeMembership = memberships.find((m) => m.companyId === activeCompanyId) || null;

  const verifyCurrentUserPassword = async (password: string) => {
    if (!currentUser?.email || !password) return false;
    try {
      await userService.authenticate(currentUser.email, password);
      return true;
    } catch {
      return false;
    }
  };

  const dataEpochRef = useRef(0);
  const loadedCompanyRef = useRef<string | null>(null);
  const localDeletedIdsRef = useRef<Set<string>>(new Set());

  const markLocalDelete = (tableName: string, id: string) => {
    dataEpochRef.current += 1;
    localDeletedIdsRef.current.add(`${tableName}:${String(id)}`);
  };

  const dropLocalDeletes = (tableName: string, rows: any[]) =>
    (Array.isArray(rows) ? rows : []).filter(
      (row) => row?.id && !localDeletedIdsRef.current.has(`${tableName}:${String(row.id)}`)
    );

  const stampUpdatedAt = (record: any) => {
    const now = new Date().toISOString();
    const one = (row: any) => {
      if (!row || typeof row !== 'object') return row;
      row.updatedAt = now;
      return row;
    };
    if (Array.isArray(record)) {
      record.forEach(one);
      return record;
    }
    return one(record);
  };

  // onResult é opcional e não muda o tipo de retorno (continua Promise<void>,
  // então quem já chama `persistCloud(...)` sem aguardar não muda em nada).
  // Serve pra quem precisa saber se a gravação realmente confirmou no Supabase
  // (ex: finalizeSale) sem depender de exceção — o catch abaixo nunca rejeita
  // a menos que options.required seja passado.
  const persistCloud = (
    tableName: string,
    record: any,
    options?: { required?: boolean; onResult?: (result: { ok: boolean; error?: string }) => void }
  ): Promise<void> => {
    dataEpochRef.current += 1;
    return db.upsert(tableName, activeCompanyId, stampUpdatedAt(record))
      .then(() => {
        const state = db.getSyncState(activeCompanyId);
        setPendingSyncCount(state.pendingCount);
        setPersistError(state.lastError);
        options?.onResult?.({ ok: true });
      })
      .catch((err) => {
        const state = db.getSyncState(activeCompanyId);
        setPendingSyncCount(state.pendingCount);
        const message = err?.message || `Não foi possível gravar ${tableName} no Supabase.`;
        setPersistError(message);
        console.warn('[PERSISTÊNCIA] Gravação no banco falhou; o registro ficou na fila local para reenvio:', tableName, err);
        options?.onResult?.({ ok: false, error: message });
        if (options?.required) throw err;
      });
  };

  const persistDelete = (tableName: string, id: string) => {
    markLocalDelete(tableName, id);
    db.delete(tableName, activeCompanyId, id)
      .then(() => {
        const state = db.getSyncState(activeCompanyId);
        setPendingSyncCount(state.pendingCount);
        setPersistError(state.lastError);
      })
      .catch((err) => {
        const state = db.getSyncState(activeCompanyId);
        setPendingSyncCount(state.pendingCount);
        setPersistError(err?.message || `Não foi possível excluir ${tableName} no Supabase.`);
      });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sessionUser = await userService.getCurrentSessionUser();
      if (cancelled) return;
      if (sessionUser) {
        handleSetCurrentUser(sessionUser);
        return;
      }
      if (currentUser && !isDemoCompany(currentUser.companyId) && !isDemoEmail(currentUser.email || '')) {
        handleSetCurrentUser(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Empresas (matriz + filiais delegadas) do usuário logado, pro seletor do
  // topo. Roda por usuário, não por activeCompanyId — senão trocar de
  // empresa recarregaria a própria lista de empresas.
  useEffect(() => {
    if (!currentUser?.id) {
      setMemberships([]);
      setSelectedCompanyId(null);
      return;
    }
    let cancelled = false;
    listMyMemberships(currentUser.id).then((rows) => {
      if (!cancelled) setMemberships(rows);
    });
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // Carregamento de dados unificado com auto-seed
  useEffect(() => {
    if (!currentUser) return;

    if (loadedCompanyRef.current && loadedCompanyRef.current !== activeCompanyId) {
      dataEpochRef.current += 1;
      localDeletedIdsRef.current.clear();
      setTransactions([]);
      setInventory([]);
      setCustomers([]);
      setOrders([]);
      setMachines([]);
      setStoreItems([]);
      setMaintenances([]);
      setFuelRecords([]);
      setFuelPurchases([]);
      setAccounts([]);
      setCategories([]);
      setUsers([]);
      setTransfers([]);
      setTransportadores([]);
    }
    loadedCompanyRef.current = activeCompanyId;

    const adoptFetched = <T,>(tableName: string, incoming: any, prev: T[]): T[] =>
      mergeRecordsByUpdatedAt(
        dropLocalDeletes(tableName, incoming),
        dropLocalDeletes(tableName, prev as any[])
      ) as T[];

    const loadAllData = async () => {
      const epoch = dataEpochRef.current;
      setSyncing(true);
      try {
        if (!isDemoCompany(activeCompanyId)) {
          await waitForAuthUser(2500);
        }

        const fetchAll = () => Promise.all([
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
          db.getTable('transfers', activeCompanyId),
          db.getTable('transportadores', activeCompanyId)
        ]);

        let bundle = await fetchAll();
        if (!isDemoCompany(activeCompanyId) && Array.isArray(bundle[3]) && bundle[3].length === 0) {
          await waitForAuthUser(1500);
          bundle = await fetchAll();
        }

        const [
          savedTxs, savedInv, savedCust, 
          savedOrders, savedMachines, savedStore, 
          savedMaint, savedFuel, savedFuelPurchases, savedAccounts,
          savedCategories, savedUsers, savedTransfers, savedTransportadores
        ] = bundle;

        if (epoch !== dataEpochRef.current) return;

        const normalizeCustomers = (rows: any[]): Customer[] =>
          (Array.isArray(rows) ? rows : [])
            .filter((c): c is Customer => Boolean(c && typeof c === 'object' && (c as Customer).id))
            .map(c => ({
              ...c,
              id: String(c.id),
              name: String(c.name || 'Cliente sem nome'),
              document: String(c.document ?? ''),
              email: String(c.email ?? ''),
              phone: String(c.phone ?? ''),
              totalSpent: Number(c.totalSpent) || 0
            }));

        setTransactions((prev) => adoptFetched('transactions', savedTxs, prev));
        setInventory((prev) => adoptFetched('inventory', savedInv, prev));
        setCustomers((prev) => adoptFetched('customers', normalizeCustomers(savedCust), prev));
        setOrders((prev) => adoptFetched('sales_orders', savedOrders, prev));
        setMachines((prev) => adoptFetched('machines', savedMachines, prev));
        setStoreItems((prev) => adoptFetched('store_items', savedStore, prev));
        setMaintenances((prev) => adoptFetched('maintenance_records', savedMaint, prev));
        setFuelRecords((prev) => adoptFetched('fuel_records', savedFuel, prev));
        setFuelPurchases((prev) => adoptFetched('fuel_purchases', savedFuelPurchases, prev));
        setAccounts((prev) => adoptFetched('financial_accounts', savedAccounts, prev));
        setCategories((prev) => adoptFetched('categories', savedCategories, prev));
        setUsers((prev) => adoptFetched('users', savedUsers, prev));
        setTransfers((prev) => adoptFetched(
          'transfers',
          Array.isArray(savedTransfers) ? savedTransfers.filter((t: any) => t && typeof t === 'object') : [],
          prev
        ));
        setTransportadores((prev) => adoptFetched(
          'transportadores',
          Array.isArray(savedTransportadores) ? savedTransportadores.filter((t: any) => t && typeof t === 'object' && t.id) : [],
          prev
        ));

        db.flushAllPending().catch((err) => {
          console.warn('[PERSISTÊNCIA] Reenvio da fila para o Supabase falhou:', err);
        }).finally(() => {
          const state = db.getSyncState(activeCompanyId);
          setPendingSyncCount(state.pendingCount);
          setPersistError(state.lastError);
        });

      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      } finally {
        setSyncing(false);
      }
    };

    loadAllData();

    const refreshOnFocus = () => { void loadAllData(); };
    const flushQueue = () => {
      db.flushAllPending()
        .then(() => {
          const state = db.getSyncState(activeCompanyId);
          setPendingSyncCount(state.pendingCount);
          setPersistError(state.lastError);
        })
        .catch((err) => setPersistError(err?.message || 'Falha ao reenviar a fila.'));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') flushQueue();
    };
    // O intervalo só reenvia a fila. Recarregar as 14 tabelas a cada 60s apagava cadastro novo.
    const refreshTimer = window.setInterval(flushQueue, 60_000);
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('online', flushQueue);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('online', flushQueue);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser, activeCompanyId]);

  // Handlers para Categorias
  const handleAddCategory = (name: string, type: 'INFLOW' | 'OUTFLOW') => {
    const newCat: Category = { id: newId('cat'), name, type, companyId: activeCompanyId };
    setCategories(prev => [...prev, newCat]);
    persistCloud('categories', newCat);
  };

  const handleDeleteCategory = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    persistDelete('categories', id);
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
    persistDelete('transfers', id);
  };

  const handleIntegrateTransferredItemsWithStore = (items: StoreIntegrationIncoming[]) => {
    items.forEach(incoming => {
      setStoreItems(prev => {
        const { items: next, touched } = applyStoreIntegration(
          prev,
          incoming,
          newId('store'),
          activeCompanyId
        );
        persistCloud('store_items', touched);
        return next;
      });
    });
  };

  // Contas Financeiras
  const handleUpdateAccount = (updatedAccount: FinancialAccount) => {
    setAccounts(prev => prev.map(acc => acc.id === updatedAccount.id ? updatedAccount : acc));
    persistCloud('financial_accounts', updatedAccount);
  };

  // Transações Financeiras
  const handleAddTransaction = (
    newTx: Omit<Transaction, 'id'>,
    options?: { onResult?: (result: { ok: boolean; error?: string }) => void }
  ): Promise<void> => {
    const id = newId('tx');
    const tx: Transaction = {
      ...newTx,
      id,
      companyId: activeCompanyId,
      payments: (newTx.payments || []).map(payment => ({ ...payment, transactionId: id }))
    };
    setTransactions(prev => [tx, ...prev]);
    return persistCloud('transactions', tx, options);
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
    const tagged = { ...updatedTx, companyId: updatedTx.companyId || activeCompanyId };
    setTransactions(prev => prev.map(t => t.id === tagged.id ? tagged : t));
    persistCloud('transactions', tagged);
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
    persistDelete('transactions', id);
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
    persistDelete('customers', id);
  };

  // Transportadores / caminhoneiros
  const handleAddTransportador = (
    data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>
  ): Transportador => {
    const now = new Date().toISOString();
    const transportador: Transportador = {
      ...data,
      id: newId('transp'),
      companyId: activeCompanyId,
      createdAt: now,
      updatedAt: now
    };
    setTransportadores(prev => [...prev, transportador]);
    persistCloud('transportadores', transportador);
    return transportador;
  };

  const handleUpdateTransportador = (updated: Transportador) => {
    const tagged: Transportador = {
      ...updated,
      companyId: updated.companyId || activeCompanyId,
      updatedAt: new Date().toISOString()
    };
    setTransportadores(prev => prev.map(item => item.id === tagged.id ? tagged : item));
    persistCloud('transportadores', tagged);
  };

  const handleDeleteTransportador = (id: string) => {
    setTransportadores(prev => prev.filter(item => item.id !== id));
    persistDelete('transportadores', id);
  };

  // Estoque
  const processStockChange = (
    productId: string,
    quantity: number,
    options?: { onResult?: (result: { ok: boolean; error?: string }) => void }
  ): Promise<void> => {
    let pending: Promise<void> = Promise.resolve();
    setInventory(prev => {
      const newList = prev.map(item =>
        (item.id === productId) ? { ...item, quantity: Math.max(0, item.quantity + quantity) } : item
      );
      const updatedItem = newList.find(i => i.id === productId);
      if (updatedItem) pending = persistCloud('inventory', updatedItem, options);
      return newList;
    });
    return pending;
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
    persistDelete('inventory', id);
  };

  // Usuários
  const handleAddUser = async (userData: Omit<User, 'id'> & { password?: string }): Promise<User> => {
    const rawPassword = (userData.password || '').trim();
    if (rawPassword.length < 6) {
      throw new Error('Informe uma senha com pelo menos 6 caracteres.');
    }
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
    setUsers(prev => {
      const without = prev.filter((item) => item.id !== publicUser.id && item.email !== publicUser.email);
      return [...without, publicUser];
    });
    return publicUser;
  };

  const handleUpdateUser = (updatedUser: User & { newPassword?: string }) => {
    const { newPassword, ...rest } = updatedUser as any;
    const tagged = {
      ...rest,
      email: (rest.email || '').trim().toLowerCase(),
      companyId: rest.companyId || activeCompanyId
    };
    setUsers(prev => prev.map(u => u.id === tagged.id ? toPublicUser(tagged) : u));
    userService.saveUser({ ...tagged, ...(newPassword ? { newPassword } : {}) });
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
    const incoming = orderData as SaleOrder;
    const isAvulsa = incoming.isAvulsa || incoming.reference?.startsWith('NFA-');
    const reference = incoming.reference
      || (isAvulsa ? nextAvulsaReference(orders) : nextOrderReference(orders));
    const newOrder: SaleOrder = {
      ...incoming,
      id: incoming.id || newId('ord'),
      reference,
      companyId: activeCompanyId,
      sellerName: incoming.sellerName || currentUser?.name || 'Vendedor'
    };
    setOrders(prev => {
      const exists = prev.some(o => o.id === newOrder.id);
      return exists ? prev.map(o => o.id === newOrder.id ? newOrder : o) : [...prev, newOrder];
    });
    persistCloud('sales_orders', newOrder);
    if (newOrder.status === OrderStatus.FINALIZED) {
      finalizeSale(newOrder, newOrder.payments || []);
      if (!newOrder.withoutFinance) {
        (newOrder.receipts || []).forEach((receipt) => applyReceiptToFinance(receipt, newOrder));
      }
    }
  };

  // Baixa de estoque acontece sempre que o pedido entra em "Venda Confirmada"
  // — o produto saiu do pátio, existe ou não lançamento financeiro. Quem
  // chama isso já garantiu que é a primeira vez que o pedido finaliza (ver
  // finalizeSale), então não precisa reaplicar em reenvios/retiradas depois.
  const applyOrderStock = (order: SaleOrder) => {
    const failures: string[] = [];
    const noteFailure = (label: string) => (result: { ok: boolean; error?: string }) => {
      if (!result.ok) failures.push(label);
    };
    const stockWrites = (Array.isArray(order.items) ? order.items : [])
      .filter((item) => item?.productId)
      .map((item) =>
        processStockChange(String(item.productId), -(Number(item.quantity) || 0), {
          onResult: noteFailure(`estoque de ${item.productId}`)
        })
      );
    Promise.all(stockWrites).then(() => {
      if (failures.length > 0) {
        setPersistError(
          `A baixa de estoque da venda #${order.reference} ficou salva neste aparelho, mas o banco ainda não confirmou: ${failures.join(', ')}. ` +
          'A fila vai reenviar sozinha — não limpe os dados deste navegador até confirmar.'
        );
      }
    });
  };

  // Cria as parcelas, os lançamentos financeiros e atualiza o saldo do
  // cliente. Só roda quando o pedido pede lançamento financeiro (checkbox
  // "Fazer lançamento financeiro" marcada) — ou quando alguém clica nesse
  // botão depois, num pedido que nasceu sem isso (ver handlePostOrderFinance).
  // Todas as gravações disparam juntas, sem esperar uma pela outra — só
  // esperamos elas confirmarem (ou não) antes de decidir a mensagem do
  // banner, que agora aponta exatamente o que ficou pendente.
  const postSaleFinance = async (order: SaleOrder, payments: SalePayment[]) => {
    const failures: string[] = [];
    const noteFailure = (label: string) => (result: { ok: boolean; error?: string }) => {
      if (!result.ok) failures.push(label);
    };

    const scheduledTotal = (payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const balanceWithoutSchedule = Math.max(0, Number(order.total || 0) - scheduledTotal);
    const financialSchedule: SalePayment[] = [
      ...(payments || []).map((payment) => ({
        ...payment,
        paidAmount: 0,
        status: TransactionStatus.PENDENTE
      })),
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

    const transactionWrites = financialSchedule.map((payment, index) => {
      const accId = payment.accountId || accounts[0]?.id || 'acc-1';
      return handleAddTransaction({
        accountId: accId,
        costCenterId: 'cc4',
        date: payment.date,
        type: TransactionType.SALE,
        status: TransactionStatus.PENDENTE,
        description: `Venda Faturada #${order.reference}`,
        category: 'Venda Calcário Moído Granel',
        amount: payment.amount,
        paidAmount: 0,
        customerId: order.customerId,
        orderId: order.id,
        payments: []
      }, { onResult: noteFailure(`parcela ${index + 1}/${financialSchedule.length}`) });
    });

    let customerWrite: Promise<void> = Promise.resolve();
    setCustomers(prev => {
      const updatedList = prev
        .filter((c): c is Customer => Boolean(c && typeof c === 'object' && c.id))
        .map(c => {
          if (c.id === order.customerId) {
            const updatedCustomer = {
              ...c,
              totalSpent: Number(c.totalSpent || 0) + Number(order.total || 0),
              status: 'Ativo' as const
            };
            customerWrite = persistCloud('customers', updatedCustomer, { onResult: noteFailure('saldo do cliente') });
            return updatedCustomer;
          }
          return c;
        });
      return updatedList;
    });
    const finalizedOrder = {
      ...order,
      payments: financialSchedule,
      status: OrderStatus.FINALIZED,
      withoutFinance: false,
      companyId: order.companyId || activeCompanyId
    };
    setOrders(prev => {
      const exists = prev.some(o => o.id === order.id);
      return exists ? prev.map(o => o.id === order.id ? finalizedOrder : o) : [...prev, finalizedOrder];
    });
    const orderWrite = persistCloud('sales_orders', finalizedOrder, { onResult: noteFailure('o próprio pedido') });

    await Promise.all([...transactionWrites, customerWrite, orderWrite]);

    if (failures.length > 0) {
      setPersistError(
        `O lançamento financeiro da venda #${order.reference} ficou salvo neste aparelho, mas o banco ainda não confirmou: ${failures.join(', ')}. ` +
        'A fila vai reenviar sozinha — não limpe os dados deste navegador até confirmar.'
      );
    }
  };

  // Orquestra a primeira finalização de uma venda: sempre baixa o estoque
  // (o produto saiu, independente de lançar no financeiro ou não); só cria
  // parcelas/transações quando o pedido não pediu pra ficar "sem financeiro".
  // Quem chama isso decide se é de fato a primeira vez que o pedido finaliza
  // (ver os pontos que chamam finalizeSale em handleAddOrder/handleUpdateOrder)
  // — chamar de novo depois (retirada parcial, edição) não deve reaplicar.
  const finalizeSale = async (order: SaleOrder, payments: SalePayment[]) => {
    applyOrderStock(order);
    if (!order.withoutFinance) {
      await postSaleFinance(order, payments);
    }
  };

  // Ação explícita do botão "Fazer lançamento financeiro" num pedido que
  // nasceu sem isso. Não toca em estoque — o produto já saiu na finalização.
  const handlePostOrderFinance = (order: SaleOrder) => {
    const alreadyPosted = transactions.some((t) => t.orderId === order.id);
    if (alreadyPosted || !order.withoutFinance) return;
    postSaleFinance(order, order.payments || []);
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

    if (hasAuthorizedFiscalDocument(order)) {
      toast.push('Esta venda possui NF-e autorizada. Cancele o documento fiscal antes de excluir a venda.', 'danger');
      return;
    }

    if (order.status === OrderStatus.FINALIZED) {
      order.items.forEach(item => processStockChange(item.productId, item.quantity));
      const linkedTransactions = transactions.filter(transaction => transaction.orderId === orderId);
      setTransactions(prev => prev.filter(transaction => transaction.orderId !== orderId));
      linkedTransactions.forEach(transaction => {
        persistDelete('transactions', transaction.id);
      });
    }
    setOrders(prev => prev.filter(o => o.id !== orderId));
    persistDelete('sales_orders', orderId);
  };

  const voidCancelledNfeFinance = (order: SaleOrder) => {
    if (!hasCancelledNfe(order)) return;
    const fiscalOnly = isFiscalOnlyOrder(order);
    const amountKeys = new Set(cancelledNfeAmountKeys(order));
    setTransactions(prev => {
      const next = prev.filter(transaction => {
        if (transaction.type !== TransactionType.SALE) return true;
        if (transaction.receiptId) return true;
        if (transaction.orderId !== order.id) return true;
        const amountKey = Math.round((Number(transaction.amount) || 0) * 100);
        const drop = fiscalOnly || amountKeys.has(amountKey);
        if (!drop) return true;
        persistDelete('transactions', transaction.id);
        return false;
      });
      return next;
    });
  };

  const handleUpdateOrder = (updatedOrder: SaleOrder, options?: { waitForCloud?: boolean }) => {
    const originalOrder = orders.find(o => o.id === updatedOrder.id);
    const tagged = { ...updatedOrder, companyId: updatedOrder.companyId || activeCompanyId };
    if (!originalOrder) {
      setOrders(prev => [...prev, tagged]);
      voidCancelledNfeFinance(tagged);
      const persist = persistCloud('sales_orders', tagged, { required: options?.waitForCloud });
      if (tagged.status === OrderStatus.FINALIZED) {
        const hasTx = transactions.some(t => t.orderId === tagged.id || (tagged.reference && t.description?.includes(tagged.reference)));
        if (!hasTx) {
          applyOrderStock(tagged);
          if (!tagged.withoutFinance) {
            postSaleFinance(tagged, tagged.payments || []);
            (tagged.receipts || []).forEach((receipt) => applyReceiptToFinance(receipt, tagged));
          }
        }
      }
      return persist;
    }
    setOrders(prev => prev.map(o => o.id === tagged.id ? tagged : o));
    const persist = persistCloud('sales_orders', tagged, { required: options?.waitForCloud });
    // Baixa de estoque só na transição pra "Venda Confirmada" — reenvios
    // depois (retirada parcial, "Fazer lançamento financeiro") não reaplicam.
    if (tagged.status === OrderStatus.FINALIZED && originalOrder.status !== OrderStatus.FINALIZED) {
      applyOrderStock(tagged);
    }
    if (tagged.status === OrderStatus.FINALIZED && !tagged.withoutFinance) {
      const hasTx = transactions.some(t => t.orderId === tagged.id || (tagged.reference && t.description?.includes(tagged.reference)));
      if (!hasTx || originalOrder.status === OrderStatus.BUDGET) {
        postSaleFinance(tagged, tagged.payments || []);
        (tagged.receipts || []).forEach((receipt) => applyReceiptToFinance(receipt, tagged));
      }
    }
    voidCancelledNfeFinance(tagged);
    return persist;
  };

  // Resetar empresa para banco 100% limpo
  const handleResetCompanyDatabase = async () => {
    if (activeCompanyId !== 'matriz-demo' && activeCompanyId !== 'demo') {
      toast.push('Reset de base está bloqueado em produção para não perder pedidos reais.', 'danger');
      return;
    }
    if (!(await confirmDialog({
      title: 'Zerar a base?',
      description: `Todos os registros de "${currentUser.companyName || 'sua empresa'}" serão apagados e a base volta limpa.`,
      confirmLabel: 'Zerar base',
      danger: true
    }))) {
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
    if (!(await confirmDialog({
      title: 'Carregar dados de demonstração?',
      description: 'Pedidos, clientes e estoque de exemplo serão adicionados nesta empresa.',
      confirmLabel: 'Carregar'
    }))) return;
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

  if (passwordRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#F4F5EF]">
        <SetNewPassword
          mode="recovery"
          onDone={() => {
            setPasswordRecovery(false);
            try { window.history.replaceState(null, '', window.location.pathname); } catch {}
            userService.getCurrentSessionUser().then((user) => { if (user) handleSetCurrentUser(user); });
          }}
        />
      </div>
    );
  }

  if (!currentUser) return <Login onLoginSuccess={handleSetCurrentUser} notice={authLinkError} />;

  const operatingCompany: Company = {
    id: activeCompanyId,
    name: currentUser.companyName || COMPANY_INFO.name,
    code: activeCompanyId === 'matriz-demo' ? COMPANY_INFO.code : activeCompanyId,
    document: currentUser.cnpj || COMPANY_INFO.document,
    cnpj: currentUser.cnpj || COMPANY_INFO.document,
    corporateName: currentUser.companyName || COMPANY_INFO.name,
    tradeName: currentUser.companyName || COMPANY_INFO.name,
    city: currentUser.city || COMPANY_INFO.city,
    state: currentUser.state || COMPANY_INFO.state,
    phone: currentUser.phone || COMPANY_INFO.phone,
    address: COMPANY_INFO.address,
    isActive: true
  };

  const displayUsers = visibleCompanyUsers(users, currentUser);

  return (
    <div className="cf-app-shell min-h-screen flex flex-col lg:flex-row">
      <Sidebar 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        user={currentUser}
        onLogout={() => handleSetCurrentUser(null)}
        onChangePassword={isDemoCompany(activeCompanyId) ? undefined : () => { setMobileMenuOpen(false); setShowChangePassword(true); }}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenDatabaseModal={() => setShowDbModal(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full min-w-0 lg:ml-[276px] p-3 sm:p-6 lg:p-8 transition-all duration-300 print:ml-0 print:p-0 min-h-screen pb-24 lg:pb-8">
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
              <div className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={() => { if (memberships.length > 1) setCompanySwitcherOpen((open) => !open); }}
                  className="cf-topbar-pill"
                  title={memberships.length > 1 ? 'Trocar de empresa' : undefined}
                >
                  <MapPin size={14} className="text-[#0F5948]" />
                  <span>
                    {activeMembership?.companyName
                      || (activeCompanyId === 'matriz-demo' ? 'Unidade Matriz' : (activeMembership?.isBranch ? 'Filial' : (currentUser.companyName || 'Unidade ativa')))}
                  </span>
                  {memberships.length > 1 && <ChevronDown size={13} />}
                </button>
                {companySwitcherOpen && memberships.length > 1 && (
                  <div className="absolute right-0 mt-1 w-64 bg-white border border-[#DDE6DE] rounded-xl shadow-lg z-40 overflow-hidden">
                    {memberships.map((m) => (
                      <button
                        key={m.companyId}
                        type="button"
                        onClick={() => { setSelectedCompanyId(m.companyId); setCompanySwitcherOpen(false); setCurrentView('dashboard'); }}
                        className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 ${m.companyId === activeCompanyId ? 'bg-emerald-50 font-semibold text-emerald-700' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        <span className="truncate">{m.companyName || (m.isBranch ? 'Filial' : (currentUser.companyName || 'Matriz'))}</span>
                        <span className="text-[11px] uppercase text-slate-500 shrink-0">{m.role}</span>
                      </button>
                    ))}
                  </div>
                )}
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

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="cf-topbar-pill"
                title="Buscar (Ctrl+K)"
                aria-label="Buscar pedido, cliente, placa ou NF"
              >
                <Search size={15} className="text-[#36574E]" />
                <span className="hidden md:inline whitespace-nowrap">Buscar</span>
                <kbd className="hidden xl:inline whitespace-nowrap text-xs text-muted">Ctrl K</kbd>
              </button>

              <div className="cf-topbar-divider hidden sm:block" />
              <button className="cf-topbar-pill hidden sm:inline-flex" title="Notificações" aria-label="Notificações">
                <Bell size={15} className="text-[#36574E]" />
              </button>

              <div className="cf-user-chip">
                <div className="cf-user-avatar">{(currentUser.name || 'U').split(' (')[0].split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('') || 'U'}</div>
                <div className="cf-user-meta hidden sm:block">
                  <strong>{(currentUser.name || 'Usuário').split(' (')[0]}</strong>
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

          {(persistError || pendingSyncCount > 0) && (
            <div className={`mb-4 rounded-xl border px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-2 ${persistError ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
              <p className="flex-1">
                {persistError
                  ? `O banco não confirmou a última gravação (${pendingSyncCount} item(ns) na fila). Não limpe o histórico nem os dados deste site neste aparelho — as notas podem estar só aqui até o reenvio.`
                  : `${pendingSyncCount} registro(s) aguardando confirmação no Supabase. Não limpe o navegador até tocar em Reenviar agora.`}
              </p>
              <button
                type="button"
                className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-current/20 text-xs font-bold"
                onClick={() => {
                  db.flushAllPending()
                    .then(() => {
                      const state = db.getSyncState(activeCompanyId);
                      setPendingSyncCount(state.pendingCount);
                      setPersistError(state.lastError);
                    })
                    .catch((err) => setPersistError(err?.message || 'Falha ao reenviar a fila.'));
                }}
              >
                Reenviar agora
              </button>
            </div>
          )}
          
          {currentView === 'dashboard' && (
            <Dashboard 
              transactions={transactions} 
              inventory={inventory} 
              customers={customers} 
              orders={orders}
              accounts={accounts}
              transfers={transfers}
              user={currentUser}
              onNavigate={setCurrentView} 
            />
          )}
          {(currentView === 'orders' || currentView === 'quotes') && (
            <ErrorBoundary label="vendas">
              <SalesOrders 
                orders={orders} 
                customers={customers} 
                inventory={inventory} 
                accounts={accounts} 
                company={operatingCompany}
                companyId={activeCompanyId}
                onAddOrder={handleAddOrder} 
                onAddCustomer={handleAddCustomer}
                transportadores={transportadores}
                onAddTransportador={handleAddTransportador}
                onUpdateOrder={handleUpdateOrder} 
                onDeleteOrder={handleDeleteOrder}
                onVerifyDeletionPassword={verifyCurrentUserPassword}
                onFinalizeOrder={(oid, p) => {
                  const order = orders.find(o => o.id === oid);
                  if (order) finalizeSale(order, p);
                }}
                onPostFinance={handlePostOrderFinance}
                onPaymentReceived={handlePaymentReceived}
                mode={currentView === 'quotes' ? 'quotes' : 'orders'}
              />
            </ErrorBoundary>
          )}
          {currentView === 'fiscal' && (
            <FiscalManagement 
              orders={orders} 
              customers={customers} 
              company={operatingCompany}
              companyId={activeCompanyId}
              inventory={inventory}
              currentUser={currentUser}
              transportadores={transportadores}
              onAddTransportador={handleAddTransportador}
              onUpdateOrder={handleUpdateOrder} 
              onAddOrder={handleAddOrder}
              onNavigate={setCurrentView}
              canConfigure={currentUser.role === 'Administrador' || (currentUser.role === 'Gerente' && Boolean(currentUser.permissions?.financial))}
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
          {currentView === 'transportadores' && (
            <Transportadores
              transportadores={transportadores}
              onAdd={handleAddTransportador}
              onUpdate={handleUpdateTransportador}
              onDelete={handleDeleteTransportador}
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
              onVerifyDeletionPassword={verifyCurrentUserPassword}
            />
          )}
          {currentView === 'loadings' && isViewAllowed(currentUser, 'loadings') && (
            <Loadings orders={orders} customers={customers} />
          )}
          {currentView === 'branches' && (
            <CompanyBranches
              activeCompanyId={activeCompanyId}
              currentUser={currentUser}
              matrizUsers={displayUsers}
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
              transportadores={transportadores}
              operatorName={currentUser.name}
              onAddMaintenance={handleAddMaintenance} 
              onAddStoreItem={handleAddStoreItem} 
              onUpdateStoreItem={handleUpdateStoreItem} 
              onUpdateOrder={handleUpdateOrder}
            />
          )}
          {currentView === 'transfers' && (
            <TransfersPage 
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
          <span className="text-xs tracking-tight">Início</span>
        </button>

        {isViewAllowed(currentUser, 'orders') && (
          <button
            onClick={() => setCurrentView('orders')}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
              currentView === 'orders' ? 'text-[#F1D67A] font-bold' : 'text-[#D5E3DC] hover:text-white'
            }`}
          >
            <FileText size={18} />
            <span className="text-xs tracking-tight">Vendas</span>
          </button>
        )}

        <button
          onClick={() => setCurrentView('yard')}
          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
            currentView === 'yard' ? 'text-[#F1D67A] font-bold' : 'text-[#D5E3DC] hover:text-white'
          }`}
        >
          <Scale size={18} />
          <span className="text-xs tracking-tight">Balança</span>
        </button>

        {isViewAllowed(currentUser, 'inventory') && (
          <button
            onClick={() => setCurrentView('inventory')}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
              currentView === 'inventory' ? 'text-[#F1D67A] font-bold' : 'text-[#D5E3DC] hover:text-white'
            }`}
          >
            <Package size={18} />
            <span className="text-xs tracking-tight">Estoque</span>
          </button>
        )}

        {isViewAllowed(currentUser, 'transfers') && (
          <button
            onClick={() => setCurrentView('transfers')}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
              currentView === 'transfers' ? 'text-[#F1D67A] font-bold' : 'text-[#D5E3DC] hover:text-white'
            }`}
          >
            <ArrowRightLeft size={18} />
            <span className="text-xs tracking-tight">Remessas</span>
          </button>
        )}

        {isViewAllowed(currentUser, 'fiscal') && (
          <button
            onClick={() => setCurrentView('fiscal')}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
              currentView === 'fiscal' ? 'text-[#F1D67A] font-bold' : 'text-[#D5E3DC] hover:text-white'
            }`}
          >
            <FileCheck size={18} />
            <span className="text-xs tracking-tight">NF-e</span>
          </button>
        )}

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-1 p-1.5 rounded-xl text-[#D5E3DC] hover:text-white"
        >
          <Menu size={18} />
          <span className="text-xs tracking-tight">Menu</span>
        </button>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        user={currentUser}
        orders={orders}
        customers={customers}
        onNavigate={(view) => { setCurrentView(view); setMobileMenuOpen(false); }}
      />

      {showChangePassword && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 flex items-center justify-center p-4 print:hidden">
          <SetNewPassword
            mode="change"
            onDone={() => setShowChangePassword(false)}
            onCancel={() => setShowChangePassword(false)}
          />
        </div>
      )}

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
        isAdmin={currentUser?.role === UserRole.ADMIN}
        companyId={activeCompanyId}
      />
    </div>
  );
};

export default App;
