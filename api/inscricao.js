// POST /api/inscricao  — público: o site chama quando a pessoa envia o formulário
import crypto from 'node:crypto';
import { redis, CHAVE, normalizar, lerCorpo, ipDe, erro, montarAviso, avisarWhatsApp } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });

  try {
    const b = lerCorpo(req);

    // Campo "armadilha" para robôs: humanos não preenchem
    if (b.site) return res.status(200).json({ ok: true });

    // Limite simples: no máximo 20 envios a cada 10 minutos por IP
    const chaveLimite = 'mosquito2027:limite:' + ipDe(req);
    const envios = await redis('INCR', chaveLimite);
    if (envios === 1) await redis('EXPIRE', chaveLimite, 600);
    if (envios > 20) return res.status(429).json({ ok: false, erro: 'Muitos envios. Aguarde alguns minutos.' });

    const registro = {
      id: crypto.randomUUID(),
      ...normalizar(b, { admin: false }),
      status: 'pendente',
      origem: 'site',
      criadoEm: new Date().toISOString()
    };

    await redis('HSET', CHAVE, registro.id, JSON.stringify(registro));

    // Aviso no WhatsApp da organização (se falhar, a inscrição continua salva)
    const aviso = await avisarWhatsApp(montarAviso(registro));
    if (!aviso.enviado) console.warn('Aviso WhatsApp não enviado:', aviso.motivo);

    return res.status(200).json({ ok: true, id: registro.id });
  } catch (e) {
    return erro(res, e);
  }
}
