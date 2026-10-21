// /api/inscricoes  — somente painel (precisa de login)
//   GET     → lista todos os cadastros
//   POST    → cadastra uma pessoa manualmente em qualquer setor
//   PUT     → edita um cadastro { id, ...campos }
//   PATCH   → { id, status: 'pago' | 'pendente' }  muda o pagamento
//   DELETE  → { id }  exclui (desistência / duplicada)
import crypto from 'node:crypto';
import { redis, CHAVE, tokenValido, normalizar, lerCorpo, erro } from './_lib.js';

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

    const b = lerCorpo(req);

    if (req.method === 'POST') {
      const dados = normalizar(b, { admin: true });
      const reg = {
        id: crypto.randomUUID(),
        ...dados,
        origem: 'painel',
        criadoEm: new Date().toISOString(),
        pagoEm: dados.status === 'pago' ? new Date().toISOString() : null
      };
      await redis('HSET', CHAVE, reg.id, JSON.stringify(reg));
      return res.status(200).json({ ok: true, inscricao: reg });
    }

    if (!b.id) return res.status(400).json({ ok: false, erro: 'ID ausente.' });
    const atualBruto = req.method === 'DELETE' ? null : await redis('HGET', CHAVE, b.id);
    if (req.method !== 'DELETE' && !atualBruto) return res.status(404).json({ ok: false, erro: 'Cadastro não encontrado.' });
    const atual = atualBruto ? JSON.parse(atualBruto) : null;

    if (req.method === 'PUT') {
      const dados = normalizar(b, { admin: true });
      const reg = {
        ...dados,
        id: atual.id,
        origem: atual.origem || 'site',
        criadoEm: atual.criadoEm,
        editadoEm: new Date().toISOString(),
        pagoEm: dados.status === 'pago' ? (atual.pagoEm || new Date().toISOString()) : null
      };
      await redis('HSET', CHAVE, reg.id, JSON.stringify(reg));
      return res.status(200).json({ ok: true, inscricao: reg });
    }

    if (req.method === 'PATCH') {
      if (!['pago', 'pendente'].includes(b.status)) return res.status(400).json({ ok: false, erro: 'Status inválido.' });
      atual.status = b.status;
      atual.pagoEm = b.status === 'pago' ? new Date().toISOString() : null;
      await redis('HSET', CHAVE, atual.id, JSON.stringify(atual));
      return res.status(200).json({ ok: true, inscricao: atual });
    }

    if (req.method === 'DELETE') {
      await redis('HDEL', CHAVE, b.id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  } catch (e) {
    return erro(res, e);
  }
}
