import React from 'react';
import { UserPermissions } from '../types';
import {
  ACCESS_AREAS,
  MODULE_LABEL,
  AppModule,
  presetModules,
  resolveModules,
  toLegacyFlags,
  fullModules
} from '../services/accessControl';

interface Props {
  permissions: UserPermissions;
  onChange: (next: UserPermissions) => void;
}

export const UserAccessPanel: React.FC<Props> = ({ permissions, onChange }) => {
  const modules = permissions.modules && Object.keys(permissions.modules).length
    ? { ...fullModules(), ...permissions.modules }
    : resolveModules({ permissions } as any);

  const setModules = (next: Record<AppModule, boolean>) => onChange(toLegacyFlags(next));

  const toggle = (id: AppModule, value: boolean) => {
    setModules({ ...modules, [id]: value } as Record<AppModule, boolean>);
  };

  return (
    <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/70 space-y-3">
      <div>
        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Onde esta pessoa pode entrar</h4>
        <p className="text-[11px] text-slate-500 font-medium mt-1">
          Marque só as telas do trabalho dela. O menu esconde o resto.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ['total', 'Acesso total'],
          ['comercial', 'Comercial'],
          ['santarem', 'Compras Santarém'],
          ['fazenda', 'Fazenda / pátio'],
          ['balanca', 'Balança'],
          ['financeiro', 'Financeiro']
        ].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setModules(presetModules(id as any))} className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-700 hover:bg-slate-900 hover:text-white">
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {ACCESS_AREAS.map((area) => (
          <div key={area.id} className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-black text-slate-800">{area.label}</p>
                <p className="text-[10px] text-slate-500">{area.hint}</p>
              </div>
              <button type="button" className="text-[10px] font-black text-purple-600" onClick={() => {
                const next = { ...modules };
                const allOn = area.modules.every((m) => next[m]);
                area.modules.forEach((m) => { next[m] = !allOn; });
                setModules(next);
              }}>
                {area.modules.every((m) => modules[m]) ? 'Limpar' : 'Liberar área'}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {area.modules.map((id) => (
                <label key={id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${modules[id] ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-400'}`}>
                  <input type="checkbox" checked={Boolean(modules[id])} onChange={(e) => toggle(id, e.target.checked)} />
                  {MODULE_LABEL[id]}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserAccessPanel;
