import React, { useMemo, useState } from 'react';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: React.ReactNode;
}

export function DataTable<T>({ columns, rows, rowKey, loading, empty }: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    const column = columns.find((col) => col.key === sortKey && col.sortValue);
    if (!column?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [columns, rows, sortDir, sortKey]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="overflow-auto max-h-[70vh] rounded-xl border border-[var(--cf-line)]">
      <table className="w-full text-sm text-left">
        <thead className="sticky top-0 bg-[var(--cf-cream)] text-[var(--cf-ink)]">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 font-semibold ${col.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {col.sortValue ? (
                  <button type="button" className="font-semibold" onClick={() => toggleSort(col.key)}>
                    {col.header}
                    {sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-[var(--cf-muted)]">
                Carregando…
              </td>
            </tr>
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-[var(--cf-muted)]">
                {empty ?? 'Nenhum registro.'}
              </td>
            </tr>
          ) : (
            sorted.map((row, index) => (
              <tr key={rowKey(row)} className={index % 2 === 1 ? 'bg-[var(--cf-cream)]' : 'bg-[var(--cf-paper)]'}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 text-[var(--cf-ink)] ${col.align === 'right' ? 'text-right tabular-nums' : ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
