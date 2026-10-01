import type { Db } from "./db";
import { dataCurta } from "./mensagens";
import { configWhatsApp, enviar, type ConfigWhatsApp, type MensagemSaida } from "./whatsapp";

const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const reais = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

type Detalhes = {
  cliente: string;
  servico: string;
  barbeiro: string;
  barbeiro_id: number;
  data: string;
  hora: string;
  preco: number;
  forma_pagamento: "PIX" | "NA_BARBEARIA";
  status: string;
};

export type ResultadoAviso = { destinatarios: number; enviados: number; falhas: number };

/**
 * Avisa por WhatsApp o barbeiro do horário e o(s) dono(s) que entrou um agendamento.
 * Nunca lança: o agendamento do cliente já está salvo e não pode falhar por causa de um aviso.
 *
 * Observação da Meta: mensagem iniciada pela empresa fora da janela de 24h só passa como "modelo" aprovado.
 * Com WHATSAPP_TEMPLATE_NOVO configurado, usamos o modelo. Sem ele, o texto livre só chega a quem falou com o bot nas últimas 24h.
 */
export async function notificarNovoAgendamento(
  db: Db,
  agendamentoId: number,
  cfg: ConfigWhatsApp | null = configWhatsApp(),
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoAviso> {
  const vazio = { destinatarios: 0, enviados: 0, falhas: 0 };
  if (!cfg) return vazio;
  try {
    const d = await db.query<Detalhes>(
      `SELECT c.nome AS cliente, s.nome AS servico, b.nome AS barbeiro, b.id AS barbeiro_id,
              a.data::text AS data, to_char(a.hora_inicio, 'HH24:MI') AS hora,
              a.preco_cobrado::float8 AS preco, a.forma_pagamento, a.status
         FROM agendamentos a
         JOIN clientes c ON c.id = a.cliente_id
         JOIN servicos s ON s.id = a.servico_id
         JOIN barbeiros b ON b.id = a.barbeiro_id
        WHERE a.id = $1`,
      [agendamentoId],
    );
    const ag = d.rows[0];
    if (!ag) return vazio;

    const quem = await db.query<{ telefone: string }>(
      `SELECT DISTINCT telefone FROM usuarios
        WHERE ativo AND telefone IS NOT NULL AND (papel = 'DONO' OR barbeiro_id = $1)`,
      [ag.barbeiro_id],
    );
    const mensagem = montarAviso(ag, cfg);

    let enviados = 0;
    let falhas = 0;
    for (const { telefone } of quem.rows) {
      const r = await enviar(cfg, telefone, mensagem, fetchImpl);
      if (r.ok) enviados++;
      else {
        falhas++;
        console.error(`[whatsapp] aviso não enviado (status ${r.status}): ${r.erro}`);
      }
    }
    return { destinatarios: quem.rows.length, enviados, falhas };
  } catch (erro) {
    console.error("[whatsapp] erro ao avisar novo agendamento", erro);
    return vazio;
  }
}

function montarAviso(ag: Detalhes, cfg: ConfigWhatsApp): MensagemSaida {
  const dia = new Date(`${ag.data}T00:00:00Z`).getUTCDay();
  const quando = `${SEMANA_CURTA[dia]} ${dataCurta(ag.data).slice(0, 5)} às ${ag.hora}`;
  const pagamento =
    ag.forma_pagamento === "PIX" ? (ag.status === "AGUARDANDO_PAGAMENTO" ? "Pix (aguardando pagamento)" : "Pix") : "na barbearia";
  const servico = `${ag.servico} (${reais(ag.preco)})`;

  if (cfg.templateNovo) {
    return { tipo: "template", nome: cfg.templateNovo, idioma: cfg.idiomaTemplate, parametros: [ag.cliente, servico, ag.barbeiro, quando, pagamento] };
  }
  return {
    tipo: "texto",
    texto: ["🆕 *Novo agendamento*", `Cliente: ${ag.cliente}`, `Serviço: ${servico}`, `Barbeiro: ${ag.barbeiro}`, `Quando: ${quando}`, `Pagamento: ${pagamento}`].join("\n"),
  };
}
