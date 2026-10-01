import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { entrar } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NOME_COOKIE, opcoesCookie } from "@/lib/sessao";
import { credenciais } from "@/lib/validacao";

// POST /api/login  { "email": "...", "senha": "..." }
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const parsed = credenciais.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
  }

  const r = await entrar(getDb(), parsed.data.email, parsed.data.senha);
  if (!r.ok) {
    // Mesma mensagem para e-mail errado e senha errada: não revela quais e-mails existem.
    return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(NOME_COOKIE, r.token, opcoesCookie(r.expiraEm));
  return NextResponse.json({ usuario: { nome: r.usuario.nome, papel: r.usuario.papel } });
}