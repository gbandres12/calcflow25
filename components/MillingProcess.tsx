
import React, { useState } from 'react';
import { Factory, ArrowRight, Save, History, Info } from 'lucide-react';

interface MillingProcessProps {
  onMilling: (input: number, output: number) => void;
  availableBritado: number;
}

const MillingProcess: React.FC<MillingProcessProps> = ({ onMilling, availableBritado }) => {
  const [input, setInput] = useState<number>(0);
  const [output, setOutput] = useState<number>(0);

  const handleInputBlur = (val: number) => {
    // Estimate 5% loss automatically
    if (output === 0) {
      setOutput(Number((val * 0.95).toFixed(2)));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input > 0 && output > 0 && input <= availableBritado) {
      onMilling(input, output);
      setInput(0);
      setOutput(0);
      alert('Produção registrada com sucesso!');
    } else {
      alert('Valores inválidos ou estoque insuficiente.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="text-center space-y-2 mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500 rounded-2xl shadow-lg shadow-amber-200 mb-4">
          <Factory className="text-slate-900" size={32} />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Registro de Moagem</h2>
        <p className="text-slate-500">Converta Calcário Britado em Calcário Moído para venda</p>
      </header>

      <div className="bg-white p-10 rounded-[2rem] shadow-xl border border-slate-100">
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1 w-full space-y-4">
              <label className="block text-sm font-bold text-slate-600 uppercase tracking-wide">
                Entrada (Britado)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  value={input || ''}
                  onChange={(e) => setInput(parseFloat(e.target.value))}
                  onBlur={(e) => handleInputBlur(parseFloat(e.target.value))}
                  className="w-full bg-slate-50 border-2 border-slate-100 focus:border-amber-500 outline-none p-6 rounded-2xl text-2xl font-bold transition-all pr-20"
                  placeholder="0.0"
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-400">TONS</span>
              </div>
              <p className="text-xs text-slate-400">Disponível em estoque: <span className="font-bold text-slate-600">{availableBritado.toFixed(1)} T</span></p>
            </div>

            <div className="shrink-0 flex items-center justify-center bg-amber-500 w-12 h-12 rounded-full shadow-lg text-slate-900">
              <ArrowRight size={24} />
            </div>

            <div className="flex-1 w-full space-y-4">
              <label className="block text-sm font-bold text-slate-600 uppercase tracking-wide">
                Saída (Moído Final)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  value={output || ''}
                  onChange={(e) => setOutput(parseFloat(e.target.value))}
                  className="w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 outline-none p-6 rounded-2xl text-2xl font-bold transition-all pr-20"
                  placeholder="0.0"
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-400">TONS</span>
              </div>
              <p className="text-xs text-slate-400">Rendimento estimado: <span className="font-bold text-emerald-600">95%</span></p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-50 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3 text-slate-500 text-sm">
              <Info size={18} className="text-amber-500" />
              <p>A perda de moagem será contabilizada automaticamente no inventário.</p>
            </div>
            <button
              type="submit"
              className="w-full md:w-auto px-10 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
            >
              <Save size={20} />
              Finalizar Produção
            </button>
          </div>
        </form>
      </div>

      <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <History size={20} className="text-slate-400" />
          Histórico de Produção Recente
        </h3>
        <div className="space-y-3">
          {[
            { date: 'Hoje', in: 12.5, out: 11.9, loss: '4.8%' },
            { date: 'Ontem', in: 25.0, out: 23.5, loss: '6.0%' },
            { date: '25 Out', in: 10.0, out: 9.6, loss: '4.0%' },
          ].map((h, i) => (
            <div key={i} className="bg-white p-4 rounded-xl flex items-center justify-between shadow-sm border border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-800">{h.date}</p>
                <p className="text-xs text-slate-400">{h.in}T Britado → {h.out}T Moído</p>
              </div>
              <span className="bg-rose-50 text-rose-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase">
                Perda: {h.loss}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MillingProcess;
