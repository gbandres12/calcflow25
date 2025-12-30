
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { 
  Users, UserPlus, Shield, Mail, 
  Lock, MoreVertical, CheckCircle2, 
  XCircle, Edit, Trash2, X, ShieldCheck, 
  Search, ShieldAlert, KeyRound 
} from 'lucide-react';

interface UserManagementProps {
  users: User[];
  onAddUser: (user: Omit<User, 'id'>) => void;
  onUpdateUser: (user: User) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, onAddUser, onUpdateUser }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // Explicitly type the form state to avoid inference issues with the 'status' property
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: UserRole;
    status: 'Ativo' | 'Inativo';
  }>({
    name: '',
    email: '',
    role: UserRole.OPERATOR,
    status: 'Ativo'
  });

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
    // Fixed: formData status can now receive 'Ativo' | 'Inativo' from user.status
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    });
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormData({ name: '', email: '', role: UserRole.OPERATOR, status: 'Ativo' });
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
          className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all text-sm shadow-xl"
        >
          <UserPlus size={18} /> Adicionar Membro
        </button>
      </header>

      <div className="grid grid-cols-1 md:flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou e-mail..." 
            className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-medium text-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Usuário</th>
                <th className="px-6 py-4">Nível de Acesso</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Último Login</th>
                <th className="px-8 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 font-black text-xs">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{user.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                          <Mail size={10} /> {user.email}
                        </p>
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
                      <button onClick={() => handleEdit(user)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all"><Edit size={16} /></button>
                      <button className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><KeyRound size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                  {editingUser ? 'Editar Membro' : 'Novo Membro na Equipe'}
                </h3>
                <button onClick={handleClose} className="text-slate-400 hover:text-slate-600"><X/></button>
             </div>

             <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome Completo</label>
                   <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" />
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail de Acesso</label>
                   <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" />
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
                   <p className="text-[10px] text-slate-400 leading-relaxed uppercase font-bold">
                     Uma senha provisória será enviada ao e-mail informado. O usuário será obrigado a alterá-la no primeiro acesso.
                   </p>
                </div>

                <button type="submit" className="w-full py-5 bg-purple-600 text-white rounded-2xl font-black shadow-xl mt-4 uppercase tracking-widest text-xs hover:bg-purple-700 transition-all">
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
