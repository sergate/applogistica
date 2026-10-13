"use client";

import { useMemo } from "react";

export interface SkuOpcion {
  id: number;
  articulo: string;
  variante: string;
}

interface Props {
  skus: SkuOpcion[];
  /** id del artículo+variante elegido (null = todavía ninguno). */
  value: number | null;
  onChange: (id: number) => void;
  disabled?: boolean;
}

const claseSelect =
  "px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 min-w-0 flex-1";

// En Lolea un producto se identifica por artículo + variante: primero se elige el
// artículo y después una de sus variantes.
export default function LolArticuloPicker({ skus, value, onChange, disabled }: Props) {
  const articulos = useMemo(() => [...new Set(skus.map((s) => s.articulo))], [skus]);
  const elegido = skus.find((s) => s.id === value) ?? null;
  const articulo = elegido?.articulo ?? articulos[0] ?? "";
  const variantes = useMemo(() => skus.filter((s) => s.articulo === articulo), [skus, articulo]);

  return (
    <div className="flex gap-2 flex-wrap">
      <select
        aria-label="Artículo"
        value={articulo}
        disabled={disabled}
        onChange={(e) => {
          const primera = skus.find((s) => s.articulo === e.target.value);
          if (primera) onChange(primera.id);
        }}
        className={claseSelect}
      >
        {articulos.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select
        aria-label="Variante"
        value={elegido?.id ?? variantes[0]?.id ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={claseSelect}
      >
        {variantes.map((v) => (
          <option key={v.id} value={v.id}>
            {v.variante}
          </option>
        ))}
      </select>
    </div>
  );
}
