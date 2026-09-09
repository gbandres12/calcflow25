import React, { useState } from 'react';
import { ShieldAlert, X, KeyRound, AlertTriangle } from 'lucide-react';

interface DeletionPasswordModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  itemDescription?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  correctPassword?: string;
  onVerifyPassword?: (password: string) => boolean | Promise<boolean>;
}

export const DeletionPasswordModal: React.FC<DeletionPasswordModalProps> = ({
  isOpen,
  title = 'Confirmação de Exclusão Segura',
  description = 'Esta operação é irreversível. Digite sua senha de acesso para autorizar a exclusão permanente:',
  itemDescription,
  onConfirm,
  onClose,
  correctPassword,
  onVerifyPassword
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    try {
      const isValid = onVerifyPassword
        ? await onVerifyPassword(password)
        : Boolean(correctPassword) && password === correctPassword;

      if (isValid) {
      setError('');
      setPassword('');
        await onConfirm();
      } else {
        setError('Senha incorreta. Tente novamente.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border border-rose-100 animate-in zoom-in-95">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight">{title}</h3>
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-500">
                Ação Crítica Protegida
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {itemDescription && (
          <div className="mb-4 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500 shrink-0" />
            <span className="truncate">Item: {itemDescription}</span>
          </div>
        )}

        <p className="text-xs text-slate-600 mb-5 leading-relaxed font-medium">
          {description}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
              Senha de acesso
            </label>
            <div className="relative">
              <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="Digite sua senha"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-center text-lg tracking-widest font-black outline-none focus:border-rose-500 focus:bg-white transition-all"
              />
            </div>
            {error && (
              <p className="text-[11px] font-bold text-rose-600 mt-1.5 flex items-center gap-1">
                {error}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-wider transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-rose-100 active:scale-95"
            >
              {isVerifying ? 'Validando...' : 'Confirmar Exclusão'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
