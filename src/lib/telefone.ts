import type { Db } from "./db";

/**
 * Deixa o telefone no formato que a Meta usa: só dígitos, com DDI.
 * - Sem DDI (10 ou 11 dígitos), assume Brasil (55).
 * - Celular brasileiro antigo, sem o 9 (55 + DDD + 8 dígitos), ganha o 9. A Meta ainda entrega alguns assim.
 * Retorna null se não parecer um telefone.
 */
export function normalizarTelefone(bruto: string): string | null {
  let d = bruto.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length === 12 && d.startsWith("55") && /^[6-9]/.test(d[4])) d = `${d.slice(0, 4)}9${d.slice(4)}`;
  return d.length >= 12 && d.length <= 15 ? d : null;
}

export type ResultadoTelefone = "OK" | "USUARIO_NAO_ENCONTRADO" | "TELEFONE_INVALIDO" | "TELEFONE_EM_USO";

/** Define (ou limpa, com null) o WhatsApp de um usuário. */
export async function definirTelefone(
  db: Db,
  alvo: { id: number } | { email: string },
  telefone: string | null,
): Promise<ResultadoTelefone> {
  const normalizado = telefone === null ? null : normalizarTelefone(telefone);
  if (telefone !== null && normalizado === null) return "TELEFONE_INVALIDO";
  try {
    const r =
      "id" in alvo
        ? await db.query("UPDATE usuarios SET telefone = $2 WHERE id = $1 RETURNING id", [alvo.id, normalizado])
        : await db.query("UPDATE usuarios SET telefone = $2 WHERE email = lower($1) RETURNING id", [alvo.email.trim(), normalizado]);
    return r.rows.length > 0 ? "OK" : "USUARIO_NAO_ENCONTRADO";
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") return "TELEFONE_EM_USO";
    throw erro;
  }
}
