
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { 
  Users, UserPlus, Shield, Mail, 
  CheckCircle2, Sparkles, Building2, Phone, Briefcase,
  XCircle, Edit, X, ShieldCheck, 
  Search, KeyRound, Copy, Check
} from 'lucide-react';

interface UserManagementProps {
  users: User[];
  currentUser?: User | null;
  onAddUser: (user: Omit<User, 'id'>) => void;
  onUpdateUser: (user: User) => void;
  onOpenOnboarding?: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ 
  users, 
  currentUser,
  onAddUser, 
  onUpdateUser,
  onOpenOnboarding
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: UserRole;
    status: 'Ativo' | 'Inativo';
    jobTitle?: string;
    phone?: string;
  }>({
    name: '',
    email: '',
    role: UserRole.OPERATOR,
    status: 'Ativo',
    jobTitle: 'Operador de Pátio e Balança',
    phone: ''
  });

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.jobTitle && u.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      onUpdateUser({ ...editingUser, ...formData });
    } else {
      onAddUser({
        ...formData,
        companyName: currentUser?.companyName || 'CalcárioFlow Mineração',
        onboardingCompleted: true,
        createdAt: new Date().toISOString()
      });
    }
    handleClose();
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      jobTitle: user.jobTitle || '',
      phone: user.phone || ''
    });
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormData({ 
      name: '', 
      email: '', 
      role: UserRole.OPERATOR, 
      status: 'Ativo',
      jobTitle: 'Operador de Pátio e Balança',
      phone: ''
    });
  };

  const handleCopyCredentials = (user: User) => {
    const credText = `*Acesso CalcárioFlow ERP*\nUsuário: ${user.email}\nSenha provisória: 123456\nCargo: ${user.role} (${user.jobTitle || 'Equipe'})\nLink: https://calcarioflow.com.br`;
    navigator.clipboard?.writeText(credText);
    setCopiedId(user.id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN: return 'bg-rose-50 text-rose-600 border-rose-100';
      case UserRole.MANAGER: return 'bg-purple-50 text-purple-600 border-purple-100';
      default: return 'bg-blue-50 text-blue-600 border-blue-100';
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Equipe & Permissões SaaS</h2>
            <span className="bg-purple-50 text-purple-700 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border border-purple-100">
              {users.length} Membros Cadastrados
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium">
            Gerencie operadores da balança, gerentes comerciais e diretores da usina
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {onOpenOnboarding && (
            <button
              onClick={onOpenOnboarding}
              className="bg-white text-purple-700 border border-purple-200 px-5 py-3.5 rounded-2xl font-black flex items-center gap-2 hover:bg-purple-50 transition-all text-xs active:scale-95 shadow-sm"
            >
              <Sparkles size={16} className="text-purple-600" /> Assistente de Onboarding
            </button>
          )}

          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-purple-600 text-white px-7 py-3.5 rounded-2xl font-black flex items-center gap-2 hover:bg-purple-700 transition-all text-sm shadow-xl shadow-purple-100 active:scale-95"
          >
            <UserPlus size={18} /> Novo Usuário
          </button>
        </div>
      </header>

      {/* Cards de Resumo da Equipe */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
            <Shield size={22} />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Administradores</span>
            <p className="text-xl font-black text-slate-800">
              {users.filter(u => u.role === UserRole.ADMIN).length}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
            <Briefcase size={22} />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Gerentes / Vendas</span>
            <p className="text-xl font-black text-slate-800">
              {users.filter(u => u.role === UserRole.MANAGER).length}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <Users size={22} />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Operadores de Balança / Pátio</span>
            <p className="text-xl font-black text-slate-800">
              {users.filter(u => u.role === UserRole.OPERATOR).length}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, e-mail ou cargo..." 
            className="w-full pl-12 pr-6 py-3.5 bg-white border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-medium text-sm transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Usuário / Cargo</th>
                <th className="px-6 py-4">Nível de Acesso</th>
                <th className="px-6 py-4">Empresa / Usina</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Último Acesso</th>
                <th className="px-8 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center opacity-30 italic font-bold">Nenhum usuário encontrado.</td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-white font-black text-sm shadow-lg">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{user.name}</p>
                          <p className="text-xs text-purple-700 font-bold">{user.jobTitle || 'Membro da Equipe'}</p>
                          <div className="flex items-center gap-3 text-[10px] font-medium text-slate-400 mt-0.5">
                             <span className="flex items-center gap-1"><Mail size={10} /> {user.email}</span>
                             {user.phone && <span className="flex items-center gap-1"><Phone size={10} /> {user.phone}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border flex items-center gap-1.5 w-fit ${getRoleBadge(user.role)}`}>
                        <Shield size={10} /> {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Building2 size={14} className="text-slate-400" />
                        {user.companyName || 'CalcárioFlow Matriz'}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase ${user.status === 'Ativo' ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {user.status === 'Ativo' ? <CheckCircle2 size={12}/> : <XCircle size={12}/>}
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-[10px] font-bold text-slate-400">
                      {user.lastAccess ? new Date(user.lastAccess).toLocaleString('pt-BR') : 'Hoje'}
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => handleCopyCredentials(user)} 
                          className={`p-2 rounded-xl transition-all ${copiedId === user.id ? 'bg-emerald-100 text-emerald-700 font-bold' : 'text-slate-400 hover:text-purple-600 hover:bg-purple-50'}`} 
                          title="Copiar Credenciais de Acesso"
                        >
                          {copiedId === user.id ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                        <button onClick={() => handleEdit(user)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all" title="Editar Perfil">
                          <Edit size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-8 md:p-10 shadow-2xl animate-in zoom-in-95 overflow-y-auto max-h-[95vh] custom-scrollbar">
             <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                    {editingUser ? 'Editar Membro' : 'Convidar para a Equipe'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Libere acesso operacional ou administrativo</p>
                </div>
                <button onClick={handleClose} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-colors"><X/></button>
             </div>

             <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome Completo *</label>
                   <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" placeholder="Ex: Lucas Santarém" />
                </div>

                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail de Acesso Corporativo *</label>
                   <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" placeholder="lucas@calcarioflow.com.br" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo / Função</label>
                     <input type="text" value={formData.jobTitle || ''} onChange={e => setFormData({...formData, jobTitle: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" placeholder="Ex: Operador de Balança" />
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp</label>
                     <input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" placeholder="(93) 99100-0000" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Papel / Nível</label>
                      <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                         <option value={UserRole.ADMIN}>Administrador (Acesso Total)</option>
                         <option value={UserRole.MANAGER}>Gerente (Produção / Vendas)</option>
                         <option value={UserRole.OPERATOR}>Operador (Balança / Pátio)</option>
                      </select>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status da Conta</label>
                      <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                         <option value="Ativo">Ativo</option>
                         <option value="Inativo">Inativo / Bloqueado</option>
                      </select>
                   </div>
                </div>

                <div className="p-4 bg-slate-900 rounded-3xl mt-4 border border-slate-800 text-white space-y-1">
                   <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-wider">
                      <ShieldCheck size={16} /> Senha Provisória Inicial
                   </div>
                   <p className="text-[11px] text-slate-400 font-medium">
                     A senha provisória de primeiro login para novos membros é <strong className="text-white font-mono">123456</strong>.
                   </p>
                </div>

                <button type="submit" className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black shadow-xl mt-4 uppercase tracking-widest text-xs hover:bg-purple-700 transition-all active:scale-95">
                  {editingUser ? 'Salvar Alterações' : 'Cadastrar Membro na Equipe'}
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;


