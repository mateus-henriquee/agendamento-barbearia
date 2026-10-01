"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { agoraNaBarbearia } from "@/lib/agora";
import { linkWhatsApp, mensagemLembrete } from "@/lib/mensagens";
import type { ItemAgenda, ResumoMes } from "@/lib/painel";
import { site } from "@/lib/site";

type Props = { usuario: { nome: string; papel: "BARBEIRO" | "DONO" } };
type Barbeiro = { id: number; nome: string };

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "2026-10-05" + 1 dia = "2026-10-06" */
function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function rotuloDia(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });
}

function rotuloMes(mes: string) {
  return new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const estiloStatus: Record<ItemAgenda["status"], string> = {
  CONFIRMADO: "bg-poste-azul/30 text-blue-200",
  CONCLUIDO: "bg-green-500/15 text-green-300",
  FALTOU: "bg-amber-500/15 text-amber-300",
  CANCELADO: "bg-white/10 text-aco",
};
const nomeStatus: Record<ItemAgenda["status"], string> = {
  CONFIRMADO: "Confirmado",
  CONCLUIDO: "Concluído",
  FALTOU: "Faltou",
  CANCELADO: "Cancelado",
};

const botaoNav = "brilho rounded-lg border border-white/15 px-3 py-2 text-sm";

export default function Painel({ usuario }: Props) {
  const router = useRouter();
  const [hoje] = useState(() => agoraNaBarbearia().data);
  const [data, setData] = useState(hoje);
  const [barbeiroId, setBarbeiroId] = useState("");
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [dados, setDados] = useState<{ chave: string; agenda: ItemAgenda[]; resumo: ResumoMes } | null>(null);
  const [chaveComFalha, setChaveComFalha] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState("");
  const [agindo, setAgindo] = useState<number | null>(null);
  const dono = usuario.papel === "DONO";

  // A "chave" identifica o que está na tela: dia + barbeiro escolhido.
  const chave = `${data}|${barbeiroId}`;
  const carregando = dados?.chave !== chave && chaveComFalha !== chave;
  const erro = chaveComFalha === chave ? "Não foi possível carregar o painel. Tente de novo." : erroAcao;

  /** Busca agenda e resumo. Devolve "SEM_SESSAO" se o login venceu, ou null se der erro. */
  const buscar = useCallback(async (d: string, b: string) => {
    try {
      const filtro = b ? `&barbeiroId=${b}` : "";
      const [ra, rr] = await Promise.all([
        fetch(`/api/painel/agenda?data=${d}${filtro}`),
        fetch(`/api/painel/resumo?mes=${d.slice(0, 7)}${filtro}`),
      ]);
      if (ra.status === 401 || rr.status === 401) return "SEM_SESSAO" as const;
      if (!ra.ok || !rr.ok) return null;
      const [ja, jr] = await Promise.all([ra.json(), rr.json()]);
      return { agenda: ja.agenda as ItemAgenda[], resumo: jr as ResumoMes };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelado = false; // se o dia mudou antes da resposta chegar, ignora a resposta antiga
    buscar(data, barbeiroId).then((r) => {
      if (cancelado) return;
      if (r === "SEM_SESSAO") router.replace("/login");
      else if (r) {
        setDados({ chave: `${data}|${barbeiroId}`, ...r });
        setChaveComFalha(null);
      } else setChaveComFalha(`${data}|${barbeiroId}`);
    });
    return () => {
      cancelado = true;
    };
  }, [data, barbeiroId, buscar, router]);

  useEffect(() => {
    if (!dono) return;
    fetch("/api/barbeiros")
      .then((r) => r.json())
      .then((j) => setBarbeiros(j.barbeiros))
      .catch(() => {});
  }, [dono]);

  async function marcar(id: number, status: "CONCLUIDO" | "FALTOU") {
    setAgindo(id);
    setErroAcao("");
    try {
      const r = await fetch(`/api/painel/agendamentos/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (r.status === 401) {
        router.replace("/login");
        return;
      }
      if (!r.ok) {
        const corpo = await r.json().catch(() => null);
        setErroAcao(typeof corpo?.erro === "string" ? corpo.erro : "Não foi possível atualizar.");
      }
      const novo = await buscar(data, barbeiroId);
      if (novo && novo !== "SEM_SESSAO") setDados({ chave, ...novo });
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setAgindo(null);
    }
  }

  async function confirmarPix(id: number) {
    setAgindo(id);
    setErroAcao("");
    try {
      const r = await fetch(`/api/painel/agendamentos/${id}/pago`, { method: "POST" });
      if (r.status === 401) {
        router.replace("/login");
        return;
      }
      if (!r.ok) {
        const corpo = await r.json().catch(() => null);
        setErroAcao(typeof corpo?.erro === "string" ? corpo.erro : "Não foi possível confirmar.");
      }
      const novo = await buscar(data, barbeiroId);
      if (novo && novo !== "SEM_SESSAO") setDados({ chave, ...novo });
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setAgindo(null);
    }
  }

  async function sair() {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  const agenda = dados?.agenda ?? null;
  const resumo = dados?.resumo ?? null;
  const podeMarcar = data <= hoje; // dia futuro não pode ser concluído

  return (
    <div className="min-h-svh bg-tinta text-white">
      <header className="border-b border-white/10 bg-grafite">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3" aria-label="Ir para o site">
            <span className="listras h-8 w-3 rounded-full ring-1 ring-white/30" aria-hidden />
            <span className="titulo text-2xl">{site.nome}</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-aco sm:inline">
              {usuario.nome} · {dono ? "Dono" : "Barbeiro"}
            </span>
            <button onClick={sair} className={botaoNav}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="titulo text-4xl sm:text-5xl">Agenda do dia</h1>
            <p className="mt-2 text-aco first-letter:uppercase">{rotuloDia(data)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setData(somarDias(data, -1))} className={botaoNav} aria-label="Dia anterior">
              ←
            </button>
            <input
              type="date"
              aria-label="Escolher dia"
              value={data}
              onChange={(e) => e.target.value && setData(e.target.value)}
              className="rounded-lg border border-white/15 bg-cartao px-3 py-2 text-sm"
            />
            <button onClick={() => setData(somarDias(data, 1))} className={botaoNav} aria-label="Próximo dia">
              →
            </button>
            <button onClick={() => setData(hoje)} className={botaoNav} disabled={data === hoje}>
              Hoje
            </button>
            {dono && (
              <select
                aria-label="Filtrar por barbeiro"
                value={barbeiroId}
                onChange={(e) => setBarbeiroId(e.target.value)}
                className="rounded-lg border border-white/15 bg-cartao px-3 py-2 text-sm"
              >
                <option value="">Todos os barbeiros</option>
                {barbeiros.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {erro && (
          <p role="alert" className="mt-6 rounded-lg border border-red-500 px-4 py-3 text-red-400">
            {erro}
          </p>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          {/* AGENDA */}
          <section aria-label="Agendamentos do dia" aria-busy={carregando} className={carregando ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {agenda === null ? (
              <p className="text-aco">Carregando…</p>
            ) : agenda.length === 0 ? (
              <p className="rounded-xl bg-cartao p-6 text-aco ring-1 ring-white/10">Nenhum agendamento neste dia.</p>
            ) : (
              <ul className="space-y-3">
                {agenda.map((i) => (
                  <li key={i.id} className="rounded-xl bg-cartao p-4 ring-1 ring-white/10">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex gap-4">
                        <div className="titulo text-3xl leading-none">{i.inicio}</div>
                        <div>
                          <p className="font-semibold">{i.cliente}</p>
                          <p className="text-sm text-aco">
                            {i.servico} · {moeda.format(i.preco)}
                            {dono && !barbeiroId && <> · {i.barbeiro}</>}
                          </p>
                          <a
                            href={linkWhatsApp(
                              i.telefone,
                              mensagemLembrete(
                                { cliente: i.cliente, servico: i.servico, data, hora: i.inicio, barbearia: site.nome },
                                hoje,
                              ),
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-aco underline-offset-2 hover:text-white hover:underline"
                          >
                            Enviar lembrete
                          </a>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${estiloStatus[i.status]}`}>
                          {nomeStatus[i.status]}
                        </span>
                        {i.status !== "CANCELADO" && i.status !== "FALTOU" && (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              i.pago ? "bg-green-500/15 text-green-300" : "bg-amber-500/15 text-amber-300"
                            }`}
                          >
                            {i.pago ? "Pago" : i.formaPagamento === "PIX" ? "Pix pendente" : "Pagar na barbearia"}
                          </span>
                        )}
                      </div>
                    </div>

                    {i.formaPagamento === "PIX" && !i.pago && (i.status === "CONFIRMADO" || i.status === "CONCLUIDO") && (
                      <button
                        onClick={() => confirmarPix(i.id)}
                        disabled={agindo === i.id}
                        className="brilho mt-4 rounded-lg bg-poste-azul px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        Confirmar Pix recebido
                      </button>
                    )}

                    {i.status === "CONFIRMADO" && podeMarcar && (
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => marcar(i.id, "CONCLUIDO")}
                          disabled={agindo === i.id}
                          className="brilho rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                        >
                          Concluir
                        </button>
                        <button
                          onClick={() => marcar(i.id, "FALTOU")}
                          disabled={agindo === i.id}
                          className="brilho rounded-lg border border-white/20 px-4 py-2 text-sm disabled:opacity-40"
                        >
                          Faltou
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* RESUMO DO MÊS */}
          <aside aria-label="Resumo do mês" className="space-y-4">
            <h2 className="text-lg font-semibold first-letter:uppercase">{resumo ? rotuloMes(resumo.mes) : "Resumo do mês"}</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 rounded-xl bg-cartao p-4 ring-1 ring-white/10">
                <p className="text-sm text-aco">Faturamento bruto</p>
                <p className="titulo mt-1 text-4xl">{moeda.format(resumo?.faturamento ?? 0)}</p>
                <p className="mt-1 text-sm text-aco">
                  + {moeda.format(resumo?.previsto ?? 0)} previsto em agendamentos confirmados
                </p>
              </div>
              <div className="rounded-xl bg-cartao p-4 ring-1 ring-white/10">
                <p className="text-sm text-aco">Atendimentos</p>
                <p className="titulo mt-1 text-4xl">{resumo?.concluidos ?? 0}</p>
              </div>
              <div className="rounded-xl bg-cartao p-4 ring-1 ring-white/10">
                <p className="text-sm text-aco">Faltas</p>
                <p className="titulo mt-1 text-4xl">{resumo?.faltas ?? 0}</p>
              </div>
            </div>

            <div className="rounded-xl bg-cartao p-4 ring-1 ring-white/10">
              <p className="text-sm text-aco">Serviço mais pedido</p>
              <p className="titulo mt-1 text-3xl">{resumo?.servicoMaisPedido ?? "—"}</p>
              {resumo && resumo.ranking.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {resumo.ranking.map((r) => (
                    <li key={r.servico} className="flex justify-between text-aco">
                      <span>{r.servico}</span>
                      <span>{r.quantidade}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {dono && resumo && resumo.porBarbeiro.length > 0 && (
              <div className="rounded-xl bg-cartao p-4 ring-1 ring-white/10">
                <p className="text-sm text-aco">Por barbeiro</p>
                <ul className="mt-3 space-y-2">
                  {resumo.porBarbeiro.map((b) => (
                    <li key={b.barbeiro} className="flex justify-between">
                      <span>
                        {b.barbeiro} <span className="text-sm text-aco">({b.concluidos})</span>
                      </span>
                      <span className="font-semibold">{moeda.format(b.faturamento)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
