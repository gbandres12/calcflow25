import React, { useState } from 'react';
import { User, UserRole, UserPermissions } from '../types';
import { 
  Users, UserPlus, Shield, Mail, 
  CheckCircle2, Sparkles, Building2, Phone, Briefcase,
  XCircle, Edit, X, ShieldCheck, 
  Search, Copy, Check, Send, Scale, Factory,
  DollarSign, Package, Truck, Trash2, Sliders, AlertCircle,
  Eye, EyeOff, KeyRound
} from 'lucide-react';
import { DeletionPasswordModal } from './DeletionPasswordModal';
import { TelegramAccessCard } from './TelegramAccessCard';

export const getDefaultPermissions = (role: UserRole): UserPermissions => {
  switch (role) {
    case UserRole.ADMIN:
    case UserRole.MANAGER:
      return { financial: true, users: true, inventory: true, orders: true };
    case UserRole.OPERATIONAL_SUPERVISOR:
      return { financial: false, users: true, inventory: true, orders: true };
    case UserRole.OPERATOR:
    default:
      return { financial: false, users: false, inventory: true, orders: true };
  }
};

interface UserManagementProps {
  users: User[];
  currentUser?: User | null;
  onAddUser: (user: Omit<User, 'id'> & { password?: string }) => Promise<User> | User;
  onUpdateUser: (user: User & { newPassword?: string }) => void;
  onDeleteUser?: (id: string) => void;
  onOpenOnboarding?: () => void;
  onVerifyDeletionPassword?: (password: string) => boolean | Promise<boolean>;
}

