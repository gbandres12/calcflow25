import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UserRole, User, UserPermissions } from '../types';
import { getDefaultPermissions } from '../components/UserManagement';
import { userService } from './dataService';

describe('gestão de usuários: permissões padrão por cargo', () => {
  it('Administrador tem acesso total a todos os módulos', () => {
    const perms = getDefaultPermissions(UserRole.ADMIN);
    assert.equal(perms.financial, true);
    assert.equal(perms.users, true);
    assert.equal(perms.inventory, true);
    assert.equal(perms.orders, true);
  });

  it('Gerente tem acesso comercial, operacional e financeiro', () => {
    const perms = getDefaultPermissions(UserRole.MANAGER);
    assert.equal(perms.financial, true);
    assert.equal(perms.users, true);
    assert.equal(perms.inventory, true);
    assert.equal(perms.orders, true);
  });

  it('Supervisor Operacional acessa estoque e carregamentos, mas não financeiro', () => {
    const perms = getDefaultPermissions(UserRole.OPERATIONAL_SUPERVISOR);
    assert.equal(perms.financial, false);
    assert.equal(perms.users, true);
    assert.equal(perms.inventory, true);
    assert.equal(perms.orders, true);
  });

  it('Operador de Balança acessa somente estoque e carregamentos (sem financeiro e sem usuários)', () => {
    const perms = getDefaultPermissions(UserRole.OPERATOR);
    assert.equal(perms.financial, false);
    assert.equal(perms.users, false);
    assert.equal(perms.inventory, true);
    assert.equal(perms.orders, true);
  });
});

describe('gestão de usuários: validação e criação de colaboradores', () => {
  it('rejeita senha com menos de 6 caracteres no cadastro', async () => {
    await assert.rejects(
      async () => {
        await userService.registerUser({
          name: 'Colaborador Teste',
          email: 'teste@exemplo.com.br',
          password: '123',
          companyName: 'Usina Teste'
        });
      },
      /A senha deve ter no mínimo 6 caracteres/
    );
  });

  it('cria colaborador em modo demo/local dev quando sem token remoto ativo', async () => {
    const newUser = await userService.inviteUser({
      name: 'João Operador',
      email: 'joao.operador@calcarioflow.com.br',
      password: 'senhaSegura123',
      role: UserRole.OPERATOR,
      status: 'Ativo',
      companyId: 'matriz-demo',
      companyName: 'Usina Matriz',
      jobTitle: 'Operador de Balança e Expedição',
      permissions: getDefaultPermissions(UserRole.OPERATOR)
    });

    assert.ok(newUser.id);
    assert.equal(newUser.name, 'João Operador');
    assert.equal(newUser.email, 'joao.operador@calcarioflow.com.br');
    assert.equal(newUser.role, UserRole.OPERATOR);
    assert.equal(newUser.status, 'Ativo');
    assert.equal(newUser.permissions?.financial, false);
    assert.equal(newUser.permissions?.orders, true);
  });

  it('atualiza e salva perfil e permissões de colaborador', async () => {
    const userToSave: User = {
      id: 'usr-teste-1',
      name: 'Maria Supervisor',
      email: 'maria@calcarioflow.com.br',
      role: UserRole.OPERATIONAL_SUPERVISOR,
      status: 'Ativo',
      companyId: 'matriz-demo',
      permissions: { financial: false, users: true, inventory: true, orders: true }
    };

    const saved = await userService.saveUser(userToSave);
    assert.equal(saved.id, 'usr-teste-1');
    assert.equal(saved.role, UserRole.OPERATIONAL_SUPERVISOR);
    assert.equal(saved.permissions?.financial, false);
    assert.equal(saved.permissions?.users, true);
  });

  it('bloqueia autenticação de usuário inativo/bloqueado', async () => {
    const inativoUser: User = {
      id: 'usr-inativo-1',
      name: 'Operador Bloqueado',
      email: 'bloqueado@calcarioflow.com.br',
      role: UserRole.OPERATOR,
      status: 'Inativo',
      companyId: 'matriz-demo'
    };
    await userService.saveUser(inativoUser);

    await assert.rejects(
      async () => {
        await userService.authenticate('bloqueado@calcarioflow.com.br', '123456');
      },
      /inativa ou bloqueada/
    );
  });
});
