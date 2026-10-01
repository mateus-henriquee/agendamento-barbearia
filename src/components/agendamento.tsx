"use client";

import { useEffect, useRef, useState } from "react";
import { agoraNaBarbearia } from "@/lib/agora";

type Servico = { id: number; nome: string; duracaoMin: number; preco: number };
type Barbeiro = { id: number; nome: string };
type Confirmacao = { servico: string; barbeiro: string; data: string; hora: string };

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "2026-10-05" -> "05/10/2026" */
function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const cartao = "rounded-lg border px-4 py-3 text-left transition";
const selecionado = "border-foreground bg-foreground text-background";
const normal = "border-black/15 hover:border-foreground dark:border-white/20";
const campo =
  "w-full rounded-lg border border-black/15 bg-transparent px-4 py-3 dark:border-white/20";

export default function Agendamento() {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState("");

  const [servicoId, setServicoId] = useState<number | null>(null);
  const [barbeiroId, setBarbeiroId] = useState<number | null>(null);
  const [data, setData] = useState("");
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [hora, setHora] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  const [hoje] = useState(() => agoraNaBarbearia().data);
  // Número do último pedido de horários. Respostas atrasadas são ignoradas.
  const ultimoPedido = useRef(0);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const [rs, rb] = await Promise.all([fetch("/api/servicos"), fetch("/api/barbeiros")]);
        if (!rs.ok || !rb.ok) throw new Error("falha");
        const [ds, db] = await Promise.all([rs.json(), rb.json()]);
        if (cancelado) return;
        setServicos(ds.servicos);
        setBarbeiros(db.barbeiros);
      } catch {
        if (!cancelado) setErroLista("Não foi possível carregar os dados. Recarregue a página.");
      } finally {
        if (!cancelado) setCarregandoLista(false);
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  async function buscarHorarios(s: number | null, b: number | null, d: string) {
    setHora("");
    setErro("");
    if (!s || !b || !d) {
      setHorarios(null);
      return;
    }
    const meu = ++ultimoPedido.current;
    setCarregandoHorarios(true);
    try {
      const r = await fetch(`/api/horarios?barbeiroId=${b}&servicoId=${s}&data=${d}`);
      const corpo = await r.json();
      if (meu !== ultimoPedido.current) return;
      if (!r.ok) throw new Error("falha");
      setHorarios(corpo.horarios);
    } catch {
      if (meu === ultimoPedido.current) {
        setHorarios(null);
        setErro("Não foi possível carregar os horários. Tente de novo.");
      }
    } finally {
      if (meu === ultimoPedido.current) setCarregandoHorarios(false);
    }
  }

  function escolherServico(id: number) {
    setServicoId(id);
    buscarHorarios(id, barbeiroId, data);
  }
  function escolherBarbeiro(id: number) {
    setBarbeiroId(id);
    buscarHorarios(servicoId, id, data);
  }
  function escolherData(d: string) {
    setData(d);
    buscarHorarios(servicoId, barbeiroId, d);
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!servicoId || !barbeiroId || !data || !hora) return;
    setEnviando(true);
    setErro("");
    try {
      const rc = await fetch("/api/clientes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome, telefone }),
      });
      const cliente = await rc.json();
      if (!rc.ok) {
        const campos = cliente.erro?.fieldErrors ?? {};
        setErro(campos.telefone?.[0] ?? campos.nome?.[0] ?? "Confira seus dados.");
        return;
      }

      const ra = await fetch("/api/agendamentos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          barbeiroId,
          servicoId,
          clienteId: cliente.id,
          data,
          horaInicio: hora,
        }),
      });
      const corpo = await ra.json();

      if (ra.ok) {
        setConfirmacao({
          servico: servicos.find((s) => s.id === servicoId)?.nome ?? "",
          barbeiro: barbeiros.find((b) => b.id === barbeiroId)?.nome ?? "",
          data,
          hora,
        });
        return;
      }
      if (ra.status === 409) {
        await buscarHorarios(servicoId, barbeiroId, data);
        setErro("Esse horário acabou de ser reservado por outra pessoa. Escolha outro.");
        return;
      }
      setErro(typeof corpo.erro === "string" ? corpo.erro : "Não foi possível agendar.");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  function recomecar() {
    setServicoId(null);
    setBarbeiroId(null);
    setData("");
    setHorarios(null);
    setHora("");
    setNome("");
    setTelefone("");
    setErro("");
    setConfirmacao(null);
  }

  if (confirmacao) {
    return (
      <section className="rounded-xl border border-black/15 p-6 dark:border-white/20" aria-live="polite">
        <h2 className="text-xl font-semibold">Agendamento confirmado ✓</h2>
        <dl className="mt-4 space-y-1">
          <div><dt className="inline opacity-70">Serviço: </dt><dd className="inline">{confirmacao.servico}</dd></div>
          <div><dt className="inline opacity-70">Barbeiro: </dt><dd className="inline">{confirmacao.barbeiro}</dd></div>
          <div><dt className="inline opacity-70">Data: </dt><dd className="inline">{formatarData(confirmacao.data)}</dd></div>
          <div><dt className="inline opacity-70">Horário: </dt><dd className="inline">{confirmacao.hora}</dd></div>
        </dl>
        <button onClick={recomecar} className="mt-6 rounded-lg border border-foreground px-4 py-2">
          Fazer outro agendamento
        </button>
      </section>
    );
  }

  if (carregandoLista) return <p>Carregando…</p>;
  if (erroLista) return <p role="alert">{erroLista}</p>;

  return (
    <form onSubmit={confirmar} className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">1. Serviço</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {servicos.map((s) => (
            <button
              type="button"
              key={s.id}
              aria-pressed={servicoId === s.id}
              onClick={() => escolherServico(s.id)}
              className={`${cartao} ${servicoId === s.id ? selecionado : normal}`}
            >
              <span className="block font-medium">{s.nome}</span>
              <span className="text-sm opacity-80">
                {s.duracaoMin} min · {moeda.format(s.preco)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">2. Barbeiro</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {barbeiros.map((b) => (
            <button
              type="button"
              key={b.id}
              aria-pressed={barbeiroId === b.id}
              onClick={() => escolherBarbeiro(b.id)}
              className={`${cartao} ${barbeiroId === b.id ? selecionado : normal}`}
            >
              {b.nome}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          <label htmlFor="data">3. Data</label>
        </h2>
        <input
          id="data"
          type="date"
          min={hoje}
          value={data}
          onChange={(e) => escolherData(e.target.value)}
          className={campo}
        />
      </section>

      {(carregandoHorarios || horarios !== null) && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">4. Horário</h2>
          {carregandoHorarios ? (
            <p>Carregando horários…</p>
          ) : horarios && horarios.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {horarios.map((h) => (
                <button
                  type="button"
                  key={h}
                  aria-pressed={hora === h}
                  onClick={() => setHora(h)}
                  className={`${cartao} text-center ${hora === h ? selecionado : normal}`}
                >
                  {h}
                </button>
              ))}
            </div>
          ) : (
            <p>Sem horários livres neste dia. Tente outra data ou outro barbeiro.</p>
          )}
        </section>
      )}

      {hora && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">5. Seus dados</h2>
          <input
            aria-label="Nome"
            placeholder="Seu nome"
            autoComplete="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={campo}
          />
          <input
            aria-label="Telefone"
            placeholder="(11) 99999-0000"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className={campo}
          />
          <button
            type="submit"
            disabled={enviando || !nome.trim() || !telefone.trim()}
            className="w-full rounded-lg bg-foreground px-4 py-3 font-medium text-background disabled:opacity-40"
          >
            {enviando ? "Agendando…" : "Confirmar agendamento"}
          </button>
        </section>
      )}

      {erro && (
        <p role="alert" className="rounded-lg border border-red-500 px-4 py-3 text-red-600 dark:text-red-400">
          {erro}
        </p>
      )}
    </form>
  );
}