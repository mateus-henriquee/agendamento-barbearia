"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const campo =
  "w-full rounded-lg border border-white/15 bg-tinta px-4 py-3 text-white placeholder:text-white/40";

export default function FormLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      if (r.ok) {
        router.replace("/painel");
        router.refresh();
        return;
      }
      const corpo = await r.json().catch(() => null);
      setErro(typeof corpo?.erro === "string" ? corpo.erro : "Não foi possível entrar.");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-aco">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@barbearia.com"
          className={campo}
        />
      </div>
      <div>
        <label htmlFor="senha" className="mb-1 block text-sm text-aco">
          Senha
        </label>
        <input
          id="senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={campo}
        />
      </div>

      {erro && (
        <p role="alert" className="rounded-lg border border-red-500 px-4 py-3 text-sm text-red-400">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando || !email || !senha}
        className="brilho w-full rounded-lg bg-poste px-4 py-3 font-semibold text-white disabled:opacity-40"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}