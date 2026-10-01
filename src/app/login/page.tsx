import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import FormLogin from "@/components/form-login";
import { usuarioAtual } from "@/lib/sessao";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `Entrar — ${site.nome}` };

export default async function Login() {
  if (await usuarioAtual()) redirect("/painel"); // já está logado

  return (
    <main className="grid min-h-svh place-items-center bg-tinta px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3" aria-label="Voltar ao site">
          <span className="listras h-9 w-3.5 rounded-full ring-1 ring-white/30" aria-hidden />
          <span className="titulo text-4xl">{site.nome}</span>
        </Link>
        <div className="rounded-2xl bg-cartao p-6 ring-1 ring-white/10 sm:p-8">
          <h1 className="mb-6 text-xl font-semibold">Área do colaborador</h1>
          <FormLogin />
        </div>
        <p className="mt-6 text-center text-sm text-aco">
          <Link href="/" className="hover:text-white">
            Voltar ao site
          </Link>
        </p>
      </div>
    </main>
  );
}