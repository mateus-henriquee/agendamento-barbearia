"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { BarbeiroAdmin, ServicoAdmin } from "@/lib/admin";
import { site } from "@/lib/site";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const campo = "w-full rounded-lg border border-white/15 bg-transparent px-3 py-2";
const botao = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:border-white disabled:opacity-40";
const botaoPrimario = "brilho rounded-lg bg-poste px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";

type Dados = { barbeiros: BarbeiroAdmin[]; servicos: ServicoAdmin[] };

export default function Admin() {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/painel/admin");
      if (r.status === 401) return router.replace("/login");
      if (r.status === 403) return router.replace("/painel");
      if (!r.ok) throw new Error();
      setDados(await r.json());
    } catch {
      setErro("Não foi possível carregar. Recarregue a página.");
    }
  }, [router]);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/painel/admin")
      .then(async (r) => {
        if (cancelado) return;
        if (r.status === 401) return router.replace("/login");
        if (r.status === 403) return router.replace("/painel");
        if (!r.ok) throw new Error();
        setDados(await r.json());
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar. Recarregue a página."));
    return () => {
      cancelado = true;
    };
  }, [router]);

  /** Envia uma alteração; mostra o erro do servidor se houver; recarrega a lista. */
  async function enviar(url: string, metodo: "POST" | "PATCH", corpo: unknown, sucesso: string) {
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      const r = await fetch(url, { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
      if (r.status === 401) return router.replace("/login");
      const json = r.status === 204 ? null : await r.json().catch(() => null);
      if (!r.ok) {
        const campos = json?.erro?.fieldErrors ? Object.values(json.erro.fieldErrors).flat()[0] : null;
        setErro(typeof json?.erro === "string" ? json.erro : typeof campos === "string" ? campos : "Confira os dados.");
        return false;
      }
      setAviso(json?.login === "EMAIL_JA_EXISTE" ? "Barbeiro criado, mas o e-mail de login já existe. O login não foi criado." : sucesso);
      await carregar();
      return true;
    } catch {
      setErro("Falha de conexão. Tente novamente.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="min-h-svh bg-tinta text-white">
      <header className="border-b border-white/10 bg-grafite">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
          <Link href="/painel" className="flex items-center gap-3" aria-label="Voltar ao painel">
            <span className="listras h-8 w-3 rounded-full ring-1 ring-white/30" aria-hidden />
            <span className="titulo text-2xl">{site.nome}</span>
          </Link>
          <Link href="/painel" className={botao}>
            ← Voltar à agenda
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-12 px-5 py-10">
        <h1 className="titulo text-4xl sm:text-5xl">Administração</h1>

        {erro && (
          <p role="alert" className="rounded-lg border border-red-500 px-4 py-3 text-red-400">
            {erro}
          </p>
        )}
        {aviso && (
          <p role="status" className="rounded-lg border border-green-500/40 px-4 py-3 text-green-300">
            {aviso}
          </p>
        )}
        {!dados && !erro && <p className="text-aco">Carregando…</p>}

        {dados && (
          <>
            <Servicos servicos={dados.servicos} ocupado={ocupado} enviar={enviar} />
            <Barbeiros barbeiros={dados.barbeiros} servicos={dados.servicos} ocupado={ocupado} enviar={enviar} />
          </>
        )}
      </main>
    </div>
  );
}

type Enviar = (url: string, metodo: "POST" | "PATCH", corpo: unknown, sucesso: string) => Promise<boolean | void>;

function Servicos({ servicos, ocupado, enviar }: { servicos: ServicoAdmin[]; ocupado: boolean; enviar: Enviar }) {
  const [novo, setNovo] = useState({ nome: "", duracaoMin: "30", preco: "" });

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const ok = await enviar(
      "/api/painel/admin/servicos",
      "POST",
      { nome: novo.nome, duracaoMin: Number(novo.duracaoMin), preco: Number(novo.preco.replace(",", ".")) },
      "Serviço criado.",
    );
    if (ok) setNovo({ nome: "", duracaoMin: "30", preco: "" });
  }

  return (
    <section aria-label="Serviços" className="space-y-4">
      <h2 className="text-2xl font-semibold">Serviços</h2>
      <ul className="space-y-3">
        {servicos.map((s) => (
          <LinhaServico key={`${s.id}-${s.nome}-${s.duracaoMin}-${s.preco}-${s.ativo}`} s={s} ocupado={ocupado} enviar={enviar} />
        ))}
      </ul>

      <form onSubmit={criar} className="rounded-xl bg-cartao p-4 ring-1 ring-white/10">
        <p className="mb-3 font-semibold">Novo serviço</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_8rem_auto]">
          <input aria-label="Nome do novo serviço" placeholder="Nome (ex.: Degradê)" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} className={campo} />
          <input aria-label="Duração do novo serviço em minutos" type="number" min={5} max={480} value={novo.duracaoMin} onChange={(e) => setNovo({ ...novo, duracaoMin: e.target.value })} className={campo} />
          <input aria-label="Preço do novo serviço" placeholder="Preço (R$)" inputMode="decimal" value={novo.preco} onChange={(e) => setNovo({ ...novo, preco: e.target.value })} className={campo} />
          <button type="submit" disabled={ocupado || !novo.nome.trim() || !novo.preco.trim()} className={botaoPrimario}>
            Adicionar
          </button>
        </div>
        <p className="mt-2 text-sm text-aco">Duração em minutos. Preço em reais.</p>
      </form>
    </section>
  );
}

