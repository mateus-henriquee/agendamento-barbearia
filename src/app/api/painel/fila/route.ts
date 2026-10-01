import { NextResponse } from "next/server";
import { z } from "zod";
import { agoraNaBarbearia } from "@/lib/agora";
import { getDb } from "@/lib/db";
import { filaDoDia } from "@/lib/fila";
import { escopoDe } from "@/lib/painel";
import { usuarioAtual } from "@/lib/sessao";
import { consultaFila } from "@/lib/validacao";

// GET /api/painel/fila?data=2026-10-05&barbeiroId=1
export async function GET(req: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Faça login." }, { status: 401 });

  const parsed = consultaFila.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });
  }
  const data = parsed.data.data ?? agoraNaBarbearia().data;
  const escopo = escopoDe(usuario, parsed.data.barbeiroId);
  return NextResponse.json({ data, fila: await filaDoDia(getDb(), escopo, data) });
}
