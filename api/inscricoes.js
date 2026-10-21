// /api/inscricoes  — somente painel (precisa de login)
//   GET     → lista todas as inscrições
//   PATCH   → { id, status: 'pago' | 'pendente' }  muda o pagamento
//   DELETE  → { id }  exclui (desistência / duplicada)
import { redis, CHAVE, tokenValido, lerCorpo, erro } from './_lib.js';

export default async function handler(req, res) {
  if (!tokenValido(req)) return res.status(401).json({ ok: false, erro: 'Sessão expirada. Entre novamente.' });

  try {
    if (req.method === 'GET') {
      const bruto = (await redis('HGETALL', CHAVE)) || [];
      const lista = [];
      for (let i = 1; i < bruto.length; i += 2) {
        try { lista.push(JSON.parse(bruto[i])); } catch { /* ignora registro corrompido */ }
      }
      lista.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
      return res.status(200).json({ ok: true, inscricoes: lista });
    }

    const { id, status } = lerCorpo(req);
    if (!id) return res.status(400).json({ ok: false, erro: 'ID ausente.' });

    if (req.method === 'PATCH') {
      if (!['pago', 'pendente'].includes(status)) return res.status(400).json({ ok: false, erro: 'Status inválido.' });
      const atual = await redis('HGET', CHAVE, id);
      if (!atual) return res.status(404).json({ ok: false, erro: 'Inscrição não encontrada.' });
      const reg = JSON.parse(atual);
      reg.status = status;
      reg.pagoEm = status === 'pago' ? new Date().toISOString() : null;
      await redis('HSET', CHAVE, id, JSON.stringify(reg));
      return res.status(200).json({ ok: true, inscricao: reg });
    }

    if (req.method === 'DELETE') {
      await redis('HDEL', CHAVE, id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  } catch (e) {
    return erro(res, e);
  }
}
