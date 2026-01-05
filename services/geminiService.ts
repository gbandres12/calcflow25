
import { GoogleGenAI } from "@google/genai";
import { Transaction, InventoryItem, Customer } from "../types";

// API PAUSADA PARA ECONOMIA DE TOKENS
// const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function getBusinessInsights(
  transactions: Transaction[], 
  inventory: InventoryItem[], 
  customers: Customer[]
) {
  // Retorno estático imediato para evitar chamadas de rede e consumo de cota
  return "O recurso de IA Insights está pausado conforme solicitado. O sistema continua operando normalmente com processamento local de dados.";
  
  /* 
  // Código original comentado para uso futuro:
  const prompt = `...`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Não foi possível carregar os insights no momento.";
  }
  */
}
