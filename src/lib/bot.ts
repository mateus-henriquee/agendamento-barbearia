import type { Usuario } from "./auth";
import { liberarExpirados } from "./agendamentos";
import type { Db } from "./db";
import { somarDias } from "./mensagens";
import { agendaDoDia, escopoDe, type ItemAgenda } from "./painel";
import type { MensagemSaida } from "./whatsapp";

/** Conversa do bot de agenda. Não envia nada: recebe o que a pessoa escreveu e devolve o que responder. */

const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const SEMANA_LONGA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const DIAS_NA_LISTA = 10; // limite da API do WhatsApp: 10 linhas por lista
const LIMITE_TEXTO = 3800; // a API aceita 4096; deixamos folga

const diaDaSemana = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const reais = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function dataValida(ano: number, mes: number, dia: number): string | null {
  const iso = `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  const confere = !Number.isNaN(d.getTime()) && d.getUTCFullYear() === ano && d.getUTCMonth() + 1 === mes && d.getUTCDate() === dia;
  return confere ? iso : null;
}

/** "hoje", "amanhã", "sexta", "05/10", "05/10/2026" → "2026-10-05". null se não entender. */
export function interpretarData(texto: string, hoje: string): string | null {
  const t = semAcento(texto).replace(/[!?.,]+$/g, "");
  if (t === "hoje") return hoje;
  if (t === "amanha") return somarDias(hoje, 1);
  if (t === "depois de amanha") return somarDias(hoje, 2);
  if (t === "ontem") return somarDias(hoje, -1);

  const dias: Record<string, number> = {
    domingo: 0, dom: 0, segunda: 1, "segunda-feira": 1, seg: 1, terca: 2, "terca-feira": 2, ter: 2,
    quarta: 3, "quarta-feira": 3, qua: 3, quinta: 4, "quinta-feira": 4, qui: 4,
    sexta: 5, "sexta-feira": 5, sex: 5, sabado: 6, sab: 6,
  };
  if (t in dias) {
    // próximo dia com esse nome; se hoje já é ele, é hoje
    const falta = (dias[t] - diaDaSemana(hoje) + 7) % 7;
    return somarDias(hoje, falta);
  }

  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (m) {
    const anoHoje = Number(hoje.slice(0, 4));
    let ano = m[3] ? Number(m[3]) : anoHoje;
    if (m[3]?.length === 2) ano += 2000;
    return dataValida(ano, Number(m[2]), Number(m[1]));
  }
  return null;
}

function rotuloDia(iso: string, hoje: string): string {
  const sem = `${SEMANA_CURTA[diaDaSemana(iso)]} ${ddmm(iso)}`;
  if (iso === hoje) return `Hoje · ${sem}`;
  if (iso === somarDias(hoje, 1)) return `Amanhã · ${sem}`;
  return sem;
}

/** Lista dos próximos dias, cada um com quantos agendamentos tem. */
export async function listaDeDias(db: Db, usuario: Usuario, hoje: string, abertura: string): Promise<MensagemSaida> {
  await liberarExpirados(db);
  const escopo = escopoDe(usuario);
  const fim = somarDias(hoje, DIAS_NA_LISTA);
  const r = await db.query<{ data: string; total: number }>(
    `SELECT data::text AS data, COUNT(*)::int AS total
       FROM agendamentos
      WHERE data >= $1::date AND data < $2::date
        AND status IN ('AGUARDANDO_PAGAMENTO', 'CONFIRMADO', 'CONCLUIDO', 'FALTOU')
        AND ($3::int IS NULL OR barbeiro_id = $3::int)
      GROUP BY data`,
    [hoje, fim, escopo],
  );
  const contagem = new Map(r.rows.map((l) => [l.data, l.total]));
  const linhas = Array.from({ length: DIAS_NA_LISTA }, (_, i) => {
    const dia = somarDias(hoje, i);
    const n = contagem.get(dia) ?? 0;
    return { id: `dia:${dia}`, titulo: rotuloDia(dia, hoje), descricao: n === 0 ? "Sem agendamentos" : n === 1 ? "1 agendamento" : `${n} agendamentos` };
  });
  return {
    tipo: "lista",
    corpo: `${abertura}\n\nToque em *Escolher dia* ou escreva: hoje, amanhã, sexta, 05/10…`,
    botao: "Escolher dia",
    secao: "Próximos dias",
    linhas,
  };
}

function linhaDoItem(i: ItemAgenda, mostrarBarbeiro: boolean): string {
  const partes = [i.servico, reais(i.preco)];
  if (mostrarBarbeiro) partes.push(i.barbeiro);
  let situacao = `Pago: *${i.pago ? "s" : "n"}*`;
  if (i.status === "AGUARDANDO_PAGAMENTO") situacao = "Pago: *n* (aguardando Pix)";
  if (i.status === "FALTOU") situacao = "faltou";
  return `*${i.inicio}* ${i.cliente}\n   ${partes.join(" · ")} · ${situacao}`;
}

/** Texto da agenda de um dia. Cancelados não aparecem. */
export async function textoDaAgenda(db: Db, usuario: Usuario, data: string, hoje: string): Promise<string> {
  const todos = await agendaDoDia(db, escopoDe(usuario), data);
  const itens = todos.filter((i) => i.status !== "CANCELADO");
  const dono = usuario.papel === "DONO";
  const quando = data === hoje ? " (hoje)" : data === somarDias(hoje, 1) ? " (amanhã)" : "";
  const titulo = `📅 *${SEMANA_LONGA[diaDaSemana(data)]}, ${ddmm(data)}/${data.slice(0, 4)}*${quando}`;
  if (itens.length === 0) return `${titulo}\n\nNenhum agendamento neste dia.`;

  const pagos = itens.filter((i) => i.pago).length;
  const aReceber = itens.filter((i) => !i.pago && i.status !== "FALTOU").reduce((s, i) => s + i.preco, 0);
  const resumo = `Total: ${itens.length} · pagos: ${pagos} · a receber: ${reais(aReceber)}`;

  const linhas: string[] = [];
  let tamanho = titulo.length + resumo.length + 40;
  for (const [k, item] of itens.entries()) {
    const l = linhaDoItem(item, dono);
    if (tamanho + l.length > LIMITE_TEXTO) {
      linhas.push(`… e mais ${itens.length - k} (veja no painel)`);
      break;
    }
    linhas.push(l);
    tamanho += l.length + 2;
  }
  return [titulo, "", ...linhas.flatMap((l) => [l, ""]), resumo].join("\n");
}

export type Entrada = { texto?: string; escolha?: string };

/** O que responder a uma mensagem de um usuário autorizado. */
export async function responder(db: Db, usuario: Usuario, entrada: Entrada, hoje: string): Promise<MensagemSaida[]> {
  let data: string | null = null;
  const escolha = entrada.escolha?.match(/^dia:(\d{4})-(\d{2})-(\d{2})$/);
  if (escolha) data = dataValida(Number(escolha[1]), Number(escolha[2]), Number(escolha[3]));
  else if (entrada.texto) data = interpretarData(entrada.texto, hoje);

  if (data) {
    return [
      { tipo: "texto", texto: await textoDaAgenda(db, usuario, data, hoje) },
      await listaDeDias(db, usuario, hoje, "Ver outro dia?"),
    ];
  }

  const primeiroNome = usuario.nome.trim().split(/\s+/)[0];
  const dono = usuario.papel === "DONO";
  const abertura = `Olá, ${primeiroNome}! Agenda ${dono ? "de todos os barbeiros" : "do dia"}. Qual dia você quer ver?`;
  return [await listaDeDias(db, usuario, hoje, abertura)];
}
