import { NextResponse } from "next/server";
import { z } from "zod";
import { agoraNaBarbearia } from "@/lib/agora";
import { getDb } from "@/lib/db";
import { agendaDoDia, escopoDe } from "@/lib/painel";
import { usuarioAtual } from "@/lib/sessao";
import { consultaAgenda } from "@/lib/validacao";

// GET /api/painel/agenda?data=2026-10-05&barbeiroId=1   (data e barbeiroId são opcionais)
export async function GET(req: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Faça login." }, { status: 401 });

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = consultaAgenda.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });
  }

  const data = parsed.data.data ?? agoraNaBarbearia().data;
  const escopo = escopoDe(usuario, parsed.data.barbeiroId);
  return NextResponse.json({ data, agenda: await agendaDoDia(getDb(), escopo, data) });
}