function LinhaServico({ s, ocupado, enviar }: { s: ServicoAdmin; ocupado: boolean; enviar: Enviar }) {
  const [nome, setNome] = useState(s.nome);
  const [duracao, setDuracao] = useState(String(s.duracaoMin));
  const [preco, setPreco] = useState(String(s.preco).replace(".", ","));
  const mudou = nome !== s.nome || Number(duracao) !== s.duracaoMin || Number(preco.replace(",", ".")) !== s.preco;

  return (
    <li className={`rounded-xl bg-cartao p-4 ring-1 ring-white/10 ${s.ativo ? "" : "opacity-60"}`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_8rem_auto_auto] sm:items-center">
        <input aria-label={`Nome de ${s.nome}`} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        <input aria-label={`Duração de ${s.nome} em minutos`} type="number" min={5} max={480} value={duracao} onChange={(e) => setDuracao(e.target.value)} className={campo} />
        <input aria-label={`Preço de ${s.nome}`} inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} className={campo} />
        <button
          disabled={ocupado || !mudou}
          onClick={() => enviar(`/api/painel/admin/servicos/${s.id}`, "PATCH", { nome, duracaoMin: Number(duracao), preco: Number(preco.replace(",", ".")) }, "Serviço atualizado.")}
          className={botaoPrimario}
        >
          Salvar
        </button>
        <button disabled={ocupado} onClick={() => enviar(`/api/painel/admin/servicos/${s.id}`, "PATCH", { ativo: !s.ativo }, s.ativo ? "Serviço desativado." : "Serviço reativado.")} className={botao}>
          {s.ativo ? "Desativar" : "Reativar"}
        </button>
      </div>
      <p className="mt-2 text-sm text-aco">
        {s.ativo ? `${s.duracaoMin} min · ${moeda.format(s.preco)} · aparece no site` : "Desativado: não aparece no site. O histórico fica."}
      </p>
    </li>
  );
}

function Barbeiros({ barbeiros, servicos, ocupado, enviar }: { barbeiros: BarbeiroAdmin[]; servicos: ServicoAdmin[]; ocupado: boolean; enviar: Enviar }) {
  const ativos = servicos.filter((s) => s.ativo);
  const [nome, setNome] = useState("");
  const [escolhidos, setEscolhidos] = useState<number[]>(ativos.map((s) => s.id));
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const login = email.trim() && senha ? { email, senha } : undefined;
    const ok = await enviar("/api/painel/admin/barbeiros", "POST", { nome, servicoIds: escolhidos, login }, "Barbeiro criado, com os horários dos próximos 60 dias.");
    if (ok) {
      setNome("");
      setEmail("");
      setSenha("");
    }
  }
  const alternar = (id: number) => setEscolhidos((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <section aria-label="Barbeiros" className="space-y-4">
      <h2 className="text-2xl font-semibold">Barbeiros</h2>
      <ul className="space-y-3">
        {barbeiros.map((b) => (
          <li key={b.id} className={`rounded-xl bg-cartao p-4 ring-1 ring-white/10 ${b.status === "ATIVO" ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{b.nome}</p>
                <p className="text-sm text-aco">
                  {b.status === "ATIVO" ? "Atendendo" : "Ausente (não aparece no site)"} · {b.temLogin ? "tem login" : "sem login"}
                </p>
              </div>
              <button disabled={ocupado} onClick={() => enviar(`/api/painel/admin/barbeiros/${b.id}`, "PATCH", { status: b.status === "ATIVO" ? "AUSENTE" : "ATIVO" }, "Barbeiro atualizado.")} className={botao}>
                {b.status === "ATIVO" ? "Marcar ausente" : "Reativar"}
              </button>
            </div>
            <fieldset className="mt-3">
              <legend className="text-sm text-aco">Serviços que {b.nome} faz</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {ativos.map((s) => {
                  const faz = b.servicoIds.includes(s.id);
                  return (
                    <label key={s.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${faz ? "border-white bg-white/10" : "border-white/15"}`}>
                      <input
                        type="checkbox"
                        checked={faz}
                        disabled={ocupado}
                        onChange={() =>
                          enviar(`/api/painel/admin/barbeiros/${b.id}`, "PATCH", { servicoIds: faz ? b.servicoIds.filter((x) => x !== s.id) : [...b.servicoIds, s.id] }, "Serviços atualizados.")
                        }
                      />
                      {s.nome}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ul>

      <form onSubmit={criar} className="space-y-3 rounded-xl bg-cartao p-4 ring-1 ring-white/10">
        <p className="font-semibold">Novo barbeiro</p>
        <input aria-label="Nome do novo barbeiro" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        <fieldset>
          <legend className="text-sm text-aco">Serviços que ele faz</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ativos.map((s) => (
              <label key={s.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${escolhidos.includes(s.id) ? "border-white bg-white/10" : "border-white/15"}`}>
                <input type="checkbox" checked={escolhidos.includes(s.id)} onChange={() => alternar(s.id)} />
                {s.nome}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <input aria-label="E-mail de login (opcional)" type="email" placeholder="E-mail de login (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
          <input aria-label="Senha de login (opcional)" type="password" placeholder="Senha, 8 ou mais caracteres" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} className={campo} />
        </div>
        <button type="submit" disabled={ocupado || nome.trim().length < 2} className={botaoPrimario}>
          Adicionar barbeiro
        </button>
        <p className="text-sm text-aco">Os horários de funcionamento dos próximos 60 dias são criados sozinhos. Foto e card no site: veja o arquivo src/lib/site.ts.</p>
      </form>
    </section>
  );
}
