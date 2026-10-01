import { createHmac, timingSafeEqual } from "node:crypto";

/** Cliente mínimo da WhatsApp Cloud API (Meta). Sem biblioteca: são só chamadas HTTP. */

const VERSAO_API = "v21.0";

export type ConfigWhatsApp = {
  token: string;
  phoneId: string;
  /** Nome do modelo aprovado para avisar novo agendamento. Sem ele, o aviso vai como texto livre. */
  templateNovo: string | null;
  idiomaTemplate: string;
};

/** Lê a configuração do ambiente. null = WhatsApp desligado (o sistema funciona sem). */
export function configWhatsApp(env: Record<string, string | undefined> = process.env): ConfigWhatsApp | null {
  const token = env.WHATSAPP_TOKEN?.trim();
  const phoneId = env.WHATSAPP_PHONE_ID?.trim();
  if (!token || !phoneId) return null;
  return {
    token,
    phoneId,
    templateNovo: env.WHATSAPP_TEMPLATE_NOVO?.trim() || null,
    idiomaTemplate: env.WHATSAPP_TEMPLATE_IDIOMA?.trim() || "pt_BR",
  };
}

export type LinhaLista = { id: string; titulo: string; descricao?: string };

export type MensagemSaida =
  | { tipo: "texto"; texto: string }
  | { tipo: "lista"; corpo: string; botao: string; secao: string; linhas: LinhaLista[] }
  | { tipo: "template"; nome: string; idioma: string; parametros: string[] };

export type ResultadoEnvio = { ok: true } | { ok: false; status: number; erro: string };

type Fetch = typeof fetch;

const corta = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** Monta o corpo JSON que a Meta espera. Respeita os limites de tamanho da API. */
export function montarPayload(para: string, m: MensagemSaida): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: para };
  if (m.tipo === "texto") {
    return { ...base, type: "text", text: { preview_url: false, body: corta(m.texto, 4000) } };
  }
  if (m.tipo === "lista") {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: corta(m.corpo, 1000) },
        action: {
          button: corta(m.botao, 20),
          sections: [
            {
              title: corta(m.secao, 24),
              rows: m.linhas.slice(0, 10).map((l) => ({
                id: corta(l.id, 200),
                title: corta(l.titulo, 24),
                ...(l.descricao ? { description: corta(l.descricao, 72) } : {}),
              })),
            },
          ],
        },
      },
    };
  }
  return {
    ...base,
    type: "template",
    template: {
      name: m.nome,
      language: { code: m.idioma },
      components: [
        // A Meta recusa quebra de linha e excesso de espaços dentro de parâmetros.
        { type: "body", parameters: m.parametros.map((p) => ({ type: "text", text: p.replace(/\s+/g, " ").trim() || "-" })) },
      ],
    },
  };
}

/** Envia uma mensagem. Nunca lança: devolve o motivo da falha para quem chamou decidir. */
export async function enviar(
  cfg: ConfigWhatsApp,
  para: string,
  mensagem: MensagemSaida,
  fetchImpl: Fetch = fetch,
): Promise<ResultadoEnvio> {
  try {
    const r = await fetchImpl(`https://graph.facebook.com/${VERSAO_API}/${cfg.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(montarPayload(para, mensagem)),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { ok: true };
    const texto = await r.text().catch(() => "");
    return { ok: false, status: r.status, erro: texto.slice(0, 300) };
  } catch (erro) {
    return { ok: false, status: 0, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** A Meta assina cada webhook com HMAC-SHA256 do corpo, usando o "App Secret". Sem isso qualquer um poderia fingir ser a Meta. */
export function assinaturaValida(corpoBruto: string, cabecalho: string | null, segredo: string): boolean {
  if (!cabecalho?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", segredo).update(corpoBruto).digest();
  const recebido = Buffer.from(cabecalho.slice(7), "hex");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export type Recebida = {
  id: string;
  de: string; // telefone, só dígitos
  texto?: string;
  escolha?: string; // id da linha/botão tocado
};

/** Tira do JSON da Meta só as mensagens de entrada (ignora status de entrega, etc.). */
export function extrairMensagens(payload: unknown): Recebida[] {
  const saida: Recebida[] = [];
  const entradas = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entradas)) return saida;
  for (const entry of entradas) {
    const mudancas = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(mudancas)) continue;
    for (const mud of mudancas) {
      const msgs = (mud as { value?: { messages?: unknown } })?.value?.messages;
      if (!Array.isArray(msgs)) continue;
      for (const m of msgs) {
        const msg = m as {
          id?: unknown;
          from?: unknown;
          type?: unknown;
          text?: { body?: unknown };
          interactive?: { list_reply?: { id?: unknown }; button_reply?: { id?: unknown } };
        };
        if (typeof msg.id !== "string" || typeof msg.from !== "string") continue;
        const r: Recebida = { id: msg.id, de: msg.from.replace(/\D/g, "") };
        if (msg.type === "text" && typeof msg.text?.body === "string") r.texto = msg.text.body;
        if (msg.type === "interactive") {
          const id = msg.interactive?.list_reply?.id ?? msg.interactive?.button_reply?.id;
          if (typeof id === "string") r.escolha = id;
        }
        saida.push(r);
      }
    }
  }
  return saida;
}
