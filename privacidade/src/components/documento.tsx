import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "@/lib/site";

/** Moldura das páginas de texto legal (privacidade e termos). */
export function Documento({ titulo, atualizado, children }: { titulo: string; atualizado: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-16">
      <Link href="/" className="text-sm text-aco underline underline-offset-4 hover:text-white">
        ← Voltar para {site.nome}
      </Link>
      <h1 className="mt-6 text-4xl font-bold uppercase tracking-tight sm:text-5xl">{titulo}</h1>
      <p className="mt-2 text-sm text-aco">Última atualização: {atualizado}</p>
      <div className="mt-8 space-y-8 leading-relaxed text-white/90">{children}</div>
    </main>
  );
}

export function Secao({ id, titulo, children }: { id?: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{titulo}</h2>
      {children}
    </section>
  );
}

export function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {itens.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}
