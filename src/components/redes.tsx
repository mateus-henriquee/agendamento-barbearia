import Foto from "@/components/foto";
import { Facebook, Instagram, TikTok, YouTube } from "@/components/icones";
import { site } from "@/lib/site";

const redes = [
  { nome: "Instagram", href: site.redes.instagram, Icone: Instagram },
  { nome: "Facebook", href: site.redes.facebook, Icone: Facebook },
  { nome: "TikTok", href: site.redes.tiktok, Icone: TikTok },
  { nome: "YouTube", href: site.redes.youtube, Icone: YouTube },
];

export default function Redes() {
  return (
    <section id="redes" className="bg-grafite py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <h2 className="titulo text-5xl sm:text-6xl">Acompanhe a {site.nome}</h2>
            <a
              href={site.redes.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-poste px-4 py-2 text-sm font-semibold text-poste transition hover:bg-poste hover:text-white"
            >
              + Seguir
            </a>
          </div>
          <p className="mt-6 max-w-md text-lg text-aco">
            Transformações, bastidores e novidades da barbearia. Siga a gente e veja o resultado antes de sentar na cadeira.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {redes.map(({ nome, href, Icone }) => (
              <li key={nome}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-full border border-white/10 bg-cartao px-5 py-3 font-medium transition hover:border-white/40"
                >
                  <Icone />
                  <span>{nome}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Foto src="/img/social-1.jpg" alt="Perfil da barbearia no celular" className="col-span-3 aspect-[16/9] rounded-2xl" />
          <Foto src="/img/social-2.jpg" alt="Corte finalizado" className="aspect-[3/4] rounded-xl" />
          <Foto src="/img/social-3.jpg" alt="Barba sendo feita" className="aspect-[3/4] rounded-xl" />
          <Foto src="/img/social-4.jpg" alt="Barbeiro atendendo cliente" className="aspect-[3/4] rounded-xl" />
        </div>
      </div>
    </section>
  );
}