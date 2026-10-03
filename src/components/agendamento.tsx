"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { agoraNaBarbearia } from "@/lib/agora";
import { linkWhatsApp, mensagemConfirmacao } from "@/lib/mensagens";
import { site } from "@/lib/site";

type Servico = { id: number; nome: string; duracaoMin: number; preco: number };
type Barbeiro = { id: number; nome: string; servicoIds: number[] };
type Forma = "PIX" | "NA_BARBEARIA";
type Confirmacao = {
  cliente: string;
  servico: string;
  barbeiro: string;
  data: string;
  hora: string;
  formaPagamento: Forma;
  pix?: { copiaECola: string; valor: number; expiraEm: string | null; automatico?: boolean; consulta?: string };
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "2026-10-05" -> "05/10/2026" */
function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const cartao = "rounded-lg border px-4 py-3 text-left transition";
const selecionado = "border-foreground bg-foreground text-background";
const normal = "border-white/15 hover:border-white";
const campo =
  "w-full rounded-lg border border-white/15 bg-transparent px-4 py-3";

/** Tempo restante até `expiraEm`, atualizado a cada segundo. null = sem prazo. */
function useSegundosRestantes(expiraEm: string | null | undefined): number | null {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!expiraEm) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiraEm]);
  if (!expiraEm) return null;
  return Math.max(0, Math.ceil((new Date(expiraEm).getTime() - agora) / 1000));
}

