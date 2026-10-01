import type { Db } from "./db";

/** Quantos logins errados em JANELA_MIN minutos bloqueiam o e-mail / o IP. */
export const MAX_FALHAS_EMAIL = 5;
export const MAX_FALHAS_IP = 20;
export const JANELA_MIN = 15;

export type EstadoLogin = { bloqueado: false } | { bloqueado: true; esperarMin: number };

const normalizar = (email: string) => email.trim().toLowerCase();

/**
 * Já houve tentativas demais? Vale para qualquer e-mail digitado, exista ou não,
 * então o bloqueio não revela quais e-mails têm conta.
 */
export async function estadoDoLogin(db: Db, email: string, ip: string | null): Promise<EstadoLogin> {
  const r = await db.query<{ por_email: number; por_ip: number; espera_email: number | null; espera_ip: number | null }>(
    `SELECT COUNT(*) FILTER (WHERE email = $1)::int AS por_email,
            COUNT(*) FILTER (WHERE $2::text IS NOT NULL AND ip = $2::text)::int AS por_ip,
            -- segundos até a falha mais antiga sair da janela
            EXTRACT(EPOCH FROM (MIN(criado_em) FILTER (WHERE email = $1) + make_interval(mins => $3::int) - now()))::float8 AS espera_email,
            EXTRACT(EPOCH FROM (MIN(criado_em) FILTER (WHERE $2::text IS NOT NULL AND ip = $2::text)
                                + make_interval(mins => $3::int) - now()))::float8 AS espera_ip
       FROM tentativas_login
      WHERE criado_em > now() - make_interval(mins => $3::int)`,
    [normalizar(email), ip, JANELA_MIN],
  );
  const l = r.rows[0];
  const esperas: number[] = [];
  if (l.por_email >= MAX_FALHAS_EMAIL && l.espera_email !== null) esperas.push(l.espera_email);
  if (l.por_ip >= MAX_FALHAS_IP && l.espera_ip !== null) esperas.push(l.espera_ip);
  if (esperas.length === 0) return { bloqueado: false };
  return { bloqueado: true, esperarMin: Math.max(1, Math.ceil(Math.max(...esperas) / 60)) };
}

export async function registrarFalha(db: Db, email: string, ip: string | null): Promise<void> {
  await db.query("INSERT INTO tentativas_login (email, ip) VALUES ($1, $2)", [normalizar(email), ip]);
  await db.query("DELETE FROM tentativas_login WHERE criado_em < now() - interval '1 day'"); // faxina
}

/** Login certo: zera as falhas desse e-mail. */
export async function limparFalhas(db: Db, email: string): Promise<void> {
  await db.query("DELETE FROM tentativas_login WHERE email = $1", [normalizar(email)]);
}
