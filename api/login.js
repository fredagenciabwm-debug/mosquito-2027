// POST /api/login  — devolve um token de sessão (12 horas) para o painel
import { conferirLogin, criarToken, lerCorpo, redis, ipDe, erro } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  try {
    // Trava tentativas: no máximo 10 erros a cada 15 minutos por IP
    const chave = 'mosquito2027:login:' + ipDe(req);
    const tentativas = parseInt(await redis('GET', chave), 10) || 0;
    if (tentativas >= 10) return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Aguarde 15 minutos.' });

    const { usuario, senha } = lerCorpo(req);
    if (!conferirLogin(usuario, senha)) {
      await redis('INCR', chave);
      await redis('EXPIRE', chave, 900);
      return res.status(401).json({ ok: false, erro: 'Usuário ou senha incorretos.' });
    }
    await redis('DEL', chave);
    return res.status(200).json({ ok: true, token: criarToken(12) });
  } catch (e) {
    return erro(res, e);
  }
}
