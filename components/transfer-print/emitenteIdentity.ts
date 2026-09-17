import { Company, FiscalConfig } from '../../types';

const DEMO_CNPJ_DIGITS = '10375218000150';
const DEMO_IE_DIGITS = '154892019';

const looksLikeDemoName = (value?: string) => {
  const normalized = (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return normalized.includes('CALCARIOFLOW');
};

export const formatCnpj = (value?: string): string => {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length !== 14) return (value || '').trim();
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const digitsOf = (value?: string) => (value || '').replace(/\D/g, '');

const isDemoCnpj = (value?: string) => digitsOf(value) === DEMO_CNPJ_DIGITS;

const firstRealCnpj = (...candidates: Array<string | undefined>) => {
  const real = candidates.find((value) => digitsOf(value).length >= 11 && !isDemoCnpj(value));
  if (real) return real;
  return candidates.find((value) => digitsOf(value).length >= 11) || '';
};

export const resolveEmitenteIdentity = (fiscal?: FiscalConfig | null, company?: Company) => {
  const cnpj = firstRealCnpj(
    fiscal?.cnpjEmitente,
    company?.cnpj,
    company?.document
  );
  const userCnpj = !isDemoCnpj(cnpj) && digitsOf(cnpj).length === 14;
  const fiscalTrade = userCnpj && looksLikeDemoName(fiscal?.nomeFantasia) ? '' : fiscal?.nomeFantasia;
  const fiscalRazao = userCnpj && looksLikeDemoName(fiscal?.razaoSocial) ? '' : fiscal?.razaoSocial;
  const tradeName =
    fiscalTrade ||
    company?.tradeName ||
    company?.name ||
    '';
  const corporateName =
    fiscalRazao ||
    company?.corporateName ||
    tradeName;
  const rawIe =
    fiscal?.inscricaoEstadual ||
    company?.ie ||
    company?.stateRegistration ||
    '';
  const ie = userCnpj && digitsOf(rawIe) === DEMO_IE_DIGITS ? '' : rawIe;
  const useFiscalAddress = !(userCnpj && (fiscal?.logradouroEmitente || '').includes('Rodovia Mineral BR-163'));
  const addressParts = [
    useFiscalAddress ? [fiscal?.logradouroEmitente, fiscal?.numeroEmitente].filter(Boolean).join(', ') : '',
    useFiscalAddress ? fiscal?.complementoEmitente : '',
    useFiscalAddress ? fiscal?.bairroEmitente : '',
    useFiscalAddress ? [fiscal?.cidadeEmitente, fiscal?.ufEmitente].filter(Boolean).join(' / ') : '',
    useFiscalAddress && fiscal?.cepEmitente ? `CEP ${fiscal.cepEmitente}` : '',
    !useFiscalAddress || !fiscal?.logradouroEmitente ? company?.address : '',
    !useFiscalAddress || !fiscal?.cidadeEmitente ? [company?.city, company?.state].filter(Boolean).join(' / ') : ''
  ].filter(Boolean);
  const demoPhone = (fiscal?.telefoneEmitente || '').includes('3522-8000');
  const phone = (userCnpj && demoPhone ? '' : fiscal?.telefoneEmitente) || company?.phone || '';
  const logoDataUrl = fiscal?.logoDataUrl || '';

  return {
    tradeName,
    corporateName,
    cnpj: formatCnpj(cnpj),
    ie,
    addressLine: addressParts.join(' · '),
    phone,
    logoDataUrl
  };
};
