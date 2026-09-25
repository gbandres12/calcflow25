import React, { useEffect, useState } from 'react';
import { Building2, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users as UsersIcon, Wallet } from 'lucide-react';
import { CompanyBranch, CompanyBranchMember, CompanyModulePermissions, FinancialAccount, User } from '../types';
import { fetchBranches, createBranch, grantBranchAccess, revokeBranchAccess } from '../services/adminApi';
import {
  PERMISSION_GROUPS,
  buildEmptyPermissions,
  getFinanceAccountScope,
  groupHasAccess,
  setFinanceAccountScope,
  setGroupAccess
} from '../services/companyPermissions';
import { useConfirm } from './ui/ConfirmDialog';

interface Props {
  activeCompanyId: string;
  currentUser: User;
  /** Colaboradores já cadastrados na matriz — é de quem escolhemos pra delegar. */
  matrizUsers: User[];
  /** Caixas da empresa ativa — pra restringir o financeiro a contas específicas. */
  accounts: FinancialAccount[];
}

const AUTH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const roleOptions = ['Administrador', 'Gerente', 'Supervisor Operacional', 'Operador'];

const DelegateForm: React.FC<{
  companyId: string;
  activeCompanyId: string;
  candidates: User[];
  existingUserIds: string[];
  /** Caixas da empresa — vazio quando a empresa editada não é a ativa. */
  accounts: FinancialAccount[];
  /** Preenchido = editando o acesso de quem já é membro. */
  editing?: CompanyBranchMember;
  onDone: (branches: CompanyBranch[]) => void;
  onCancel: () => void;
}> = ({ companyId, activeCompanyId, candidates, existingUserIds, accounts, editing, onDone, onCancel }) => {
  // Só dá pra delegar a quem tem login (id = uuid do Supabase Auth); cadastros
  // antigos com id local (u-…) quebrariam a FK de company_memberships.
  const pickable = editing
    ? [{ id: editing.userId, name: editing.name || editing.email || editing.userId, email: editing.email || '' } as User]
    : candidates.filter((u) => AUTH_ID.test(u.id) && !existingUserIds.includes(u.id));
  const [userId, setUserId] = useState(pickable[0]?.id || '');
  const [role, setRole] = useState(editing?.role || 'Gerente');
  const [permissions, setPermissions] = useState<CompanyModulePermissions>(
    editing ? { ...buildEmptyPermissions(), ...editing.permissions } : buildEmptyPermissions()
  );
  const accountScope = getFinanceAccountScope(permissions);
  const financeGroup = PERMISSION_GROUPS.find((g) => g.key === 'financeiro');
  const canSeeFinance = financeGroup ? groupHasAccess(permissions, financeGroup, 'read') : false;
  const toggleAccount = (accountId: string, checked: boolean) => {
    const current = accountScope || accounts.map((a) => a.id);
    const next = checked ? Array.from(new Set([...current, accountId])) : current.filter((id) => id !== accountId);
    setPermissions((prev) => setFinanceAccountScope(prev, next));
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!userId) { setError('Escolha um colaborador.'); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await grantBranchAccess(activeCompanyId, { companyId, userId, role, permissions });
      onDone(result.branches);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o acesso.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-3">
      {pickable.length === 0 ? (
        <p className="text-sm text-slate-600">Todos os colaboradores com login já têm acesso aqui.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Colaborador
              <select value={userId} disabled={Boolean(editing)} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white">
                {pickable.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Cargo
              <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white">
                {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">O que ele pode ver/gravar aqui</p>
            <div className="space-y-1.5">
              {PERMISSION_GROUPS.map((group) => {
                const canRead = groupHasAccess(permissions, group, 'read');
                const canWrite = groupHasAccess(permissions, group, 'write');
                return (
                  <div key={group.key} className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-slate-700">{group.label}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canRead}
                          onChange={(e) => setPermissions((prev) => setGroupAccess(prev, group, { read: e.target.checked, write: e.target.checked ? canWrite : false }))}
                        />
                        Ver
                      </label>
                      <label className={`flex items-center gap-1.5 cursor-pointer ${!canRead ? 'opacity-40' : ''}`}>
                        <input
                          type="checkbox"
                          disabled={!canRead}
                          checked={canWrite}
                          onChange={(e) => setPermissions((prev) => setGroupAccess(prev, group, { read: true, write: e.target.checked }))}
                        />
                        Editar
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {canSeeFinance && accounts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5"><Wallet size={13} /> Quais caixas pode acessar</p>
              <label className="flex items-center gap-2 text-sm mb-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!accountScope}
                  onChange={(e) => setPermissions((prev) => setFinanceAccountScope(prev, e.target.checked ? null : []))}
                />
                Todos os caixas
              </label>
              {accountScope && (
                <div className="space-y-1.5">
                  {accounts.map((account) => (
                    <label key={account.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={accountScope.includes(account.id)}
                        onChange={(e) => toggleAccount(account.id, e.target.checked)}
                      />
                      {account.name}
                    </label>
                  ))}
                  <p className="text-[11px] text-slate-500">Com caixa restrito, a pessoa vê, lança e dá baixa só nesses caixas. Não exclui lançamentos nem cria ou edita contas.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 bg-white">Cancelar</button>
        {pickable.length > 0 && (
          <button type="button" onClick={submit} disabled={saving} className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-emerald-600 disabled:opacity-50">
            {saving ? 'Salvando…' : editing ? 'Salvar acesso' : 'Delegar acesso'}
          </button>
        )}
      </div>
    </div>
  );
};

export const CompanyBranches: React.FC<Props> = ({ activeCompanyId, currentUser, matrizUsers, accounts }) => {
  const confirmDialog = useConfirm();
  const [branches, setBranches] = useState<CompanyBranch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newBranchName, setNewBranchName] = useState('');
  const [creating, setCreating] = useState(false);
  const [delegatingFor, setDelegatingFor] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<{ companyId: string; member: CompanyBranchMember } | null>(null);

  const load = () => {
    setLoading(true);
    fetchBranches(activeCompanyId)
      .then((result) => { setBranches(result.branches); setError(null); })
      .catch((err) => setError(err?.message || 'Não foi possível carregar as filiais.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeCompanyId]);

  const handleCreate = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createBranch(activeCompanyId, name, currentUser.companyName);
      setBranches(result.branches);
      setNewBranchName('');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível criar a filial.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (companyId: string, userId: string) => {
    if (!(await confirmDialog({ title: 'Remover acesso?', description: 'Esse colaborador deixa de ver e editar os dados desta empresa.', confirmLabel: 'Remover', danger: true }))) return;
    try {
      const result = await revokeBranchAccess(activeCompanyId, { companyId, userId });
      setBranches(result.branches);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível remover o acesso.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><Building2 size={20} className="text-emerald-600" /> Filiais e Acessos</h2>
          <p className="text-sm text-slate-500 mt-1">Crie filiais e escolha exatamente o que cada colaborador vê e edita em cada uma.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            placeholder="Nome da nova filial"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-56"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !newBranchName.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-white bg-slate-900 rounded-lg disabled:opacity-50"
          >
            <Plus size={15} /> Nova filial
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-sm font-medium text-rose-700">{error}</div>
      )}

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && branches?.map((branch) => (
        <div key={branch.id} className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                {branch.name || (branch.isBranch ? 'Filial sem nome' : (currentUser.companyName || 'Matriz'))}
                {!branch.isBranch && <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Matriz</span>}
              </h3>
              <p className="text-xs text-slate-500">{branch.id}</p>
            </div>
            <button
              type="button"
              onClick={() => { setEditingMember(null); setDelegatingFor(delegatingFor === branch.id ? null : branch.id); }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 rounded-lg bg-emerald-50"
            >
              <UserPlus size={13} /> {delegatingFor === branch.id ? 'Fechar' : 'Delegar acesso'}
            </button>
          </div>

          <div className="space-y-1.5">
            {branch.members.map((member) => (
              <div key={member.userId} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2 text-sm">
                  <UsersIcon size={14} className="text-slate-400" />
                  <span className="font-semibold text-slate-700">{member.name || member.email || member.userId}</span>
                  <span className="text-xs text-slate-500">{member.role}</span>
                </div>
                {member.userId !== currentUser.id && (
                  <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setDelegatingFor(null); setEditingMember(editingMember?.member.userId === member.userId && editingMember.companyId === branch.id ? null : { companyId: branch.id, member }); }}
                    className="text-slate-500 hover:text-emerald-600"
                    title="Editar acesso"
                  >
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => handleRevoke(branch.id, member.userId)} className="text-slate-500 hover:text-rose-600" title="Remover acesso">
                    <Trash2 size={14} />
                  </button>
                  </div>
                )}
              </div>
            ))}
            {branch.members.length === 0 && (
              <p className="text-xs text-slate-500 italic">Ninguém tem acesso aqui ainda.</p>
            )}
          </div>

          {editingMember?.companyId === branch.id && (
            <DelegateForm
              key={editingMember.member.userId}
              companyId={branch.id}
              activeCompanyId={activeCompanyId}
              candidates={matrizUsers}
              existingUserIds={[]}
              accounts={branch.id === activeCompanyId ? accounts : []}
              editing={editingMember.member}
              onDone={(next) => { setBranches(next); setEditingMember(null); }}
              onCancel={() => setEditingMember(null)}
            />
          )}

          {delegatingFor === branch.id && (
            <DelegateForm
              companyId={branch.id}
              activeCompanyId={activeCompanyId}
              candidates={matrizUsers}
              existingUserIds={branch.members.map((m) => m.userId)}
              accounts={branch.id === activeCompanyId ? accounts : []}
              onDone={(next) => { setBranches(next); setDelegatingFor(null); }}
              onCancel={() => setDelegatingFor(null)}
            />
          )}
        </div>
      ))}

      <div className="flex items-start gap-2 text-xs text-slate-500 px-1">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        <p>O que marcar aqui vale de verdade no banco de dados — quem não tiver "Ver" marcado num módulo não recebe esses dados nem contornando o app.</p>
      </div>
    </div>
  );
};

export default CompanyBranches;
