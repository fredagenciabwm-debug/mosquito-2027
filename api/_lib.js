// =====================================================
//  Funções compartilhadas da API (arquivos com "_" não viram rota no Vercel)
// =====================================================
import crypto from 'node:crypto';

// ---------- Login do painel ----------
// Usuário: Mosquito
// A senha NÃO fica escrita aqui, só o "hash" dela (SHA-256).
// Para trocar a senha sem mexer no código, crie no Vercel a variável ADMIN_SENHA.
const USUARIO_PADRAO = 'Mosquito';
const SENHA_HASH_PADRAO = '319865e076987801d98fbc9ed9a8bc7f51057bd0e65c55f918e154378203c34b';

export const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'Infantil'];
export const TIPOS = ['paisFilhos', 'bandeiras', 'abada'];

// ---------- Banco de dados (Upstash Redis via REST, sem dependências) ----------
function credenciaisRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('BANCO_NAO_CONFIGURADO');
  return { url: url.replace(/\/$/, ''), token };
}

export async function redis(...comando) {
  const { url, token } = credenciaisRedis();
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comando)
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok || dados.error) throw new Error('ERRO_BANCO: ' + (dados.error || r.status));
  return dados.result;
}

export const CHAVE = 'mosquito2027:inscricoes';

// ---------- Sessão (token assinado) ----------
function segredoSessao() {
  const base = process.env.SESSION_SECRET || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  if (!base) throw new Error('BANCO_NAO_CONFIGURADO');
  return crypto.createHash('sha256').update('sessao-mosquito:' + base).digest();
}

const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const iguais = (a, b) => {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

export function conferirLogin(usuario, senha) {
  const usuarioOk = String(usuario || '').trim().toLowerCase() === (process.env.ADMIN_USUARIO || USUARIO_PADRAO).toLowerCase();
  const hashEsperado = process.env.ADMIN_SENHA ? sha256(process.env.ADMIN_SENHA) : SENHA_HASH_PADRAO;
  const senhaOk = iguais(sha256(senha || ''), hashEsperado);
  return usuarioOk && senhaOk;
}

export function criarToken(horas = 12) {
  const exp = Date.now() + horas * 3600 * 1000;
  const corpo = Buffer.from(JSON.stringify({ u: 'admin', exp })).toString('base64url');
  const assinatura = crypto.createHmac('sha256', segredoSessao()).update(corpo).digest('base64url');
  return `${corpo}.${assinatura}`;
}

export function tokenValido(req) {
  try {
    const cab = req.headers.authorization || '';
    const token = cab.startsWith('Bearer ') ? cab.slice(7) : '';
    const [corpo, assinatura] = token.split('.');
    if (!corpo || !assinatura) return false;
    const esperada = crypto.createHmac('sha256', segredoSessao()).update(corpo).digest('base64url');
    if (!iguais(assinatura, esperada)) return false;
    const { exp } = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return Date.now() < exp;
  } catch { return false; }
}

// ---------- Utilidades ----------
export function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export const texto = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export function ipDe(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anon').split(',')[0].trim();
}

export function erro(res, e) {
  const msg = String(e?.message || e);
  if (msg.includes('BANCO_NAO_CONFIGURADO')) {
    return res.status(503).json({ ok: false, erro: 'Banco de dados ainda não conectado no Vercel (Storage → Upstash Redis).' });
  }
  console.error(e);
  return res.status(500).json({ ok: false, erro: 'Erro interno. Tente novamente.' });
}
