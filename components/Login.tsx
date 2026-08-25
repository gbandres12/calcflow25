
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { userService } from '../services/dataService';
import { INITIAL_USERS } from '../constants';
import { Lock, Mail, Loader2, ArrowRight, Factory, ShieldCheck, Sparkles, UserCheck, Briefcase, Wrench, Shield, CheckCircle2 } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('admin@calcarioflow.com.br');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPass?: string) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    const targetEmail = customEmail || email;
    const targetPassword = customPass || password;

    try {
      const user = await userService.authenticate(targetEmail, targetPassword);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err?.message || 'E-mail ou senha incorretos. Utilize 123456.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRole = (user: User) => {
    setEmail(user.email);
    setPassword('123456');
    handleLogin(undefined, user.email, '123456');
  };

  const roleIcons = {
    [UserRole.ADMIN]: ShieldCheck,
    [UserRole.MANAGER]: Briefcase,
    [UserRole.OPERATOR]: Wrench
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 md:p-8 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(147,51,234,0.15),rgba(255,255,255,0))]">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Painel Esquerdo: Contexto e Acessos Rápidos Estratégicos */}
        <div className="lg:col-span-6 space-y-6 text-white p-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-black uppercase tracking-widest">
            <Sparkles size={14} className="text-purple-400" /> Versão Pronta para Vercel & GitHub
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-purple-500/30">
                <Factory size={32} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-white">CalcárioFlow ERP</h1>
                <p className="text-sm text-slate-400 font-medium">Gestão Integrada de Mineração & Moagem</p>
              </div>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Sistema completo para usinas de britagem, moagem de calcário agrícola, controle de pátio, faturamento FOB/CIF e fluxo de caixa.
            </p>
          </div>

          {/* Perfis Estratégicos Rápidos */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                Acesso Rápido por Perfil (1-Clique)
              </span>
              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 size={12} /> Dados Mockados Ativos
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {INITIAL_USERS.map((u) => {
                const Icon = roleIcons[u.role] || UserCheck;
                const isAdmin = u.role === UserRole.ADMIN;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleQuickRole(u)}
                    className={`text-left p-3.5 rounded-2xl border transition-all flex items-start gap-3 group hover:scale-[1.02] active:scale-95 ${
                      isAdmin 
                        ? 'bg-slate-900/90 border-purple-500/40 hover:border-purple-400 hover:bg-slate-800' 
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${isAdmin ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800 text-slate-400'}`}>
                      <Icon size={18} />
                    </div>
                    <div className="overflow-hidden min-w-0">
                      <p className="text-xs font-black text-slate-100 truncate group-hover:text-purple-300 transition-colors">
                        {u.name.split(' (')[0]}
                      </p>
                      <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">{u.role}</p>
                      <p className="text-[10px] text-slate-500 font-mono truncate">{u.email}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Painel Direito: Formulário de Login Tradicional */}
        <div className="lg:col-span-6 bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-10 space-y-6 border border-slate-100 animate-in fade-in duration-500">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Entrar na Plataforma</h2>
            <p className="text-xs text-slate-500 font-medium">Informe suas credenciais ou selecione um perfil ao lado</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  required
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-12 pr-6 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold transition-all text-sm text-slate-800"
                  placeholder="ex: admin@calcarioflow.com.br"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha de Acesso</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  required
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-12 pr-6 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold transition-all text-sm text-slate-800"
                  placeholder="••••••••"
                />
              </div>
              <p className="text-[10px] text-slate-400 text-right font-medium">Senha padrão de demonstração: <strong className="text-slate-700">123456</strong></p>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-bold">
                {error}
              </div>
            )}

            <button 
              disabled={loading}
              type="submit" 
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 group active:scale-95 text-sm"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : "Acessar o Sistema"}
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              © 2026 CalcárioFlow ERP • Planta Industrial & Moagem
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;
