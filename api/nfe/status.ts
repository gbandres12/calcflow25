import { applyCors } from './_lib';

export default async function handler(req: any, res: any) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(200).json({
    status: 'online',
    mensagem: 'NF-e 55 via NotaAs. Status da nota é consultado em /nfe/invoices/{id}/status, não há ping da SEFAZ.',
  });
}
