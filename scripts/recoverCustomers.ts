import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente. Não grave chaves no repositório.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const RESTORATIONS: Array<{ id: string; companyId: string; data: Record<string, any> }> = [
  {
    id: 'cust-muba1da0-ldj6zl',
    companyId: 'comp-1788898385141',
    data: {
      id: 'cust-muba1da0-ldj6zl',
      companyId: 'comp-1788898385141',
      name: 'CBA MINERAÇÃO COM DE CALCARIO E BRITA',
      document: '10375218000265',
      ie: '152923438',
      isentoIE: false,
      tipoPessoa: 'PJ',
      street: 'Avenida Cuiabá BR 163',
      number: '1030',
      neighborhood: 'MATINHA',
      city: 'Santarém',
      state: 'PA',
      zipCode: '68040-400',
      ibgeCode: '1506807',
      email: '',
      phone: '',
      status: 'Ativo',
      totalSpent: 60960
    }
  },
  {
    id: 'cust-mu6zbsqj-8vwa7a',
    companyId: 'comp-1788898385141',
    data: {
      id: 'cust-mu6zbsqj-8vwa7a',
      companyId: 'comp-1788898385141',
      name: 'Alair Celestino Afonso',
      document: '05303357945',
      ie: '',
      isentoIE: true,
      tipoPessoa: 'PF',
      street: 'BR 163 pa km 130',
      number: 'SN',
      neighborhood: 'Castelo dos Sonhos',
      city: 'Altamira',
      state: 'PA',
      zipCode: '68379-200',
      ibgeCode: '1500602',
      email: '',
      phone: '',
      status: 'Ativo',
      totalSpent: 0
    }
  },
  {
    id: 'cust-mtt4mpto-m95i1p',
    companyId: 'comp-1788898385141',
    data: {
      id: 'cust-mtt4mpto-m95i1p',
      companyId: 'comp-1788898385141',
      name: 'Gabriel Andres',
      document: '05952429289',
      ie: '',
      isentoIE: true,
      tipoPessoa: 'PF',
      street: 'Rua Rosa Vermelha',
      number: '1767',
      neighborhood: 'Aeroporto Velho',
      city: 'Santarém',
      state: 'PA',
      zipCode: '68010-200',
      ibgeCode: '1506807',
      email: 'gabrielandres052@gmail.com',
      phone: '',
      status: 'Ativo',
      totalSpent: 0
    }
  },
  {
    id: 'cust-mtszthor-kpgucc',
    companyId: 'comp-1787706064101',
    data: {
      id: 'cust-mtszthor-kpgucc',
      companyId: 'comp-1787706064101',
      name: 'Gabriel Andres',
      document: '05952429289',
      ie: '',
      isentoIE: true,
      tipoPessoa: 'PF',
      street: 'Rua Rosa Vermelha',
      number: '1767',
      neighborhood: 'Aeroporto Velho',
      city: 'Santarém',
      state: 'PA',
      zipCode: '68010-200',
      ibgeCode: '1506807',
      email: 'gabrielandres052@gmail.com',
      phone: '',
      status: 'Ativo',
      totalSpent: 180
    }
  },
  {
    id: 'cust-1787765248055',
    companyId: 'comp-1787706064101',
    data: {
      id: 'cust-1787765248055',
      companyId: 'comp-1787706064101',
      name: 'Gabriel Andres',
      document: '05952429289',
      ie: '',
      isentoIE: true,
      tipoPessoa: 'PF',
      street: '',
      number: '',
      neighborhood: '',
      city: 'Santarém',
      state: 'PA',
      zipCode: '68010-200',
      ibgeCode: '1506807',
      email: '',
      phone: '',
      status: 'Ativo',
      totalSpent: 180
    }
  },
  {
    id: 'cust-mtt41mjs-p6z9u0',
    companyId: 'comp-1788898385141',
    data: {
      id: 'cust-mtt41mjs-p6z9u0',
      companyId: 'comp-1788898385141',
      name: 'Cliente Restaurado (mtt41mjs)',
      document: '',
      ie: '',
      isentoIE: true,
      tipoPessoa: 'PF',
      street: '',
      number: '',
      neighborhood: '',
      city: 'Santarém',
      state: 'PA',
      zipCode: '',
      ibgeCode: '1506807',
      email: '',
      phone: '',
      status: 'Ativo',
      totalSpent: 0
    }
  },
  {
    id: 'cust-1787754735699',
    companyId: 'comp-1787706064101',
    data: {
      id: 'cust-1787754735699',
      companyId: 'comp-1787706064101',
      name: 'Cliente Restaurado (1787754735699)',
      document: '',
      ie: '',
      isentoIE: true,
      tipoPessoa: 'PF',
      street: '',
      number: '',
      neighborhood: '',
      city: 'Santarém',
      state: 'PA',
      zipCode: '',
      ibgeCode: '1506807',
      email: '',
      phone: '',
      status: 'Ativo',
      totalSpent: 0
    }
  },
  {
    id: 'cust-1787749334787',
    companyId: 'comp-1787706064101',
    data: {
      id: 'cust-1787749334787',
      companyId: 'comp-1787706064101',
      name: 'Cliente Restaurado (1787749334787)',
      document: '',
      ie: '',
      isentoIE: true,
      tipoPessoa: 'PF',
      street: '',
      number: '',
      neighborhood: '',
      city: 'Santarém',
      state: 'PA',
      zipCode: '',
      ibgeCode: '1506807',
      email: '',
      phone: '',
      status: 'Ativo',
      totalSpent: 0
    }
  },
  {
    id: 'cust-mtsyyvcd-t5w3rc',
    companyId: 'comp-1787706064101',
    data: {
      id: 'cust-mtsyyvcd-t5w3rc',
      companyId: 'comp-1787706064101',
      name: 'Cliente Restaurado (mtsyyvcd)',
      document: '',
      ie: '',
      isentoIE: true,
      tipoPessoa: 'PF',
      street: '',
      number: '',
      neighborhood: '',
      city: 'Santarém',
      state: 'PA',
      zipCode: '',
      ibgeCode: '1506807',
      email: '',
      phone: '',
      status: 'Ativo',
      totalSpent: 0
    }
  }
];

async function run() {
  console.log('Iniciando recuperação de clientes no Supabase...');
  for (const item of RESTORATIONS) {
    const { error } = await supabase
      .from('app_records')
      .upsert({
        id: item.id,
        table_name: 'customers',
        company_id: item.companyId,
        data: item.data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'table_name,company_id,id' });

    if (error) {
      console.error(`Erro ao restaurar ${item.id}:`, error.message);
    } else {
      console.log(`✓ Restaurado com sucesso: ${item.id} -> ${item.data.name}`);
    }
  }
  console.log('Recuperação concluída!');
}

run().catch(console.error);
