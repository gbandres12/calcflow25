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
