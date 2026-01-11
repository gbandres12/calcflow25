
import { GoogleGenAI } from "@google/genai";
import { Transaction, InventoryItem, Customer, TransactionType } from "../types";

// Implementing the getBusinessInsights function using the latest Google GenAI SDK rules.
export async function getBusinessInsights(
  transactions: Transaction[], 
  inventory: InventoryItem[], 
  customers: Customer[]
) {
  try {
    // Initializing the AI client with the provided environment variable.
    // Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY}); as per guidelines.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Aggregating some data to provide context to the model.
    const totalRevenue = transactions
      .filter(t => t.type === TransactionType.SALE)
      .reduce((acc, t) => acc + Number(t.amount), 0);
    
    const totalExpenses = transactions
      .filter(t => t.type === TransactionType.PURCHASE || t.type === TransactionType.EXPENSE)
      .reduce((acc, t) => acc + Number(t.amount), 0);

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

    // Using 'gemini-3-pro-preview' for complex text tasks like business reasoning.
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.95,
      }
    });

    // Accessing the text property directly as per the correct method.
    return response.text || "No momento, não foi possível gerar novos insights estratégicos.";
  } catch (error) {
    console.error("Erro ao consultar Gemini API:", error);
    return "Ocorreu um erro ao processar os insights de IA. Certifique-se de que a chave de API é válida.";
  }
}
