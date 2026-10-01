import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Db } from "./db";

export const DURACAO_SESSAO_DIAS = 7;
const CUSTO_BCRYPT = 10; // quanto maior, mais lento (e mais difícil de quebrar por força bruta)

// Hash falso, usado quando o e-mail não existe: assim "e-mail errado" e "senha errada"
// demoram o mesmo tempo, e ninguém descobre quais e-mails têm conta.
const HASH_FALSO = bcrypt.hashSync("senha-que-ninguem-usa", CUSTO_BCRYPT);

export type Papel = "BARBEIRO" | "DONO";

export type Usuario = {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  barbeiroId: number | null;
};

/** O token vai no cookie do navegador. No banco guardamos só o hash dele. */
function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type NovoUsuario = {
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
  barbeiroId?: number | null;
};

export type ResultadoCriarUsuario =
  | { ok: true; id: number }
  | { ok: false; motivo: "EMAIL_JA_EXISTE" | "DADOS_INVALIDOS" | "BARBEIRO_INVALIDO" };

export async function criarUsuario(db: Db, n: NovoUsuario): Promise<ResultadoCriarUsuario> {
  const email = n.email.trim().toLowerCase();
  if (!n.nome.trim() || !email.includes("@") || n.senha.length < 8) {
    return { ok: false, motivo: "DADOS_INVALIDOS" };
  }
  if (n.papel === "BARBEIRO" && !n.barbeiroId) {
    return { ok: false, motivo: "DADOS_INVALIDOS" };
  }

  const senhaHash = await bcrypt.hash(n.senha, CUSTO_BCRYPT);
  try {
    const r = await db.query<{ id: number }>(
      `INSERT INTO usuarios (nome, email, senha_hash, papel, barbeiro_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [n.nome.trim(), email, senhaHash, n.papel, n.barbeiroId ?? null],
    );
    return { ok: true, id: r.rows[0].id };
  } catch (erro) {
    const e = erro as { code?: string; constraint?: string };
    if (e.code === "23505") {
      // violação de UNIQUE: e-mail repetido, ou barbeiro que já tem login
      return { ok: false, motivo: e.constraint === "usuarios_barbeiro_uk" ? "BARBEIRO_INVALIDO" : "EMAIL_JA_EXISTE" };
    }
    if (e.code === "23503") return { ok: false, motivo: "BARBEIRO_INVALIDO" }; // barbeiro não existe
    throw erro;
  }
}

export type ResultadoEntrar =
  | { ok: true; token: string; expiraEm: Date; usuario: Usuario }
  | { ok: false };

/** Confere e-mail e senha. Se estiver certo, cria uma sessão e devolve o token. */
export async function entrar(db: Db, emailDigitado: string, senha: string): Promise<ResultadoEntrar> {
  const email = emailDigitado.trim().toLowerCase();
  const r = await db.query<{
    id: number;
    nome: string;
    email: string;
    senha_hash: string;
    papel: Papel;
    barbeiro_id: number | null;
    ativo: boolean;
  }>("SELECT id, nome, email, senha_hash, papel, barbeiro_id, ativo FROM usuarios WHERE email = $1", [email]);

  const u = r.rows[0];
  const senhaCerta = await bcrypt.compare(senha, u?.senha_hash ?? HASH_FALSO);
  if (!u || !senhaCerta || !u.ativo) return { ok: false };

  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_DIAS * 24 * 3600 * 1000);
  await db.query("DELETE FROM sessoes WHERE expira_em < now()"); // faxina de sessões vencidas
  await db.query("INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ($1, $2, $3)", [
    hashDoToken(token),
    u.id,
    expiraEm.toISOString(),
  ]);

  return {
    ok: true,
    token,
    expiraEm,
    usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel, barbeiroId: u.barbeiro_id },
  };
}

/** Quem é o dono deste token? null se não existir, se venceu ou se o usuário foi desativado. */
export async function usuarioDaSessao(db: Db, token: string | undefined): Promise<Usuario | null> {
  if (!token) return null;
  const r = await db.query<{
    id: number;
    nome: string;
    email: string;
    papel: Papel;
    barbeiro_id: number | null;
  }>(
    `SELECT u.id, u.nome, u.email, u.papel, u.barbeiro_id
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.expira_em > now() AND u.ativo`,
    [hashDoToken(token)],
  );
  const u = r.rows[0];
  return u ? { id: u.id, nome: u.nome, email: u.email, papel: u.papel, barbeiroId: u.barbeiro_id } : null;
}

/** Encerra a sessão (logout). */
export async function sair(db: Db, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.query("DELETE FROM sessoes WHERE token_hash = $1", [hashDoToken(token)]);
}