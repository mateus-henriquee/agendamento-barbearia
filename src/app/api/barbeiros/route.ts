import { NextResponse } from "next/server";
import { listarBarbeiros } from "@/lib/catalogo";
import { getDb } from "@/lib/db";

// GET /api/barbeiros
export async function GET() {
  return NextResponse.json({ barbeiros: await listarBarbeiros(getDb()) });
}