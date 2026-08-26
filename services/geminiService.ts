
import { GoogleGenAI } from "@google/genai";
import { Transaction, InventoryItem, Customer, TransactionType } from "../types";

// Implementing the getBusinessInsights function using the latest Google GenAI SDK rules.
export async function getBusinessInsights(
  transactions: Transaction[], 
  inventory: InventoryItem[], 
  customers: Customer[]
) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Aggregating some data to provide context to the model.
    const totalRevenue = transactions
      .filter(t => t.type === TransactionType.SALE)
      .reduce((acc, t) => acc + Number(t.amount || 0), 0);
    
    const totalExpenses = transactions
      .filter(t => t.type === TransactionType.PURCHASE || t.type === TransactionType.EXPENSE)
      .reduce((acc, t) => acc + Number(t.amount || 0), 0);

    const lowStockCount = inventory.filter(item => item.quantity <= item.minStock).length;

    const prompt = `
      Você é um consultor financeiro especialista em mineração. Analise os dados operacionais abaixo e forneça 3 insights rápidos e acionáveis para o gestor da empresa.
      Seja direto, profissional e foque em otimização de lucro e controle de custos.
      
      Dados Atuais:
      - Receita Bruta: R$ ${totalRevenue.toLocaleString('pt-BR')}
      - Despesas Totais: R$ ${totalExpenses.toLocaleString('pt-BR')}
      - Margem Líquida: R$ ${(totalRevenue - totalExpenses).toLocaleString('pt-BR')}
      - Itens com Estoque Crítico: ${lowStockCount} de ${inventory.length} minerais cadastrados.
      - Total de Clientes na Carteira: ${customers.length}
      
      Formate a resposta em Markdown curto. Responda em Português do Brasil.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.95,
      }
    });

    return response.text || "No momento, não foi possível gerar novos insights estratégicos.";
  } catch (error) {
    console.error("Erro ao consultar Gemini API:", error);
    return "Ocorreu um erro ao processar os insights de IA. Certifique-se de que a chave de API é válida.";
  }
}

/**
 * Função utilitária para normalizar texto (remove acentos, caixa baixa e pontuação)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Encontra a categoria oficial mais próxima por correspondência exata ou parcial
 */
function matchOfficialCategory(suggestedText: string, officialCategories: string[]): string | null {
  if (!suggestedText) return null;
  const cleanSuggested = normalizeText(suggestedText);

  // 1. Correspondência exata normalizada
  for (const cat of officialCategories) {
    if (normalizeText(cat) === cleanSuggested) return cat;
  }

  // 2. Correspondência de inclusão
  for (const cat of officialCategories) {
    const normCat = normalizeText(cat);
    if (normCat.includes(cleanSuggested) || cleanSuggested.includes(normCat)) {
      return cat;
    }
  }

  // 3. Fallback de palavras-chave
  const words = cleanSuggested.split(/\s+/).filter(w => w.length > 3);
  for (const word of words) {
    for (const cat of officialCategories) {
      if (normalizeText(cat).includes(word)) return cat;
    }
  }

  return null;
}

/**
 * Sugestão inteligente de Categoria Financeira com IA (Gemini)
 */
export async function suggestCategory(params: {
  type: 'receita' | 'despesa' | 'INFLOW' | 'OUTFLOW' | TransactionType;
  description: string;
  notes?: string;
  officialCategories: string[];
  history?: { description: string; category: string }[];
}): Promise<{ category: string; confidence: number; reasoning?: string } | null> {
  const { type, description, notes, officialCategories, history = [] } = params;
  if (!description || description.trim().length < 2) return null;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const isIncome = type === 'receita' || type === 'INFLOW' || type === TransactionType.SALE;
    const typeLabel = isIncome ? 'Receita / Entrada' : 'Despesa / Saída';

    // Amostra de histórico de até 30 classificações anteriores
    const historySample = history.slice(0, 30).map(h => `- "${h.description}" -> ${h.category}`).join('\n');

    const prompt = `
Você é um classificador financeiro especialista em mineração e indústria de calcário.
Sua tarefa é sugerir a MELHOR CATEGORIA OFICIAL para o lançamento financeiro abaixo.

