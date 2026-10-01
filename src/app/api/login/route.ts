import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { entrar } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { estadoDoLogin, limparFalhas, registrarFalha } from "@/lib/limite-login";
import { NOME_COOKIE, opcoesCookie } from "@/lib/sessao";
import { credenciais } from "@/lib/validacao";

// POST /api/login  { "email": "...", "senha": "..." }
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const parsed = credenciais.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
  }

  const db = getDb();
  // Atrás de proxy (Vercel etc.) o IP vem em x-forwarded-for. Sem ele, só o limite por e-mail vale.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;

  // Bloqueado: nem confere a senha. Quem acertou a senha também espera.
  const estado = await estadoDoLogin(db, parsed.data.email, ip);
  if (estado.bloqueado) {
    return NextResponse.json(
      { erro: `Muitas tentativas. Tente novamente em ${estado.esperarMin} min.` },
      { status: 429, headers: { "Retry-After": String(estado.esperarMin * 60) } },
    );
  }

  const r = await entrar(db, parsed.data.email, parsed.data.senha);
  if (!r.ok) {
    await registrarFalha(db, parsed.data.email, ip);
    // Mesma mensagem para e-mail errado e senha errada: não revela quais e-mails existem.
    return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
  }

  await limparFalhas(db, parsed.data.email);
  const jar = await cookies();
  jar.set(NOME_COOKIE, r.token, opcoesCookie(r.expiraEm));
  return NextResponse.json({ usuario: { nome: r.usuario.nome, papel: r.usuario.papel } });
}
