import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Admin from "@/components/admin";
import { usuarioAtual } from "@/lib/sessao";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `Administração — ${site.nome}` };

export default async function AdminPage() {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/login");
  if (usuario.papel !== "DONO") redirect("/painel");
  return <Admin />;
}
