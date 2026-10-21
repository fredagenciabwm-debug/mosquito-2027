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
// Setores que o SITE pode enviar
export const TIPOS_PUBLICOS = ['paisFilhos', 'bandeiras', 'abada'];
// Todos os setores (o painel pode cadastrar em qualquer um)
export const TIPOS = ['paisFilhos', 'bandeiras', 'destaque', 'bateria', 'abada'];

// ---------- Banco de dados (Upstash Redis via REST, sem dependências) ----------
// Aceita qualquer prefixo escolhido ao conectar o banco no Vercel (KV_, STORAGE_, UPSTASH_REDIS_ …)
function acharVariavel(sufixo) {
  const preferidas = ['KV' + sufixo, 'STORAGE' + sufixo, 'UPSTASH_REDIS' + sufixo];
  for (const n of preferidas) if (process.env[n]) return process.env[n];
  const outra = Object.keys(process.env).find((n) => n.endsWith(sufixo) && !n.includes('READ_ONLY'));
  return outra ? process.env[outra] : '';
}

function credenciaisRedis() {
  const url = acharVariavel('_REST_API_URL') || acharVariavel('_REST_URL');
  const token = acharVariavel('_REST_API_TOKEN') || acharVariavel('_REST_TOKEN');
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
  const base = process.env.SESSION_SECRET || acharVariavel('_REST_API_TOKEN') || acharVariavel('_REST_TOKEN') || '';
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
  if (msg.startsWith('INVALIDO: ')) return res.status(400).json({ ok: false, erro: msg.slice(10) });
  if (msg.includes('BANCO_NAO_CONFIGURADO')) {
    return res.status(503).json({ ok: false, erro: 'Banco de dados ainda não conectado no Vercel (Storage → Upstash Redis).' });
  }
  console.error(e);
  return res.status(500).json({ ok: false, erro: 'Erro interno. Tente novamente.' });
}

// ---------- Validação de um cadastro (site ou painel) ----------
// Lança Error('INVALIDO: mensagem') quando algo está errado.
export function normalizar(b, { admin = false } = {}) {
  const falha = (m) => { throw new Error('INVALIDO: ' + m); };
  const permitidos = admin ? TIPOS : TIPOS_PUBLICOS;
  const tipo = permitidos.includes(b.tipo) ? b.tipo : falha('Setor inválido.');

  const nome = texto(b.nome, 100);
  if (nome.length < 3) falha('Informe o nome completo.');

  const whatsapp = texto(b.whatsapp, 20).replace(/[^\d()\s-]/g, '');
  const digitos = whatsapp.replace(/\D/g, '').length;
  // No painel o WhatsApp é opcional; se preenchido, precisa ser válido
  if ((!admin || digitos > 0) && (digitos < 10 || digitos > 11)) falha('WhatsApp inválido (use DDD + número).');

  const tamanho = TAMANHOS.includes(b.tamanho) ? b.tamanho : '';
  if (!admin && !tamanho) falha('Selecione o tamanho do abadá.');

  const reg = { tipo, nome, whatsapp, tamanho, quantidade: 1, criancas: [], valorKit: texto(b.valorKit, 20) };

  if (tipo === 'paisFilhos') {
    reg.criancas = (Array.isArray(b.criancas) ? b.criancas : []).slice(0, 10).map((c) => ({
      nome: texto(c?.nome, 80),
      idade: Math.max(0, Math.min(17, parseInt(c?.idade, 10) || 0)),
      tamanho: TAMANHOS.includes(c?.tamanho) ? c.tamanho : (admin ? '' : 'Infantil')
    })).filter((c) => c.nome.length >= 2);
    if (!reg.criancas.length) falha('Informe ao menos uma criança.');
    reg.quantidade = 1 + reg.criancas.length;
  }
  if (tipo === 'abada') reg.quantidade = Math.max(1, Math.min(admin ? 200 : 20, parseInt(b.quantidade, 10) || 1));
  if (tipo === 'destaque') {
    reg.posicao = texto(b.posicao, 80);
    if (reg.posicao.length < 2) falha('Informe a posição de destaque.');
  }
  if (tipo === 'bateria') {
    reg.instrumento = texto(b.instrumento, 60);
    if (reg.instrumento.length < 2) falha('Informe o instrumento.');
  }
  if (admin) {
    reg.status = b.status === 'pago' ? 'pago' : 'pendente';
    reg.obs = texto(b.obs, 300);
  }
  return reg;
}
