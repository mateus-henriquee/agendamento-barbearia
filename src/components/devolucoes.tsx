"use client";

import { useEffect, useState } from "react";
import type { Devolucao } from "@/lib/pix-automatico";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Busca a lista. null = não conseguiu (o aviso é complementar: o painel segue normal). */
async function buscarDevolucoes(): Promise<Devolucao[] | null> {
  try {
    const r = await fetch("/api/painel/devolucoes", { cache: "no-store" });
    return r.ok ? ((await r.json()).devolucoes as Devolucao[]) : null;
  } catch {
    return null;
  }
}

/**
 * Aviso para o dono: Pix que o Mercado Pago recebeu mas que não virou horário (a pessoa pagou depois de perder a vaga).
 * O dinheiro precisa voltar para o cliente. A devolução é feita no painel do Mercado Pago; aqui só se registra.
 * Só aparece quando há algo a devolver.
 */
export function Devolucoes() {
  const [lista, setLista] = useState<Devolucao[]>([]);
  const [agindo, setAgindo] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    buscarDevolucoes().then((l) => {
      if (ativo && l) setLista(l);
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function devolvido(mpId: string) {
    setAgindo(mpId);
    setErro("");
    try {
      const r = await fetch(`/api/painel/devolucoes/${mpId}`, { method: "POST" });
      if (!r.ok && r.status !== 404) throw new Error("falha");
      const l = await buscarDevolucoes();
      if (l) setLista(l);
    } catch {
      setErro("Não foi possível registrar. Tente de novo.");
    } finally {
      setAgindo(null);
    }
  }

  if (lista.length === 0) return null;

  return (
    <section aria-label="Pagamentos a devolver" className="mb-8 rounded-xl border border-amber-500/60 bg-amber-500/10 p-5">
      <h2 className="text-lg font-semibold text-amber-200">
        {lista.length === 1 ? "1 pagamento para devolver" : `${lista.length} pagamentos para devolver`}
      </h2>
      <p className="mt-1 text-sm text-amber-100/80">
        Estes clientes pagaram o Pix depois de perder o horário. Devolva no painel do Mercado Pago e depois marque aqui.
      </p>
      <ul className="mt-4 space-y-3">
        {lista.map((d) => (
          <li key={d.mpId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-black/20 p-3">
            <div className="text-sm">
              <p className="font-semibold">
                {d.cliente} · {moeda.format(d.valor)}
              </p>
              <p className="text-aco">
                {d.servico} · {d.data.split("-").reverse().join("/")} às {d.hora} · {d.telefone} · pagamento {d.mpId}
              </p>
            </div>
            <button
              type="button"
              disabled={agindo === d.mpId}
              onClick={() => devolvido(d.mpId)}
              className="brilho rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
            >
              Já devolvi
            </button>
          </li>
        ))}
      </ul>
      {erro && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {erro}
        </p>
      )}
    </section>
  );
}
