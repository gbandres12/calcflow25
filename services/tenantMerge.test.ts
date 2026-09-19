import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planTenantCopy, planUserDedupe } from './tenantMerge';

describe('fusão de pastas internas', () => {
  it('copia só o que a pasta destino ainda não tem', () => {
    const source = [
      { id: 'ord-1', table_name: 'sales_orders', company_id: 'comp-a', data: { nfeNumero: '1' } },
      { id: 'ord-2', table_name: 'sales_orders', company_id: 'comp-a', data: { nfeNumero: '2' } }
    ];
    const target = [
      { id: 'ord-1', table_name: 'sales_orders', company_id: 'comp-b', data: { nfeNumero: '1-destino' } }
    ];
    const { toCopy, skipped } = planTenantCopy(source, target);
    assert.deepEqual(toCopy.map((row) => row.id), ['ord-2']);
    assert.deepEqual(skipped.map((row) => row.id), ['ord-1']);
  });
});

describe('deduplicar usuários pelo e-mail', () => {
  it('mantém o id do Auth e remove o perfil extra da Cassia', () => {
    const authId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const rows = [
      { id: 'usr-local', table_name: 'users', company_id: 'cba', data: { email: 'cassiasilva140287@gmail.com', name: 'Cassia Silva' } },
      { id: authId, table_name: 'users', company_id: 'cba', data: { email: 'cassiasilva140287@gmail.com', name: 'Cassia Juliane' }, updated_at: '2026-09-08T20:41:45.000Z' }
    ];
    const { keep, remove } = planUserDedupe(rows, { 'cassiasilva140287@gmail.com': authId });
    assert.equal(keep.length, 1);
    assert.equal(keep[0].id, authId);
    assert.equal(remove.length, 1);
    assert.equal(remove[0].id, 'usr-local');
  });
});
