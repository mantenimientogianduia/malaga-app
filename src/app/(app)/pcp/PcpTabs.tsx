import Link from "next/link";

export type PestaniaPcp = "cierre" | "plan" | "config" | "estadisticas";

export function PcpTabs({ activa, esGestion }: { activa: PestaniaPcp; esGestion: boolean }) {
  const pestanias: { id: PestaniaPcp; label: string; href: string }[] = [
    { id: "cierre", label: "Cierre del día", href: "/pcp" },
    { id: "plan", label: "Plan del día", href: "/pcp?tab=plan" },
    ...(esGestion
      ? [
          { id: "config" as const, label: "Configuración", href: "/pcp?tab=config" },
          { id: "estadisticas" as const, label: "Estadísticas", href: "/pcp?tab=estadisticas" },
        ]
      : []),
  ];

  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {pestanias.map((p) => (
        <Link
          key={p.id}
          href={p.href}
          prefetch={false}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            activa === p.id ? "border-b-2 border-copper text-ink" : "text-ink-soft hover:text-ink"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
