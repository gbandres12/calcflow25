
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { userService } from '../services/dataService';
import { isLocalDevHost } from '../services/authLogic';
import { INITIAL_USERS } from '../constants';
import {
  Lock, Mail, Loader2, ArrowRight, Factory, ShieldCheck,
  UserCheck, Briefcase, Wrench, Building2, CheckCircle2, HardHat, Database
} from 'lucide-react';
import { DatabaseStatusModal } from './DatabaseStatusModal';

interface LoginProps {
  onLoginSuccess: (user: User, isNewRegistration?: boolean) => void;
  /** Mensagem vinda de fora (ex: link de recuperação expirado). */
  notice?: string;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, notice }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [showDbModal, setShowDbModal] = useState(false);
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Register State
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerCompany, setRegisterCompany] = useState('');
  const [registerCnpj, setRegisterCnpj] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');

  // Forgot Password State
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(notice || '');
  const [successInfo, setSuccessInfo] = useState('');

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPass?: string) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessInfo('');

    const targetEmail = customEmail || email;
    const targetPassword = customPass || password;

    try {
      const user = await userService.authenticate(targetEmail, targetPassword);
      onLoginSuccess(user, false);
    } catch (err: any) {
      setError(err?.message || 'E-mail ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessInfo('');

    if (!registerName.trim() || !registerEmail.trim() || !registerCompany.trim()) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      setLoading(false);
      return;
    }

    if (registerPassword.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      setLoading(false);
      return;
    }

    try {
      const { user: newUser, requiresEmailConfirmation } = await userService.registerUser({
        name: registerName,
        email: registerEmail,
        password: registerPassword,
        companyName: registerCompany,
        cnpj: registerCnpj,
        phone: registerPhone,
        jobTitle: 'Diretor / Gestor Geral',
        role: UserRole.ADMIN
      });

      if (requiresEmailConfirmation) {
        setSuccessInfo('Conta criada com sucesso no Supabase! Verifique sua caixa de entrada para confirmar o e-mail (ou faça login caso a confirmação esteja desativada no seu painel).');
        setMode('login');
        setEmail(registerEmail);
        setPassword('');
      } else {
        onLoginSuccess(newUser, true);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao cadastrar empresa e usuário no Supabase Auth.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setError('Informe seu e-mail cadastrado.');
      return;
    }
    setLoading(true);
    setError('');
    setForgotSuccess('');

    try {
      const res = await userService.resetPassword(forgotEmail);
      setForgotSuccess(res.message);
    } catch (err: any) {
      setError(err?.message || 'Erro ao solicitar redefinição de senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRole = (user: User) => {
    setEmail(user.email);
    setPassword('');
    handleLogin(undefined, user.email, '123456');
  };

  const showDemoAccess = isLocalDevHost();

  const roleIcons = {
    [UserRole.ADMIN]: ShieldCheck,
    [UserRole.MANAGER]: Briefcase,
    [UserRole.OPERATIONAL_SUPERVISOR]: HardHat,
    [UserRole.OPERATOR]: Wrench
  };

  const inputCls = 'w-full pl-11 pr-4 py-3 bg-white/70 border border-slate-200 rounded-xl outline-none focus:border-slate-900 focus:bg-white focus:ring-4 focus:ring-slate-900/5 transition text-sm text-slate-900 placeholder:text-slate-400';
  const plainInputCls = 'w-full px-4 py-3 bg-white/70 border border-slate-200 rounded-xl outline-none focus:border-slate-900 focus:bg-white focus:ring-4 focus:ring-slate-900/5 transition text-sm text-slate-900 placeholder:text-slate-400';
  const labelCls = 'text-xs font-semibold text-slate-600';
  const primaryBtn = 'w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2 group active:scale-[0.98] text-sm';
  const errorBox = error && (
    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs font-medium">{error}</div>
  );

  return (
    <div className="relative min-h-screen flex items-center justify-center lg:justify-end p-4 md:p-10 lg:pr-24 overflow-hidden bg-slate-900">
      <img
        src="/login-fazenda.webp"
        alt=""
        className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-1000"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/60 via-slate-950/20 to-slate-950/50" />

      {/* Marca */}
      <div className="hidden lg:block absolute left-12 bottom-12 text-white max-w-md">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center">
            <Factory size={20} />
          </div>
          <span className="text-lg font-bold tracking-tight">CalcárioFlow</span>
        </div>
        <p className="text-3xl font-semibold leading-tight tracking-tight drop-shadow">
          Da lavra à balsa, tudo sob controle.
        </p>
      </div>

      <div className="relative w-full max-w-sm bg-white/85 backdrop-blur-xl rounded-3xl shadow-2xl shadow-black/30 border border-white/60 p-7 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="lg:hidden flex items-center gap-2 text-slate-900">
          <Factory size={20} />
          <span className="font-bold tracking-tight">CalcárioFlow</span>
        </div>

        {successInfo && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-start gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <span>{successInfo}</span>
          </div>
        )}

        {mode === 'login' ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Bem-vindo</h2>
              <p className="text-sm text-slate-500 mt-1">Entre com sua conta para continuar</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className={labelCls}>E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="voce@empresa.com.br" />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className={labelCls}>Senha</label>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setForgotSuccess(''); setForgotEmail(email); }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900 transition"
                  >
                    Esqueci a senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
                </div>
              </div>

              {errorBox}

              <button disabled={loading} type="submit" className={primaryBtn}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : <>Entrar <ArrowRight size={17} className="group-hover:translate-x-0.5 transition-transform" /></>}
              </button>
            </form>

            <p className="text-center text-xs text-slate-500">
              Ainda não tem conta?{' '}
              <button type="button" onClick={() => { setMode('register'); setError(''); setSuccessInfo(''); }} className="font-semibold text-slate-900 hover:underline">
                Cadastre sua usina
              </button>
            </p>
          </div>
        ) : mode === 'forgot' ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Recuperar senha</h2>
              <p className="text-sm text-slate-500 mt-1">Enviaremos um link para o seu e-mail</p>
            </div>

            {forgotSuccess ? (
              <div className="space-y-4">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-emerald-800">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-medium">{forgotSuccess}</p>
                    <p className="text-emerald-700 mt-1">Confira também a pasta de spam.</p>
                  </div>
                </div>
                <button type="button" onClick={() => { setMode('login'); setForgotSuccess(''); }} className={primaryBtn}>
                  Voltar para o login
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>E-mail cadastrado</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                    <input required type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} className={inputCls} placeholder="voce@empresa.com.br" />
                  </div>
                </div>
                {errorBox}
                <button disabled={loading} type="submit" className={primaryBtn}>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : 'Enviar link'}
                </button>
                <button type="button" onClick={() => { setMode('login'); setError(''); }} className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-900 transition">
                  ← Voltar para o login
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Cadastrar usina</h2>
              <p className="text-sm text-slate-500 mt-1">Crie sua conta e configure em minutos</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-3.5 max-h-[55vh] overflow-y-auto -mx-1 px-1 custom-scrollbar">
              <div className="space-y-1.5">
                <label className={labelCls}>Seu nome *</label>
                <div className="relative">
                  <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input required type="text" value={registerName} onChange={e => setRegisterName(e.target.value)} className={inputCls} placeholder="Nome completo" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Usina / Mineração *</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input required type="text" value={registerCompany} onChange={e => setRegisterCompany(e.target.value)} className={inputCls} placeholder="Nome da empresa" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={labelCls}>CNPJ</label>
                  <input type="text" value={registerCnpj} onChange={e => setRegisterCnpj(e.target.value)} className={plainInputCls} placeholder="00.000.000/0001-00" />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Telefone</label>
                  <input type="text" value={registerPhone} onChange={e => setRegisterPhone(e.target.value)} className={plainInputCls} placeholder="(93) 99100-0000" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>E-mail *</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input required type="email" value={registerEmail} onChange={e => setRegisterEmail(e.target.value)} className={inputCls} placeholder="voce@empresa.com.br" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Senha *</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input required type="password" autoComplete="new-password" value={registerPassword} onChange={e => setRegisterPassword(e.target.value)} className={inputCls} placeholder="Mínimo 6 caracteres" />
                </div>
              </div>
              {errorBox}
              <button disabled={loading} type="submit" className={primaryBtn}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : 'Criar conta'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-500">
              Já tem conta?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className="font-semibold text-slate-900 hover:underline">
                Entrar
              </button>
            </p>
          </div>
        )}

        {showDemoAccess && (
          <div className="pt-4 border-t border-slate-200/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Demo local</span>
              <button type="button" onClick={() => setShowDbModal(true)} className="text-[11px] text-slate-500 hover:text-slate-900 font-medium flex items-center gap-1">
                <Database size={12} className="text-emerald-500" /> Status DB
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {INITIAL_USERS.map((u) => {
                const Icon = roleIcons[u.role] || UserCheck;
                return (
                  <button key={u.id} type="button" onClick={() => handleQuickRole(u)} title={u.email}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition">
                    <Icon size={13} /> {u.role}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <p className="absolute bottom-4 right-6 text-[11px] text-white/60 hidden lg:block">© 2026 CalcárioFlow</p>

      <DatabaseStatusModal isOpen={showDbModal} onClose={() => setShowDbModal(false)} />
    </div>
  );
};

export default Login;
