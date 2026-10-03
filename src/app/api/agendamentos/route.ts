import { NextResponse } from "next/server";
import { z } from "zod";
import { agendar, cancelar } from "@/lib/agendamentos";
import { agoraNaBarbearia } from "@/lib/agora";
import { getDb } from "@/lib/db";
import { depoisDaResposta } from "@/lib/depois";
import { criarPix, configMercadoPago } from "@/lib/mercadopago";
import { notificarNovoAgendamento } from "@/lib/notificacoes";
import { registrarPix } from "@/lib/pix-automatico";
import { gerarPixCopiaECola, pixConfigurado } from "@/lib/pix";
import { site } from "@/lib/site";
import { urlPublica } from "@/lib/url-publica";
import { novoAgendamento } from "@/lib/validacao";

const STATUS = {
  CONFLITO: 409,
  FORA_DO_EXPEDIENTE: 422,
  SERVICO_NAO_ENCONTRADO: 404,
  SERVICO_NAO_OFERECIDO: 422,
  REFERENCIA_INVALIDA: 404,
} as const;

const MENSAGEM = {
  CONFLITO: "Esse horário já foi reservado",
  FORA_DO_EXPEDIENTE: "Horário fora do expediente ou barbeiro indisponível",
  SERVICO_NAO_ENCONTRADO: "Serviço não encontrado",
  SERVICO_NAO_OFERECIDO: "Este barbeiro não faz esse serviço",
  REFERENCIA_INVALIDA: "Barbeiro ou cliente não encontrado",
} as const;

// POST /api/agendamentos
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const parsed = novoAgendamento.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });
  }

  const agora = agoraNaBarbearia();
  const { data, horaInicio } = parsed.data;
  if (data < agora.data || (data === agora.data && horaInicio <= agora.hora)) {
    return NextResponse.json({ erro: "Horário no passado" }, { status: 400 });
  }

  // Pix só pode ser escolhido se há como gerá-lo: Mercado Pago (automático) ou chave Pix própria (manual).
  // Conferimos ANTES de reservar o horário.
  const querPix = parsed.data.formaPagamento === "PIX";
  const mp = querPix ? configMercadoPago() : null;
  const pix = querPix ? pixConfigurado() : null;
  if (querPix && !mp && !pix) {
    return NextResponse.json(
      { erro: "Pix indisponível no momento. Escolha pagar após o corte.", motivo: "PIX_INDISPONIVEL" },
      { status: 422 },
    );
  }

  const db = getDb();
  const r = await agendar(db, parsed.data);
  if (!r.ok) {
    return NextResponse.json({ erro: MENSAGEM[r.motivo], motivo: r.motivo }, { status: STATUS[r.motivo] });
  }

  // Avisa barbeiro e dono no WhatsApp (se configurado), sem atrasar nem arriscar a resposta ao cliente.
  depoisDaResposta(() => notificarNovoAgendamento(getDb(), r.id));

  if (!querPix || r.preco <= 0) return NextResponse.json({ id: r.id }, { status: 201 });

  if (mp) {
    const criado = await criarPix(mp, {
      agendamentoId: r.id,
      valor: r.preco,
      descricao: `${site.nome} - agendamento ${r.id}`,
      urlAviso: `${urlPublica(req)}/api/pagamentos/mercadopago/webhook`,
    });
    if (criado.ok) {
      // Se não der para guardar o registro, o cliente ainda paga e o aviso do Mercado Pago confirma. Só não há consulta automática na tela.
      const consulta = await registrarPix(db, { mpId: criado.mpId, agendamentoId: r.id, valor: r.preco }).catch((e) => {
        console.error("[pix] não foi possível registrar o pagamento", e);
        return undefined;
      });
      return NextResponse.json(
        { id: r.id, pix: { copiaECola: criado.copiaECola, valor: r.preco, expiraEm: r.expiraEm, automatico: true, consulta } },
        { status: 201 },
      );
    }
    console.error(`[pix] Mercado Pago recusou (status ${criado.status}): ${criado.erro}`);
    if (!pix) {
      await cancelar(db, r.id); // sem Pix para pagar, não deixa o horário preso
      return NextResponse.json(
        { erro: "Não foi possível gerar o Pix agora. Escolha pagar após o corte.", motivo: "PIX_INDISPONIVEL" },
        { status: 502 },
      );
    }
    // Há chave Pix própria: segue com o Pix manual, que o barbeiro confirma.
  }

  const copiaECola = gerarPixCopiaECola({ ...pix!, valor: r.preco, txid: `AG${r.id}` });
  return NextResponse.json({ id: r.id, pix: { copiaECola, valor: r.preco, expiraEm: r.expiraEm } }, { status: 201 });
}
