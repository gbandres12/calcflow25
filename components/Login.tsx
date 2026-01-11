
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { userService } from '../services/dataService';
import { Lock, Mail, Loader2, ArrowRight } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const user = await userService.authenticate(email, password);
      onLoginSuccess(user);
    } catch (err) {
      setError('E-mail ou senha incorretos. Tente admin@calcarioflow.com.br / 123456');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
      <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-12 space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="text-center space-y-2">
          <div className="w-32 h-32 flex items-center justify-center mx-auto mb-6">
            <img 
              src="https://i.ibb.co/h9vDq8s/calcario-logo.png" 
              alt="Calcário Amazônia Logo" 
              className="w-full h-auto object-contain drop-shadow-xl"
            />
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">CalcárioFlow ERP</h1>
          <p className="text-slate-500 font-medium">Gestão inteligente de mineração</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail Corporativo</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                required
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold transition-all"
                placeholder="ex: voce@empresa.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha de Acesso</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                required
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <p className="text-[10px] font-black text-rose-500 text-center uppercase tracking-tight">{error}</p>}

          <button 
            disabled={loading}
            type="submit" 
            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-2xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 group active:scale-95"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Entrar no Sistema"}
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <div className="pt-4 text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">© 2024 Calcário Amazônia • Versão 2.5 Pro</p>
        </div>
      </div>
    </div>
  );
};

export default Login;