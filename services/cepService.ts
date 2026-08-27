export interface ViaCepResult {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  gia?: string;
  ddd?: string;
  siafi?: string;
  erro?: boolean | string;
}

/**
 * Formata o valor digitado como CEP: 00000-000
 */
export const formatCep = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

/**
 * Normaliza nome de município para comparação (minúsculas, sem acentos).
 */
export const normalizeCityName = (s: string): string => {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Busca o endereço completo via API pública ViaCEP
 */
export const fetchAddressByCep = async (cep: string): Promise<ViaCepResult | null> => {
  const cleanCep = cep.replace(/\D/g, '');
  if (cleanCep.length !== 8) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data: ViaCepResult = await response.json();

    if (data.erro === true || data.erro === 'true') {
      return null;
    }

    return data;
  } catch (error) {
    console.warn("Erro ao consultar serviço ViaCEP:", error);
    return null;
  }
};

interface IbgeMunicipio {
  id: number;
  nome: string;
}

/**
 * Resolve o código IBGE (7 dígitos) a partir de cidade + UF via API de localidades.
 */
export const fetchIbgeByCityUf = async (city: string, uf: string): Promise<string | null> => {
  const cleanUf = (uf || '').trim().toUpperCase();
  const cleanCity = (city || '').trim();
  if (!cleanCity || cleanUf.length !== 2) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(cleanUf)}/municipios`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data: IbgeMunicipio[] = await response.json();
    if (!Array.isArray(data)) return null;

    const target = normalizeCityName(cleanCity);
    const match = data.find((m) => normalizeCityName(m?.nome || '') === target);
    if (!match || match.id == null) return null;

    const id = String(match.id).replace(/\D/g, '');
    return id.length === 7 ? id : null;
  } catch (error) {
    console.warn('Erro ao consultar municípios IBGE:', error);
    return null;
  }
};

/**
 * Resolve o código IBGE do município:
 * 1) já informado (7 dígitos)
 * 2) ViaCEP a partir do CEP
 * 3) API IBGE por cidade + UF
 */
export const resolveIbgeCode = async (opts: {
  zipCode?: string;
  city?: string;
  state?: string;
  ibgeCode?: string;
}): Promise<string | null> => {
  const existing = (opts.ibgeCode || '').replace(/\D/g, '');
  if (existing.length === 7) return existing;

  const zip = (opts.zipCode || '').replace(/\D/g, '');
  if (zip.length === 8) {
    const addr = await fetchAddressByCep(zip);
    const via = (addr?.ibge || '').replace(/\D/g, '');
    if (via.length === 7) return via;
  }

  const fromCity = await fetchIbgeByCityUf(opts.city || '', opts.state || '');
  if (fromCity) return fromCity;

  return null;
};
