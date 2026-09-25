import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UserRole } from '../types';
import { isViewAllowed } from './viewAccess';

const user = (role: UserRole, permissions?: any) =>
  ({ id: 'u', name: 'U', email: 'u@x', role, status: 'Ativo', permissions }) as any;

describe('acesso às telas (menu e rodapé do celular)', () => {
  const balanca = user(UserRole.OPERATOR, { financial: false, users: false, inventory: false, orders: false });

  it('operador da balança sem permissões vê só balança e início', () => {
    assert.equal(isViewAllowed(balanca, 'yard'), true);
    assert.equal(isViewAllowed(balanca, 'dashboard'), true);
    for (const view of ['orders', 'inventory', 'transfers', 'fiscal', 'loadings', 'transactions']) {
      assert.equal(isViewAllowed(balanca, view), false, view);
    }
  });

  it('planilha de carregamentos só pra administrador e gerente', () => {
    assert.equal(isViewAllowed(user(UserRole.ADMIN), 'loadings'), true);
    assert.equal(isViewAllowed(user(UserRole.MANAGER), 'loadings'), true);
    assert.equal(isViewAllowed(user(UserRole.OPERATIONAL_SUPERVISOR), 'loadings'), false);
  });

  it('gerente sem financeiro não emite NF-e', () => {
    const gerente = user(UserRole.MANAGER, { financial: false, fiscal: false, users: false, inventory: true, orders: true });
    assert.equal(isViewAllowed(gerente, 'fiscal'), false);
    assert.equal(isViewAllowed(gerente, 'orders'), true);
  });
});
