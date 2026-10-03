import { NextResponse } from "next/server";
import { exigirDono } from "@/lib/acesso";
import { getDb } from "@/lib/db";
import { devolucoesPendentes } from "@/lib/pix-automatico";

// GET /api/painel/devolucoes — pagamentos recebidos que o dono precisa devolver (só dono)
export async function GET() {
  const g = await exigirDono();
  if ("erro" in g) return g.erro;
  return NextResponse.json({ devolucoes: await devolucoesPendentes(getDb()) }, { headers: { "Cache-Control": "no-store" } });
}
