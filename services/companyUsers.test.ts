import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { visibleCompanyUsers } from './authLogic';
import { planCompanyUserHeal, userBelongsToCompany } from './companyUsers';
import { UserRole } from '../types';

const COMPANY = 'comp-1788898385141';
const ALANA_ID = 'a539848a-fd09-49ff-96d4-bc617e1a60b3';
const CASSIA_AUTH = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('equipe da pasta de produção', () => {
  it('reconhece perfil da Cassia gravado na demo mas apontando para a CBA', () => {
    const row = {
      id: 'u-mtt4xnf8-32b9j0',
      table_name: 'users',
      company_id: 'matriz-demo',
      data: {
        name: 'Cassia Juliane',
        email: 'cassiasilva140287@gmail.com',
        companyId: COMPANY
      }
    };
    assert.equal(userBelongsToCompany(row, COMPANY), true);
    assert.equal(userBelongsToCompany(row, 'matriz-demo'), true);
  });

  it('traz Cassia e Alana para a pasta da CBA e descarta admin de demonstração duplicado', () => {
    const plan = planCompanyUserHeal({
      companyId: COMPANY,
      userRows: [
        {
          id: 'u-mtt4xnf8-32b9j0',
          table_name: 'users',
          company_id: 'matriz-demo',
          data: {
            name: 'Cassia Juliane',
            email: 'cassiasilva140287@gmail.com',
            role: 'Gerente',
            companyId: COMPANY,
            companyName: 'CBA Mineração'
          }
        },
        {
          id: ALANA_ID,
          table_name: 'users',
          company_id: 'matriz-demo',
          data: {
            name: 'Alana',
            email: 'cbamatriz@gmail.com',
            role: 'Administrador',
            companyId: COMPANY
          }
        },
        {
          id: 'usr-1787706064101',
          table_name: 'users',
          company_id: 'matriz-demo',
          data: {
            name: 'Gabriel Andres',
            email: 'cbamatriz@gmail.com',
            role: 'Administrador',
            companyId: COMPANY
          }
        },
        {
          id: 'u1',
          table_name: 'users',
          company_id: COMPANY,
          data: {
            name: 'Carlos Mendes (Diretor Geral)',
            email: 'admin@calcarioflow.com.br',
            role: 'Administrador'
          }
        }
      ],
      memberships: [
        { company_id: COMPANY, user_id: ALANA_ID, role: 'Administrador' }
      ],
      authUsers: [
        { id: ALANA_ID, email: 'cbamatriz@gmail.com', name: 'Alana' },
        { id: CASSIA_AUTH, email: 'cassiasilva140287@gmail.com', name: 'Cassia Juliane' }
      ]
    });

    const emails = plan.users.map((user) => user.email).sort();
    assert.deepEqual(emails, ['cassiasilva140287@gmail.com', 'cbamatriz@gmail.com']);

    const admin = plan.users.find((user) => user.email === 'cbamatriz@gmail.com');
    assert.equal(admin?.id, ALANA_ID);
    assert.equal(admin?.name, 'Alana');
    assert.equal(admin?.role, 'Administrador');
    assert.equal(admin?.companyId, COMPANY);

    const cassia = plan.users.find((user) => user.email === 'cassiasilva140287@gmail.com');
    assert.equal(cassia?.id, CASSIA_AUTH);
    assert.equal(cassia?.name, 'Cassia Juliane');
    assert.equal(cassia?.companyId, COMPANY);

    assert.equal(plan.toEnsureMembership.some((row) => row.userId === CASSIA_AUTH), true);
    assert.equal(plan.toUpsert.some((row) => row.id === CASSIA_AUTH && row.company_id === COMPANY), true);
    assert.equal(plan.toRemove.some((row) => row.id === 'u1'), true);
  });

  it('mantém o administrador logado visível mesmo se a lista vier incompleta', () => {
    const alana = {
      id: ALANA_ID,
      name: 'Alana',
      email: 'cbamatriz@gmail.com',
      role: UserRole.ADMIN,
      status: 'Ativo' as const
    };
    const shown = visibleCompanyUsers([], alana);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].name, 'Alana');
    const corrected = visibleCompanyUsers([{
      id: 'usr-local',
      name: 'Gabriel Andres',
      email: 'cbamatriz@gmail.com',
      role: UserRole.ADMIN,
      status: 'Ativo'
    }], alana);
    assert.equal(corrected.length, 1);
    assert.equal(corrected[0].name, 'Alana');
    assert.equal(corrected[0].id, ALANA_ID);
  });
});
