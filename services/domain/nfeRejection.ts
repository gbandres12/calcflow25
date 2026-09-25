/** O que a rejeição da SEFAZ quer dizer e onde corrigir, em linguagem de escritório. */
export interface NfeRejectionHelp {
  title: string;
  fix: string;
}

interface Rule {
  codes: number[];
  pattern?: RegExp;
  help: NfeRejectionHelp;
}

const RULES: Rule[] = [
  {
    codes: [204, 539],
    pattern: /duplicidade/i,
    help: {
      title: 'Número de nota já usado',
      fix: 'A SEFAZ já recebeu uma NF-e com esse número. Em Configuração de NF-e, aumente o "próximo número" e emita de novo.'
    }
  },
  {
    codes: [280, 281, 282, 283, 284, 285, 286],
    pattern: /certificado/i,
    help: {
      title: 'Problema no certificado digital',
      fix: 'O certificado A1 está vencido, inválido ou não pertence a este CNPJ. Envie um certificado válido em Configuração de NF-e.'
    }
  },
  {
    codes: [777, 778],
    pattern: /\bNCM\b/i,
    help: {
      title: 'NCM do produto inválido',
      fix: 'Confira o NCM no cadastro do produto (Produtos & NCM) com a contabilidade: tem que ter 8 dígitos e existir na tabela vigente.'
    }
  },
  {
    codes: [232, 233],
    pattern: /IE do destinat[aá]rio|inscri[cç][aã]o estadual do destinat/i,
    help: {
      title: 'Inscrição estadual do cliente',
      fix: 'A IE do cliente está vazia, errada ou não cadastrada na SEFAZ. Corrija no cadastro do cliente ou marque como isento, se for o caso.'
    }
  },
  {
    codes: [209],
    pattern: /IE do emitente/i,
    help: {
      title: 'Inscrição estadual da empresa',
      fix: 'A IE da empresa emitente está errada. Corrija em Configuração de NF-e.'
    }
  },
  {
    codes: [301, 302],
    pattern: /uso denegado|irregularidade fiscal/i,
    help: {
      title: 'Nota denegada',
      fix: 'A SEFAZ bloqueou a operação por pendência fiscal do emitente ou do cliente. Esse número de nota não pode ser reaproveitado; resolva a pendência antes de emitir outra.'
    }
  },
  {
    codes: [610, 629],
    pattern: /total da NF|difere do somat|valor unit[aá]rio x quantidade/i,
    help: {
      title: 'Totais não batem',
      fix: 'A soma dos itens, desconto e frete não fecha com o total. Revise quantidades, preço unitário e frete do pedido.'
    }
  },
  {
    codes: [215, 225],
    pattern: /schema/i,
    help: {
      title: 'Campo obrigatório vazio ou fora do formato',
      fix: 'Algum dado do cliente, do transporte ou do produto está incompleto (ex.: CEP, município, placa, CPF do motorista). Revise os cadastros e tente de novo.'
    }
  }
];

const codeFrom = (message: string): number | null => {
  const match = message.match(/(?:rejei[cç][aã]o|cStat|c[oó]digo)\D{0,6}(\d{3})/i) || message.match(/^\s*(\d{3})\s*[-:]/);
  return match ? Number(match[1]) : null;
};

export function explainNfeRejection(message?: string | null): NfeRejectionHelp | null {
  const text = String(message || '').trim();
  if (!text) return null;
  const code = codeFrom(text);
  if (code != null) {
    const byCode = RULES.find((rule) => rule.codes.includes(code));
    if (byCode) return byCode.help;
  }
  const byText = RULES.find((rule) => rule.pattern?.test(text));
  return byText ? byText.help : null;
}
