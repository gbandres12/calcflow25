
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { 
  Users, UserPlus, Shield, Mail, 
  CheckCircle2, Sparkles, Building2, Phone, Briefcase,
  XCircle, Edit, X, ShieldCheck, 
  Search, KeyRound, Copy, Check, Send, Scale, Factory
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
    jobTitle: 'Operador de Balança e Expedição',
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
      jobTitle: 'Operador de Balança e Expedição',
      phone: ''
    });
  };

  const handleCopyCredentials = (user: User) => {
    const credText = `*Acesso ao CalcárioFlow ERP*\nOlá ${user.name}, seu login na Usina está liberado:\n\n👤 E-mail: ${user.email}\n🔑 Senha Provisória: 123456\n📌 Função: ${user.jobTitle || user.role}\n🏢 Unidade: ${user.companyName || currentUser?.companyName || 'CalcárioFlow'}\n\n📱 Acesse pelo link:\n${window.location.origin}`;
    navigator.clipboard?.writeText(credText);
    setCopiedId(user.id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  const handleSendWhatsApp = (user: User) => {
    const cleanPhone = (user.phone || '').replace(/\D/g, '');
    const message = `*Acesso ao CalcárioFlow ERP*\n\nOlá *${user.name}*, seu acesso à plataforma da usina foi gerado com sucesso!\n\n👤 *Usuário:* ${user.email}\n🔑 *Senha Provisória:* 123456\n📌 *Função:* ${user.jobTitle || user.role}\n🏢 *Unidade:* ${user.companyName || currentUser?.companyName || 'CalcárioFlow'}\n\n📲 *Acesse pelo navegador ou instale como app no celular:*\n${window.location.origin}`;
    const encoded = encodeURIComponent(message);
    const url = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleSelectPreset = (presetRole: UserRole, presetTitle: string) => {
    setFormData(prev => ({
      ...prev,
      role: presetRole,
      jobTitle: presetTitle
    }));
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN: return 'bg-slate-900 text-white border-slate-700';
      case UserRole.MANAGER: return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Equipe & Gestão de Pessoas</h2>
            <span className="bg-slate-200 text-slate-700 text-[10px] font-black uppercase px-2.5 py-1 rounded-full">
              {users.length} Integrantes
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium">
            Cadastre e convide operadores de balança, encarregados de pátio, gerentes e diretores
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

          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all text-sm shadow-sm active:scale-95"
          >
            <UserPlus size={16} /> Convidar Usuário
          </button>
        </div>
      </header>

      {/* Cards de Resumo da Equipe */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
            <Scale size={20} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Operadores (Balança & Pátio)</span>
            <p className="text-xl font-black text-slate-800">
              {users.filter(u => u.role === UserRole.OPERATOR).length}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-purple-50 text-purple-700 rounded-xl">
            <Briefcase size={20} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gerentes / Comercial</span>
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
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Administradores</span>
            <p className="text-xl font-black text-slate-800">
              {users.filter(u => u.role === UserRole.ADMIN).length}
            </p>
          </div>
        </div>
      </div>

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
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                <th className="px-6 py-3.5">Colaborador / Função</th>
                <th className="px-4 py-3.5">Nível de Acesso</th>
                <th className="px-4 py-3.5">Unidade / Usina</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Último Acesso</th>
                <th className="px-6 py-3.5 text-center">Convite & Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 text-xs font-medium">Nenhum colaborador encontrado.</td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 leading-tight">{user.name}</p>
                          <p className="text-xs text-slate-500 font-medium">{user.jobTitle || 'Equipe de Operações'}</p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                             <span className="flex items-center gap-1"><Mail size={11} /> {user.email}</span>
                             {user.phone && <span className="flex items-center gap-1"><Phone size={11} /> {user.phone}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase border flex items-center gap-1 w-fit ${getRoleBadge(user.role)}`}>
                        {user.role === UserRole.OPERATOR ? <Scale size={11} /> : user.role === UserRole.MANAGER ? <Briefcase size={11} /> : <Shield size={11} />}
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs font-medium text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Building2 size={13} className="text-slate-400" />
                        {user.companyName || 'CalcárioFlow'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`flex items-center gap-1 text-[11px] font-bold ${user.status === 'Ativo' ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {user.status === 'Ativo' ? <CheckCircle2 size={13}/> : <XCircle size={13}/>}
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-400">
                      {user.lastAccess ? new Date(user.lastAccess).toLocaleDateString('pt-BR') : 'Hoje'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center items-center gap-1.5">
                        <button 
                          onClick={() => handleSendWhatsApp(user)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all border border-emerald-200"
                          title="Enviar Convite com Acesso via WhatsApp"
                        >
                          <Send size={14} />
                        </button>
                        <button 
                          onClick={() => handleCopyCredentials(user)} 
                          className={`p-1.5 rounded-lg transition-all border ${copiedId === user.id ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 border-slate-200'}`} 
                          title="Copiar dados de login"
                        >
                          {copiedId === user.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <button 
                          onClick={() => handleEdit(user)} 
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all border border-slate-200" 
                          title="Editar Cadastro"
                        >
                          <Edit size={14} />
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

      {/* Modal Convidar / Editar Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl p-6 md:p-8 shadow-xl border border-slate-200 animate-in zoom-in-95 overflow-y-auto max-h-[92vh] custom-scrollbar">
             <div className="flex justify-between items-center pb-4 border-b border-slate-200 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                    {editingUser ? 'Editar Dados do Membro' : 'Convidar Membro para a Equipe'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Libere acesso operacional da balança ou administrativo</p>
                </div>
                <button onClick={handleClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"><X size={18}/></button>
             </div>

             <form onSubmit={handleSubmit} className="space-y-4">
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
                      onClick={() => handleSelectPreset(UserRole.OPERATOR, 'Encarregado de Pátio & Almoxarifado')}
                      className={`p-2 rounded-lg border text-left font-bold transition-all flex items-center gap-2 ${
                        formData.jobTitle === 'Encarregado de Pátio & Almoxarifado' 
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Factory size={14} className="shrink-0" />
                      <span className="truncate">Encarregado Pátio</span>
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
                     value={formData.email} 
                     onChange={e => setFormData({...formData, email: e.target.value})} 
                     className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-slate-800 font-medium text-sm" 
                     placeholder="operador.balanca@usina.com.br" 
                   />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-700">Cargo / Descrição da Função</label>
                     <input 
                       type="text" 
                       value={formData.jobTitle || ''} 
                       onChange={e => setFormData({...formData, jobTitle: e.target.value})} 
                       className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-slate-800 font-medium text-sm" 
                       placeholder="Ex: Operador de Balança" 
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
                      <label className="text-xs font-bold text-slate-700">Nível de Permissão</label>
                      <select 
                        value={formData.role} 
                        onChange={e => setFormData({...formData, role: e.target.value as UserRole})} 
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-xs outline-none"
                      >
                         <option value={UserRole.OPERATOR}>Operador (Balança, Romaneio e Pátio)</option>
                         <option value={UserRole.MANAGER}>Gerente (Vendas, Estoque e Caixa)</option>
                         <option value={UserRole.ADMIN}>Administrador (Acesso Total)</option>
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Status da Conta</label>
                      <select 
                        value={formData.status} 
                        onChange={e => setFormData({...formData, status: e.target.value as any})} 
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-xs outline-none"
                      >
                         <option value="Ativo">Ativo</option>
                         <option value="Inativo">Inativo / Bloqueado</option>
                      </select>
                   </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                   <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <ShieldCheck size={14} className="text-emerald-600" /> Senha Inicial Provisória: <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">123456</span>
                   </div>
                   <p className="text-[11px] text-slate-500">
                     Ao salvar, você poderá enviar o convite diretamente no WhatsApp do colaborador com 1 clique.
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
                    className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all shadow-sm"
                  >
                    {editingUser ? 'Salvar Alterações' : 'Confirmar & Cadastrar'}
                  </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;


