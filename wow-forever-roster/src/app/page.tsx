import { Suspense } from "react";
import {
  CircleCheck,
  CircleHelp,
  ClipboardList,
  Heart,
  Shield,
  Sword,
  UserPlus,
} from "lucide-react";
import { addAndAudit, processAttendance } from "@/app/actions";
import { connectDB } from "@/lib/db";
import { classColor, roleKind, type RoleKind } from "@/lib/wow";
import Character from "@/models/Character";

interface RosterEntry {
  id: string;
  name: string;
  class: string;
  role: string;
  ilvl: number;
  missingEnchants: string[];
  missingGems: string[];
  attendanceCount: number;
}

async function loadRoster(): Promise<{ roster: RosterEntry[]; error?: string }> {
  try {
    await connectDB();
    const docs = await Character.find().sort({ ilvl: -1, name: 1 }).lean();
    return {
      roster: docs.map((d) => ({
        id: String(d._id),
        name: d.name,
        class: d.class,
        role: d.role,
        ilvl: d.ilvl,
        missingEnchants: d.missingEnchants ?? [],
        missingGems: d.missingGems ?? [],
        attendanceCount: d.attendanceCount ?? 0,
      })),
    };
  } catch (e) {
    return { roster: [], error: e instanceof Error ? e.message : "Error de base de datos" };
  }
}

const ROLE_ICON: Record<RoleKind, { Icon: typeof Shield; label: string; color: string }> = {
  tank: { Icon: Shield, label: "Tanque", color: "text-sky-400" },
  healer: { Icon: Heart, label: "Sanador", color: "text-emerald-400" },
  dps: { Icon: Sword, label: "Daño", color: "text-rose-400" },
  unknown: { Icon: CircleHelp, label: "Sin rol", color: "text-zinc-500" },
};

function attendanceColor(pct: number) {
  if (pct < 40) return "#ef4444";
  if (pct < 70) return "#f59e0b";
  return "#22c55e";
}

const panel = "rounded-xl border border-white/10 bg-[#111115]";
const input =
  "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-cyan-400/50";
const button =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-300 [text-shadow:0_0_10px_rgba(34,211,238,.6)] hover:bg-cyan-400/20";

function CharacterCard({
  c,
  topIlvl,
  topAttendance,
}: {
  c: RosterEntry;
  topIlvl: number;
  topAttendance: number;
}) {
  const color = classColor(c.class);
  const { Icon, label, color: roleColor } = ROLE_ICON[roleKind(c.role)];
  const pct = topAttendance ? Math.round((c.attendanceCount / topAttendance) * 100) : 0;
  const alerts = [
    ...c.missingEnchants.map((t) => ({ t, kind: "Encantamiento" })),
    ...c.missingGems.map((t) => ({ t, kind: "Gema" })),
  ];
  const ilvlGold = c.ilvl > 0 && c.ilvl >= topIlvl * 0.9;

  return (
    <article className={`${panel} flex flex-col gap-3 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            className="truncate text-base font-bold leading-tight"
            style={{ color, textShadow: `0 0 12px ${color}66` }}
          >
            {c.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
            <Icon size={13} className={roleColor} aria-hidden />
            <span className={roleColor}>{label}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{c.class}</span>
          </p>
        </div>
        <div
          className={`text-right text-lg font-bold tabular-nums ${
            ilvlGold
              ? "text-amber-300 [text-shadow:0_0_12px_rgba(251,191,36,.55)]"
              : "text-zinc-400"
          }`}
          title="Nivel de objeto"
        >
          {c.ilvl > 0 ? c.ilvl : "—"}
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
          <span>Asistencia</span>
          <span className="tabular-nums">{c.attendanceCount}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: attendanceColor(pct),
              boxShadow: `0 0 8px ${attendanceColor(pct)}99`,
            }}
          />
        </div>
      </div>

      {alerts.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {alerts.map((a, i) => (
            <li
              key={i}
              title={a.kind}
              className="max-w-full truncate rounded-md border border-red-500/20 bg-red-950/60 px-2 py-0.5 text-[11px] font-medium text-red-400 [text-shadow:0_0_8px_rgba(248,113,113,.7)]"
            >
              {a.t}
            </li>
          ))}
        </ul>
      ) : (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-400 [text-shadow:0_0_8px_rgba(52,211,153,.7)]">
          <CircleCheck size={13} aria-hidden /> Optimizado
        </span>
      )}
    </article>
  );
}

async function Messages({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  const err = typeof sp.err === "string" ? sp.err : undefined;
  if (!ok && !err) return null;

  return (
    <p
      role="status"
      className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
        err
          ? "border-red-500/20 bg-red-950/40 text-red-400"
          : "border-emerald-400/20 bg-emerald-950/30 text-emerald-400"
      }`}
    >
      {err ?? ok}
    </p>
  );
}

async function Roster() {
  const { roster, error } = await loadRoster();
  const topIlvl = Math.max(0, ...roster.map((c) => c.ilvl));
  const topAttendance = Math.max(0, ...roster.map((c) => c.attendanceCount));

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-red-500/20 bg-red-950/40 px-3 py-2 text-sm text-red-400">
        {error}
      </p>
    );
  }
  if (!roster.length) {
    return (
      <p className={`${panel} p-10 text-center text-sm text-zinc-500`}>
        El roster está vacío. Agrega personajes o procesa una asistencia.
      </p>
    );
  }
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {roster.map((c) => (
        <CharacterCard key={c.id} c={c} topIlvl={topIlvl} topAttendance={topAttendance} />
      ))}
    </section>
  );
}

function RosterSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={`${panel} h-32`} />
      ))}
    </div>
  );
}

export default function Home(props: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <h1 className="bg-gradient-to-b from-white via-zinc-300 to-zinc-600 bg-clip-text text-3xl font-black uppercase tracking-[0.25em] text-transparent sm:text-4xl">
          WoW: Forever Roster
        </h1>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1 text-xs font-medium text-emerald-400 [text-shadow:0_0_8px_rgba(52,211,153,.7)]">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          Región: US - Conectado
        </span>
      </header>

      <Suspense>
        <Messages searchParams={props.searchParams} />
      </Suspense>

      <section className="mb-8 grid gap-4 rounded-xl border border-white/10 bg-[#111115]/60 p-4 backdrop-blur-md md:grid-cols-2">
        <form action={addAndAudit} className="flex flex-col gap-2">
          <label htmlFor="names" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Agregar y auditar personajes
          </label>
          <div className="flex gap-2">
            <input id="names" name="names" required placeholder="Arthas, Thrall, Jaina" className={input} />
            <button type="submit" className={button}>
              <UserPlus size={14} aria-hidden /> Auditar
            </button>
          </div>
        </form>

        <form action={processAttendance} className="flex flex-col gap-2">
          <label htmlFor="dump" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Asistencia del addon
          </label>
          <div className="flex gap-2">
            <textarea
              id="dump"
              name="dump"
              required
              rows={2}
              placeholder="Roster: Name1, Name2, Name3"
              className={`${input} resize-none`}
            />
            <button type="submit" className={button}>
              <ClipboardList size={14} aria-hidden /> Procesar
            </button>
          </div>
        </form>
      </section>

      <Suspense fallback={<RosterSkeleton />}>
        <Roster />
      </Suspense>
    </main>
  );
}
