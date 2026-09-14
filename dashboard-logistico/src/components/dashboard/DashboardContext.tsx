"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { useRouter } from "next/navigation";

export interface DashboardContextValue {
  router: ReturnType<typeof useRouter>;
  usuarioActual: { email: string; nombre: string; perfil: string } | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  dataVersion: number;
  setDataVersion: React.Dispatch<React.SetStateAction<number>>;
  permisos: string[] | null;
  tienePermiso: (key: string) => boolean;
  seccionVisible: (keys: string[]) => boolean;
  irA: (subseccionKey: string) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

// Provee a las secciones extraídas de page.tsx (una por archivo) lo que hoy
// es estado/handlers compartidos declarados en el componente raíz: la
// pestaña activa, permisos del usuario, navegación y la señal global de
// "recargar datos" (dataVersion). Cada sección sigue teniendo su propio
// estado local -- esto solo evita pasar 9 props a mano por componente.
export function DashboardProvider({
  value,
  children,
}: {
  value: DashboardContextValue;
  children: ReactNode;
}) {
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard() debe usarse dentro de <DashboardProvider>.");
  }
  return ctx;
}
