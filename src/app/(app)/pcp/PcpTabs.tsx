import Link from "next/link";

export function PcpTabs({ activa }: { activa: "plan" | "estadisticas" }) {
  return (
    <div className="flex gap-1 border-b border-border">
      <Link
        href="/pcp"
        className={`px-3 py-2 text-sm font-medium transition-colors ${
          activa === "plan" ? "border-b-2 border-copper text-ink" : "text-ink-soft hover:text-ink"
        }`}
      >
        Plan de mañana
      </Link>
      <Link
        href="/pcp?tab=estadisticas"
        className={`px-3 py-2 text-sm font-medium transition-colors ${
          activa === "estadisticas" ? "border-b-2 border-copper text-ink" : "text-ink-soft hover:text-ink"
        }`}
      >
        Estadísticas
      </Link>
    </div>
  );
}
