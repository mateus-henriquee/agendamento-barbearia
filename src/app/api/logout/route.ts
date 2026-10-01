import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sair } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NOME_COOKIE } from "@/lib/sessao";

// POST /api/logout
export async function POST() {
  const jar = await cookies();
  await sair(getDb(), jar.get(NOME_COOKIE)?.value);
  jar.delete(NOME_COOKIE);
  return new NextResponse(null, { status: 204 });
}