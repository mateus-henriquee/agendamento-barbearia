import { cookies } from "next/headers";
import { DURACAO_SESSAO_DIAS, usuarioDaSessao, type Usuario } from "./auth";
import { getDb } from "./db";

export const NOME_COOKIE = "sessao";

/** Opções do cookie: o JavaScript da página não consegue ler (httpOnly). */
export function opcoesCookie(expira: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expira,
    maxAge: DURACAO_SESSAO_DIAS * 24 * 3600,
  };
}

/** Usuário logado na requisição atual, ou null. Usado nas páginas e rotas do painel. */
export async function usuarioAtual(): Promise<Usuario | null> {
  const jar = await cookies();
  return usuarioDaSessao(getDb(), jar.get(NOME_COOKIE)?.value);
}