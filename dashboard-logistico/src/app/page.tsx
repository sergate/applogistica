"use client";

import { useEffect, useRef, useState } from "react";

type ImportKey = "clientes" | "grupos" | "tiendas";

interface ImportFileResult {
  archivo: ImportKey;
  filasLeidas: number;
  filasInsertadas: number;
  error: string | null;
}

interface MarcaResumen {
  name: string;
  uni: number;
  pick: number;
  sep: number;
  pendPick: number;
  pendSep: number;
  eficPick: number;
  eficSep: number;
  reg: number;
}

interface CanalResumen {
  name: string;
  uni: number;
  pick: number;
  sep: number;
  pendPick: number;
  pendSep: number;
  eficPick: number;
  eficSep: number;
  reg: number;
}

interface FechaResumen {
  fecha: string;
  marca: string;
  uni: number;
  pick: number;
  sep: number;
  eficPick: number;
  eficSep: number;
}

interface ResumenData {
  kpis: {
    totalUni: number;
    totalPick: number;
    totalSep: number;
    pendPick: number;
    pendSep: number;
    eficPick: number;
    eficSep: number;
    totalRegistros: number;
  };
  marcas: MarcaResumen[];
  updatedAt: string | null;
}

export default function DashboardLayout() {
  // Estados de navegación del Sidebar
  const [isPrepOpen, setIsPrepOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("Resumen"); 

  // =========================================================================
  // ESTADO: IMPORTAR DATOS (Clientes / Grupos / Tiendas -> Supabase)
  // =========================================================================
  const [archivoClientes, setArchivoClientes] = useState<File | null>(null);
  const [archivoGrupos, setArchivoGrupos] = useState<File | null>(null);
  const [archivoTiendas, setArchivoTiendas] = useState<File | null>(null);
  const [isProcesando, setIsProcesando] = useState(false);
  const [resultadosImport, setResultadosImport] = useState<ImportFileResult[] | null>(null);
  const [errorImport, setErrorImport] = useState<string | null>(null);

  const inputClientesRef = useRef<HTMLInputElement>(null);
  const inputGruposRef = useRef<HTMLInputElement>(null);
  const inputTiendasRef = useRef<HTMLInputElement>(null);

  const todosLosArchivosListos = !!archivoClientes && !!archivoGrupos && !!archivoTiendas;

  const handleProcesarDatos = async () => {
    if (!todosLosArchivosListos) return;

    setIsProcesando(true);
    setErrorImport(null);
    setResultadosImport(null);

    try {
      const formData = new FormData();
      formData.append("clientes", archivoClientes as File);
      formData.append("grupos", archivoGrupos as File);
      formData.append("tiendas", archivoTiendas as File);

      const res = await fetch("/api/import-maestros", {
        method: "POST",
        body: formData,
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(
          `El servidor respondió con un error inesperado (status ${res.status}). ` +
            "Puede ser que alguno de los archivos sea demasiado grande, o un problema de configuración del servidor."
        );
      }

      if (!res.ok && res.status !== 207) {
        throw new Error(data.error || "Error al procesar los archivos.");
      }

      setResultadosImport(data.resultados ?? null);
    } catch (err) {
      setErrorImport(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesando(false);
    }
  };

  const resetImportState = () => {
    setArchivoClientes(null);
    setArchivoGrupos(null);
    setArchivoTiendas(null);
    setResultadosImport(null);
    setErrorImport(null);
    if (inputClientesRef.current) inputClientesRef.current.value = "";
    if (inputGruposRef.current) inputGruposRef.current.value = "";
    if (inputTiendasRef.current) inputTiendasRef.current.value = "";
  };

  // Estados para la interactividad de las tablas en "Resumen"
  const [selectedMarca, setSelectedMarca] = useState<string | null>(null);
  const [selectedCanal, setSelectedCanal] = useState<string | null>(null);

  // =========================================================================
  // ESTADO: RESUMEN (datos reales desde grupo_pedidos vía /api/resumen)
  // =========================================================================
  const [resumenData, setResumenData] = useState<ResumenData | null>(null);
  const [resumenLoading, setResumenLoading] = useState(false);
  const [resumenError, setResumenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarResumen() {
      setResumenLoading(true);
      setResumenError(null);
      try {
        const res = await fetch("/api/resumen", { cache: "no-store" });
        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "No se pudo cargar el resumen.");
        }
        if (!cancelado) setResumenData(data);
      } catch (err) {
        if (!cancelado) setResumenError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setResumenLoading(false);
      }
    }

    cargarResumen();
    return () => {
      cancelado = true;
    };
  }, []);

  // Paleta de colores para el "dot" de cada marca (seller), asignados por orden de aparición
  const DOT_PALETTE = [
    "bg-purple-400", "bg-emerald-500", "bg-blue-400", "bg-red-400",
    "bg-orange-400", "bg-pink-400", "bg-teal-400", "bg-amber-400",
  ];
  const dotForMarca = (index: number) => DOT_PALETTE[index % DOT_PALETTE.length];
  const dotForMarcaName = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return DOT_PALETTE[hash % DOT_PALETTE.length];
  };

  // Formato numérico es-AR ("85.781") y de porcentaje ("3.3%")
  const fmtNum = (n: number) => Math.round(n).toLocaleString("es-AR");
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const fmtFecha = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  // =========================================================================
  // ESTADO: POR FECHA (datos reales desde grupo_pedidos vía /api/resumen/por-fecha)
  // =========================================================================
  const [fechaData, setFechaData] = useState<{ filas: FechaResumen[]; updatedAt: string | null } | null>(null);
  const [fechaLoading, setFechaLoading] = useState(false);
  const [fechaError, setFechaError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarPorFecha() {
      setFechaLoading(true);
      setFechaError(null);
      try {
        const res = await fetch("/api/resumen/por-fecha", { cache: "no-store" });
        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "No se pudo cargar el detalle por fecha.");
        }
        if (!cancelado) setFechaData({ filas: data.filas, updatedAt: data.updatedAt });
      } catch (err) {
        if (!cancelado) setFechaError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setFechaLoading(false);
      }
    }

    cargarPorFecha();
    return () => {
      cancelado = true;
    };
  }, []);

  const prepSubSections = ["Importar datos", "Resumen", "Por fecha", "Por marca", "Por canal", "Por categoría"];

  // =========================================================================
  // DATOS MOCK - STATUS DE PREPARACIÓN
  // =========================================================================
  const kpiData = [
    { title: "Total Unidades", value: resumenData ? fmtNum(resumenData.kpis.totalUni) : "—", theme: "blue", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline strokeLinecap="round" strokeLinejoin="round" points="3.27 6.96 12 12.01 20.73 6.96" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="22.08" x2="12" y2="12" /></svg> },
    { title: "Unidades Pickeadas", value: resumenData ? fmtNum(resumenData.kpis.totalPick) : "—", theme: "green", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline strokeLinecap="round" strokeLinejoin="round" points="22 4 12 14.01 9 11.01" /></svg> },
    { title: "Unidades Separadas", value: resumenData ? fmtNum(resumenData.kpis.totalSep) : "—", theme: "purple", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polygon strokeLinecap="round" strokeLinejoin="round" points="12 2 2 7 12 12 22 7 12 2" /><polyline strokeLinecap="round" strokeLinejoin="round" points="2 17 12 22 22 17" /><polyline strokeLinecap="round" strokeLinejoin="round" points="2 12 17 22 12" /></svg> },
    { title: "Pendiente Picking", value: resumenData ? fmtNum(resumenData.kpis.pendPick) : "—", theme: "orange", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle strokeLinecap="round" strokeLinejoin="round" cx="12" cy="12" r="10" /><polyline strokeLinecap="round" strokeLinejoin="round" points="12 6 12 12 16 14" /></svg> },
    { title: "Pendiente Separación", value: resumenData ? fmtNum(resumenData.kpis.pendSep) : "—", theme: "red", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="9" x2="12" y2="13" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="17" x2="12.01" y2="17" /></svg> },
    { title: "Efic. Picking", value: resumenData ? fmtPct(resumenData.kpis.eficPick) : "—", theme: "green", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polyline strokeLinecap="round" strokeLinejoin="round" points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline strokeLinecap="round" strokeLinejoin="round" points="17 6 23 6 23 12" /></svg> },
    { title: "Efic. Separación", value: resumenData ? fmtPct(resumenData.kpis.eficSep) : "—", theme: "purple", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><line strokeLinecap="round" strokeLinejoin="round" x1="18" y1="20" x2="18" y2="10" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="20" x2="12" y2="4" /><line strokeLinecap="round" strokeLinejoin="round" x1="6" y1="20" x2="6" y2="14" /></svg> },
    { title: "Total Registros", value: resumenData ? fmtNum(resumenData.kpis.totalRegistros) : "—", theme: "blue", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline strokeLinecap="round" strokeLinejoin="round" points="3.27 6.96 12 12.01 20.73 6.96" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="22.08" x2="12" y2="12" /></svg> }
  ];

  const marcasData = (resumenData?.marcas ?? []).map((m, idx) => ({
    name: m.name,
    dot: dotForMarca(idx),
    uni: fmtNum(m.uni),
    pick: fmtNum(m.pick),
    sep: fmtNum(m.sep),
    pendPick: fmtNum(m.pendPick),
    pendSep: fmtNum(m.pendSep),
    eficPick: fmtPct(m.eficPick),
    eficSep: fmtPct(m.eficSep),
    reg: fmtNum(m.reg),
  }));

  const canalesData = [
    { name: "CLIENTE", dot: "bg-pink-400", uni: "2", pick: "0", sep: "0", pendPick: "2", pendSep: "2", eficPick: "0.0%", eficSep: "0.0%" },
    { name: "PROPIO", dot: "bg-blue-400", uni: "1.476", pick: "12", sep: "5", pendPick: "1.464", pendSep: "1.471", eficPick: "0.8%", eficSep: "0.3%" },
    { name: "DEPOSITO", dot: "bg-emerald-500", uni: "2", pick: "0", sep: "0", pendPick: "2", pendSep: "2", eficPick: "0.0%", eficSep: "0.0%" },
    { name: "FRANQUICIA", dot: "bg-orange-400", uni: "302", pick: "0", sep: "0", pendPick: "302", pendSep: "302", eficPick: "0.0%", eficSep: "0.0%" }
  ];

  const clientesData = [
    { codigo: "300139", cliente: "GLUZ DEBORA RUTH", lineas: "2", uni: "2", pick: "0", sep: "0", pendPick: "2", pendSep: "2", eficPick: "0.0%", eficSep: "0.0%" }
  ];

  const fechasData = (fechaData?.filas ?? []).map((f) => ({
    fecha: f.fecha,
    marca: f.marca,
    dot: dotForMarcaName(f.marca),
    uni: fmtNum(f.uni),
    pick: fmtNum(f.pick),
    sep: fmtNum(f.sep),
    eficPick: fmtPct(f.eficPick),
    eficSep: fmtPct(f.eficSep),
  }));

  // =========================================================================
  // DATOS MOCK - OTRAS SECCIONES (Productividad, Carga, Remanentes)
  // =========================================================================
  const procesosData = [
    { id: '1', proceso: 'Recepción', unidades: "1.500", horas: 8.5, prod: 176, remanentes: 200 },
    { id: '2', proceso: 'Putaway', unidades: "1.250", horas: 7.0, prod: 178, remanentes: 50 },
    { id: '3', proceso: 'Picking E-com', unidades: "850", horas: 8.0, prod: 106, remanentes: 120 },
    { id: '4', proceso: 'Picking Retail', unidades: "2.400", horas: 7.5, prod: 320, remanentes: 300 },
    { id: '5', proceso: 'Despacho', unidades: "3.100", horas: 9.0, prod: 344, remanentes: 0 },
  ];

  const cargaInicialData = [
    { id: '1', plan: 'PLN-202610-01', ruta: 'Ruta Norte', meta: "500", preparado: "480", pendiente: "20", avance: 96.0 },
    { id: '2', plan: 'PLN-202610-02', ruta: 'Ruta Sur', meta: "750", preparado: "300", pendiente: "450", avance: 40.0 },
    { id: '3', plan: 'PLN-202610-03', ruta: 'AMBA', meta: "1.200", preparado: "1.150", pendiente: "50", avance: 95.8 },
    { id: '4', plan: 'PLN-202610-04', ruta: 'Interior Centro', meta: "400", preparado: "150", pendiente: "250", avance: 37.5 },
  ];

  const getThemeClasses = (theme: string) => {
    switch (theme) {
      case "blue": return { text: "text-sky-500", bgIcon: "bg-sky-100", textIcon: "text-sky-500", blob: "bg-sky-50" };
      case "green": return { text: "text-emerald-500", bgIcon: "bg-emerald-100", textIcon: "text-emerald-500", blob: "bg-emerald-50" };
      case "purple": return { text: "text-indigo-400", bgIcon: "bg-indigo-100", textIcon: "text-indigo-400", blob: "bg-indigo-50" };
      case "orange": return { text: "text-orange-400", bgIcon: "bg-orange-100", textIcon: "text-orange-400", blob: "bg-orange-50" };
      case "red": return { text: "text-red-400", bgIcon: "bg-red-100", textIcon: "text-red-400", blob: "bg-red-50" };
      default: return { text: "text-slate-500", bgIcon: "bg-slate-100", textIcon: "text-slate-500", blob: "bg-slate-50" };
    }
  };

  const handleMarcaClick = (marca: string) => {
    if (marca === selectedMarca) {
      setSelectedMarca(null);
      setCanalRows(null);
      setCanalError(null);
      return;
    }
    setSelectedMarca(marca);
    setSelectedCanal(null);
    void cargarCanalPorMarca(marca);
  };

  // =========================================================================
  // ESTADO: DESGLOSE POR CANAL (al hacer click en una marca)
  // =========================================================================
  const [canalRows, setCanalRows] = useState<CanalResumen[] | null>(null);
  const [canalLoading, setCanalLoading] = useState(false);
  const [canalError, setCanalError] = useState<string | null>(null);

  const cargarCanalPorMarca = async (marca: string) => {
    setCanalLoading(true);
    setCanalError(null);
    setCanalRows(null);
    try {
      const res = await fetch(`/api/resumen/canal?marca=${encodeURIComponent(marca)}`, {
        cache: "no-store",
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo cargar el desglose por canal.");
      }
      setCanalRows(data.canales);
    } catch (err) {
      setCanalError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCanalLoading(false);
    }
  };

  const handleCanalClick = (canal: string) => {
    setSelectedCanal(canal === selectedCanal ? null : canal);
  };

  return (
    <div className="flex h-screen bg-[#f8f9fc] font-sans text-slate-800 overflow-hidden">
      
      {/* ================= BARRA LATERAL ================= */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-10 flex-shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
          <svg className="w-6 h-6 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <span className="text-lg font-bold text-white tracking-wide">WMS Analytics</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <button onClick={() => setActiveTab("Producción por proceso")} className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === "Producción por proceso" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"}`}>
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Producción por proceso
          </button>

          <div className="pt-2">
            <button onClick={() => setIsPrepOpen(!isPrepOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                Status de preparación
              </div>
              <svg className={`w-4 h-4 transition-transform duration-200 ${isPrepOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isPrepOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {prepSubSections.map((sub, idx) => (
                  <button key={idx} onClick={() => setActiveTab(sub)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => setActiveTab("Status carga inicial")} className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === "Status carga inicial" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"}`}>
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Status carga inicial
          </button>

          <button onClick={() => setActiveTab("Status remanentes")} className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === "Status remanentes" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"}`}>
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
            Status remanentes
          </button>

          <button onClick={() => setActiveTab("Productividad por proceso")} className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === "Productividad por proceso" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"}`}>
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Productividad por proceso
          </button>
        </nav>
      </aside>

      {/* ================= ÁREA PRINCIPAL ================= */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-xl font-bold text-slate-800">
            {activeTab === "Resumen" ? "Status de Preparación - Resumen" : 
             activeTab === "Por fecha" ? "Status de Preparación - Por Fecha" :
             activeTab === "Importar datos" ? "Status de Preparación - Importar Datos" : activeTab}
          </h1>
        </header>

        <div className="flex-1 overflow-auto p-8 space-y-6">
          
          {/* ================= PESTAÑA: RESUMEN ================= */}
          {activeTab === "Resumen" && (
            <>
              {resumenError && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el resumen: {resumenError}
                </div>
              )}
              {resumenLoading && !resumenData && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                  Cargando datos de grupo_pedidos...
                </div>
              )}

              {resumenData && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(resumenData.updatedAt)}</span>
                </div>
              )}

              {/* TARJETAS KPI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiData.map((kpi, index) => {
                  const themeClasses = getThemeClasses(kpi.theme);
                  return (
                    <div key={index} className="relative overflow-hidden bg-white rounded-xl border border-slate-200 p-5 h-32 flex flex-col justify-center">
                      <div className={`absolute -right-8 -bottom-12 w-40 h-40 rounded-[100%] ${themeClasses.blob} opacity-80`}></div>
                      <div className="relative z-10 w-full flex justify-between items-center">
                        <div>
                          <h3 className="text-sm font-medium text-slate-500 mb-1">{kpi.title}</h3>
                          <p className={`text-[32px] font-bold tracking-tight ${themeClasses.text} leading-none`}>{kpi.value}</p>
                        </div>
                        <div className={`w-[46px] h-[46px] rounded-xl flex items-center justify-center ${themeClasses.bgIcon} ${themeClasses.textIcon}`}>{kpi.icon}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* TABLA MARCAS */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800">Detalle por Marca</h2>
                <p className="text-sm text-slate-500 mb-6">Haz click en una marca para ver el desglose por canal</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-left">Marca</th>
                        <th className="py-3 px-4 text-left">Unidades</th>
                        <th className="py-3 px-4 text-left">Pickeadas</th>
                        <th className="py-3 px-4 text-left">Separadas</th>
                        <th className="py-3 px-4 text-left">Pend. Picking</th>
                        <th className="py-3 px-4 text-left">Pend. Sep.</th>
                        <th className="py-3 px-4 text-left">Efic. Pick.</th>
                        <th className="py-3 px-4 text-left">Efic. Sep.</th>
                        <th className="py-3 px-4 text-left">Registros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {marcasData.map((marca, i) => (
                        <tr key={i} onClick={() => handleMarcaClick(marca.name)} className={`cursor-pointer transition-colors ${selectedMarca === marca.name ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                          <td className="py-3 px-4 text-left flex items-center gap-3 font-semibold text-slate-800"><span className={`w-2.5 h-2.5 rounded-full ${marca.dot}`}></span> {marca.name}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.uni}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.pick}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.sep}</td>
                          <td className="py-3 px-4 text-left font-semibold text-orange-500">{marca.pendPick}</td>
                          <td className="py-3 px-4 text-left font-semibold text-red-500">{marca.pendSep}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.eficPick}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.eficSep}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.reg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DESGLOSE POR CANAL (al hacer click en una marca) */}
              {selectedMarca && (
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-slate-800">
                    Desglose por Canal — {selectedMarca}
                  </h2>
                  <p className="text-sm text-slate-500 mb-6">
                    Canal de venta de cada pedido, según la tienda destino asociada.
                  </p>

                  {canalLoading && (
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                      Cargando desglose por canal...
                    </div>
                  )}

                  {canalError && (
                    <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                      Error al cargar el desglose: {canalError}
                    </div>
                  )}

                  {!canalLoading && !canalError && canalRows && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-slate-500 font-medium border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4 text-left">Canal</th>
                            <th className="py-3 px-4 text-left">Unidades</th>
                            <th className="py-3 px-4 text-left">Pickeadas</th>
                            <th className="py-3 px-4 text-left">Separadas</th>
                            <th className="py-3 px-4 text-left">Pend. Picking</th>
                            <th className="py-3 px-4 text-left">Pend. Sep.</th>
                            <th className="py-3 px-4 text-left">Efic. Pick.</th>
                            <th className="py-3 px-4 text-left">Efic. Sep.</th>
                            <th className="py-3 px-4 text-left">Registros</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {canalRows.map((canal, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="py-3 px-4 text-left flex items-center gap-3 font-semibold text-slate-800">
                                <span className={`w-2.5 h-2.5 rounded-full ${dotForMarca(i)}`}></span>
                                {canal.name}
                              </td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(canal.uni)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(canal.pick)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(canal.sep)}</td>
                              <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(canal.pendPick)}</td>
                              <td className="py-3 px-4 text-left font-semibold text-red-500">{fmtNum(canal.pendSep)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtPct(canal.eficPick)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtPct(canal.eficSep)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(canal.reg)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ================= PESTAÑA: IMPORTAR DATOS ================= */}
          {activeTab === "Importar datos" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
              <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Maestros</h2>
              <p className="text-sm text-slate-500 mb-6">
                Subí los 3 archivos de maestros. Al procesar, se cargan directamente en Supabase.
              </p>

              <div className="space-y-4">
                {/* --- CLIENTES (Excel) --- */}
                <div className="flex items-center justify-between border border-slate-200 rounded-lg p-4">
                  <div>
                    <p className="font-semibold text-slate-800">Clientes</p>
                    <p className="text-xs text-slate-500">Formato Excel (.xlsx, .xls)</p>
                    {archivoClientes && (
                      <p className="text-xs text-emerald-600 font-medium mt-1">{archivoClientes.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputClientesRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => setArchivoClientes(e.target.files?.[0] ?? null)}
                    />
                    <button
                      onClick={() => inputClientesRef.current?.click()}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      {archivoClientes ? "Cambiar archivo" : "Seleccionar archivo"}
                    </button>
                  </div>
                </div>

                {/* --- GRUPOS (CSV) --- */}
                <div className="flex items-center justify-between border border-slate-200 rounded-lg p-4">
                  <div>
                    <p className="font-semibold text-slate-800">Grupos</p>
                    <p className="text-xs text-slate-500">Formato CSV (.csv)</p>
                    {archivoGrupos && (
                      <p className="text-xs text-emerald-600 font-medium mt-1">{archivoGrupos.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputGruposRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => setArchivoGrupos(e.target.files?.[0] ?? null)}
                    />
                    <button
                      onClick={() => inputGruposRef.current?.click()}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      {archivoGrupos ? "Cambiar archivo" : "Seleccionar archivo"}
                    </button>
                  </div>
                </div>

                {/* --- TIENDAS (CSV) --- */}
                <div className="flex items-center justify-between border border-slate-200 rounded-lg p-4">
                  <div>
                    <p className="font-semibold text-slate-800">Tiendas</p>
                    <p className="text-xs text-slate-500">Formato CSV (.csv)</p>
                    {archivoTiendas && (
                      <p className="text-xs text-emerald-600 font-medium mt-1">{archivoTiendas.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputTiendasRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => setArchivoTiendas(e.target.files?.[0] ?? null)}
                    />
                    <button
                      onClick={() => inputTiendasRef.current?.click()}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      {archivoTiendas ? "Cambiar archivo" : "Seleccionar archivo"}
                    </button>
                  </div>
                </div>
              </div>

              {/* --- ACCIONES --- */}
              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={handleProcesarDatos}
                  disabled={!todosLosArchivosListos || isProcesando}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    !todosLosArchivosListos || isProcesando
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isProcesando ? "Procesando..." : "Procesar datos"}
                </button>
                <button
                  onClick={resetImportState}
                  disabled={isProcesando}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Limpiar
                </button>
              </div>

              {/* --- RESULTADOS --- */}
              {errorImport && (
                <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {errorImport}
                </div>
              )}

              {resultadosImport && (
                <div className="mt-6 space-y-2">
                  {resultadosImport.map((r) => (
                    <div
                      key={r.archivo}
                      className={`p-4 rounded-lg border text-sm ${
                        r.error
                          ? "bg-red-50 border-red-200 text-red-700"
                          : "bg-emerald-50 border-emerald-200 text-emerald-700"
                      }`}
                    >
                      <span className="font-semibold capitalize">{r.archivo}:</span>{" "}
                      {r.error
                        ? r.error
                        : `${r.filasInsertadas} de ${r.filasLeidas} filas cargadas correctamente.`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= PESTAÑA: POR FECHA ================= */}
          {activeTab === "Por fecha" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-slate-800">Detalle por Fecha</h2>
                {fechaData && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(fechaData.updatedAt)}</span>
                  </div>
                )}
              </div>

              {fechaError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el detalle por fecha: {fechaError}
                </div>
              )}
              {fechaLoading && !fechaData && (
                <div className="mb-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                  Cargando datos de grupo_pedidos...
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-4 px-4 text-left">Fecha</th>
                      <th className="py-4 px-4 text-left">Marca</th>
                      <th className="py-4 px-4 text-left">Unidades</th>
                      <th className="py-4 px-4 text-left">Pickeadas</th>
                      <th className="py-4 px-4 text-left">Separadas</th>
                      <th className="py-4 px-4 text-left">Efic. Pick.</th>
                      <th className="py-4 px-4 text-left">Efic. Sep.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fechasData.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-4 text-left text-slate-600 font-medium">{row.fecha}</td>
                        <td className="py-4 px-4 text-left flex items-center gap-3 font-bold text-slate-900"><span className={`w-2 h-2 rounded-full ${row.dot}`}></span>{row.marca}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.uni}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.pick}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.sep}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.eficPick}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.eficSep}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: PRODUCTIVIDAD POR PROCESO ================= */}
          {activeTab === "Productividad por proceso" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-6">Productividad Diaria</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-4 px-4 text-left">Proceso</th>
                      <th className="py-4 px-4 text-left">Unidades Procesadas</th>
                      <th className="py-4 px-4 text-left">Horas Operativas</th>
                      <th className="py-4 px-4 text-left">Productividad (Uds/Hr)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {procesosData.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-4 text-left text-slate-900 font-medium">{row.proceso}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.unidades}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.horas} hs</td>
                        <td className="py-4 px-4 text-left">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${row.prod < 120 ? 'text-red-700 bg-red-100' : 'text-emerald-700 bg-emerald-100'}`}>
                            {row.prod}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: STATUS CARGA INICIAL ================= */}
          {activeTab === "Status carga inicial" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-6">Planes de Picking y Rutas</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-4 px-4 text-left">Plan / Ruta</th>
                      <th className="py-4 px-4 text-left">Carga Inicial (Meta)</th>
                      <th className="py-4 px-4 text-left">Preparado</th>
                      <th className="py-4 px-4 text-left">Pendiente</th>
                      <th className="py-4 px-4 text-left">% Avance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cargaInicialData.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-4 text-left">
                          <div className="font-bold text-slate-900">{row.plan}</div>
                          <div className="text-xs text-slate-500">{row.ruta}</div>
                        </td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.meta}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.preparado}</td>
                        <td className="py-4 px-4 text-left font-medium text-orange-500">{row.pendiente}</td>
                        <td className="py-4 px-4 text-left">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${row.avance < 50 ? 'text-red-700 bg-red-100' : 'text-emerald-700 bg-emerald-100'}`}>
                            {row.avance}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: STATUS REMANENTES ================= */}
          {activeTab === "Status remanentes" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-6">Remanentes por Proceso</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-4 px-4 text-left">Proceso</th>
                      <th className="py-4 px-4 text-left">Unidades Pendientes (Remanente)</th>
                      <th className="py-4 px-4 text-left">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {procesosData.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-4 text-left text-slate-900 font-medium">{row.proceso}</td>
                        <td className="py-4 px-4 text-left font-bold text-slate-700">{row.remanentes}</td>
                        <td className="py-4 px-4 text-left">
                          {row.remanentes === 0 ? (
                            <span className="text-emerald-600 font-medium flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Completado</span>
                          ) : row.remanentes > 150 ? (
                            <span className="text-red-500 font-medium flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg> Crítico</span>
                          ) : (
                            <span className="text-orange-500 font-medium flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> En proceso</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= PESTAÑAS EN DESARROLLO ================= */}
          {!["Resumen", "Por fecha", "Importar datos", "Productividad por proceso", "Status carga inicial", "Status remanentes"].includes(activeTab) && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 h-full flex flex-col items-center justify-center text-slate-400">
               <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
               <h2 className="text-lg font-medium text-slate-600">Sección en desarrollo: {activeTab}</h2>
               <p className="mt-2 text-sm text-center max-w-md">Esta vista aún no ha sido maquetada. Navega a las otras secciones del menú lateral.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}