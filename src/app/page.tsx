import Agendamento from "@/components/agendamento";
import Estrelas from "@/components/estrelas";
import Foto from "@/components/foto";
import Header from "@/components/header";
import Redes from "@/components/redes";
import BotaoWhatsApp from "@/components/whatsapp";
import { equipe, site } from "@/lib/site";

const mapa = `https://www.google.com/maps?q=${encodeURIComponent(site.endereco)}&output=embed`;
const rotaMapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.endereco)}`;

export default function Home() {
  return (
    <>
      <Header />
      <BotaoWhatsApp />
      <main id="topo">
        {/* HERO */}
        <section className="bg-tinta pt-16 text-white">
          <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl items-center gap-10 px-5 py-14 md:grid-cols-2">
            <div>
              <h1 className="titulo text-6xl sm:text-7xl lg:text-8xl">
                Corte certo.
                <br />
                Hora marcada.
              </h1>
              <p className="mt-6 max-w-md text-lg text-white/70">
                Escolha o barbeiro, o serviço e o horário em menos de um minuto. Sem fila e sem ligação.
              </p>
              <a
                href="#agendar"
                className="mt-9 inline-block rounded-full bg-poste px-8 py-4 text-lg font-semibold transition hover:brightness-110"
              >
                Agendar horário
              </a>
            </div>
            <Foto src="/img/hero.jpg" alt="Barbeiro finalizando um corte na cadeira" prioridade className="aspect-[4/5] w-full rounded-[2rem] md:rounded-tl-[8rem]" />
          </div>
        </section>

        {/* SOBRE */}
        <section id="sobre" className="bg-grafite py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-2">
            <div>
            <Foto src="/img/sobre.jpg" alt="Interior da barbearia" className="aspect-[5/4] w-full rounded-2xl" />             
            </div>
            <div>
            <h2 className="titulo text-5xl sm:text-6xl">Sobre nós</h2>
              <p className="mt-6 max-w-md text-xl text-aco">
                Uma barbearia de bairro com agenda de verdade. Cada cliente tem horário marcado, tempo para conversar e saída com o corte que pediu.
              </p>
              <p className="mt-4 max-w-md text-aco">
                Desde 2015 cuidamos de cabelo e barba, com atendimento masculino e feminino.
              </p>
              </div>
          </div>
        </section>

        {/* LOCALIZAÇÃO */}
        <section id="local" className="bg-tinta py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 className="titulo text-5xl sm:text-6xl">Localização</h2>
              <address className="mt-6 text-xl not-italic">{site.endereco}</address>
              <p className="mt-3 text-aco">{site.horario}</p>
              <p className="text-aco">{site.telefone}</p>
              <a
                href={rotaMapa}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-block rounded-full border-2 border-white/80 px-6 py-3 font-semibold transition hover:bg-white hover:text-tinta"
              >
               📍 Abrir no Google Maps
              </a>
            </div>
            <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-cartao ring-1 ring-white/10">
              <iframe
                title={`Mapa: ${site.endereco}`}
                src={mapa}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </section>

        {/* AGENDAR */}
        <section id="agendar" className="bg-grafite py-24">
          <div className="mx-auto max-w-2xl px-5">
            <h2 className="titulo text-5xl sm:text-6xl">Agende seu corte</h2>
            <p className="mb-10 mt-4 text-lg text-aco">Escolha serviço, barbeiro, dia e horário.</p>
            <div className="rounded-2xl bg-cartao p-6 ring-1 ring-white/10 sm:p-8 brilho">
              <Agendamento />
            </div>
          </div>
        </section>

        {/* EQUIPE */}
        <section id="equipe" className="bg-tinta py-24 text-white">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="titulo text-5xl sm:text-6xl">Conheça nossos profissionais</h2>
            <ul className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {equipe.map((p) => (
                <li key={p.nome}>
                  <Foto src={p.foto} alt={`Foto de ${p.nome}`} className="aspect-[4/5] w-full rounded-t-[3rem] rounded-b-md" />
                  <div className="mt-5">
                    <h3 className="titulo text-4xl">{p.nome}</h3>
                    <p className="mt-1 text-white/60">
                      {p.especialidade} · {p.anosExperiencia} anos de experiência
                    </p>
                    <p className="mt-3 flex items-center gap-2">
                      <Estrelas nota={p.nota} />
                      <span className="font-semibold">{p.nota.toFixed(1)}</span>
                      <span className="text-sm text-white/50">({p.avaliacoes} avaliações)</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <Redes />
      </main>

      {/* FOOTER */}
      <footer className="bg-grafite text-white">
        <div className="listras h-2" aria-hidden />
        <div className="mx-auto max-w-6xl px-5 pb-10 pt-16">
          <p className="titulo select-none text-[22vw] leading-[0.8] text-white/[0.06] sm:text-[14rem]" aria-hidden>
            {site.nome}
          </p>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            <div>
              <h2 className="font-semibold">Horário</h2>
              <p className="mt-3 text-white/60">{site.horario}</p>
            </div>
            <div>
              <h2 className="font-semibold">Contato</h2>
              <p className="mt-3 text-white/60">{site.telefone}</p>
              <p className="text-white/60">{site.instagram}</p>
            </div>
            <div>
              <h2 className="font-semibold">Endereço</h2>
              <address className="mt-3 text-white/60 not-italic">{site.endereco}</address>
            </div>
          </div>
          <div className="mt-14 flex flex-col justify-between gap-2 border-t border-white/10 pt-6 text-sm text-white/40 sm:flex-row">
            <p>© {new Date().getFullYear()} {site.nome}. Todos os direitos reservados.</p>
            <a href="#topo" className="hover:text-white">Voltar ao topo</a>
          </div>
        </div>
      </footer>
    </>
  );
}
