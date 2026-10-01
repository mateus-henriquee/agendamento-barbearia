import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Painel from "@/components/painel";
import { usuarioAtual } from "@/lib/sessao";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `Painel — ${site.nome}` };

export default async function PainelPage() {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/login");
  return <Painel usuario={{ nome: usuario.nome, papel: usuario.papel }} />;
}