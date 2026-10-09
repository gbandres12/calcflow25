export type DatePreset = 'ALL' | 'TODAY' | '7DAYS' | 'THIS_MONTH' | 'CUSTOM';

/**
 * Data (YYYY-MM-DD) no fuso de São Paulo / Brasília. Usar no lugar de
 * `toISOString().slice(0, 10)`, que devolve a data em UTC e vira o
 * dia seguinte depois das 21h no Brasil (inclusive no servidor da Vercel).
 */
const BR_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
});

export const dateISOBR = (d: Date = new Date()): string => BR_DATE_FMT.format(d);

export const getLocalDateStr = (d: Date = new Date()): string => dateISOBR(d);

export const formatDateBR = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

export const getDatePresetRange = (
  preset: 'ALL' | 'TODAY' | '7DAYS' | 'THIS_MONTH'
): { startDate: string; endDate: string } => {
  const today = new Date();
  const todayStr = dateISOBR(today);

  if (preset === 'ALL') {
    return { startDate: '', endDate: '' };
  }
  if (preset === 'TODAY') {
    return { startDate: todayStr, endDate: todayStr };
  }
  if (preset === '7DAYS') {
    const past7 = new Date();
    past7.setDate(past7.getDate() - 7);
    return { startDate: dateISOBR(past7), endDate: todayStr };
  }
  if (preset === 'THIS_MONTH') {
    const parts = todayStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const firstDayStr = `${parts[0]}-${parts[1]}-01`;
    const lastDayNum = new Date(year, month, 0).getDate();
    const lastDayStr = `${parts[0]}-${parts[1]}-${String(lastDayNum).padStart(2, '0')}`;
    return { startDate: firstDayStr, endDate: lastDayStr };
  }

  return { startDate: '', endDate: '' };
};

export const isDateInRange = (
  dateStr?: string,
  startDate?: string,
  endDate?: string
): boolean => {
  if (!startDate && !endDate) return true;
  if (!dateStr) return false;

  // Extrair apenas o prefixo YYYY-MM-DD para evitar problemas de fuso horário em strings ISO
  const targetDate = dateStr.slice(0, 10);

  if (startDate && targetDate < startDate) {
    return false;
  }
  if (endDate && targetDate > endDate) {
    return false;
  }

  return true;
};
