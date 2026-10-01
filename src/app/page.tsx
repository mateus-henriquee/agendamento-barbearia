import Agendamento from "@/components/agendamento";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold">Agende seu horário</h1>
      <p className="mb-8 mt-2 opacity-70">Escolha o serviço, o barbeiro e o melhor horário.</p>
      <Agendamento />
    </main>
  );
}