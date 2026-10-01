"use client";

import { useEffect, useState } from "react";
import { site } from "@/lib/site";

const links = [
  { id: "sobre", rotulo: "Sobre" },
  { id: "local", rotulo: "Local" },
  { id: "agendar", rotulo: "Agendar" },
  { id: "equipe", rotulo: "Equipe" },
];

export default function Header() {
  const [progresso, setProgresso] = useState(0);
  const [ativo, setAtivo] = useState("");

  useEffect(() => {
    let quadro = 0;
    function atualizar() {
      quadro = 0;
      const rolavel = document.documentElement.scrollHeight - window.innerHeight;
      setProgresso(rolavel > 0 ? Math.min(1, window.scrollY / rolavel) : 0);

      // Seção ativa: a última cujo topo já passou da altura do header.
      let atual = "";
      for (const { id } of links) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) atual = id;
      }
      setAtivo(atual);
    }
    function aoRolar() {
      if (!quadro) quadro = requestAnimationFrame(atualizar); // no máx. 1 atualização por quadro
    }
    atualizar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRolar);
    return () => {
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRolar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-tinta/55 text-white backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#topo" className="flex items-center gap-3" aria-label={`${site.nome}, voltar ao início`}>
          <span className="listras h-8 w-3 rounded-full ring-1 ring-white/30" aria-hidden />
          <span className="titulo text-2xl">{site.nome}</span>
        </a>

        <nav aria-label="Seções" className="hidden gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              aria-current={ativo === l.id ? "true" : undefined}
              className={`text-sm font-medium transition-colors hover:text-white ${
                ativo === l.id ? "text-white" : "text-white/60"
              }`}
            >
              {l.rotulo}
            </a>
          ))}
        </nav>

        <a
          href="#agendar"
          className="rounded-full bg-poste px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Agendar
        </a>
      </div>

      {/* Barra de progresso: um poste de barbeiro que enche conforme a página desce */}
      <div
        className="absolute inset-x-0 bottom-0 h-1 bg-white/10"
        role="progressbar"
        aria-label="Progresso da página"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progresso * 100)}
      >
        <div className="listras listras-animadas h-full" style={{ width: `${progresso * 100}%` }} />
      </div>
    </header>
  );
}