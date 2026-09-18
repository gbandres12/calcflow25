import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPendingDeletes,
  hasSeedMeta,
  mergeRecordsById,
  remainingPendingAfterConfirm,
  remainingPendingDeletes,
  serializeRecord,
  splitConfirmedPending,
  stripSeedDocs
} from './persistSeed';

describe('persistência: merge de cache pendente com o banco', () => {
  it('não deixa a leitura do Supabase apagar um cliente ainda não confirmado', () => {
    const remote = [{ id: 'cust-1', name: 'Antigo', totalSpent: 10 }];
    const pending = [{ id: 'cust-2', name: 'Novo no navegador', totalSpent: 0 }];
    const merged = mergeRecordsById(remote, pending);
    assert.equal(merged.length, 2);
    assert.ok(merged.some((row) => row.id === 'cust-2' && row.name === 'Novo no navegador'));
  });

  it('a edição local mais recente vence o registro antigo da nuvem', () => {
    const remote = [{ id: 'ord-1', reference: 'PED-2026-0001', total: 100 }];
    const pending = [{ id: 'ord-1', reference: 'PED-2026-0001', total: 250 }];
    const merged = mergeRecordsById(remote, pending);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].total, 250);
  });

  it('exclusão pendente remove o registro mesmo se a nuvem ainda o devolver', () => {
    const remote = [
      { id: 'cust-1', name: 'Manter' },
      { id: 'cust-2', name: 'Apagar' }
    ];
    const remaining = applyPendingDeletes(remote, ['cust-2']);
    assert.deepEqual(remaining.map((row) => row.id), ['cust-1']);
  });

  it('confirma só o que o banco já devolveu idêntico e mantém o restante na fila', () => {
    const pending = [
      { id: 'cust-1', name: 'Ok' },
      { id: 'cust-2', name: 'Ainda local' }
    ];
    const remote = [{ id: 'cust-1', name: 'Ok' }];
    const { confirmed, unconfirmed } = splitConfirmedPending(pending, remote);
    assert.deepEqual(confirmed.map((row) => row.id), ['cust-1']);
    assert.deepEqual(unconfirmed.map((row) => row.id), ['cust-2']);
  });

  it('não confirma exclusão enquanto o registro continuar no banco', () => {
    const leftover = remainingPendingDeletes(['cust-2', 'cust-9'], [{ id: 'cust-2', name: 'Ainda lá' }]);
    assert.deepEqual(leftover, ['cust-2']);
  });

  it('seed meta não entra na lista operacional de clientes/vendas', () => {
    const rows = [
      { id: '__seed__', __isSeedMeta: true },
      { id: 'cust-1', name: 'Real' }
    ];
    assert.equal(hasSeedMeta(rows), true);
    assert.deepEqual(stripSeedDocs(rows).map((row) => row.id), ['cust-1']);
  });

  it('serialize estável evita confirmar uma versão antiga depois de editar', () => {
    const sent = [{ id: 'ord-1', b: 2, a: 1 }];
    const pending = [{ id: 'ord-1', a: 1, b: 3 }];
    const remaining = remainingPendingAfterConfirm(pending, sent);
    assert.equal(remaining.length, 1);
    assert.equal(serializeRecord({ a: 1, b: 2 }), serializeRecord({ b: 2, a: 1 }));
  });
});
