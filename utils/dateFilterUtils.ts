export type DatePreset = 'ALL' | 'TODAY' | '7DAYS' | 'THIS_MONTH' | 'CUSTOM';

export const getLocalDateStr = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  const todayStr = getLocalDateStr(today);

  if (preset === 'ALL') {
    return { startDate: '', endDate: '' };
  }
  if (preset === 'TODAY') {
    return { startDate: todayStr, endDate: todayStr };
  }
  if (preset === '7DAYS') {
    const past7 = new Date();
    past7.setDate(today.getDate() - 7);
    return { startDate: getLocalDateStr(past7), endDate: todayStr };
  }
  if (preset === 'THIS_MONTH') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { startDate: getLocalDateStr(firstDay), endDate: getLocalDateStr(lastDay) };
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
