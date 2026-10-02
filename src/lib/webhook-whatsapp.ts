import { agoraNaBarbearia } from "./agora";
import type { Usuario } from "./auth";
import { responder } from "./bot";
import type { Db } from "./db";
import { normalizarTelefone } from "./telefone";
import { enviar, extrairMensagens, type ConfigWhatsApp } from "./whatsapp";

async function usuarioPorTelefone(db: Db, telefone: string): Promise<Usuario | null> {
  const r = await db.query<{ id: number; nome: string; email: string; papel: Usuario["papel"]; barbeiro_id: number | null }>(
    "SELECT id, nome, email, papel, barbeiro_id FROM usuarios WHERE telefone = $1 AND ativo",
    [telefone],
  );
  const u = r.rows[0];
  return u ? { id: u.id, nome: u.nome, email: u.email, papel: u.papel, barbeiroId: u.barbeiro_id } : null;
}

export type ResumoWebhook = { recebidas: number; respondidas: number; ignoradas: number };

/**
 * Trata o que a Meta mandou: para cada mensagem de um usuário cadastrado, responde com a agenda.
 * - Número desconhecido: ignorado em silêncio (não confirmamos nem que o bot existe).
 * - Mensagem repetida (a Meta reenvia): respondida uma vez só.
 */
export async function processarWebhook(
  db: Db,
  payload: unknown,
  cfg: ConfigWhatsApp,
  fetchImpl: typeof fetch = fetch,
  hoje: string = agoraNaBarbearia().data,
): Promise<ResumoWebhook> {
  const resumo: ResumoWebhook = { recebidas: 0, respondidas: 0, ignoradas: 0 };
  await db.query("DELETE FROM whatsapp_recebidas WHERE recebido_em < now() - interval '7 days'");

  for (const msg of extrairMensagens(payload)) {
    resumo.recebidas++;
    const novo = await db.query("INSERT INTO whatsapp_recebidas (wamid) VALUES ($1) ON CONFLICT DO NOTHING RETURNING wamid", [msg.id]);
    if (novo.rows.length === 0) {
      resumo.ignoradas++;
      console.log(`[whatsapp] mensagem repetida ignorada (${msg.id.slice(-6)})`);
      continue;
    }
    try {
      const telefone = normalizarTelefone(msg.de);
      const usuario = telefone ? await usuarioPorTelefone(db, telefone) : null;
      if (!usuario) {
        resumo.ignoradas++;
        // Mostra só o final do número, para diagnosticar sem expor o telefone inteiro nos logs.
        console.log(`[whatsapp] número não cadastrado ou inativo: final ${msg.de.slice(-4)} (normalizado: ${telefone ? `final ${telefone.slice(-4)}, ${telefone.length} dígitos` : "inválido"})`);
        await db.query("DELETE FROM whatsapp_recebidas WHERE wamid = $1", [msg.id]);
        continue;
      }
      const respostas = await responder(db, usuario, { texto: msg.texto, escolha: msg.escolha }, hoje);
      for (const resposta of respostas) {
        const r = await enviar(cfg, msg.de, resposta, fetchImpl);
        if (!r.ok) throw new Error(`envio falhou (status ${r.status}): ${r.erro}`);
      }
      resumo.respondidas++;
      console.log(`[whatsapp] respondido a ${usuario.papel} (${respostas.length} mensagem(ns))`);
    } catch (erro) {
      // Libera o id para a Meta poder tentar de novo.
      await db.query("DELETE FROM whatsapp_recebidas WHERE wamid = $1", [msg.id]);
      console.error("[whatsapp] erro ao responder", erro);
    }
  }
  return resumo;
}
