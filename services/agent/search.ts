/**
 * Casa nome digitado no Telegram com cadastro do ERP.
 *
 * "GABRIEL ANDRES" precisa achar "Gabriel Lima Andres": o includes()
 * clássico falha porque o sobrenome do meio quebra a substring.
 */

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os', 'para', 'com', 'no', 'na', 'um', 'uma']);

export const normalizeText = (text: string): string =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const tokensOf = (text: string): string[] =>
  normalizeText(text)
    .split(' ')
    .filter((token) => token.length >= 2 && !STOP.has(token));

const tokenHits = (needle: string, haystack: string[]): boolean =>
  haystack.some(
    (item) =>
      item === needle ||
      (needle.length >= 4 && item.startsWith(needle)) ||
      (item.length >= 4 && needle.startsWith(item))
  );

export function scoreName(query: string, name: string): number {
  const queryTokens = tokensOf(query);
  const nameTokens = tokensOf(name);
  if (!queryTokens.length || !nameTokens.length) return 0;

  const queryJoined = queryTokens.join(' ');
  const nameJoined = nameTokens.join(' ');
  if (nameJoined === queryJoined) return 100;
  if (nameJoined.includes(queryJoined)) return 92;
  if (queryJoined.includes(nameJoined) && nameTokens.length >= 2) return 88;

  const matchedQuery = queryTokens.filter((token) => tokenHits(token, nameTokens));
  if (!matchedQuery.length) return 0;

  if (matchedQuery.length === queryTokens.length) {
    return 70 + Math.round((matchedQuery.length / Math.max(nameTokens.length, 1)) * 20);
  }

  const nameCovered = nameTokens.filter((token) => tokenHits(token, queryTokens));
  if (nameCovered.length === nameTokens.length && nameTokens.length >= 2) {
    return 65 + Math.round((nameTokens.length / queryTokens.length) * 15);
  }

  const queryRatio = matchedQuery.length / queryTokens.length;
  const nameRatio = nameCovered.length / nameTokens.length;
  const score = Math.round(queryRatio * 45 + nameRatio * 25);
  return score >= 20 ? score : 0;
}

export interface Ranked<T> {
  item: T;
  score: number;
}

export function rankNamed<T>(items: T[], query: string, nameOf: (item: T) => string): Ranked<T>[] {
  return (items || [])
    .map((item) => ({ item, score: scoreName(query, nameOf(item)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function pickUnique<T>(ranked: Ranked<T>[], minScore = 50): T | null {
  if (!ranked.length) return null;
  if (ranked.length === 1 && ranked[0].score >= 20) return ranked[0].item;
  if (ranked[0].score < minScore) return null;
  if (ranked[0].score - ranked[1].score >= 15) return ranked[0].item;
  return null;
}

export function formatSuggestions<T>(ranked: Ranked<T>[], nameOf: (item: T) => string, limit = 5): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of ranked) {
    const name = nameOf(entry.item);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length >= limit) break;
  }
  return names;
}
