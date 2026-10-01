import { NextResponse } from "next/server";
import { z } from "zod";
import { agoraNaBarbearia } from "@/lib/agora";
import { getDb } from "@/lib/db";
import { escopoDe, resumoDoMes } from "@/lib/painel";
import { usuarioAtual } from "@/lib/sessao";
import { consultaResumo } from "@/lib/validacao";

// GET /api/painel/resumo?mes=2026-10&barbeiroId=1   (mes e barbeiroId são opcionais)
export async function GET(req: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Faça login." }, { status: 401 });

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = consultaResumo.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });
  }

  const mes = parsed.data.mes ?? agoraNaBarbearia().data.slice(0, 7);
  const escopo = escopoDe(usuario, parsed.data.barbeiroId);
  return NextResponse.json(await resumoDoMes(getDb(), escopo, mes));
}