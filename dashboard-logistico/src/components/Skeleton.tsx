// Placeholders de carga reutilizables -- reemplazan el patrón repetido de
// "Cargando..." en texto plano que hoy usa cada sección de page.tsx.

function base(extra: string) {
  return `animate-pulse rounded bg-slate-200 ${extra}`;
}

/** Bloque de texto (una línea, ej. un título o un valor suelto). */
export function SkeletonText({ width = "w-32", className = "" }: { width?: string; className?: string }) {
  return <div className={base(`h-4 ${width} ${className}`)} />;
}

/** Card de KPI: título chico + número grande. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 ${className}`}>
      <div className={base("h-3 w-20 mb-3")} />
      <div className={base("h-7 w-16")} />
    </div>
  );
}

/** Fila de tabla con N columnas. */
export function SkeletonTableRow({ columns = 5 }: { columns?: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <div className={base("h-4 w-full")} />
        </td>
      ))}
    </tr>
  );
}

/** Tabla completa placeholder: N filas x M columnas. */
export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <table className="w-full">
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} columns={columns} />
        ))}
      </tbody>
    </table>
  );
}
