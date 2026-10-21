// POST /api/aviso-teste  — painel: envia uma mensagem de teste para o WhatsApp de avisos
import { tokenValido, avisarWhatsApp, erro } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  if (!tokenValido(req)) return res.status(401).json({ ok: false, erro: 'Sessão expirada. Entre novamente.' });
  try {
    const r = await avisarWhatsApp('✅ *Teste de aviso* – Controle Interno Mosquito 2027.\nSe você recebeu esta mensagem, os avisos de novos cadastros estão funcionando!');
    return r.enviado
      ? res.status(200).json({ ok: true })
      : res.status(200).json({ ok: false, erro: r.motivo });
  } catch (e) {
    return erro(res, e);
  }
}
