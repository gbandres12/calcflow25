import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickAdminMembership, pickMembershipCompanyId } from './membershipCompany';

describe('membership: empresa do convite, não a pasta mais antiga', () => {
  const rows = [
    { company_id: 'comp-agosto', created_at: '2026-08-26T01:00:00.000Z', role: 'Administrador' },
    { company_id: 'comp-setembro', created_at: '2026-09-08T20:13:05.000Z', role: 'Administrador' }
  ];

  it('usa a empresa preferida (metadado do convite) quando o usuário pertence a ela', () => {
    assert.equal(pickMembershipCompanyId(rows, 'comp-setembro'), 'comp-setembro');
  });

  it('se não houver preferência, escolhe a pasta mais nova', () => {
    assert.equal(pickMembershipCompanyId(rows, null), 'comp-setembro');
  });

  it('admin segue a mesma regra', () => {
    const picked = pickAdminMembership(rows, 'comp-setembro');
    assert.equal(picked?.company_id, 'comp-setembro');
  });
});
