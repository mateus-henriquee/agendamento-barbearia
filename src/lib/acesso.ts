import { NextResponse } from "next/server";
import type { Usuario } from "./auth";
import { usuarioAtual } from "./sessao";

/** Para rotas só do dono: devolve o usuário ou a resposta de erro pronta (401 sem login, 403 se não for dono). */
export async function exigirDono(): Promise<{ usuario: Usuario } | { erro: NextResponse }> {
  const usuario = await usuarioAtual();
  if (!usuario) return { erro: NextResponse.json({ erro: "Faça login." }, { status: 401 }) };
  if (usuario.papel !== "DONO") return { erro: NextResponse.json({ erro: "Apenas o dono pode fazer isso." }, { status: 403 }) };
  return { usuario };
}
