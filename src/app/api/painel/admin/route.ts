import { NextResponse } from "next/server";
import { exigirDono } from "@/lib/acesso";
import { listarBarbeirosAdmin, listarServicosAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";

// GET /api/painel/admin   (só o dono)
export async function GET() {
  const g = await exigirDono();
  if ("erro" in g) return g.erro;
  const db = getDb();
  return NextResponse.json({ barbeiros: await listarBarbeirosAdmin(db), servicos: await listarServicosAdmin(db) });
}