const UserManagement: React.FC<UserManagementProps> = ({ 
  users, 
  currentUser,
  onAddUser, 
  onUpdateUser,
  onDeleteUser,
  onOpenOnboarding,
  onVerifyDeletionPassword
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [invitePasswords, setInvitePasswords] = useState<Record<string, string>>({});
  const [savingUser, setSavingUser] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const canManage = !currentUser || currentUser.role === UserRole.ADMIN || currentUser.permissions?.users !== false;

  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: UserRole;
    status: 'Ativo' | 'Inativo';
    jobTitle?: string;
    phone?: string;
    password?: string;
    permissions: UserPermissions;
  }>({
    name: '',
    email: '',
    role: UserRole.OPERATOR,
    status: 'Ativo',
    jobTitle: 'Operador de Balança e Expedição',
    phone: '',
    password: '',
    permissions: getDefaultPermissions(UserRole.OPERATOR)
  });

  const filteredUsers = users.filter(u => 
    String(u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    String(u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.jobTitle && u.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = formData.name.trim();
    const cleanEmail = formData.email.trim().toLowerCase();

    if (!cleanName) {
      setFormError('Informe o nome completo do colaborador.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Informe um e-mail corporativo válido.');
      return;
    }

    if (editingUser) {
      const { password: _pw, ...rest } = formData;
      try {
        await onUpdateUser({
          ...editingUser,
          ...rest,
          name: cleanName,
          ...(newPassword.trim().length >= 6 ? { newPassword: newPassword.trim() } : {})
        });
        if (newPassword.trim().length >= 6) {
          setInvitePasswords(prev => ({ ...prev, [editingUser.id]: newPassword.trim() }));
        }
        handleClose();
      } catch (err: any) {
        setFormError(err?.message || 'Falha ao atualizar dados do colaborador.');
      }
      return;
    }

    const password = (formData.password || '').trim();
    if (password.length < 6) {
      setFormError('A senha de acesso deve ter pelo menos 6 caracteres.');
      return;
    }

    setSavingUser(true);
    try {
      const created = await onAddUser({
        ...formData,
        name: cleanName,
        email: cleanEmail,
        password,
        companyName: currentUser?.companyName || 'CalcárioFlow Mineração',
        onboardingCompleted: true,
        createdAt: new Date().toISOString()
      });
      if (created?.id) {
        setInvitePasswords(prev => ({ ...prev, [created.id]: password }));
      }
      handleClose();
    } catch (err: any) {
      setFormError(err?.message || 'Não foi possível cadastrar o colaborador.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleEdit = (user: User) => {
    setFormError(null);
    setNewPassword('');
    setShowNewPassword(false);
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      jobTitle: user.jobTitle || '',
      phone: user.phone || '',
      permissions: user.permissions || getDefaultPermissions(user.role)
    });
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormError(null);
    setNewPassword('');
    setShowNewPassword(false);
    setFormData({ 
      name: '', 
      email: '', 
      role: UserRole.OPERATOR, 
      status: 'Ativo',
      jobTitle: 'Operador de Balança e Expedição',
      phone: '',
      password: '',
      permissions: getDefaultPermissions(UserRole.OPERATOR)
    });
  };

  const buildAccessShareText = (user: User) => {
    const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://calcarioflow.com.br';
    const knownPassword = invitePasswords[user.id];
    const passwordLine = knownPassword
      ? `🔑 Senha: ${knownPassword}`
      : `🔑 Senha: use "Esqueci minha senha" em ${appOrigin} para definir uma nova senha`;
    return `*Acesso ao CalcárioFlow ERP*\nOlá ${user.name}, seu login na Usina está liberado:\n\n👤 E-mail: ${user.email}\n${passwordLine}\n📌 Função: ${user.jobTitle || user.role}\n🏢 Unidade: ${user.companyName || currentUser?.companyName || 'CalcárioFlow'}\n\n📱 Acesse pelo link:\n${appOrigin}`;
  };

  const handleCopyCredentials = (user: User) => {
    navigator.clipboard?.writeText(buildAccessShareText(user));
    setCopiedId(user.id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  const handleSendWhatsApp = (user: User) => {
    const cleanPhone = (user.phone || '').replace(/\D/g, '');
    const encoded = encodeURIComponent(buildAccessShareText(user));
    const url = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleSelectPreset = (presetRole: UserRole, presetTitle: string) => {
    setFormData(prev => ({
      ...prev,
      role: presetRole,
      jobTitle: presetTitle,
      permissions: getDefaultPermissions(presetRole)
    }));
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN: return 'bg-slate-900 text-white border-slate-700';
      case UserRole.MANAGER: return 'bg-purple-100 text-purple-800 border-purple-200';
      case UserRole.OPERATIONAL_SUPERVISOR: return 'bg-amber-100 text-amber-900 border-amber-300';
      default: return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Equipe & Gestão de Pessoas</h2>
            <span className="bg-slate-200 text-slate-700 text-[11px] font-black uppercase px-2.5 py-1 rounded-full">
              {users.length} Integrantes
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium">
            Cadastre colaboradores e defina permissões de acesso por módulo (Operacional vs. Administrativo)
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {onOpenOnboarding && (
            <button
              onClick={onOpenOnboarding}
              className="bg-white text-slate-700 border border-slate-300 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all text-xs shadow-sm"
            >
              <Sparkles size={15} className="text-amber-500" /> Assistente
            </button>
          )}

          {canManage && (
            <button 
              onClick={() => { setFormError(null); setIsModalOpen(true); }}
              className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all text-sm shadow-sm active:scale-95"
            >
              <UserPlus size={16} /> Convidar Usuário
            </button>
          )}
        </div>
      </header>

      {/* Cards de Resumo da Equipe */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
            <Scale size={20} />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Operadores de Balança</span>
            <p className="text-xl font-black text-slate-800">
              {users.filter(u => u.role === UserRole.OPERATOR).length}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
            <Factory size={20} />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Supervisores Operacionais</span>
            <p className="text-xl font-black text-amber-800">
              {users.filter(u => u.role === UserRole.OPERATIONAL_SUPERVISOR).length}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-purple-50 text-purple-700 rounded-xl">
            <Briefcase size={20} />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Gerentes / Comercial</span>
            <p className="text-xl font-black text-slate-800">
              {users.filter(u => u.role === UserRole.MANAGER).length}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-slate-100 text-slate-800 rounded-xl">
            <Shield size={20} />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Administradores</span>
            <p className="text-xl font-black text-slate-800">
              {users.filter(u => u.role === UserRole.ADMIN).length}
            </p>
          </div>
        </div>
      </div>

      <TelegramAccessCard />

      <div className="grid grid-cols-1 md:flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, e-mail, WhatsApp ou cargo..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-slate-800 font-medium text-sm transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                <th className="px-6 py-3.5">Colaborador / Função</th>
                <th className="px-4 py-3.5">Nível de Acesso</th>
                <th className="px-4 py-3.5">Permissões por Módulo</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Último Acesso</th>
                <th className="px-6 py-3.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500 text-xs font-medium">Nenhum colaborador encontrado.</td>
                </tr>
              ) : (
                filteredUsers.map(user => {
                  const perms = user.permissions || getDefaultPermissions(user.role);
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {(user.name || user.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 leading-tight">{user.name}</p>
                            <p className="text-xs text-slate-500 font-medium">{user.jobTitle || 'Equipe de Operações'}</p>
                            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                               <span className="flex items-center gap-1"><Mail size={11} /> {user.email}</span>
                               {user.phone && <span className="flex items-center gap-1"><Phone size={11} /> {user.phone}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase border flex items-center gap-1 w-fit ${getRoleBadge(user.role)}`}>
                          {user.role === UserRole.OPERATOR ? <Scale size={11} /> : user.role === UserRole.MANAGER ? <Briefcase size={11} /> : <Shield size={11} />}
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                            perms.financial ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-500 border-slate-200 opacity-60 line-through'
                          }`} title={perms.financial ? "Financeiro Liberado" : "Financeiro Restrito"}>
                            💰 Financeiro
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                            perms.users ? 'bg-purple-50 text-purple-800 border-purple-300' : 'bg-slate-100 text-slate-500 border-slate-200 opacity-60 line-through'
                          }`} title={perms.users ? "Usuários Liberado" : "Usuários Restrito"}>
                            👥 Usuários
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                            perms.inventory ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-500 border-slate-200 opacity-60 line-through'
                          }`} title={perms.inventory ? "Estoque Liberado" : "Estoque Restrito"}>
                            📦 Estoque
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                            perms.orders ? 'bg-blue-50 text-blue-800 border-blue-300' : 'bg-slate-100 text-slate-500 border-slate-200 opacity-60 line-through'
                          }`} title={perms.orders ? "Carregamentos Liberado" : "Carregamentos Restrito"}>
                            🚚 Carregamentos
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`flex items-center gap-1 text-xs font-bold ${user.status === 'Ativo' ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {user.status === 'Ativo' ? <CheckCircle2 size={13}/> : <XCircle size={13}/>}
                          {user.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">
                        {user.lastAccess ? new Date(user.lastAccess).toLocaleDateString('pt-BR') : 'Hoje'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center items-center gap-1.5">
                          <button 
                            onClick={() => handleSendWhatsApp(user)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all border border-emerald-200"
                            title="Enviar convite de acesso via WhatsApp"
                          >
                            <Send size={14} />
                          </button>
                          <button 
                            onClick={() => handleCopyCredentials(user)} 
                            className={`p-1.5 rounded-lg transition-all border ${copiedId === user.id ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 border-slate-200'}`} 
                            title={invitePasswords[user.id] ? 'Copiar e-mail e senha do convite' : 'Copiar e-mail e instrução de redefinição'}
                          >
                            {copiedId === user.id ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                          {canManage && (
                            <button 
                              onClick={() => handleEdit(user)} 
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all border border-slate-200" 
                              title="Editar Dados e Permissões"
                            >
                              <Edit size={14} />
                            </button>
                          )}
                          {onDeleteUser && canManage && user.id !== currentUser?.id && (
                            <button 
                              onClick={() => {
                                setUserToDelete(user);
                                setIsDeleteModalOpen(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-slate-200" 
                              title="Excluir usuário"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Convidar / Editar Usuário com Painel de Permissões */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl p-6 md:p-8 shadow-xl border border-slate-200 animate-in zoom-in-95 overflow-y-auto max-h-[92vh] custom-scrollbar">
             <div className="flex justify-between items-center pb-4 border-b border-slate-200 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                    {editingUser ? 'Editar Dados e Permissões do Usuário' : 'Convidar Novo Usuário para a Usina'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Configure perfis operacionais vs. administrativos e controle de acesso</p>
                </div>
                <button onClick={handleClose} className="p-1 text-slate-500 hover:text-slate-700 rounded-lg transition-colors"><X size={18}/></button>
             </div>

             <form onSubmit={handleSubmit} className="space-y-5">
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0 text-rose-500" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Perfis Rápidos Pré-configurados */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Modelos Rápidos de Cargo</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(UserRole.OPERATOR, 'Operador de Balança e Expedição')}
                      className={`p-2 rounded-lg border text-left font-bold transition-all flex items-center gap-2 ${
                        formData.jobTitle === 'Operador de Balança e Expedição' 
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Scale size={14} className="shrink-0" />
                      <span className="truncate">Op. de Balança</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(UserRole.OPERATIONAL_SUPERVISOR, 'Supervisor de Operações & Pátio')}
                      className={`p-2 rounded-lg border text-left font-bold transition-all flex items-center gap-2 ${
                        formData.jobTitle === 'Supervisor de Operações & Pátio' 
                          ? 'bg-amber-700 text-white border-amber-700 shadow-sm' 
                          : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      <Factory size={14} className="shrink-0" />
                      <span className="truncate">Supervisor Operac.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(UserRole.MANAGER, 'Gerente Comercial & Vendas')}
                      className={`p-2 rounded-lg border text-left font-bold transition-all flex items-center gap-2 ${
                        formData.jobTitle === 'Gerente Comercial & Vendas' 
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Briefcase size={14} className="shrink-0" />
                      <span className="truncate">Gerente Vendas</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(UserRole.ADMIN, 'Administrador Geral da Usina')}
                      className={`p-2 rounded-lg border text-left font-bold transition-all flex items-center gap-2 ${
                        formData.jobTitle === 'Administrador Geral da Usina' 
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Shield size={14} className="shrink-0" />
                      <span className="truncate">Diretor / Admin</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-700">Nome Completo *</label>
                   <input 
                     required 
                     type="text" 
                     value={formData.name} 
                     onChange={e => setFormData({...formData, name: e.target.value})} 
                     className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-slate-800 font-medium text-sm" 
                     placeholder="Ex: Carlos Eduardo Silveira" 
                   />
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-700">E-mail Corporativo de Acesso *</label>
                   <input 
                     required 
                     type="email" 
                     disabled={Boolean(editingUser)}
                     value={formData.email} 
                     onChange={e => setFormData({...formData, email: e.target.value})} 
                     className={`w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-slate-800 font-medium text-sm ${editingUser ? 'bg-slate-100 cursor-not-allowed text-slate-500' : ''}`} 
                     placeholder="operador.balanca@usina.com.br" 
                   />
                   {editingUser && (
                     <p className="text-xs text-slate-500">O e-mail de acesso é a credencial de login e não pode ser alterado diretamente.</p>
                   )}
                </div>

                {!editingUser && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Senha de Acesso *</label>
                    <input
                      required
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      value={formData.password || ''}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-slate-800 font-medium text-sm"
                      placeholder="Mínimo 6 caracteres"
                    />
                    <p className="text-xs text-slate-500">Essa senha só aparece no WhatsApp e na cópia se o convite for enviado nesta sessão. Depois, o colaborador usa “Esqueci minha senha”.</p>
                  </div>
                )}

                {/* Redefinir senha – só aparece no modo de edição */}
                {editingUser && (
                  <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <KeyRound size={15} className="text-amber-600" />
                      <span className="text-xs font-black text-amber-900 uppercase tracking-wide">Redefinir Senha do Usuário</span>
                    </div>
                    <p className="text-xs text-amber-800 font-medium">
                      Como administrador, você pode definir uma nova senha diretamente — sem necessidade de e-mail de recuperação.
                      Deixe em branco para não alterar a senha atual.
                    </p>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full p-2.5 pr-10 bg-white border border-amber-300 rounded-lg outline-none focus:border-amber-500 font-medium text-sm"
                        placeholder="Nova senha (mín. 6 caracteres) — opcional"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors"
                        tabIndex={-1}
                      >
                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {newPassword.length > 0 && newPassword.length < 6 && (
                      <p className="text-xs text-rose-600 font-bold">A senha deve ter pelo menos 6 caracteres.</p>
                    )}
                    {newPassword.trim().length >= 6 && (
                      <p className="text-xs text-emerald-700 font-bold">✓ Nova senha será aplicada ao salvar.</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-700">Cargo / Descrição da Função</label>
                     <input 
                       type="text" 
                       value={formData.jobTitle || ''} 
                       onChange={e => setFormData({...formData, jobTitle: e.target.value})} 
                       className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-slate-800 font-medium text-sm" 
                       placeholder="Ex: Supervisor Operacional" 
                     />
                  </div>
                  <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-700">WhatsApp (com DDD)</label>
                     <input 
                       type="text" 
                       value={formData.phone || ''} 
                       onChange={e => setFormData({...formData, phone: e.target.value})} 
                       className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-slate-800 font-medium text-sm" 
                       placeholder="(93) 99123-4567" 
                     />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Nível de Permissão Base</label>
                      <select 
                        value={formData.role} 
                        onChange={e => {
                          const newRole = e.target.value as UserRole;
                          setFormData({
                            ...formData,
                            role: newRole,
                            permissions: getDefaultPermissions(newRole)
                          });
                        }} 
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-xs outline-none"
                      >
                         <option value={UserRole.OPERATOR}>Operador (Balança, Romaneio e Pátio)</option>
                         <option value={UserRole.OPERATIONAL_SUPERVISOR}>Supervisor Operacional (Sem Financeiro)</option>
                         <option value={UserRole.MANAGER}>Gerente (Vendas, Estoque e Caixa)</option>
                         <option value={UserRole.ADMIN}>Administrador (Acesso Total)</option>
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Status da Conta</label>
                      <select 
                        value={formData.status} 
                        disabled={editingUser?.id === currentUser?.id}
                        onChange={e => setFormData({...formData, status: e.target.value as any})} 
                        className={`w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-xs outline-none ${editingUser?.id === currentUser?.id ? 'bg-slate-100 cursor-not-allowed text-slate-500' : ''}`}
                      >
                         <option value="Ativo">Ativo</option>
                         <option value="Inativo">Inativo / Bloqueado</option>
                      </select>
                      {editingUser?.id === currentUser?.id && (
                        <p className="text-xs text-slate-500">Você não pode inativar a sua própria conta ativa em uso.</p>
                      )}
                   </div>
                </div>

                {/* PAINEL DE PERMISSÕES POR PERFIL E MÓDULOS (CHECKBOXES INDIVIDUAIS) */}
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/70 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Sliders size={16} className="text-slate-800" />
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                        Painel de Permissões de Acesso por Módulo
                      </h4>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      Personalizar Acessos
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 font-medium">
                    Marque os checkboxes para liberar ou restringir os módulos específicos do sistema para este colaborador:
                  </p>

                  {/* Atalhos Rápidos */}
                  <div className="flex flex-wrap gap-2 text-xs pb-1">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, permissions: { financial: true, users: true, inventory: true, orders: true } }))}
                      className="px-2.5 py-1.5 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-all flex items-center gap-1 text-xs"
                    >
                      🛡️ Perfil Administrativo (Geral)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, permissions: { financial: false, users: true, inventory: true, orders: true } }))}
                      className="px-2.5 py-1.5 bg-amber-100 text-amber-900 font-bold rounded-lg hover:bg-amber-200 border border-amber-300 transition-all flex items-center gap-1 text-xs"
                    >
                      👷 Perfil Operacional (Supervisor)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, permissions: { financial: false, users: false, inventory: true, orders: true } }))}
                      className="px-2.5 py-1.5 bg-emerald-100 text-emerald-900 font-bold rounded-lg hover:bg-emerald-200 border border-emerald-300 transition-all flex items-center gap-1 text-xs"
                    >
                      ⚖️ Perfil Operacional (Balança)
                    </button>
                  </div>

                  {/* Checkboxes em Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {/* Checkbox Financeiro */}
                    <label className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                      formData.permissions.financial 
                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-xs' 
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                      <input 
                        type="checkbox"
                        checked={formData.permissions.financial}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          permissions: { ...prev.permissions, financial: e.target.checked }
                        }))}
                        className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                          <DollarSign size={14} className={formData.permissions.financial ? "text-emerald-600" : "text-slate-400"} />
                          Financeiro
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5 leading-snug">
                          Caixa diário, extrato, DRE, contas bancárias e emissão fiscal (NF-e).
                        </p>
                      </div>
                    </label>

                    {/* Checkbox Usuários */}
                    <label className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                      formData.permissions.users 
                        ? 'bg-purple-50/90 border-purple-300 text-purple-950 shadow-xs' 
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                      <input 
                        type="checkbox"
                        checked={formData.permissions.users}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          permissions: { ...prev.permissions, users: e.target.checked }
                        }))}
                        className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                          <Users size={14} className={formData.permissions.users ? "text-purple-600" : "text-slate-400"} />
                          Usuários
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5 leading-snug">
                          Gestão de equipe, cadastro de funcionários e controle de permissões.
                        </p>
                      </div>
                    </label>

                    {/* Checkbox Estoque */}
                    <label className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                      formData.permissions.inventory 
                        ? 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-xs' 
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                      <input 
                        type="checkbox"
                        checked={formData.permissions.inventory}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          permissions: { ...prev.permissions, inventory: e.target.checked }
                        }))}
                        className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                          <Package size={14} className={formData.permissions.inventory ? "text-amber-600" : "text-slate-400"} />
                          Estoque
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5 leading-snug">
                          Estoque mineral, sacaria moída, britagem e ordens de produção.
                        </p>
                      </div>
                    </label>

                    {/* Checkbox Carregamentos */}
                    <label className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                      formData.permissions.orders 
                        ? 'bg-blue-50/90 border-blue-300 text-blue-950 shadow-xs' 
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                      <input 
                        type="checkbox"
                        checked={formData.permissions.orders}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          permissions: { ...prev.permissions, orders: e.target.checked }
                        }))}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                          <Truck size={14} className={formData.permissions.orders ? "text-blue-600" : "text-slate-400"} />
                          Carregamentos
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5 leading-snug">
                          Vendas, pesagem na balança rodoviária, pátio e romaneios de carga.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                   <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <ShieldCheck size={14} className="text-emerald-600" /> Convite de acesso
                   </div>
                   <p className="text-xs text-slate-500">
                     Após salvar, copie as credenciais ou envie o convite no WhatsApp do colaborador.
                   </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={handleClose} 
                    className="w-1/3 py-2.5 border border-slate-300 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={savingUser}
                    className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all shadow-sm disabled:opacity-60"
                  >
                    {savingUser ? 'Salvando...' : editingUser ? 'Salvar Alterações & Permissões' : 'Confirmar & Cadastrar'}
                  </button>
                </div>
             </form>
          </div>
        </div>
      )}

      {userToDelete && (
        <DeletionPasswordModal
          isOpen={isDeleteModalOpen}
          title="Excluir Colaborador"
          description={`Tem certeza que deseja apagar o usuário ${userToDelete.name} (${userToDelete.email})? Esta ação revogará o acesso ao sistema imediatamente. Digite a sua senha de acesso para confirmar.`}
          itemDescription={`Usuário: ${userToDelete.name}`}
          onConfirm={() => {
            if (onDeleteUser && userToDelete) {
              onDeleteUser(userToDelete.id);
            }
            setIsDeleteModalOpen(false);
            setUserToDelete(null);
          }}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setUserToDelete(null);
          }}
          onVerifyPassword={onVerifyDeletionPassword}
        />
      )}
    </div>
  );
};

export default UserManagement;