TIPO: ${typeLabel}
DESCRIÇÃO: "${description}"
${notes ? `OBSERVAÇÕES: "${notes}"` : ''}

LISTA OBRIGATÓRIA DE CATEGORIAS OFICIAIS DISPONÍVEIS:
${officialCategories.map(c => `* ${c}`).join('\n')}

${historySample ? `HISTÓRICO RECENTE DE REFERÊNCIA:\n${historySample}\n` : ''}

REGRAS:
1. Responda ESTRITAMENTE com UMA das categorias oficiais listadas acima.
2. Não invente novas categorias.
3. Se nenhuma se encaixar perfeitamente, escolha "Outras Receitas Operacionais" (para receitas) ou "Outras Despesas Operacionais" (para despesas) ou a mais próxima.

Retorne APENAS o nome exato da categoria oficial selecionada.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
      }
    });

    const rawResult = response.text ? response.text.trim().replace(/^["'*`]+|["'*`]+$/g, '') : '';
    const matchedCategory = matchOfficialCategory(rawResult, officialCategories);

    if (matchedCategory) {
      return { category: matchedCategory, confidence: 0.95, reasoning: rawResult };
    }

    // Fallback de regra determinística local se o modelo devolver algo fora da lista
    const localMatch = matchOfficialCategory(description, officialCategories);
    if (localMatch) {
      return { category: localMatch, confidence: 0.8 };
    }

    return null;
  } catch (error) {
    console.warn("Erro ao sugerir categoria via IA (fallback silencioso):", error);
    // Fallback heurístico em caso de timeout/offline
    const localMatch = matchOfficialCategory(description, officialCategories);
    if (localMatch) return { category: localMatch, confidence: 0.7 };
    return null;
  }
}

/**
 * Sugestão inteligente de Centro de Custo com IA (Gemini)
 */
export async function suggestCostCenter(params: {
  description: string;
  category?: string;
  notes?: string;
  existingCostCenters: { id: string; name: string }[];
  history?: { description: string; costCenter: string }[];
}): Promise<{ name: string; existingId?: string; isNew: boolean } | null> {
  const { description, category, notes, existingCostCenters, history = [] } = params;
  if (!description || description.trim().length < 2) return null;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const existingNames = existingCostCenters.map(cc => cc.name);

    // Amostra de histórico de até 40 classificações anteriores
    const historySample = history.slice(0, 40).map(h => `- "${h.description}" -> ${h.costCenter}`).join('\n');

    const prompt = `
Você é um controller financeiro de uma mineradora e usina de calcário.
Sua tarefa é sugerir o CENTRO DE CUSTO mais adequado para o lançamento abaixo.

DESCRIÇÃO: "${description}"
${category ? `CATEGORIA: "${category}"` : ''}
${notes ? `OBSERVAÇÕES: "${notes}"` : ''}

CENTROS DE CUSTO EXISTENTES NO SISTEMA:
${existingNames.map(name => `* ${name}`).join('\n')}

${historySample ? `HISTÓRICO RECENTE:\n${historySample}\n` : ''}

REGRAS:
1. PREFIRA SEMPRE REUTILIZAR um dos Centros de Custo Existentes acima se fizer sentido.
2. Caso nenhum se aplique, crie um nome ultra-curto e objetivo (no MÁXIMO 3 palavras), ex: "Moinho Martelos #02", "Poço Artesiano", "Balança Saída".
3. Retorne APENAS o nome do Centro de Custo, sem explicações ou aspas.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
      }
    });

    const rawResult = response.text ? response.text.trim().replace(/^["'*`]+|["'*`]+$/g, '') : '';
    if (!rawResult) return null;

    // Verifica se casa com algum existente
    const normResult = normalizeText(rawResult);
    const matchedExisting = existingCostCenters.find(cc => {
      const normCC = normalizeText(cc.name);
      return normCC === normResult || normCC.includes(normResult) || normResult.includes(normCC);
    });

    if (matchedExisting) {
      return {
        name: matchedExisting.name,
        existingId: matchedExisting.id,
        isNew: false
      };
    }

    return {
      name: rawResult.slice(0, 50),
      isNew: true
    };
  } catch (error) {
    console.warn("Erro ao sugerir centro de custo via IA:", error);
    return null;
  }
}

