import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirDono } from "@/lib/acesso";
import { criarBarbeiro } from "@/lib/admin";
import { criarUsuario } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { gerarExpediente } from "@/lib/expediente";
import { definirTelefone, normalizarTelefone } from "@/lib/telefone";
import { novoBarbeiro } from "@/lib/validacao";

// POST /api/painel/admin/barbeiros  { "nome": "Lucas", "servicoIds": [1, 2], "login": { "email": "...", "senha": "..." } }
export async function POST(req: Request) {
  const g = await exigirDono();
  if ("erro" in g) return g.erro;

  const parsed = novoBarbeiro.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });

  const telefone = parsed.data.login?.telefone;
  if (telefone && !normalizarTelefone(telefone)) {
    return NextResponse.json({ erro: "WhatsApp inválido. Use DDD + número, ex.: 11 99999-9999." }, { status: 400 });
  }

  const db = getDb();
  const id = await criarBarbeiro(db, parsed.data);
  if (id === null) return NextResponse.json({ erro: "Algum serviço escolhido não existe." }, { status: 422 });

  await gerarExpediente(db); // sem horários de funcionamento o barbeiro não apareceria para agendar

  let login: "CRIADO" | "EMAIL_JA_EXISTE" | undefined;
  let whatsapp: "OK" | "TELEFONE_EM_USO" | undefined;
  if (parsed.data.login) {
    const r = await criarUsuario(db, {
      nome: parsed.data.nome,
      email: parsed.data.login.email,
      senha: parsed.data.login.senha,
      papel: "BARBEIRO",
      barbeiroId: id,
    });
    login = r.ok ? "CRIADO" : "EMAIL_JA_EXISTE";
    if (r.ok && telefone) {
      const t = await definirTelefone(db, { id: r.id }, telefone);
      whatsapp = t === "OK" ? "OK" : "TELEFONE_EM_USO";
    }
  }
  return NextResponse.json({ id, login, whatsapp }, { status: 201 });
}
