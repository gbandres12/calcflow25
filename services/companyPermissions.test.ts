import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PERMISSION_GROUPS,
  buildEmptyPermissions,
  buildFullAccessPermissions,
  groupHasAccess,
  setGroupAccess
} from './companyPermissions';

describe('permissão de filial: acesso total cobre todo módulo que o backfill do banco cobre', () => {
  it('marca read e write em todos os 15 módulos', () => {
    const full = buildFullAccessPermissions();
    assert.equal(Object.keys(full).length, 15);
    Object.values(full).forEach((entry) => {
      assert.equal(entry.read, true);
      assert.equal(entry.write, true);
    });
  });

  it('acesso vazio começa sem nenhum módulo liberado', () => {
    const empty = buildEmptyPermissions();
    Object.values(empty).forEach((entry) => {
      assert.equal(entry.read, false);
      assert.equal(entry.write, false);
    });
  });
});

describe('permissão de filial: liberar/bloquear por grupo (o que a tela de delegação usa)', () => {
  const financeiro = PERMISSION_GROUPS.find((g) => g.key === 'financeiro')!;
  const comercial = PERMISSION_GROUPS.find((g) => g.key === 'comercial')!;

  it('liberar um grupo não muda os outros', () => {
    const base = buildEmptyPermissions();
    const next = setGroupAccess(base, financeiro, { read: true, write: true });
    assert.equal(groupHasAccess(next, financeiro, 'read'), true);
    assert.equal(groupHasAccess(next, comercial, 'read'), false);
  });

  it('write sem read não faz sentido: write fica falso mesmo se pedido', () => {
    const base = buildEmptyPermissions();
    const next = setGroupAccess(base, financeiro, { read: false, write: true });
    assert.equal(groupHasAccess(next, financeiro, 'write'), false);
  });

  it('grupo só aparece marcado quando TODOS os módulos dele têm a permissão', () => {
    const base = buildFullAccessPermissions();
    const partial = { ...base, transactions: { read: true, write: false } };
    assert.equal(groupHasAccess(partial, financeiro, 'write'), false);
    assert.equal(groupHasAccess(partial, financeiro, 'read'), true);
  });
});
