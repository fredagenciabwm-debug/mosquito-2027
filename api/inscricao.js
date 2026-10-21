// POST /api/inscricao  — público: o site chama quando a pessoa envia o formulário
import crypto from 'node:crypto';
import { redis, CHAVE, TAMANHOS, TIPOS, lerCorpo, texto, ipDe, erro } from './_lib.js';

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

    const tipo = TIPOS.includes(b.tipo) ? b.tipo : null;
    const nome = texto(b.nome, 100);
    const whatsapp = texto(b.whatsapp, 20).replace(/[^\d()\s-]/g, '');
    const digitos = whatsapp.replace(/\D/g, '').length;
    const tamanho = TAMANHOS.includes(b.tamanho) ? b.tamanho : null;

    if (!tipo || nome.length < 3 || digitos < 10 || digitos > 11 || !tamanho) {
      return res.status(400).json({ ok: false, erro: 'Dados inválidos.' });
    }

    let criancas = [];
    let quantidade = 1;

    if (tipo === 'paisFilhos') {
      criancas = (Array.isArray(b.criancas) ? b.criancas : []).slice(0, 10).map((c) => ({
        nome: texto(c?.nome, 80),
        idade: Math.max(0, Math.min(17, parseInt(c?.idade, 10) || 0)),
        tamanho: TAMANHOS.includes(c?.tamanho) ? c.tamanho : 'Infantil'
      })).filter((c) => c.nome.length >= 2);
      if (!criancas.length) return res.status(400).json({ ok: false, erro: 'Informe as crianças.' });
      quantidade = 1 + criancas.length; // responsável + crianças
    } else if (tipo === 'abada') {
      quantidade = Math.max(1, Math.min(20, parseInt(b.quantidade, 10) || 1));
    }

    const registro = {
      id: crypto.randomUUID(),
      tipo,
      nome,
      whatsapp,
      tamanho,
      quantidade,
      criancas,
      valorKit: texto(b.valorKit, 20),
      status: 'pendente',
      criadoEm: new Date().toISOString()
    };

    await redis('HSET', CHAVE, registro.id, JSON.stringify(registro));
    return res.status(200).json({ ok: true, id: registro.id });
  } catch (e) {
    return erro(res, e);
  }
}
