import React, { useState } from 'react';
import { KeyRound, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { userService } from '../services/dataService';

interface Props {
  /** "recovery": veio do link do e-mail. "change": usuário logado trocando a própria senha. */
  mode: 'recovery' | 'change';
  onDone: () => void;
  onCancel?: () => void;
}

const MIN_LENGTH = 6;

export const SetNewPassword: React.FC<Props> = ({ mode, onDone, onCancel }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError('As duas senhas não são iguais.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await userService.updatePassword(password);
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível trocar a senha.');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-7 text-center space-y-4">
        <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
        <h2 className="text-lg font-black text-slate-900">Senha alterada</h2>
        <p className="text-sm text-slate-500">Da próxima vez, entre com a senha nova.</p>
        <button
          type="button"
          onClick={onDone}
          className="w-full py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold"
        >
          {mode === 'recovery' ? 'Entrar no sistema' : 'Fechar'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-7 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
          <KeyRound size={20} />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900">
            {mode === 'recovery' ? 'Defina sua nova senha' : 'Alterar minha senha'}
          </h2>
          <p className="text-xs text-slate-500">Mínimo de {MIN_LENGTH} caracteres.</p>
        </div>
      </div>

      <label className="block text-xs font-semibold text-slate-600">
        Nova senha
        <div className="relative mt-1">
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 pr-10 text-sm outline-none focus:border-emerald-600"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>

      <label className="block text-xs font-semibold text-slate-600">
        Repita a nova senha
        <input
          type={show ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
        />
      </label>

      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          Salvar nova senha
        </button>
      </div>
    </form>
  );
};

export default SetNewPassword;
