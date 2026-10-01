"use client";

import Image from "next/image";
import { useState } from "react";

type Props = { src: string; alt: string; className?: string; prioridade?: boolean };

/** Mostra a foto. Se o arquivo não existir ainda, mostra um aviso no lugar. */
export default function Foto({ src, alt, className = "", prioridade = false }: Props) {
  const [falhou, setFalhou] = useState(false);
  return (
    <div className={`listras-suave relative overflow-hidden bg-[#16253b] ${className}`}>
      {!falhou && (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          priority={prioridade}
          className="object-cover"
          onError={() => setFalhou(true)}
        />
      )}
      {falhou && (
        <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-white/60">
          Coloque a foto em public{src}
        </p>
      )}
    </div>
  );
}