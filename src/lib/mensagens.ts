/** Textos e links do WhatsApp (click-to-chat, "wa.me"). Não envia nada sozinho: abre a conversa com a mensagem pronta. */

export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-05" -> "05/10/2026" */
export function dataCurta(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Link que abre o WhatsApp no número informado, com o texto já digitado. */
export function linkWhatsApp(telefone: string, texto: string): string {
  const numero = telefone.replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** "hoje", "amanhã" ou "dia 05/10" */
function quando(data: string, hoje: string): string {
  if (data === hoje) return "hoje";
  if (data === somarDias(hoje, 1)) return "amanhã";
  return `dia ${dataCurta(data).slice(0, 5)}`;
}

export type DadosConfirmacao = {
  cliente: string;
  servico: string;
  barbeiro: string;
  data: string;
  hora: string;
  formaPagamento: "PIX" | "NA_BARBEARIA";
};

/** Mensagem que o CLIENTE envia para a barbearia, confirmando o agendamento. */
export function mensagemConfirmacao(d: DadosConfirmacao): string {
  const pagamento = d.formaPagamento === "PIX" ? "Pagamento: Pix" : "Pagamento: após o corte";
  return [
    "Olá! Acabei de agendar pelo site.",
    `Nome: ${d.cliente}`,
    `Serviço: ${d.servico}`,
    `Barbeiro: ${d.barbeiro}`,
    `Data: ${dataCurta(d.data)} às ${d.hora}`,
    pagamento,
  ].join("\n");
}

export type DadosLembrete = {
  cliente: string;
  servico: string;
  data: string;
  hora: string;
  barbearia: string;
};

/** Mensagem que o BARBEIRO envia para o cliente, lembrando do horário. */
export function mensagemLembrete(d: DadosLembrete, hoje: string): string {
  const primeiroNome = d.cliente.trim().split(/\s+/)[0];
  return `Oi, ${primeiroNome}! Lembrete do seu horário na ${d.barbearia}: ${d.servico}, ${quando(d.data, hoje)} às ${d.hora}. Até lá!`;
}

export type DadosVaga = { cliente: string; barbeiro: string; data: string; barbearia: string };

/** Mensagem que o BARBEIRO envia para quem está na fila, quando abre uma vaga. */
export function mensagemVaga(d: DadosVaga, hoje: string): string {
  const primeiroNome = d.cliente.trim().split(/\s+/)[0];
  return `Oi, ${primeiroNome}! Abriu um horário com ${d.barbeiro} ${quando(d.data, hoje)} na ${d.barbearia}. Ainda quer? Responda aqui que a gente reserva para você.`;
}
