
import { GoogleGenAI } from "@google/genai";
import { Transaction, InventoryItem, Customer } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function getBusinessInsights(
  transactions: Transaction[], 
  inventory: InventoryItem[], 
  customers: Customer[]
) {
  const prompt = `
    Como consultor especialista em mineração e agronegócio, analise os seguintes dados de uma empresa de calcário:
    
    Estoque Atual: ${JSON.stringify(inventory)}
    Últimas Transações: ${JSON.stringify(transactions.slice(-10))}
    Principais Clientes: ${JSON.stringify(customers)}

    Forneça 3 insights estratégicos curtos sobre:
    1. Eficiência da moagem (se aplicável).
    2. Saúde do fluxo de caixa.
    3. Oportunidade de vendas baseado no estoque de moído.
    
    Responda em Português com tom profissional e direto.
  `;

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
}
