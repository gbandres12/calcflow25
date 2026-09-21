import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPendingDeletes,
  hasSeedMeta,
  keepUnseenLocalRecords,
  mergeRecordsById,
  mergeRecordsByUpdatedAt,
  reconcileVisibleRecords,
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

  it('um fetch atrasado não apaga cliente/transportador recém-criado no cache', () => {
    const remote = [{ id: 'cust-1', name: 'Antigo' }];
    const localCache = [
      { id: 'cust-1', name: 'Antigo' },
      { id: 'cust-novo', name: 'Acabei de cadastrar' }
    ];
    const merged = mergeRecordsById(remote, localCache);
    assert.ok(merged.some((row) => row.id === 'cust-novo'));
  });

  it('um fetch atrasado não apaga cliente/transportador recém-criado na tela', () => {
    const remote = [{ id: 'cust-1', name: 'Antigo' }];
    const local = [
      { id: 'cust-1', name: 'Antigo' },
      { id: 'cust-novo', name: 'Acabei de cadastrar' },
      { id: 'transp-1', nome: 'Caminhoneiro novo' }
    ];
    const kept = keepUnseenLocalRecords(remote, local);
    assert.ok(kept.some((row) => row.id === 'cust-novo'));
    assert.ok(kept.some((row) => row.id === 'transp-1'));
    assert.equal(kept.filter((row) => row.id === 'cust-1').length, 1);
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

  it('um snapshot vazio da nuvem não apaga o que já está no cache ou na tela', () => {
    const local = [
      { id: 'tx-1', description: 'Recebimento', updatedAt: '2026-09-21T12:00:00.000Z' },
      { id: 'inv-1', name: 'Moído', updatedAt: '2026-09-21T12:00:00.000Z' }
    ];
    const merged = mergeRecordsByUpdatedAt([], local);
    assert.equal(merged.length, 2);
    assert.deepEqual(merged.map((row) => row.id).sort(), ['inv-1', 'tx-1']);
  });

  it('cache velho não sobrescreve a versão mais nova já gravada na nuvem', () => {
    const remote = [{ id: 'ord-1', total: 250, updatedAt: '2026-09-21T14:00:00.000Z' }];
    const staleCache = [{ id: 'ord-1', total: 100, updatedAt: '2026-09-21T10:00:00.000Z' }];
    const merged = mergeRecordsByUpdatedAt(remote, staleCache);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].total, 250);
  });

  it('edição local mais nova continua na tela mesmo se o fetch voltar a versão antiga', () => {
    const remote = [{ id: 'cust-1', name: 'Antigo', updatedAt: '2026-09-21T10:00:00.000Z' }];
    const screen = [{ id: 'cust-1', name: 'Nome corrigido', updatedAt: '2026-09-21T14:00:00.000Z' }];
    const merged = mergeRecordsByUpdatedAt(remote, screen);
    assert.equal(merged[0].name, 'Nome corrigido');
  });

  it('reconcile não perde cadastro local, aplica exclusão pendente e deixa a fila vencer', () => {
    const visible = reconcileVisibleRecords({
      remote: [
        { id: 'cust-1', name: 'Nuvem', updatedAt: '2026-09-21T10:00:00.000Z' },
        { id: 'cust-2', name: 'Apagar' }
      ],
      local: [
        { id: 'cust-1', name: 'Cache velho', updatedAt: '2026-09-20T10:00:00.000Z' },
        { id: 'cust-3', name: 'Novo no navegador', updatedAt: '2026-09-21T14:00:00.000Z' }
      ],
      pendingUpserts: [{ id: 'cust-1', name: 'Editado agora', updatedAt: '2026-09-21T14:05:00.000Z' }],
      pendingDeletes: ['cust-2']
    });
    assert.equal(visible.length, 2);
    assert.equal(visible.find((row) => row.id === 'cust-1')?.name, 'Editado agora');
    assert.ok(visible.some((row) => row.id === 'cust-3'));
    assert.ok(!visible.some((row) => row.id === 'cust-2'));
  });
});
