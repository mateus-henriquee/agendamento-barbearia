import { NextResponse } from "next/server";
import { listarServicos } from "@/lib/catalogo";
import { getDb } from "@/lib/db";

// GET /api/servicos
export async function GET() {
  return NextResponse.json({ servicos: await listarServicos(getDb()) });
}