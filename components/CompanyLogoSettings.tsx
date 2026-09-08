import React, { useEffect, useState } from 'react';
import { fiscalService } from '../services/fiscalService';
import { ImagePlus, Trash2, Save, Building2 } from 'lucide-react';

const sessionCompanyId = () => {
  try {
    const raw = localStorage.getItem('calcarioflow_active_session_user');
    const user = raw ? JSON.parse(raw) : null;
    return user?.companyId || undefined;
  } catch {
    return undefined;
  }
};

export const CompanyLogoSettings: React.FC<{ companyId?: string }> = ({ companyId }) => {
  const [logo, setLogo] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const resolvedId = companyId || sessionCompanyId();

  useEffect(() => {
    fiscalService.getConfig(resolvedId).then((cfg: any) => setLogo(cfg?.logoDataUrl || ''));
  }, [resolvedId]);

  const onFile = (file?: File) => {
    if (!file) return;
    if (file.size > 700000) {
      setMsg('Use uma imagem até 700 KB (PNG ou JPG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result || ''));
    reader.readAsDataURL(file);
    setMsg('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const cfg: any = await fiscalService.getConfig(resolvedId);
      await fiscalService.saveConfig({ ...cfg, logoDataUrl: logo, companyId: resolvedId || cfg.companyId }, resolvedId);
      setMsg('Logo salva. O próximo pedido impresso já usa essa imagem.');
    } catch {
      setMsg('Não foi possível gravar a logo no Supabase.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-[2rem] border border-slate-200 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="text-purple-600" size={20} />
        <div>
          <h3 className="text-lg font-black text-slate-800">Logo da empresa</h3>
          <p className="text-xs font-medium text-slate-500">Aparece no cabeçalho do Pedido de Venda impresso.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-40 h-24 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
          {logo ? <img src={logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-[11px] font-bold text-slate-400">Sem logo</span>}
        </div>
        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black cursor-pointer">
            <ImagePlus size={14} /> Enviar logo
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {logo && (
            <button type="button" onClick={() => setLogo('')} className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-rose-600">
              <Trash2 size={13} /> Remover
            </button>
          )}
          <button type="button" onClick={save} disabled={saving} className="block px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-black disabled:opacity-50">
            <Save size={13} className="inline mr-1" /> {saving ? 'Salvando…' : 'Salvar logo'}
          </button>
        </div>
      </div>
      {msg && <p className="text-xs font-bold text-slate-600">{msg}</p>}
    </section>
  );
};

export default CompanyLogoSettings;
