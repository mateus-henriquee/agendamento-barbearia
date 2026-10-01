/** Cinco estrelas preenchidas até a nota (ex.: 4.8 de 5). */
export default function Estrelas({ nota }: { nota: number }) {
  const largura = `${Math.max(0, Math.min(5, nota)) * 20}%`;
  return (
    <span className="relative inline-block text-lg leading-none" role="img" aria-label={`Nota ${nota} de 5`}>
      <span className="text-white/25">★★★★★</span>
      <span className="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-amber-400" style={{ width: largura }}>
        ★★★★★
      </span>
    </span>
  );
}