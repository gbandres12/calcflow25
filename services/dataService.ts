
/**
 * DataService - Camada de Conexão com Banco de Dados
 * Para conectar ao seu banco real, altere a BASE_URL para o endereço da sua API.
 */

const BASE_URL = 'https://sua-api-erp.com/api'; // Substitua pela URL do seu backend (ex: Supabase, Node.js)

export const db = {
  async request(endpoint: string, method = 'GET', body?: any) {
    try {
      // Quando você tiver o backend pronto, descomente as linhas abaixo:
      /*
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      return await response.json();
      */

      // Enquanto não houver backend, operamos via LocalStorage (Simulação)
      const key = `calcarioflow_${endpoint.split('/')[0]}`;
      if (method === 'GET') {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
      } else {
        localStorage.setItem(key, JSON.stringify(body));
        return body;
      }
    } catch (error) {
      console.error("Erro na requisição:", error);
      throw error;
    }
  }
};

export const userService = {
  async authenticate(email: string, pass: string) {
    // Simulação de login - Em produção, isso bateria no seu banco
    const users = await this.getAll();
    const user = users.find(u => u.email === email);
    if (user && pass === '123456') return user; // Senha padrão para teste
    throw new Error("Credenciais inválidas");
  },

  async getAll() {
    return await db.request('users') || [];
  },

  async sync(users: any[]) {
    return await db.request('users', 'POST', users);
  }
};

export const financeService = {
  async getTransactions() {
    return await db.request('transactions') || [];
  },
  async saveTransactions(txs: any[]) {
    return await db.request('transactions', 'POST', txs);
  }
};
