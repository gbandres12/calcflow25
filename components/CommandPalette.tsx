import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, LayoutGrid, Search, Truck, User as UserIcon } from 'lucide-react';
import { Customer, SaleOrder, User, View } from '../types';
import { CommandItem, CommandKind, buildCommandIndex, searchCommands } from '../services/domain/commandSearch';
import { isViewAllowed } from '../services/viewAccess';

const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Visão Geral',
  orders: 'Vendas & Romaneios',
  quotes: 'Orçamentos',
  loadings: 'Carregamentos',
  customers: 'Clientes & Fornecedores',
  fiscal: 'Notas Fiscais',
  inventory: 'Produtos & NCM',
  milling: 'Moagem / Britagem',
  yard: 'Pátio, Balança & Peças',
  transfers: 'Transferências',
  transportadores: 'Transportadores',
  fleet: 'Frota e Maquinário',
  fuel: 'Combustível',
  daily: 'Movimentação Diária',
  transactions: 'Lançamentos / Extrato',
  cashflow: 'Fluxo de Caixa',
  accounts: 'Contas Bancárias',
  users: 'Usuários & Equipe',
  branches: 'Filiais e Acessos',
  fiscal_config: 'Configuração de NF-e',
  settings: 'Configurações'
};

const ICON: Record<CommandKind, React.ElementType> = {
  view: LayoutGrid,
  order: FileText,
  customer: UserIcon,
  loading: Truck
};

interface Props {
  open: boolean;
  onClose: () => void;
  user: User;
  orders: SaleOrder[];
  customers: Customer[];
  onNavigate: (view: View) => void;
}

export const CommandPalette: React.FC<Props> = ({ open, onClose, user, orders, customers, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const index = useMemo(() => {
    if (!open) return [];
    const views = Object.entries(VIEW_LABELS)
      .filter(([id]) => isViewAllowed(user, id))
      .map(([id, label]) => ({ id, label }));
    // Quem não vê vendas não deve achar pedido nem cliente pela busca.
    const canSeeOrders = isViewAllowed(user, 'orders');
    return buildCommandIndex({
      views,
      orders: canSeeOrders ? orders : [],
      customers: isViewAllowed(user, 'customers') ? customers : []
    }).filter((item) => isViewAllowed(user, item.view));
  }, [open, user, orders, customers]);

  const results = useMemo(() => searchCommands(index, query), [index, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const choose = (item?: CommandItem) => {
    if (!item) return;
    onNavigate(item.view as View);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[active]);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-start justify-center p-4 pt-[12vh] print:hidden" onKeyDown={onKeyDown}>
      <button type="button" aria-label="Fechar busca" className="absolute inset-0 bg-ink/55" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Busca" className="relative w-full max-w-xl overflow-hidden rounded-xl bg-paper shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pedido, cliente, placa, NF ou tela…"
            aria-label="Buscar"
            className="min-h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-xs text-muted sm:inline">Esc</kbd>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto py-2" role="listbox">
          {results.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted">Nada encontrado para “{query}”.</li>
          ) : (
            results.map((item, i) => {
              const Icon = ICON[item.kind];
              return (
                <li key={item.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(item)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === active ? 'bg-forest-soft' : ''}`}
                  >
                    <Icon size={16} className="shrink-0 text-forest" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{item.label}</span>
                    <span className="shrink-0 truncate text-xs text-muted max-w-[45%]">{item.hint}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
};

export default CommandPalette;