function mmss(segundos: number) {
  return `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;
}

export default function Agendamento({ pixDisponivel }: { pixDisponivel: boolean }) {
  // Listas vindas da API
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState("");

  // Escolhas do cliente
  const [servicoId, setServicoId] = useState<number | null>(null);
  const [barbeiroId, setBarbeiroId] = useState<number | null>(null);
  const [data, setData] = useState("");
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [hora, setHora] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [forma, setForma] = useState<Forma>("NA_BARBEARIA");
  const [copiado, setCopiado] = useState(false);
  const [entrandoFila, setEntrandoFila] = useState(false);
  const [filaMsg, setFilaMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Estado do envio
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  const [hoje] = useState(() => agoraNaBarbearia().data);
  // Número do último pedido de horários. Respostas atrasadas de pedidos antigos são ignoradas.
  const ultimoPedido = useRef(0);
  const restantes = useSegundosRestantes(confirmacao?.pix?.expiraEm);
  const [pagoConfirmado, setPagoConfirmado] = useState(false);

  // Pix automático: pergunta ao servidor se o pagamento já caiu. Continua um pouco depois do prazo da reserva,
  // porque o Mercado Pago ainda aceita o Pix por mais alguns minutos.
  const consulta = confirmacao?.pix?.consulta;
  const expiraEmPix = confirmacao?.pix?.expiraEm;
  useEffect(() => {
    if (!consulta) return;
    const limite = (expiraEmPix ? new Date(expiraEmPix).getTime() : Date.now()) + 11 * 60_000;
    let ativo = true;
    const id = setInterval(async () => {
      if (Date.now() > limite) return clearInterval(id);
      try {
        const r = await fetch(`/api/pagamentos/${consulta}`, { cache: "no-store" });
        if (!r.ok || !ativo) return;
        const status = await r.json();
        if (status.pago) {
          setPagoConfirmado(true);
          clearInterval(id);
        }
      } catch {
        // sem rede por um instante: tenta de novo no próximo ciclo
      }
    }, 4000);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [consulta, expiraEmPix]);
  // Só aparecem os barbeiros que fazem o serviço escolhido.
  const barbeirosDoServico = servicoId ? barbeiros.filter((b) => b.servicoIds.includes(servicoId)) : barbeiros;

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
    setFilaMsg(null);
    if (!s || !b || !d) {
      setHorarios(null);
      return;
    }
    const meu = ++ultimoPedido.current;
    setCarregandoHorarios(true);
    try {
      const r = await fetch(`/api/horarios?barbeiroId=${b}&servicoId=${s}&data=${d}`);
      const corpo = await r.json();
      if (meu !== ultimoPedido.current) return; // chegou uma resposta mais nova
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
    // Se o barbeiro já escolhido não faz esse serviço, limpa a escolha dele.
    const ainda = barbeiros.find((b) => b.id === barbeiroId)?.servicoIds.includes(id) ? barbeiroId : null;
    if (ainda === null) setBarbeiroId(null);
    buscarHorarios(id, ainda, data);
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
          formaPagamento: forma,
        }),
      });
      const corpo = await ra.json();

      if (ra.ok) {
        setConfirmacao({
          cliente: nome.trim(),
          formaPagamento: forma,
          pix: corpo.pix,
          servico: servicos.find((s) => s.id === servicoId)?.nome ?? "",
          barbeiro: barbeiros.find((b) => b.id === barbeiroId)?.nome ?? "",
          data,
          hora,
        });
        return;
      }
      if (ra.status === 409) {
        await buscarHorarios(servicoId, barbeiroId, data); // atualiza a lista
        setErro("Esse horário acabou de ser reservado por outra pessoa. Escolha outro.");
        return;
      }
      if (corpo.motivo === "PIX_INDISPONIVEL") setForma("NA_BARBEARIA");
      setErro(typeof corpo.erro === "string" ? corpo.erro : "Não foi possível agendar.");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function entrarNaFila() {
    if (!servicoId || !barbeiroId || !data) return;
    setEntrandoFila(true);
    setFilaMsg(null);
    try {
      const r = await fetch("/api/fila", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ barbeiroId, servicoId, data, nome, telefone }),
      });
      const corpo = await r.json();
      if (r.ok) {
        setFilaMsg({
          tipo: "ok",
          texto: `Pronto! Você é o ${corpo.posicao}º da fila. Se abrir uma vaga, a barbearia avisa pelo WhatsApp.`,
        });
      } else if (r.status === 400) {
        const campos = corpo.erro?.fieldErrors ?? {};
        setFilaMsg({ tipo: "erro", texto: campos.telefone?.[0] ?? campos.nome?.[0] ?? "Confira seus dados." });
      } else {
        if (corpo.motivo === "HA_HORARIO_LIVRE") await buscarHorarios(servicoId, barbeiroId, data);
        setFilaMsg({ tipo: "erro", texto: typeof corpo.erro === "string" ? corpo.erro : "Não foi possível entrar na fila." });
      }
    } catch {
      setFilaMsg({ tipo: "erro", texto: "Falha de conexão. Tente novamente." });
    } finally {
      setEntrandoFila(false);
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
    setForma("NA_BARBEARIA");
    setCopiado(false);
    setFilaMsg(null);
    setPagoConfirmado(false);
  }

  async function copiarPix(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  if (confirmacao) {
    const c = confirmacao;
    const expirou = restantes === 0 && !pagoConfirmado;
    const zap = linkWhatsApp(
      site.whatsapp,
      mensagemConfirmacao({
        cliente: c.cliente,
        servico: c.servico,
        barbeiro: c.barbeiro,
        data: c.data,
        hora: c.hora,
        formaPagamento: c.formaPagamento,
      }),
    );
    return (
      <section aria-live="polite">
        <h2 className="titulo text-3xl">
          {pagoConfirmado ? "Pagamento confirmado ✓" : expirou ? "Reserva expirada" : c.pix ? "Horário reservado" : "Agendamento confirmado ✓"}
        </h2>
        <dl className="mt-4 space-y-1">
          <div><dt className="inline opacity-70">Serviço: </dt><dd className="inline">{c.servico}</dd></div>
          <div><dt className="inline opacity-70">Barbeiro: </dt><dd className="inline">{c.barbeiro}</dd></div>
          <div><dt className="inline opacity-70">Data: </dt><dd className="inline">{formatarData(c.data)}</dd></div>
          <div><dt className="inline opacity-70">Horário: </dt><dd className="inline">{c.hora}</dd></div>
          <div>
            <dt className="inline opacity-70">Pagamento: </dt>
            <dd className="inline">{pagoConfirmado ? "Pix (pago ✓)" : c.pix ? "Pix (aguardando pagamento)" : "após o corte"}</dd>
          </div>
        </dl>

        {c.pix && expirou && (
          <p role="alert" className="mt-6 rounded-lg border border-red-500 px-4 py-3 text-red-400">
            O prazo para pagar acabou e o horário foi liberado. Faça um novo agendamento.
          </p>
        )}

        {c.pix && pagoConfirmado && (
          <p role="status" className="mt-6 rounded-lg border border-green-500 px-4 py-3 text-green-300">
            Recebemos o seu Pix. Seu horário está confirmado. Até lá!
          </p>
        )}

        {c.pix && !expirou && !pagoConfirmado && (
          <div className="mt-6 rounded-xl border border-white/15 p-5">
            <p className="font-semibold">Pague {moeda.format(c.pix.valor)} com Pix</p>
            {restantes !== null && (
              <p className="mt-1 text-sm text-amber-300">
                Seu horário fica reservado por <span className="font-semibold tabular-nums">{mmss(restantes)}</span>.
              </p>
            )}
            <p className="mt-1 text-sm text-aco">Aponte a câmera do app do banco ou use o código copia e cola.</p>
            <div className="mt-4 inline-block rounded-lg bg-white p-3">
              <QRCodeSVG value={c.pix.copiaECola} size={176} title="QR code do Pix" />
            </div>
            <textarea
              readOnly
              aria-label="Código Pix copia e cola"
              value={c.pix.copiaECola}
              rows={3}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-4 w-full rounded-lg border border-white/15 bg-transparent p-3 text-xs"
            />
            <button
              type="button"
              onClick={() => copiarPix(c.pix!.copiaECola)}
              className="brilho mt-3 w-full rounded-lg bg-poste px-4 py-3 font-semibold text-white"
            >
              {copiado ? "Copiado ✓" : "Copiar código Pix"}
            </button>
            <p className="mt-3 text-sm text-aco">
              {c.pix.automatico
                ? "Assim que o pagamento cair, esta tela confirma sozinha. Sem pagamento no prazo, o horário é liberado."
                : "O agendamento é confirmado quando o barbeiro receber o Pix. Sem pagamento no prazo, o horário é liberado."}
            </p>
          </div>
        )}

        {erro && (
          <p role="alert" className="mt-4 text-red-400">
            {erro}
          </p>
        )}

        {!expirou && (
          <a
            href={zap}
            target="_blank"
            rel="noopener noreferrer"
            className="brilho mt-6 block rounded-lg bg-[#25d366] px-4 py-3 text-center font-semibold text-black"
          >
            Enviar confirmação no WhatsApp
          </a>
        )}
        <button onClick={recomecar} className="mt-3 w-full rounded-lg border border-white/20 px-4 py-3">
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
        {barbeirosDoServico.length === 0 && (
          <p className="text-aco">Nenhum barbeiro disponível para este serviço no momento.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {barbeirosDoServico.map((b) => (
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
            <div className="rounded-xl border border-white/15 p-5">
              <p className="font-semibold">Sem horários livres neste dia.</p>
              <p className="mt-1 text-sm text-aco">
                Tente outra data ou outro barbeiro, ou entre na fila de espera: se alguém cancelar, a barbearia avisa
                você pelo WhatsApp.
              </p>
              {filaMsg?.tipo === "ok" ? (
                <p role="status" className="mt-4 rounded-lg border border-green-500/40 px-4 py-3 text-green-300">
                  {filaMsg.texto}
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  <input
                    aria-label="Seu nome (fila de espera)"
                    placeholder="Seu nome"
                    autoComplete="name"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className={campo}
                  />
                  <input
                    aria-label="Telefone (fila de espera)"
                    placeholder="(11) 99999-0000"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className={campo}
                  />
                  <button
                    type="button"
                    onClick={entrarNaFila}
                    disabled={entrandoFila || !nome.trim() || !telefone.trim()}
                    className="brilho w-full rounded-lg bg-poste px-4 py-3 font-semibold text-white disabled:opacity-40"
                  >
                    {entrandoFila ? "Entrando…" : "Entrar na fila de espera"}
                  </button>
                  {filaMsg?.tipo === "erro" && (
                    <p role="alert" className="text-red-400">
                      {filaMsg.texto}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {hora && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">5. Pagamento</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {pixDisponivel && (
              <button
                type="button"
                aria-pressed={forma === "PIX"}
                onClick={() => setForma("PIX")}
                className={`${cartao} ${forma === "PIX" ? selecionado : normal}`}
              >
                <span className="block font-medium">Pagar agora (Pix)</span>
                <span className="text-sm opacity-80">QR code e copia e cola</span>
              </button>
            )}
            <button
              type="button"
              aria-pressed={forma === "NA_BARBEARIA"}
              onClick={() => setForma("NA_BARBEARIA")}
              className={`${cartao} ${forma === "NA_BARBEARIA" ? selecionado : normal}`}
            >
              <span className="block font-medium">Pagar após o corte</span>
              <span className="text-sm opacity-80">Na barbearia</span>
            </button>
          </div>
        </section>
      )}

      {hora && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">6. Seus dados</h2>
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
        <p role="alert" className="rounded-lg border border-red-500 px-4 py-3 text-red-400">
          {erro}
        </p>
      )}
    </form>
  );
}
