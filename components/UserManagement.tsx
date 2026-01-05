
import React, { useState } from 'react';
import { User, UserRole, Company } from '../types';
import { 
  Users, UserPlus, Shield, Mail, 
  Lock, MoreVertical, CheckCircle2, 
  XCircle, Edit, Trash2, X, ShieldCheck, 
  Search, ShieldAlert, KeyRound, Building2
} from 'lucide-react';

interface UserManagementProps {
  users: User[];
  companies: Company[];
  onAddUser: (user: Omit<User, 'id'>) => void;
  onUpdateUser: (user: User) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, companies, onAddUser, onUpdateUser }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: UserRole;
    status: 'Ativo' | 'Inativo';
    companyId: string;
  }>({
    name: '',
    email: '',
    role: UserRole.OPERATOR,
    status: 'Ativo',
    companyId: companies[0]?.id || ''
  });

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      onUpdateUser({ ...editingUser, ...formData });
    } else {
      onAddUser(formData);
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
      companyId: user.companyId || companies[0]?.id || ''
    });
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormData({ name: '', email: '', role: UserRole.OPERATOR, status: 'Ativo', companyId: companies[0]?.id || '' });
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
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Equipe e Acessos</h2>
          <p className="text-slate-500 text-sm font-medium">Controle quem pode acessar e operar o CalcárioFlow</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-purple-600 text-white px-8 py-3.5 rounded-2xl font-black flex items-center gap-2 hover:bg-purple-700 transition-all text-sm shadow-xl shadow-purple-100 active:scale-95"
        >
          <UserPlus size={20} /> Convidar Membro
        </button>
      </header>

      <div className="grid grid-cols-1 md:flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail..." 
            className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-medium text-sm transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Usuário / Filial</th>
                <th className="px-6 py-4">Nível de Acesso</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Último Login</th>
                <th className="px-8 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center opacity-30 italic font-bold">Nenhum usuário encontrado.</td>
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
                          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                             <span className="flex items-center gap-1 uppercase bg-slate-100 px-1.5 py-0.5 rounded text-[8px] tracking-widest">
                               <Building2 size={10} className="text-purple-500" />
                               {companies.find(c => c.id === user.companyId)?.code || 'Global'}
                             </span>
                             <span className="flex items-center gap-1"><Mail size={10} /> {user.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border flex items-center gap-1.5 w-fit ${getRoleBadge(user.role)}`}>
                        <Shield size={10} /> {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase ${user.status === 'Ativo' ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {user.status === 'Ativo' ? <CheckCircle2 size={12}/> : <XCircle size={12}/>}
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-[10px] font-bold text-slate-400">
                      {user.lastAccess ? new Date(user.lastAccess).toLocaleString('pt-BR') : 'Nunca acessou'}
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleEdit(user)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all" title="Editar Perfil"><Edit size={16} /></button>
                        <button className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all" title="Resetar Senha"><KeyRound size={16} /></button>
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
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-10 shadow-2xl animate-in zoom-in-95 overflow-y-auto max-h-[95vh] custom-scrollbar">
             <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                  {editingUser ? 'Editar Membro' : 'Convidar para a Equipe'}
                </h3>
                <button onClick={handleClose} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-colors"><X/></button>
             </div>

             <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome Completo</label>
                   <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" placeholder="Ex: Lucas Santarém" />
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail de Acesso</label>
                   <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" placeholder="lucas@calcarioflow.com.br" />
                </div>
                
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filial Vinculada</label>
                   <select required value={formData.companyId} onChange={e => setFormData({...formData, companyId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                   </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Papel / Nível</label>
                      <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                         <option value={UserRole.ADMIN}>Administrador (Total)</option>
                         <option value={UserRole.MANAGER}>Gerente (Filial)</option>
                         <option value={UserRole.OPERATOR}>Operador (Pátio)</option>
                      </select>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status da Conta</label>
                      <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                         <option value="Ativo">Ativo</option>
                         <option value="Inativo">Inativo / Bloqueado</option>
                      </select>
                   </div>
                </div>

                <div className="p-6 bg-slate-900 rounded-[2.5rem] mt-6 border border-slate-800 shadow-xl">
                   <div className="flex items-center gap-3 text-amber-400 mb-2">
                      <ShieldCheck size={20} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Segurança de Dados</span>
                   </div>
                   <p className="text-[10px] text-slate-400 leading-relaxed uppercase font-bold tracking-tight">
                     Uma senha provisória padrão (123456) será atribuída. O usuário poderá alterá-la após o primeiro acesso ao painel.
                   </p>
                </div>

                <button type="submit" className="w-full py-5 bg-purple-600 text-white rounded-2xl font-black shadow-xl mt-4 uppercase tracking-widest text-xs hover:bg-purple-700 transition-all active:scale-95">
                  {editingUser ? 'Salvar Alterações' : 'Confirmar e Convidar'}
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
