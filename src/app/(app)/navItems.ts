import {
  IconHome,
  IconTarget,
  IconBox,
  IconFlask,
  IconClipboard,
  IconLayers,
  IconStorefront,
  IconHistory,
  IconTrendUp,
  IconAlert,
} from "@/components/icons";

export const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: IconHome },
  { href: "/planificacion", label: "Cartilla actual", icon: IconTarget },
  { href: "/pcp", label: "PCP", icon: IconTrendUp },
  { href: "/exhibir", label: "Exhibir", icon: IconStorefront },
  { href: "/quiebres", label: "Quiebres", icon: IconAlert },
  { href: "/productos", label: "Productos", icon: IconBox },
  { href: "/recetas", label: "Recetas", icon: IconFlask },
  { href: "/ordenes", label: "Órdenes", icon: IconClipboard },
  { href: "/stock", label: "Stock", icon: IconLayers },
  { href: "/auditoria", label: "Auditoría", icon: IconHistory },
];
