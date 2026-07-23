"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsvFile, parseExcelFile } from "@/lib/fileParsers";
import * as XLSX from "xlsx";
import { createClient as createBrowserAuthClient } from "@/lib/supabase/client";
import { REGISTRO_SECCIONES } from "@/lib/secciones";

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
  canal: string;
  grupo: string;
  uni: number;
  pick: number;
  sep: number;
  pendPick: number;
  pendSep: number;
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
  const router = useRouter();

  // =========================================================================
  // ESTADO: SESIÓN Y PERMISOS DEL USUARIO LOGUEADO
  // =========================================================================
  const [usuarioActual, setUsuarioActual] = useState<{ email: string; nombre: string; perfil: string } | null>(null);
  const [permisos, setPermisos] = useState<string[] | null>(null); // null = todavía cargando
  const [permisosError, setPermisosError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarPermisos() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "No se pudieron cargar tus permisos.");
        }
        if (!cancelado) {
          setUsuarioActual({ email: data.email, nombre: data.nombre, perfil: data.perfil });
          setPermisos(data.subsecciones);
        }
      } catch (err) {
        if (!cancelado) {
          setPermisosError(err instanceof Error ? err.message : "Error inesperado.");
          setPermisos([]);
        }
      }
    }

    cargarPermisos();
    return () => {
      cancelado = true;
    };
  }, []);

  const tienePermiso = (key: string) => permisos !== null && permisos.includes(key);
  const seccionVisible = (keys: string[]) => permisos !== null && keys.some((k) => permisos.includes(k));

  // Navega a una subsección y registra el acceso (fecha/hora + usuario).
  const irA = (subseccionKey: string) => {
    setActiveTab(subseccionKey);
    fetch("/api/log-acceso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subseccionKey }),
    }).catch(() => {
      // el registro de acceso no debe interrumpir la navegación si falla
    });
  };

  const handleCerrarSesion = async () => {
    const supabase = createBrowserAuthClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // Estados de navegación del Sidebar
  const [isPrepOpen, setIsPrepOpen] = useState(true);

  // Si un import anterior guardó una pestaña de destino antes de recargar la
  // página (window.location.reload), arrancamos ya posicionados ahí.
  const [isCargaInicialOpen, setIsCargaInicialOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (sessionStorage.getItem("tabDespuesDeRefresh") || "").startsWith("CI-");
  });
  const [isRemanentesOpen, setIsRemanentesOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (sessionStorage.getItem("tabDespuesDeRefresh") || "").startsWith("REM-");
  });
  const [isProductividadOpen, setIsProductividadOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (sessionStorage.getItem("tabDespuesDeRefresh") || "").startsWith("PROD-");
  });
  const [isInboundOpen, setIsInboundOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (sessionStorage.getItem("tabDespuesDeRefresh") || "").startsWith("INB-");
  });
  const [isAdminOpen, setIsAdminOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (sessionStorage.getItem("tabDespuesDeRefresh") || "").startsWith("ADMIN-");
  });
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "Resumen";
    return sessionStorage.getItem("tabDespuesDeRefresh") || "Resumen";
  });

  // Si la pestaña actual no está permitida para este usuario (por ejemplo
  // el "Resumen" por defecto), lo mandamos a la primera que sí pueda ver.
  useEffect(() => {
    if (permisos === null) return;
    if (permisos.length === 0) return; // se muestra el mensaje de "sin acceso" más abajo
    if (!permisos.includes(activeTab)) {
      setActiveTab(permisos[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permisos]);

  // Se incrementa después de un import exitoso, para que Resumen / Por fecha /
  // Por pedidos vuelvan a pedir los datos y se vean actualizados al instante.
  const [dataVersion, setDataVersion] = useState(0);

  // Limpiamos la marca de "pestaña pendiente" una vez consumida en el estado inicial.
  useEffect(() => {
    sessionStorage.removeItem("tabDespuesDeRefresh");
  }, []);

  // =========================================================================
  // ESTADO: IMPORTAR DATOS (Clientes / Grupos / Tiendas -> Supabase)
  // =========================================================================
  const [archivoClientes, setArchivoClientes] = useState<File | null>(null);
  const [archivoGrupos, setArchivoGrupos] = useState<File | null>(null);
  const [archivoTiendas, setArchivoTiendas] = useState<File | null>(null);
  const [isProcesando, setIsProcesando] = useState(false);
  const [progresoImport, setProgresoImport] = useState(0); // 0-100
  const [resultadosImport, setResultadosImport] = useState<ImportFileResult[] | null>(null);
  const [errorImport, setErrorImport] = useState<string | null>(null);

  const inputClientesRef = useRef<HTMLInputElement>(null);
  const inputGruposRef = useRef<HTMLInputElement>(null);
  const inputTiendasRef = useRef<HTMLInputElement>(null);

  const todosLosArchivosListos = !!archivoClientes && !!archivoGrupos && !!archivoTiendas;

  const CHUNK_SIZE = 500; // registros por request, para no chocar con el límite de 4.5MB de Vercel

  async function enviarArchivoEnLotes(
    archivo: "clientes" | "grupos" | "tiendas",
    records: Record<string, unknown>[],
    onProgresoRegistros: (cantidad: number) => void
  ): Promise<{ filasInsertadas: number }> {
    let totalInsertadas = 0;

    if (records.length === 0) {
      // igual mandamos un "lote vacío" para que corra el borrado total en full_replace
      const res = await fetch("/api/import-maestros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivo, batch: [], esPrimerLote: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `Error procesando ${archivo}.`);
      return { filasInsertadas: 0 };
    }

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const batch = records.slice(i, i + CHUNK_SIZE);
      const res = await fetch("/api/import-maestros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivo, batch, esPrimerLote: i === 0 }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`El servidor respondió con un error inesperado (status ${res.status}) procesando ${archivo}.`);
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Error al procesar ${archivo}.`);
      }
      totalInsertadas += data.filasInsertadas ?? batch.length;
      onProgresoRegistros(batch.length);
    }

    return { filasInsertadas: totalInsertadas };
  }

  const handleProcesarDatos = async () => {
    if (!todosLosArchivosListos) return;

    setIsProcesando(true);
    setProgresoImport(0);
    setErrorImport(null);
    setResultadosImport(null);

    const archivos: { key: "clientes" | "grupos" | "tiendas"; file: File; tipo: "excel" | "csv" }[] = [
      { key: "clientes", file: archivoClientes as File, tipo: "excel" },
      { key: "grupos", file: archivoGrupos as File, tipo: "csv" },
      { key: "tiendas", file: archivoTiendas as File, tipo: "csv" },
    ];

    const resultados: ImportFileResult[] = [];

    try {
      // Parseamos los 3 archivos primero para saber el total de registros
      // y poder calcular un % de avance real sobre el conjunto completo.
      const archivosConRegistros = await Promise.all(
        archivos.map(async ({ key, file, tipo }) => {
          try {
            const records = tipo === "excel" ? await parseExcelFile(file) : await parseCsvFile(file);
            return { key, records, errorParseo: null as string | null };
          } catch (err) {
            return { key, records: [] as Record<string, unknown>[], errorParseo: err instanceof Error ? err.message : "Error al leer el archivo" };
          }
        })
      );

      const totalRegistros = archivosConRegistros.reduce((acc, a) => acc + a.records.length, 0) || 1;
      let registrosProcesados = 0;

      for (const { key, records, errorParseo } of archivosConRegistros) {
        if (errorParseo) {
          resultados.push({ archivo: key, filasLeidas: 0, filasInsertadas: 0, error: errorParseo });
          continue;
        }
        try {
          if (records.length === 0) {
            resultados.push({ archivo: key, filasLeidas: 0, filasInsertadas: 0, error: "El archivo no tiene filas de datos." });
            continue;
          }

          const { filasInsertadas } = await enviarArchivoEnLotes(key, records, (cantidad) => {
            registrosProcesados += cantidad;
            setProgresoImport(Math.min(100, Math.round((registrosProcesados / totalRegistros) * 100)));
          });
          resultados.push({ archivo: key, filasLeidas: records.length, filasInsertadas, error: null });
        } catch (err) {
          resultados.push({
            archivo: key,
            filasLeidas: 0,
            filasInsertadas: 0,
            error: err instanceof Error ? err.message : "Error desconocido",
          });
        }
      }

      setProgresoImport(100);
      setResultadosImport(resultados);

      // Si al menos un archivo se procesó sin error, refrescamos los datos
      // de Resumen / Por fecha / Por pedidos para que se vean al instante,
      // y llevamos la vista al Resumen de esta misma sección.
      if (resultados.some((r) => !r.error)) {
        setDataVersion((v) => v + 1);
        setTimeout(() => setActiveTab("Resumen"), 800);
      }
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

  // =========================================================================
  // ESTADO: RESUMEN (datos reales desde grupo_pedidos vía /api/resumen)
  // =========================================================================
  const [resumenData, setResumenData] = useState<ResumenData | null>(null);
  const [resumenLoading, setResumenLoading] = useState(false);
  const [resumenError, setResumenError] = useState<string | null>(null);
  const [rangoResumen, setRangoResumen] = useState<7 | 14 | 30 | null>(null); // null = todos los datos

  useEffect(() => {
    let cancelado = false;

    async function cargarResumen() {
      setResumenLoading(true);
      setResumenError(null);
      try {
        let url = "/api/resumen";
        if (rangoResumen) {
          const d = new Date();
          d.setDate(d.getDate() - (rangoResumen - 1));
          url += `?desde=${d.toISOString().slice(0, 10)}`;
        }
        const res = await fetch(url, { cache: "no-store" });
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
  }, [dataVersion, rangoResumen]);

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
  // Para fechas "solas" (YYYY-MM-DD, sin hora) -- evita el corrimiento de
  // huso horario que da `new Date("YYYY-MM-DD")` al pasar por toLocaleString.
  const fmtSoloFecha = (iso: string | null) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  // Semanas del mes (domingo a sábado). La semana 1 es la que contiene el
  // día 1 del mes, aunque empiece en el mes anterior; la última es la que
  // contiene el último día, aunque termine en el mes siguiente.
  interface SemanaDelMes {
    numero: number;
    desde: string; // ISO YYYY-MM-DD
    hasta: string; // ISO YYYY-MM-DD
    label: string;
  }
  const fmtFechaCorta = (d: Date) =>
    d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  const toISODate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  // Semanas del CALENDARIO ANUAL LABORAL: numeradas de forma continua a lo
  // largo de todo el año (no se reinician cada mes). La Semana 1 es la que
  // contiene el 1° de enero (domingo a sábado).
  function semanasDelAnio(year: number): SemanaDelMes[] {
    const primerDia = new Date(year, 0, 1);
    const ultimoDia = new Date(year, 11, 31);
    const semanas: SemanaDelMes[] = [];
    const cursor = new Date(primerDia);
    cursor.setDate(cursor.getDate() - cursor.getDay()); // retrocede al domingo
    let n = 1;
    while (cursor <= ultimoDia) {
      const desde = new Date(cursor);
      const hasta = new Date(cursor);
      hasta.setDate(hasta.getDate() + 6);
      semanas.push({
        numero: n,
        desde: toISODate(desde),
        hasta: toISODate(hasta),
        label: `Semana ${n} • ${year} (${fmtFechaCorta(desde)} - ${fmtFechaCorta(hasta)})`,
      });
      cursor.setDate(cursor.getDate() + 7);
      n++;
    }
    return semanas;
  }
  // =========================================================================
  // ESTADO: POR FECHA (datos reales desde grupo_pedidos vía /api/resumen/por-fecha)
  // =========================================================================
  const [fechaData, setFechaData] = useState<{ filas: FechaResumen[]; updatedAt: string | null } | null>(null);
  const [fechaLoading, setFechaLoading] = useState(false);
  const [fechaError, setFechaError] = useState<string | null>(null);
  const [rangoFecha, setRangoFecha] = useState<7 | 14 | 30>(7);
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>("");
  const [semanaFecha, setSemanaFecha] = useState<{ desde: string; hasta: string } | null>(null);
  const [filtroMarcaFecha, setFiltroMarcaFecha] = useState<string>("TODAS");
  const [filtroCanalFecha, setFiltroCanalFecha] = useState<string>("TODAS");
  const [filtroGrupoFecha, setFiltroGrupoFecha] = useState<string>("TODAS");

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
  }, [dataVersion]);

  // Solo mostramos en el desplegable las semanas que efectivamente tienen
  // datos cargados (según el rango real de fechas en grupo_pedidos), en vez
  // de generar las ~52 semanas de todo el año.
  const semanasConDatos = (() => {
    const fechas = (fechaData?.filas ?? [])
      .map((f) => f.fecha)
      .filter((f) => f !== "SIN FECHA");
    if (fechas.length === 0) return [] as SemanaDelMes[];

    const minFecha = fechas.reduce((a, b) => (a < b ? a : b));
    const maxFecha = fechas.reduce((a, b) => (a > b ? a : b));
    const anioMin = Number(minFecha.slice(0, 4));
    const anioMax = Number(maxFecha.slice(0, 4));

    let todas: SemanaDelMes[] = [];
    for (let y = anioMin; y <= anioMax; y++) {
      todas = todas.concat(semanasDelAnio(y));
    }
    // No alcanza con que la semana esté dentro del rango [minFecha, maxFecha]:
    // puede haber semanas sin ningún dato en el medio (huecos). Solo mostramos
    // las que tienen al menos una fecha real cargada dentro de su rango.
    return todas.filter((s) => fechas.some((f) => f >= s.desde && f <= s.hasta));
  })();

  const prepSubSections = ["Importar datos", "Resumen", "Por fecha", "Por pedidos"];

  const cargaInicialSubSections = [
    { key: "CI-Importar", label: "Importar Datos" },
    { key: "CI-Resumen", label: "Resumen" },
    { key: "CI-Avance", label: "Avance Plan" },
    { key: "CI-Carga", label: "Carga Datos" },
  ];

  const remanentesSubSections = [
    { key: "REM-Importar", label: "Importar Datos" },
    { key: "REM-Resumen", label: "Resumen" },
    { key: "REM-Avance", label: "Avance Plan" },
    { key: "REM-Carga", label: "Carga Datos" },
  ];

  const productividadSubSections = [
    { key: "PROD-Importar", label: "Importar Datos" },
    { key: "PROD-Resumen", label: "Resumen" },
  ];

  // "INB-EditarArribo" NO va acá -- es un permiso de capacidad (habilita
  // editar Arribo CD / marcar arribado dentro de Resumen), no una pestaña.
  const inboundSubSections = [
    { key: "INB-Importar", label: "Importar Datos" },
    { key: "INB-Resumen", label: "Resumen" },
  ];

  const adminSubSections = [
    { key: "ADMIN-Perfiles", label: "Perfiles" },
    { key: "ADMIN-Usuarios", label: "Usuarios" },
    { key: "ADMIN-Accesos", label: "Accesos" },
    { key: "ADMIN-Feriados", label: "Feriados" },
  ];

  // =========================================================================
  // ESTADO: STATUS CARGA INICIAL - IMPORTAR DATOS (varios .csv -> carga_inicial)
  // =========================================================================
  const [archivosCargaInicial, setArchivosCargaInicial] = useState<File[]>([]);
  const [isProcesandoCargaInicial, setIsProcesandoCargaInicial] = useState(false);
  const [progresoCargaInicial, setProgresoCargaInicial] = useState(0);
  const [errorCargaInicial, setErrorCargaInicial] = useState<string | null>(null);
  const [resultadoCargaInicial, setResultadoCargaInicial] = useState<{ filasInsertadas: number } | null>(null);

  const inputCargaInicialRef = useRef<HTMLInputElement>(null);

  const CI_CHUNK_SIZE = 500;

  const handleProcesarCargaInicial = async () => {
    if (archivosCargaInicial.length === 0) return;

    setIsProcesandoCargaInicial(true);
    setProgresoCargaInicial(0);
    setErrorCargaInicial(null);
    setResultadoCargaInicial(null);

    try {
      // Parseamos todos los archivos seleccionados (misma estructura, se combinan)
      const listasDeRegistros = await Promise.all(
        archivosCargaInicial.map((file) => parseCsvFile(file))
      );
      const records = listasDeRegistros.flat();

      if (records.length === 0) {
        throw new Error("Los archivos seleccionados no tienen filas de datos.");
      }

      const numerosUnicos = Array.from(
        new Set(records.map((r) => r.numero).filter((v) => v !== null && v !== undefined && v !== ""))
      );

      const total = records.length;
      let procesados = 0;
      let filasInsertadasTotal = 0;

      for (let i = 0; i < records.length; i += CI_CHUNK_SIZE) {
        const batch = records.slice(i, i + CI_CHUNK_SIZE);
        const res = await fetch("/api/carga-inicial/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batch,
            numerosAEliminar: i === 0 ? numerosUnicos : null,
            esPrimerLote: i === 0,
          }),
        });

        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Error al procesar el archivo.");
        }

        filasInsertadasTotal += data.filasInsertadas ?? batch.length;
        procesados += batch.length;
        setProgresoCargaInicial(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoCargaInicial({ filasInsertadas: filasInsertadasTotal });
      setProgresoCargaInicial(100);

      // Refresh completo de la app para que todo se vea actualizado. Guardamos
      // en sessionStorage a qué pestaña volver, ya que el reload reinicia el estado de React.
      sessionStorage.setItem("tabDespuesDeRefresh", "CI-Resumen");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setErrorCargaInicial(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoCargaInicial(false);
    }
  };

  const resetCargaInicial = () => {
    setArchivosCargaInicial([]);
    setResultadoCargaInicial(null);
    setErrorCargaInicial(null);
    setProgresoCargaInicial(0);
    if (inputCargaInicialRef.current) inputCargaInicialRef.current.value = "";
  };

  // =========================================================================
  // ESTADO: STATUS CARGA INICIAL - TABLA DE DETALLE (marca/curva/grupo)
  // =========================================================================
  interface CIDetalleFila {
    marca: string;
    curva: string;
    grupo: string;
    temporada: string;
    pedidas: number;
    distribuidas: number;
    aRepartir: number;
  }

  const [ciDetalleData, setCiDetalleData] = useState<{ filas: CIDetalleFila[]; updatedAt: string | null } | null>(null);
  const [ciDetalleLoading, setCiDetalleLoading] = useState(false);
  const [ciDetalleError, setCiDetalleError] = useState<string | null>(null);

  const [filtroMarcaCI, setFiltroMarcaCI] = useState("TODAS");
  const [filtroTemporadaCI, setFiltroTemporadaCI] = useState("TODAS");
  const [filtroGrupoCI, setFiltroGrupoCI] = useState("TODAS");
  const [filaExpandidaCI, setFilaExpandidaCI] = useState<{ marca: string; curva: string } | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarDetalleCI() {
      setCiDetalleLoading(true);
      setCiDetalleError(null);
      try {
        const res = await fetch("/api/carga-inicial/detalle", { cache: "no-store" });
        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "No se pudo cargar el detalle.");
        }
        if (!cancelado) setCiDetalleData({ filas: data.filas, updatedAt: data.updatedAt });
      } catch (err) {
        if (!cancelado) setCiDetalleError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setCiDetalleLoading(false);
      }
    }

    cargarDetalleCI();
    return () => {
      cancelado = true;
    };
  }, [dataVersion]);

  // Orden fijo de curvas: ADELANTO, 1RA ETAPA, SEGUNDA ETAPA, y las que sigan
  // (desconocidas van al final, ordenadas alfabéticamente entre sí).
  const ORDEN_CURVAS = ["ADELANTO", "1RA ETAPA", "SEGUNDA ETAPA"];
  const rankCurva = (curva: string) => {
    const idx = ORDEN_CURVAS.indexOf(curva);
    return idx === -1 ? 100 : idx;
  };

  const marcasDisponiblesCI = Array.from(new Set((ciDetalleData?.filas ?? []).map((f) => f.marca))).sort();
  const temporadasDisponiblesCI = Array.from(new Set((ciDetalleData?.filas ?? []).map((f) => f.temporada))).sort();
  const gruposDisponiblesCI = Array.from(new Set((ciDetalleData?.filas ?? []).map((f) => f.grupo))).sort();

  const filasFiltradasCI = (ciDetalleData?.filas ?? []).filter(
    (f) =>
      (filtroMarcaCI === "TODAS" || f.marca === filtroMarcaCI) &&
      (filtroTemporadaCI === "TODAS" || f.temporada === filtroTemporadaCI) &&
      (filtroGrupoCI === "TODAS" || f.grupo === filtroGrupoCI)
  );

  // Consolidamos por (marca, curva) para la tabla principal
  const consolidadoMarcaCurva = new Map<string, { marca: string; curva: string; pedidas: number; distribuidas: number; aRepartir: number }>();
  for (const f of filasFiltradasCI) {
    const key = `${f.marca}__${f.curva}`;
    if (!consolidadoMarcaCurva.has(key)) {
      consolidadoMarcaCurva.set(key, { marca: f.marca, curva: f.curva, pedidas: 0, distribuidas: 0, aRepartir: 0 });
    }
    const acc = consolidadoMarcaCurva.get(key)!;
    acc.pedidas += f.pedidas;
    acc.distribuidas += f.distribuidas;
    acc.aRepartir += f.aRepartir;
  }

  // Total de pedidas por marca (para ordenar las marcas de mayor a menor)
  const totalPedidasPorMarca = new Map<string, number>();
  for (const acc of consolidadoMarcaCurva.values()) {
    totalPedidasPorMarca.set(acc.marca, (totalPedidasPorMarca.get(acc.marca) || 0) + acc.pedidas);
  }

  const filasTablaCI = Array.from(consolidadoMarcaCurva.values())
    .map((acc) => ({
      ...acc,
      completitud: acc.pedidas > 0 ? (acc.distribuidas / acc.pedidas) * 100 : 0,
    }))
    .sort((a, b) => {
      const totalA = totalPedidasPorMarca.get(a.marca) || 0;
      const totalB = totalPedidasPorMarca.get(b.marca) || 0;
      if (a.marca !== b.marca) return totalB - totalA;
      return rankCurva(a.curva) - rankCurva(b.curva);
    });

  // Subtotal general sobre los datos filtrados
  const subtotalCI = filasFiltradasCI.reduce(
    (acc, f) => ({ pedidas: acc.pedidas + f.pedidas, distribuidas: acc.distribuidas + f.distribuidas, aRepartir: acc.aRepartir + f.aRepartir }),
    { pedidas: 0, distribuidas: 0, aRepartir: 0 }
  );
  const subtotalCICalculado = {
    ...subtotalCI,
    completitud: subtotalCI.pedidas > 0 ? (subtotalCI.distribuidas / subtotalCI.pedidas) * 100 : 0,
  };

  // Desglose por grupo de la fila (marca + curva) expandida -- se calcula
  // sobre los mismos datos ya filtrados por temporada/grupo/marca.
  const desgloseGrupoCI = (() => {
    if (!filaExpandidaCI) return [];
    const porGrupo = new Map<string, { grupo: string; pedidas: number; distribuidas: number; aRepartir: number }>();
    for (const f of filasFiltradasCI) {
      if (f.marca !== filaExpandidaCI.marca || f.curva !== filaExpandidaCI.curva) continue;
      if (!porGrupo.has(f.grupo)) {
        porGrupo.set(f.grupo, { grupo: f.grupo, pedidas: 0, distribuidas: 0, aRepartir: 0 });
      }
      const acc = porGrupo.get(f.grupo)!;
      acc.pedidas += f.pedidas;
      acc.distribuidas += f.distribuidas;
      acc.aRepartir += f.aRepartir;
    }
    return Array.from(porGrupo.values())
      .map((acc) => ({ ...acc, completitud: acc.pedidas > 0 ? (acc.distribuidas / acc.pedidas) * 100 : 0 }))
      .sort((a, b) => b.pedidas - a.pedidas);
  })();

  const handleFilaClickCI = (marca: string, curva: string) => {
    setFilaExpandidaCI(
      filaExpandidaCI?.marca === marca && filaExpandidaCI?.curva === curva ? null : { marca, curva }
    );
  };

  // =========================================================================
  // ESTADO: STATUS REMANENTES - IMPORTAR DATOS (varios .csv -> remanentes)
  // =========================================================================
  const [archivosRemanentes, setArchivosRemanentes] = useState<File[]>([]);
  const [isProcesandoRemanentes, setIsProcesandoRemanentes] = useState(false);
  const [progresoRemanentes, setProgresoRemanentes] = useState(0);
  const [errorRemanentes, setErrorRemanentes] = useState<string | null>(null);
  const [resultadoRemanentes, setResultadoRemanentes] = useState<{ filasInsertadas: number } | null>(null);

  const inputRemanentesRef = useRef<HTMLInputElement>(null);

  const REM_CHUNK_SIZE = 500;

  const handleProcesarRemanentes = async () => {
    if (archivosRemanentes.length === 0) return;

    setIsProcesandoRemanentes(true);
    setProgresoRemanentes(0);
    setErrorRemanentes(null);
    setResultadoRemanentes(null);

    try {
      // Parseamos todos los archivos seleccionados (misma estructura, se combinan)
      const listasDeRegistros = await Promise.all(
        archivosRemanentes.map((file) => parseCsvFile(file))
      );
      const records = listasDeRegistros.flat();

      if (records.length === 0) {
        throw new Error("Los archivos seleccionados no tienen filas de datos.");
      }

      const numerosUnicos = Array.from(
        new Set(records.map((r) => r.numero).filter((v) => v !== null && v !== undefined && v !== ""))
      );

      const total = records.length;
      let procesados = 0;
      let filasInsertadasTotal = 0;

      for (let i = 0; i < records.length; i += REM_CHUNK_SIZE) {
        const batch = records.slice(i, i + REM_CHUNK_SIZE);
        const res = await fetch("/api/remanentes/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batch,
            numerosAEliminar: i === 0 ? numerosUnicos : null,
            esPrimerLote: i === 0,
          }),
        });

        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Error al procesar el archivo.");
        }

        filasInsertadasTotal += data.filasInsertadas ?? batch.length;
        procesados += batch.length;
        setProgresoRemanentes(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoRemanentes({ filasInsertadas: filasInsertadasTotal });
      setProgresoRemanentes(100);

      // Refresh completo de la app para que todo se vea actualizado. Guardamos
      // en sessionStorage a qué pestaña volver, ya que el reload reinicia el estado de React.
      sessionStorage.setItem("tabDespuesDeRefresh", "REM-Resumen");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setErrorRemanentes(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoRemanentes(false);
    }
  };

  const resetRemanentes = () => {
    setArchivosRemanentes([]);
    setResultadoRemanentes(null);
    setErrorRemanentes(null);
    setProgresoRemanentes(0);
    if (inputRemanentesRef.current) inputRemanentesRef.current.value = "";
  };

  // =========================================================================
  // ESTADO: STATUS REMANENTES - TABLA DE DETALLE (marca/archivo/grupo)
  // =========================================================================
  interface REMDetalleFila {
    marca: string;
    archivo: string;
    grupo: string;
    temporada: string;
    pedidas: number;
    distribuidas: number;
    aRepartir: number;
  }

  const [remDetalleData, setRemDetalleData] = useState<{ filas: REMDetalleFila[]; updatedAt: string | null } | null>(null);
  const [remDetalleLoading, setRemDetalleLoading] = useState(false);
  const [remDetalleError, setRemDetalleError] = useState<string | null>(null);

  const [filtroMarcaREM, setFiltroMarcaREM] = useState("TODAS");
  const [filtroTemporadaREM, setFiltroTemporadaREM] = useState("TODAS");
  const [filtroGrupoREM, setFiltroGrupoREM] = useState("TODAS");
  const [filaExpandidaREM, setFilaExpandidaREM] = useState<{ marca: string; archivo: string } | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarDetalleREM() {
      setRemDetalleLoading(true);
      setRemDetalleError(null);
      try {
        const res = await fetch("/api/remanentes/detalle", { cache: "no-store" });
        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "No se pudo cargar el detalle.");
        }
        if (!cancelado) setRemDetalleData({ filas: data.filas, updatedAt: data.updatedAt });
      } catch (err) {
        if (!cancelado) setRemDetalleError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setRemDetalleLoading(false);
      }
    }

    cargarDetalleREM();
    return () => {
      cancelado = true;
    };
  }, [dataVersion]);

  const marcasDisponiblesREM = Array.from(new Set((remDetalleData?.filas ?? []).map((f) => f.marca))).sort();
  const temporadasDisponiblesREM = Array.from(new Set((remDetalleData?.filas ?? []).map((f) => f.temporada))).sort();
  const gruposDisponiblesREM = Array.from(new Set((remDetalleData?.filas ?? []).map((f) => f.grupo))).sort();

  const filasFiltradasREM = (remDetalleData?.filas ?? []).filter(
    (f) =>
      (filtroMarcaREM === "TODAS" || f.marca === filtroMarcaREM) &&
      (filtroTemporadaREM === "TODAS" || f.temporada === filtroTemporadaREM) &&
      (filtroGrupoREM === "TODAS" || f.grupo === filtroGrupoREM)
  );

  // Consolidamos por (marca, archivo) para la tabla principal
  const consolidadoMarcaArchivo = new Map<string, { marca: string; archivo: string; pedidas: number; distribuidas: number; aRepartir: number }>();
  for (const f of filasFiltradasREM) {
    const key = `${f.marca}__${f.archivo}`;
    if (!consolidadoMarcaArchivo.has(key)) {
      consolidadoMarcaArchivo.set(key, { marca: f.marca, archivo: f.archivo, pedidas: 0, distribuidas: 0, aRepartir: 0 });
    }
    const acc = consolidadoMarcaArchivo.get(key)!;
    acc.pedidas += f.pedidas;
    acc.distribuidas += f.distribuidas;
    acc.aRepartir += f.aRepartir;
  }

  // Total de pedidas por marca (para ordenar las marcas de mayor a menor)
  const totalPedidasPorMarcaREM = new Map<string, number>();
  for (const acc of consolidadoMarcaArchivo.values()) {
    totalPedidasPorMarcaREM.set(acc.marca, (totalPedidasPorMarcaREM.get(acc.marca) || 0) + acc.pedidas);
  }

  const filasTablaREM = Array.from(consolidadoMarcaArchivo.values())
    .map((acc) => ({
      ...acc,
      completitud: acc.pedidas > 0 ? (acc.distribuidas / acc.pedidas) * 100 : 0,
    }))
    .sort((a, b) => {
      const totalA = totalPedidasPorMarcaREM.get(a.marca) || 0;
      const totalB = totalPedidasPorMarcaREM.get(b.marca) || 0;
      if (a.marca !== b.marca) return totalB - totalA;
      return a.archivo.localeCompare(b.archivo);
    });

  // Subtotal general sobre los datos filtrados
  const subtotalREM = filasFiltradasREM.reduce(
    (acc, f) => ({ pedidas: acc.pedidas + f.pedidas, distribuidas: acc.distribuidas + f.distribuidas, aRepartir: acc.aRepartir + f.aRepartir }),
    { pedidas: 0, distribuidas: 0, aRepartir: 0 }
  );
  const subtotalREMCalculado = {
    ...subtotalREM,
    completitud: subtotalREM.pedidas > 0 ? (subtotalREM.distribuidas / subtotalREM.pedidas) * 100 : 0,
  };

  // Desglose por grupo de la fila (marca + archivo) expandida -- se calcula
  // sobre los mismos datos ya filtrados por temporada/grupo/marca.
  const desgloseGrupoREM = (() => {
    if (!filaExpandidaREM) return [];
    const porGrupo = new Map<string, { grupo: string; pedidas: number; distribuidas: number; aRepartir: number }>();
    for (const f of filasFiltradasREM) {
      if (f.marca !== filaExpandidaREM.marca || f.archivo !== filaExpandidaREM.archivo) continue;
      if (!porGrupo.has(f.grupo)) {
        porGrupo.set(f.grupo, { grupo: f.grupo, pedidas: 0, distribuidas: 0, aRepartir: 0 });
      }
      const acc = porGrupo.get(f.grupo)!;
      acc.pedidas += f.pedidas;
      acc.distribuidas += f.distribuidas;
      acc.aRepartir += f.aRepartir;
    }
    return Array.from(porGrupo.values())
      .map((acc) => ({ ...acc, completitud: acc.pedidas > 0 ? (acc.distribuidas / acc.pedidas) * 100 : 0 }))
      .sort((a, b) => b.pedidas - a.pedidas);
  })();

  const handleFilaClickREM = (marca: string, archivo: string) => {
    setFilaExpandidaREM(
      filaExpandidaREM?.marca === marca && filaExpandidaREM?.archivo === archivo ? null : { marca, archivo }
    );
  };

  // =========================================================================
  // ESTADO: PRODUCTIVIDAD POR PROCESO - IMPORTAR DATOS (varios .xlsx -> productividad)
  // =========================================================================
  const [archivosProductividad, setArchivosProductividad] = useState<File[]>([]);
  const [isProcesandoProductividad, setIsProcesandoProductividad] = useState(false);
  const [progresoProductividad, setProgresoProductividad] = useState(0);
  const [errorProductividad, setErrorProductividad] = useState<string | null>(null);
  const [resultadoProductividad, setResultadoProductividad] = useState<{ filasInsertadas: number } | null>(null);

  const inputProductividadRef = useRef<HTMLInputElement>(null);

  const PROD_CHUNK_SIZE = 500;

  // Convierte "20/07/2026" (dd/mm/yyyy, como viene en el Excel) a "2026-07-20" (ISO)
  function fechaDDMMYYYYaISO(fecha: string): string | null {
    const m = fecha.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const handleProcesarProductividad = async () => {
    if (archivosProductividad.length === 0) return;

    setIsProcesandoProductividad(true);
    setProgresoProductividad(0);
    setErrorProductividad(null);
    setResultadoProductividad(null);

    try {
      // Parseamos todos los archivos seleccionados (misma estructura, se combinan)
      const listasDeRegistros = await Promise.all(
        archivosProductividad.map((file) => parseExcelFile(file))
      );
      let records = listasDeRegistros.flat();

      // Normalizamos la fecha de dd/mm/yyyy a ISO para que se pueda usar
      // como clave de reemplazo y para que ordene bien en el resumen.
      records = records.map((r) => {
        const fechaOriginal = typeof r.fecha === "string" ? r.fecha : "";
        const fechaISO = fechaDDMMYYYYaISO(fechaOriginal);
        return { ...r, fecha: fechaISO ?? fechaOriginal };
      });

      if (records.length === 0) {
        throw new Error("Los archivos seleccionados no tienen filas de datos.");
      }

      // Para cada fecha presente en el archivo, juntamos los tipos de proceso
      // que trae -- solo esas combinaciones exactas (fecha + tipo_proceso) se
      // reemplazan; el resto de los procesos de esa misma fecha no se tocan.
      const tiposPorFecha = new Map<string, Set<string>>();
      for (const r of records) {
        const fecha = typeof r.fecha === "string" ? r.fecha : "";
        const tipo = typeof r.tipo_proceso === "string" ? r.tipo_proceso : "";
        if (!fecha || !tipo) continue;
        if (!tiposPorFecha.has(fecha)) tiposPorFecha.set(fecha, new Set());
        tiposPorFecha.get(fecha)!.add(tipo);
      }
      const combinacionesAEliminar = Array.from(tiposPorFecha.entries()).map(([fecha, tipos]) => ({
        fecha,
        tipos: Array.from(tipos),
      }));

      const total = records.length;
      let procesados = 0;
      let filasInsertadasTotal = 0;

      for (let i = 0; i < records.length; i += PROD_CHUNK_SIZE) {
        const batch = records.slice(i, i + PROD_CHUNK_SIZE);
        const res = await fetch("/api/productividad/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batch,
            combinacionesAEliminar: i === 0 ? combinacionesAEliminar : null,
            esPrimerLote: i === 0,
          }),
        });

        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Error al procesar el archivo.");
        }

        filasInsertadasTotal += data.filasInsertadas ?? batch.length;
        procesados += batch.length;
        setProgresoProductividad(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoProductividad({ filasInsertadas: filasInsertadasTotal });
      setProgresoProductividad(100);

      // Refresh completo de la app para que todo se vea actualizado. Guardamos
      // en sessionStorage a qué pestaña volver, ya que el reload reinicia el estado de React.
      sessionStorage.setItem("tabDespuesDeRefresh", "PROD-Resumen");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setErrorProductividad(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoProductividad(false);
    }
  };

  const resetProductividad = () => {
    setArchivosProductividad([]);
    setResultadoProductividad(null);
    setErrorProductividad(null);
    setProgresoProductividad(0);
    if (inputProductividadRef.current) inputProductividadRef.current.value = "";
  };

  // =========================================================================
  // ESTADO: PRODUCTIVIDAD POR PROCESO - RESUMEN
  // =========================================================================
  interface ProductividadFila {
    fecha: string;
    tipoProceso: string;
    cantidad: number;
  }

  const [productividadResumen, setProductividadResumen] = useState<{ filas: ProductividadFila[]; updatedAt: string | null } | null>(null);
  const [productividadResumenLoading, setProductividadResumenLoading] = useState(false);
  const [productividadResumenError, setProductividadResumenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarProductividadResumen() {
      setProductividadResumenLoading(true);
      setProductividadResumenError(null);
      try {
        const res = await fetch("/api/productividad/resumen", { cache: "no-store" });
        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "No se pudo cargar el resumen.");
        }
        if (!cancelado) setProductividadResumen({ filas: data.filas, updatedAt: data.updatedAt });
      } catch (err) {
        if (!cancelado) setProductividadResumenError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setProductividadResumenLoading(false);
      }
    }

    cargarProductividadResumen();
    return () => {
      cancelado = true;
    };
  }, [dataVersion]);

  // --- Filtros de la tabla de Productividad ---
  const [rangoProductividad, setRangoProductividad] = useState<7 | 14 | 30 | null>(null); // null = todos los datos
  const [fechaSeleccionadaProductividad, setFechaSeleccionadaProductividad] = useState<string>("");
  const [filtroTipoProcesoProductividad, setFiltroTipoProcesoProductividad] = useState<string>("TODOS");

  const hoyProductividadISO = new Date().toISOString().slice(0, 10);

  // Grupos de tipo de proceso para el filtro: elegir "ECOM" muestra tanto
  // PICKING ECOM como FINISHING ECOM (sin sumarlos en una sola fila); ídem REPO.
  const GRUPOS_PROCESO_PRODUCTIVIDAD: Record<string, string[]> = {
    "CARGA INICIAL": ["CARGA INICIAL"],
    GUARDADO: ["GUARDADO"],
    REMANENTES: ["REMANENTES"],
    ECOM: ["PICKING ECOM", "FINISHING ECOM"],
    REPO: ["PICKING REPO", "FINISHING REPO"],
  };

  const filasProductividadFiltradas = (productividadResumen?.filas ?? []).filter((f) => {
    // Filtro de fecha: fecha puntual tiene prioridad sobre el rango de días.
    if (fechaSeleccionadaProductividad) {
      if (f.fecha !== fechaSeleccionadaProductividad) return false;
    } else if (rangoProductividad) {
      const d = new Date();
      d.setDate(d.getDate() - (rangoProductividad - 1));
      const limiteISO = d.toISOString().slice(0, 10);
      if (f.fecha < limiteISO || f.fecha > hoyProductividadISO) return false;
    }

    // Filtro de tipo de proceso (agrupado)
    if (filtroTipoProcesoProductividad !== "TODOS") {
      const permitidos = GRUPOS_PROCESO_PRODUCTIVIDAD[filtroTipoProcesoProductividad] || [];
      if (!permitidos.includes(f.tipoProceso)) return false;
    }

    return true;
  });

  // =========================================================================
  // ESTADO: POR PEDIDOS (datos reales desde tiendas_destino vía /api/resumen/pedidos)
  // =========================================================================
  interface PedidoResumen {
    pedido: string;
    grupo: string;
    codigoTienda: string;
    cliente: string;
    nombrePedido: string;
    marca: string;
    canal: string;
    fecha: string;
    uni: number;
    pick: number;
    sep: number;
    pendPick: number;
    pendSep: number;
    eficPick: number;
    eficSep: number;
  }

  const [pedidosData, setPedidosData] = useState<{ filas: PedidoResumen[]; updatedAt: string | null } | null>(null);
  const [pedidosLoading, setPedidosLoading] = useState(false);
  const [pedidosError, setPedidosError] = useState<string | null>(null);

  const [busquedaPedidos, setBusquedaPedidos] = useState("");
  const [filtroMarcaPedidos, setFiltroMarcaPedidos] = useState("TODAS");
  const [filtroCanalPedidos, setFiltroCanalPedidos] = useState("TODAS");
  const [filtroGrupoPedidos, setFiltroGrupoPedidos] = useState("TODAS");
  const [rangoFechaPedidos, setRangoFechaPedidos] = useState<7 | 14 | 30>(7);
  const [semanaPedidos, setSemanaPedidos] = useState<{ desde: string; hasta: string } | null>(null);

  const [pedidoExpandido, setPedidoExpandido] = useState<string | null>(null);
  interface GrupoDetalle {
    grupo: string;
    nombrePedido: string;
    uni: number;
    pick: number;
    sep: number;
    pendPick: number;
    pendSep: number;
    eficPick: number;
    eficSep: number;
  }
  const [gruposDelPedido, setGruposDelPedido] = useState<GrupoDetalle[] | null>(null);
  const [gruposLoading, setGruposLoading] = useState(false);
  const [gruposError, setGruposError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarPedidos() {
      setPedidosLoading(true);
      setPedidosError(null);
      try {
        const res = await fetch("/api/resumen/pedidos", { cache: "no-store" });
        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "No se pudo cargar el detalle por pedidos.");
        }
        if (!cancelado) setPedidosData({ filas: data.filas, updatedAt: data.updatedAt });
      } catch (err) {
        if (!cancelado) setPedidosError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setPedidosLoading(false);
      }
    }

    cargarPedidos();
    return () => {
      cancelado = true;
    };
  }, [dataVersion]);

  const handleTiendaClick = async (pedido: string) => {
    if (pedidoExpandido === pedido) {
      setPedidoExpandido(null);
      setGruposDelPedido(null);
      setGruposError(null);
      return;
    }
    setPedidoExpandido(pedido);
    setGruposDelPedido(null);
    setGruposError(null);
    setGruposLoading(true);
    try {
      const res = await fetch(`/api/resumen/pedidos/grupos?pedido=${encodeURIComponent(pedido)}`, { cache: "no-store" });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo cargar el detalle por grupo.");
      }
      setGruposDelPedido(data.grupos);
    } catch (err) {
      setGruposError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGruposLoading(false);
    }
  };

  const hoyPedidosISO = new Date().toISOString().slice(0, 10);
  const limitePedidosISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() - (rangoFechaPedidos - 1));
    return d.toISOString().slice(0, 10);
  })();

  const marcasDisponiblesPedidos = Array.from(new Set((pedidosData?.filas ?? []).map((f) => f.marca))).sort();
  const canalesDisponiblesPedidos = Array.from(new Set((pedidosData?.filas ?? []).map((f) => f.canal))).sort();
  const gruposDisponiblesPedidos = Array.from(new Set((pedidosData?.filas ?? []).map((f) => f.grupo))).sort();

  const busquedaNormalizada = busquedaPedidos.trim().toLowerCase();

  // Filtrado a nivel (pedido, grupo) -- todavía sin consolidar.
  const filasCrudasPedidos = (pedidosData?.filas ?? []).filter((f) => {
    const enRango = semanaPedidos
      ? f.fecha !== "SIN FECHA" && f.fecha >= semanaPedidos.desde && f.fecha <= semanaPedidos.hasta
      : f.fecha !== "SIN FECHA" && f.fecha >= limitePedidosISO && f.fecha <= hoyPedidosISO;
    if (!enRango) return false;
    if (filtroMarcaPedidos !== "TODAS" && f.marca !== filtroMarcaPedidos) return false;
    if (filtroCanalPedidos !== "TODAS" && f.canal !== filtroCanalPedidos) return false;
    if (filtroGrupoPedidos !== "TODAS" && f.grupo !== filtroGrupoPedidos) return false;
    if (busquedaNormalizada) {
      const matchCliente = f.cliente.toLowerCase().includes(busquedaNormalizada);
      const matchCodigo = f.codigoTienda.toLowerCase().includes(busquedaNormalizada);
      if (!matchCliente && !matchCodigo) return false;
    }
    return true;
  });

  // Consolidamos por pedido: el filtro de grupo ya se aplicó arriba, así que
  // acá solo sumamos lo que haya quedado (si es "Todos los grupos", suma
  // todas las líneas del pedido; si es un grupo puntual, solo esa porción).
  const consolidadoPorPedido = new Map<string, PedidoResumen>();
  for (const f of filasCrudasPedidos) {
    const existente = consolidadoPorPedido.get(f.pedido);
    if (!existente) {
      consolidadoPorPedido.set(f.pedido, { ...f });
    } else {
      existente.uni += f.uni;
      existente.pick += f.pick;
      existente.sep += f.sep;
    }
  }
  const filasFiltradasPedidos = Array.from(consolidadoPorPedido.values()).map((f) => ({
    ...f,
    pendPick: f.uni - f.pick,
    pendSep: f.uni - f.sep,
    eficPick: f.uni > 0 ? (f.pick / f.uni) * 100 : 0,
    eficSep: f.uni > 0 ? (f.sep / f.uni) * 100 : 0,
  }));

  const subtotalPedidos = filasFiltradasPedidos.reduce(
    (acc, f) => ({ uni: acc.uni + f.uni, pick: acc.pick + f.pick, sep: acc.sep + f.sep }),
    { uni: 0, pick: 0, sep: 0 }
  );
  const subtotalPedidosCalculado = {
    ...subtotalPedidos,
    pendPick: subtotalPedidos.uni - subtotalPedidos.pick,
    pendSep: subtotalPedidos.uni - subtotalPedidos.sep,
    eficPick: subtotalPedidos.uni > 0 ? (subtotalPedidos.pick / subtotalPedidos.uni) * 100 : 0,
    eficSep: subtotalPedidos.uni > 0 ? (subtotalPedidos.sep / subtotalPedidos.uni) * 100 : 0,
  };

  const exportarPedidosAExcel = () => {
    const filasExport = filasFiltradasPedidos.map((f) => ({
      "Código Tienda": f.codigoTienda,
      Cliente: f.cliente,
      "N° Pedido": f.pedido,
      Marca: f.marca,
      Canal: f.canal,
      Fecha: f.fecha,
      Unidades: f.uni,
      Pickeadas: f.pick,
      Separadas: f.sep,
      "Pend. Pick": f.pendPick,
      "Pend. Sep": f.pendSep,
      "Efic Pick %": Number(f.eficPick.toFixed(1)),
      "Efic Sep %": Number(f.eficSep.toFixed(1)),
    }));
    const hoja = XLSX.utils.json_to_sheet(filasExport);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Por Pedidos");
    const fechaArchivo = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(libro, `pedidos_${fechaArchivo}.xlsx`);
  };

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

  const hoyISO = new Date().toISOString().slice(0, 10);
  const limiteFechaISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() - (rangoFecha - 1)); // incluye el día de hoy dentro del rango
    return d.toISOString().slice(0, 10);
  })();

  const filasConFecha = (fechaData?.filas ?? []).filter((f) => {
    if (f.fecha === "SIN FECHA") return false;
    if (semanaFecha) return f.fecha >= semanaFecha.desde && f.fecha <= semanaFecha.hasta;
    if (fechaSeleccionada) return f.fecha === fechaSeleccionada;
    return f.fecha >= limiteFechaISO && f.fecha <= hoyISO;
  });
  // Los pedidos sin fecha_creacion solo se muestran en el filtro "Último mes"
  // (y no cuando se eligió una fecha puntual o una semana), siempre al final de la tabla.
  const filasSinFecha =
    rangoFecha === 30 && !fechaSeleccionada && !semanaFecha
      ? (fechaData?.filas ?? []).filter((f) => f.fecha === "SIN FECHA")
      : [];

  // Lista de marcas, canales y grupos disponibles para los filtros (únicas, ordenadas)
  const marcasDisponiblesFecha = Array.from(
    new Set((fechaData?.filas ?? []).map((f) => f.marca))
  ).sort();
  const canalesDisponiblesFecha = Array.from(
    new Set((fechaData?.filas ?? []).map((f) => f.canal))
  ).sort();
  const gruposDisponiblesFecha = Array.from(
    new Set((fechaData?.filas ?? []).map((f) => f.grupo))
  ).sort();

  const filasFiltradas = [...filasConFecha, ...filasSinFecha].filter(
    (f) =>
      (filtroMarcaFecha === "TODAS" || f.marca === filtroMarcaFecha) &&
      (filtroCanalFecha === "TODAS" || f.canal === filtroCanalFecha) &&
      (filtroGrupoFecha === "TODAS" || f.grupo === filtroGrupoFecha)
  );

  // Consolidamos por (fecha, marca): el canal se usa solo para filtrar,
  // no se muestra como columna ni se desglosa en el resultado.
  const consolidadoPorFechaMarca = new Map<
    string,
    { fecha: string; marca: string; uni: number; pick: number; sep: number }
  >();
  for (const f of filasFiltradas) {
    const key = `${f.fecha}__${f.marca}`;
    if (!consolidadoPorFechaMarca.has(key)) {
      consolidadoPorFechaMarca.set(key, { fecha: f.fecha, marca: f.marca, uni: 0, pick: 0, sep: 0 });
    }
    const acc = consolidadoPorFechaMarca.get(key)!;
    acc.uni += f.uni;
    acc.pick += f.pick;
    acc.sep += f.sep;
  }

  const fechasData = Array.from(consolidadoPorFechaMarca.values())
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.uni - a.uni))
    .map((f) => ({
      fecha: f.fecha,
      marca: f.marca,
      dot: dotForMarcaName(f.marca),
      uni: fmtNum(f.uni),
      pick: fmtNum(f.pick),
      sep: fmtNum(f.sep),
      pendPick: fmtNum(f.uni - f.pick),
      pendSep: fmtNum(f.uni - f.sep),
      eficPick: fmtPct(f.uni > 0 ? (f.pick / f.uni) * 100 : 0),
      eficSep: fmtPct(f.uni > 0 ? (f.sep / f.uni) * 100 : 0),
    }));

  // Subtotal sobre los datos ya filtrados (fecha + marca + canal). La eficiencia
  // se recalcula sobre los totales sumados, NO como promedio de los % de cada fila.
  const subtotalFecha = filasFiltradas.reduce(
    (acc, f) => ({
      uni: acc.uni + f.uni,
      pick: acc.pick + f.pick,
      sep: acc.sep + f.sep,
    }),
    { uni: 0, pick: 0, sep: 0 }
  );
  const subtotalFechaCalculado = {
    ...subtotalFecha,
    pendPick: subtotalFecha.uni - subtotalFecha.pick,
    pendSep: subtotalFecha.uni - subtotalFecha.sep,
    eficPick: subtotalFecha.uni > 0 ? (subtotalFecha.pick / subtotalFecha.uni) * 100 : 0,
    eficSep: subtotalFecha.uni > 0 ? (subtotalFecha.sep / subtotalFecha.uni) * 100 : 0,
  };

  // =========================================================================
  // DATOS MOCK - OTRAS SECCIONES (Productividad, Carga, Remanentes)
  // =========================================================================

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

  // =========================================================================
  // ESTADO: ADMINISTRACIÓN - PERFILES
  // =========================================================================
  interface PerfilAdmin {
    id: string;
    nombre: string;
    permisos: string[];
  }
  const [perfilesAdmin, setPerfilesAdmin] = useState<PerfilAdmin[]>([]);
  const [perfilesAdminLoading, setPerfilesAdminLoading] = useState(false);
  const [perfilesAdminError, setPerfilesAdminError] = useState<string | null>(null);
  const [perfilSeleccionadoId, setPerfilSeleccionadoId] = useState<string | null>(null);
  const [formPerfilNombre, setFormPerfilNombre] = useState("");
  const [formPerfilPermisos, setFormPerfilPermisos] = useState<string[]>([]);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const cargarPerfilesAdmin = async () => {
    setPerfilesAdminLoading(true);
    setPerfilesAdminError(null);
    try {
      const res = await fetch("/api/admin/perfiles", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los perfiles.");
      setPerfilesAdmin(data.perfiles);
    } catch (err) {
      setPerfilesAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setPerfilesAdminLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPerfilesAdmin();
  }, [dataVersion]);

  const seleccionarPerfil = (perfil: PerfilAdmin | null) => {
    if (perfil) {
      setPerfilSeleccionadoId(perfil.id);
      setFormPerfilNombre(perfil.nombre);
      setFormPerfilPermisos(perfil.permisos);
    } else {
      setPerfilSeleccionadoId(null);
      setFormPerfilNombre("");
      setFormPerfilPermisos([]);
    }
  };

  const toggleFormPermiso = (key: string) => {
    setFormPerfilPermisos((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const guardarPerfil = async () => {
    if (!formPerfilNombre.trim()) return;
    setGuardandoPerfil(true);
    setPerfilesAdminError(null);
    try {
      const esNuevo = !perfilSeleccionadoId;
      const res = await fetch(
        esNuevo ? "/api/admin/perfiles" : `/api/admin/perfiles/${perfilSeleccionadoId}`,
        {
          method: esNuevo ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: formPerfilNombre.trim(), permisos: formPerfilPermisos }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar el perfil.");
      await cargarPerfilesAdmin();
      seleccionarPerfil(null);
    } catch (err) {
      setPerfilesAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const eliminarPerfil = async (id: string) => {
    if (!confirm("¿Seguro que querés eliminar este perfil?")) return;
    setPerfilesAdminError(null);
    try {
      const res = await fetch(`/api/admin/perfiles/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el perfil.");
      await cargarPerfilesAdmin();
      if (perfilSeleccionadoId === id) seleccionarPerfil(null);
    } catch (err) {
      setPerfilesAdminError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  // =========================================================================
  // ESTADO: ADMINISTRACIÓN - USUARIOS
  // =========================================================================
  interface UsuarioAdmin {
    id: string;
    email: string;
    nombre: string | null;
    perfilId: string | null;
    perfilNombre: string;
  }
  const [usuariosAdmin, setUsuariosAdmin] = useState<UsuarioAdmin[]>([]);
  const [usuariosAdminLoading, setUsuariosAdminLoading] = useState(false);
  const [usuariosAdminError, setUsuariosAdminError] = useState<string | null>(null);

  const [formUsuarioEmail, setFormUsuarioEmail] = useState("");
  const [formUsuarioPassword, setFormUsuarioPassword] = useState("");
  const [formUsuarioNombre, setFormUsuarioNombre] = useState("");
  const [formUsuarioPerfilId, setFormUsuarioPerfilId] = useState("");
  const [creandoUsuario, setCreandoUsuario] = useState(false);

  const cargarUsuariosAdmin = async () => {
    setUsuariosAdminLoading(true);
    setUsuariosAdminError(null);
    try {
      const res = await fetch("/api/admin/usuarios", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los usuarios.");
      setUsuariosAdmin(data.usuarios);
    } catch (err) {
      setUsuariosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setUsuariosAdminLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarUsuariosAdmin();
  }, [dataVersion]);

  const crearUsuario = async () => {
    if (!formUsuarioEmail.trim() || !formUsuarioPassword) return;
    setCreandoUsuario(true);
    setUsuariosAdminError(null);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formUsuarioEmail.trim(),
          password: formUsuarioPassword,
          nombre: formUsuarioNombre.trim(),
          perfilId: formUsuarioPerfilId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo crear el usuario.");
      setFormUsuarioEmail("");
      setFormUsuarioPassword("");
      setFormUsuarioNombre("");
      setFormUsuarioPerfilId("");
      await cargarUsuariosAdmin();
    } catch (err) {
      setUsuariosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCreandoUsuario(false);
    }
  };

  const cambiarPerfilUsuario = async (usuarioId: string, perfilId: string) => {
    setUsuariosAdminError(null);
    try {
      const res = await fetch(`/api/admin/usuarios/${usuarioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfilId: perfilId || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo actualizar el usuario.");
      await cargarUsuariosAdmin();
    } catch (err) {
      setUsuariosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const eliminarUsuario = async (id: string) => {
    if (!confirm("¿Seguro que querés eliminar este usuario? Perderá el acceso a la app.")) return;
    setUsuariosAdminError(null);
    try {
      const res = await fetch(`/api/admin/usuarios/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el usuario.");
      await cargarUsuariosAdmin();
    } catch (err) {
      setUsuariosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  // =========================================================================
  // ESTADO: ADMINISTRACIÓN - ACCESOS
  // =========================================================================
  interface AccesoAdmin {
    id: string;
    subseccionKey: string;
    fechaHora: string;
    usuarioEmail: string;
    usuarioNombre: string | null;
  }
  const [accesosAdmin, setAccesosAdmin] = useState<AccesoAdmin[]>([]);
  const [accesosAdminLoading, setAccesosAdminLoading] = useState(false);
  const [accesosAdminError, setAccesosAdminError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargarAccesos() {
      setAccesosAdminLoading(true);
      setAccesosAdminError(null);
      try {
        const res = await fetch("/api/admin/accesos", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el log de accesos.");
        if (!cancelado) setAccesosAdmin(data.accesos);
      } catch (err) {
        if (!cancelado) setAccesosAdminError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setAccesosAdminLoading(false);
      }
    }
    cargarAccesos();
    return () => {
      cancelado = true;
    };
  }, [dataVersion]);

  // Etiqueta legible para una subseccion_key (ej: "CI-Resumen" -> "Status Carga Inicial / Resumen")
  const labelSubseccion = (key: string) => {
    for (const seccion of REGISTRO_SECCIONES) {
      const sub = seccion.subsecciones.find((s) => s.key === key);
      if (sub) return `${seccion.nombre} / ${sub.label}`;
    }
    return key;
  };

  // =========================================================================
  // ESTADO: ADMINISTRACIÓN - FERIADOS
  // =========================================================================
  interface FeriadoAdmin {
    id: string;
    fecha: string;
    descripcion: string | null;
  }
  const [feriadosAdmin, setFeriadosAdmin] = useState<FeriadoAdmin[]>([]);
  const [feriadosAdminLoading, setFeriadosAdminLoading] = useState(false);
  const [feriadosAdminError, setFeriadosAdminError] = useState<string | null>(null);
  const [formFeriadoFecha, setFormFeriadoFecha] = useState("");
  const [formFeriadoDescripcion, setFormFeriadoDescripcion] = useState("");
  const [creandoFeriado, setCreandoFeriado] = useState(false);

  const cargarFeriadosAdmin = async () => {
    setFeriadosAdminLoading(true);
    setFeriadosAdminError(null);
    try {
      const res = await fetch("/api/admin/feriados", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los feriados.");
      setFeriadosAdmin(data.feriados);
    } catch (err) {
      setFeriadosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setFeriadosAdminLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarFeriadosAdmin();
  }, [dataVersion]);

  const crearFeriado = async () => {
    if (!formFeriadoFecha) return;
    setCreandoFeriado(true);
    setFeriadosAdminError(null);
    try {
      const res = await fetch("/api/admin/feriados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: formFeriadoFecha, descripcion: formFeriadoDescripcion.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo crear el feriado.");
      setFormFeriadoFecha("");
      setFormFeriadoDescripcion("");
      await cargarFeriadosAdmin();
    } catch (err) {
      setFeriadosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCreandoFeriado(false);
    }
  };

  const eliminarFeriado = async (id: string) => {
    if (!confirm("¿Seguro que querés eliminar este feriado?")) return;
    setFeriadosAdminError(null);
    try {
      const res = await fetch(`/api/admin/feriados/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el feriado.");
      await cargarFeriadosAdmin();
    } catch (err) {
      setFeriadosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  // =========================================================================
  // ESTADO: STATUS CARGA INICIAL - CARGA DATOS (plan vigente, un único registro)
  // =========================================================================
  interface PlanCargaInicial {
    id: number;
    fecha_inicio: string;
    fecha_fin: string;
    total_a_procesar: number;
    proceso_inicial: number;
    updated_at: string;
  }

  const [planCargaInicial, setPlanCargaInicial] = useState<PlanCargaInicial | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [editandoPlan, setEditandoPlan] = useState(false);
  const [guardandoPlan, setGuardandoPlan] = useState(false);
  const [formPlanFechaInicio, setFormPlanFechaInicio] = useState("");
  const [formPlanFechaFin, setFormPlanFechaFin] = useState("");
  const [formPlanTotalAProcesar, setFormPlanTotalAProcesar] = useState("");
  const [formPlanProcesoInicial, setFormPlanProcesoInicial] = useState("");

  const cargarPlanCargaInicial = async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const res = await fetch("/api/carga-inicial/plan", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el plan.");
      setPlanCargaInicial(data.plan);
      if (data.plan) {
        setFormPlanFechaInicio(data.plan.fecha_inicio);
        setFormPlanFechaFin(data.plan.fecha_fin);
        setFormPlanTotalAProcesar(String(data.plan.total_a_procesar));
        setFormPlanProcesoInicial(String(data.plan.proceso_inicial));
      }
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setPlanLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPlanCargaInicial();
  }, [dataVersion]);

  const planFormValido =
    !!formPlanFechaInicio &&
    !!formPlanFechaFin &&
    formPlanFechaFin >= formPlanFechaInicio &&
    formPlanTotalAProcesar !== "" &&
    Number.isFinite(Number(formPlanTotalAProcesar)) &&
    Number(formPlanTotalAProcesar) >= 0 &&
    formPlanProcesoInicial !== "" &&
    Number.isFinite(Number(formPlanProcesoInicial)) &&
    Number(formPlanProcesoInicial) >= 0;

  const guardarPlanCargaInicial = async () => {
    if (!planFormValido) return;
    setGuardandoPlan(true);
    setPlanError(null);
    try {
      const res = await fetch("/api/carga-inicial/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaInicio: formPlanFechaInicio,
          fechaFin: formPlanFechaFin,
          totalAProcesar: Number(formPlanTotalAProcesar),
          procesoInicial: Number(formPlanProcesoInicial),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar el plan.");
      setPlanCargaInicial(data.plan);
      setEditandoPlan(false);
      setDataVersion((v) => v + 1); // refresca también el cálculo de Avance Plan
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoPlan(false);
    }
  };

  const cancelarEdicionPlan = () => {
    setEditandoPlan(false);
    setPlanError(null);
    if (planCargaInicial) {
      setFormPlanFechaInicio(planCargaInicial.fecha_inicio);
      setFormPlanFechaFin(planCargaInicial.fecha_fin);
      setFormPlanTotalAProcesar(String(planCargaInicial.total_a_procesar));
      setFormPlanProcesoInicial(String(planCargaInicial.proceso_inicial));
    }
  };

  // =========================================================================
  // ESTADO: STATUS CARGA INICIAL - AVANCE PLAN
  // =========================================================================
  interface AvancePlanTabla {
    totalAProcesar: number;
    procesoInicial: number;
    paraProcesar: number;
    diasHabilesPlan: number;
    necesidadPorDia: number;
    produccionActual: number;
    diferencia: number;
  }
  interface AvancePlanTarjetas {
    fechaInicio: string;
    fechaFin: string;
    diasHabilesTranscurridos: number;
    avanceIdeal: number;
    avanceReal: number;
    pctAvance: number;
    unidadesPendientes: number;
  }

  const [avancePlanData, setAvancePlanData] = useState<{
    plan: PlanCargaInicial | null;
    tabla: AvancePlanTabla | null;
    tarjetas: AvancePlanTarjetas | null;
  } | null>(null);
  const [avancePlanLoading, setAvancePlanLoading] = useState(false);
  const [avancePlanError, setAvancePlanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarAvancePlan() {
      setAvancePlanLoading(true);
      setAvancePlanError(null);
      try {
        const res = await fetch("/api/carga-inicial/avance", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el avance del plan.");
        if (!cancelado) setAvancePlanData({ plan: data.plan, tabla: data.tabla, tarjetas: data.tarjetas });
      } catch (err) {
        if (!cancelado) setAvancePlanError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setAvancePlanLoading(false);
      }
    }

    cargarAvancePlan();
    return () => {
      cancelado = true;
    };
  }, [dataVersion]);

  // =========================================================================
  // ESTADO: STATUS REMANENTES - CARGA DATOS (plan vigente, un único registro)
  // =========================================================================
  interface PlanRemanentes {
    id: number;
    fecha_inicio: string;
    fecha_fin: string;
    proceso_inicial: number;
    target: number;
    updated_at: string;
  }

  const [planRemanentes, setPlanRemanentes] = useState<PlanRemanentes | null>(null);
  const [planRemanentesLoading, setPlanRemanentesLoading] = useState(false);
  const [planRemanentesError, setPlanRemanentesError] = useState<string | null>(null);
  const [editandoPlanRemanentes, setEditandoPlanRemanentes] = useState(false);
  const [guardandoPlanRemanentes, setGuardandoPlanRemanentes] = useState(false);
  const [formPlanRemFechaInicio, setFormPlanRemFechaInicio] = useState("");
  const [formPlanRemFechaFin, setFormPlanRemFechaFin] = useState("");
  const [formPlanRemProcesoInicial, setFormPlanRemProcesoInicial] = useState("");
  const [formPlanRemTarget, setFormPlanRemTarget] = useState("");

  const cargarPlanRemanentes = async () => {
    setPlanRemanentesLoading(true);
    setPlanRemanentesError(null);
    try {
      const res = await fetch("/api/remanentes/plan", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el plan.");
      setPlanRemanentes(data.plan);
      if (data.plan) {
        setFormPlanRemFechaInicio(data.plan.fecha_inicio);
        setFormPlanRemFechaFin(data.plan.fecha_fin);
        setFormPlanRemProcesoInicial(String(data.plan.proceso_inicial));
        setFormPlanRemTarget(String(data.plan.target));
      }
    } catch (err) {
      setPlanRemanentesError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setPlanRemanentesLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPlanRemanentes();
  }, [dataVersion]);

  const planRemanentesFormValido =
    !!formPlanRemFechaInicio &&
    !!formPlanRemFechaFin &&
    formPlanRemFechaFin >= formPlanRemFechaInicio &&
    formPlanRemProcesoInicial !== "" &&
    Number.isFinite(Number(formPlanRemProcesoInicial)) &&
    Number(formPlanRemProcesoInicial) >= 0 &&
    formPlanRemTarget !== "" &&
    Number.isFinite(Number(formPlanRemTarget)) &&
    Number(formPlanRemTarget) >= 0;

  const guardarPlanRemanentes = async () => {
    if (!planRemanentesFormValido) return;
    setGuardandoPlanRemanentes(true);
    setPlanRemanentesError(null);
    try {
      const res = await fetch("/api/remanentes/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaInicio: formPlanRemFechaInicio,
          fechaFin: formPlanRemFechaFin,
          procesoInicial: Number(formPlanRemProcesoInicial),
          target: Number(formPlanRemTarget),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar el plan.");
      setPlanRemanentes(data.plan);
      setEditandoPlanRemanentes(false);
      setDataVersion((v) => v + 1); // refresca también el cálculo de Avance Plan
    } catch (err) {
      setPlanRemanentesError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoPlanRemanentes(false);
    }
  };

  const cancelarEdicionPlanRemanentes = () => {
    setEditandoPlanRemanentes(false);
    setPlanRemanentesError(null);
    if (planRemanentes) {
      setFormPlanRemFechaInicio(planRemanentes.fecha_inicio);
      setFormPlanRemFechaFin(planRemanentes.fecha_fin);
      setFormPlanRemProcesoInicial(String(planRemanentes.proceso_inicial));
      setFormPlanRemTarget(String(planRemanentes.target));
    }
  };

  // =========================================================================
  // ESTADO: STATUS REMANENTES - AVANCE PLAN
  // =========================================================================
  const [avancePlanRemData, setAvancePlanRemData] = useState<{
    plan: PlanRemanentes | null;
    tabla: AvancePlanTabla | null;
    tarjetas: AvancePlanTarjetas | null;
  } | null>(null);
  const [avancePlanRemLoading, setAvancePlanRemLoading] = useState(false);
  const [avancePlanRemError, setAvancePlanRemError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarAvancePlanRem() {
      setAvancePlanRemLoading(true);
      setAvancePlanRemError(null);
      try {
        const res = await fetch("/api/remanentes/avance", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el avance del plan.");
        if (!cancelado) setAvancePlanRemData({ plan: data.plan, tabla: data.tabla, tarjetas: data.tarjetas });
      } catch (err) {
        if (!cancelado) setAvancePlanRemError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setAvancePlanRemLoading(false);
      }
    }

    cargarAvancePlanRem();
    return () => {
      cancelado = true;
    };
  }, [dataVersion]);

  // =========================================================================
  // ESTADO: STATUS REMANENTES - RESUMEN POR MARCA / GRUPO (con Unidades Target)
  // =========================================================================
  const [filtroMarcaResumenREM, setFiltroMarcaResumenREM] = useState("TODAS");
  const [filtroGrupoResumenREM, setFiltroGrupoResumenREM] = useState("TODAS");

  const filasFiltradasResumenREM = (remDetalleData?.filas ?? []).filter(
    (f) =>
      (filtroMarcaResumenREM === "TODAS" || f.marca === filtroMarcaResumenREM) &&
      (filtroGrupoResumenREM === "TODAS" || f.grupo === filtroGrupoResumenREM)
  );

  const targetPctREM = planRemanentes ? planRemanentes.target : 0;

  // Consolidamos por (marca, grupo) sumando todos los archivos/temporadas
  const consolidadoMarcaGrupoREM = new Map<
    string,
    { marca: string; grupo: string; pedidas: number; distribuidas: number; aRepartir: number }
  >();
  for (const f of filasFiltradasResumenREM) {
    const key = `${f.marca}__${f.grupo}`;
    if (!consolidadoMarcaGrupoREM.has(key)) {
      consolidadoMarcaGrupoREM.set(key, { marca: f.marca, grupo: f.grupo, pedidas: 0, distribuidas: 0, aRepartir: 0 });
    }
    const acc = consolidadoMarcaGrupoREM.get(key)!;
    acc.pedidas += f.pedidas;
    acc.distribuidas += f.distribuidas;
    acc.aRepartir += f.aRepartir;
  }

  const filasTablaResumenMarcaGrupoREM = Array.from(consolidadoMarcaGrupoREM.values())
    .map((acc) => {
      const unidadesTarget = acc.pedidas * (targetPctREM / 100);
      return {
        ...acc,
        unidadesTarget,
        pctAvance: unidadesTarget > 0 ? (acc.distribuidas / unidadesTarget) * 100 : 0,
      };
    })
    .sort((a, b) => (a.marca !== b.marca ? a.marca.localeCompare(b.marca) : a.grupo.localeCompare(b.grupo)));

  const subtotalResumenMarcaGrupoREM = filasFiltradasResumenREM.reduce(
    (acc, f) => ({
      pedidas: acc.pedidas + f.pedidas,
      distribuidas: acc.distribuidas + f.distribuidas,
      aRepartir: acc.aRepartir + f.aRepartir,
    }),
    { pedidas: 0, distribuidas: 0, aRepartir: 0 }
  );
  const subtotalResumenMarcaGrupoREMCalculado = (() => {
    const unidadesTarget = subtotalResumenMarcaGrupoREM.pedidas * (targetPctREM / 100);
    return {
      ...subtotalResumenMarcaGrupoREM,
      unidadesTarget,
      pctAvance: unidadesTarget > 0 ? (subtotalResumenMarcaGrupoREM.distribuidas / unidadesTarget) * 100 : 0,
    };
  })();

  // =========================================================================
  // ESTADO: INBOUND - IMPORTAR DATOS (.xlsx -> inbound)
  // =========================================================================
  const [archivosInbound, setArchivosInbound] = useState<File[]>([]);
  const [isProcesandoInbound, setIsProcesandoInbound] = useState(false);
  const [progresoInbound, setProgresoInbound] = useState(0);
  const [errorInbound, setErrorInbound] = useState<string | null>(null);
  const [resultadoInbound, setResultadoInbound] = useState<{ filasInsertadas: number } | null>(null);

  const inputInboundRef = useRef<HTMLInputElement>(null);
  const INB_CHUNK_SIZE = 500;

  // ETD/ETA/ARRIBO AL CD vienen del Excel como texto "dd/mm/yyyy" (parseExcelFile
  // usa raw:false para no perder ceros a la izquierda en otros campos) -> las
  // convertimos a ISO "yyyy-mm-dd" para guardarlas en columnas date.
  function fechaExcelAISO(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const m = valor.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const handleProcesarInbound = async () => {
    if (archivosInbound.length === 0) return;

    setIsProcesandoInbound(true);
    setProgresoInbound(0);
    setErrorInbound(null);
    setResultadoInbound(null);

    try {
      const listasDeRegistros = await Promise.all(archivosInbound.map((file) => parseExcelFile(file)));
      const registrosCrudos = listasDeRegistros.flat();

      if (registrosCrudos.length === 0) {
        throw new Error("Los archivos seleccionados no tienen filas de datos.");
      }

      // Deduplicamos por legajo (si el archivo trae el mismo legajo repetido,
      // se queda con la última fila) y convertimos las fechas a ISO.
      const porLegajo = new Map<number, Record<string, unknown>>();
      for (const r of registrosCrudos) {
        const legajo = Number(r.legajo);
        if (!Number.isFinite(legajo)) continue;
        const { arribo_al_cd, ...resto } = r;
        porLegajo.set(legajo, {
          ...resto,
          legajo,
          etd: fechaExcelAISO(r.etd),
          eta: fechaExcelAISO(r.eta),
          arribo_cd: fechaExcelAISO(arribo_al_cd),
        });
      }

      const records = Array.from(porLegajo.values());
      if (records.length === 0) {
        throw new Error("No se encontraron filas con LEGAJO válido.");
      }
      const legajosUnicos = Array.from(porLegajo.keys());

      const total = records.length;
      let procesados = 0;
      let filasInsertadasTotal = 0;

      for (let i = 0; i < records.length; i += INB_CHUNK_SIZE) {
        const batch = records.slice(i, i + INB_CHUNK_SIZE);
        const res = await fetch("/api/inbound/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batch,
            legajosAEliminar: i === 0 ? legajosUnicos : null,
            esPrimerLote: i === 0,
          }),
        });

        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Error al procesar el archivo.");
        }

        filasInsertadasTotal += data.filasInsertadas ?? batch.length;
        procesados += batch.length;
        setProgresoInbound(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoInbound({ filasInsertadas: filasInsertadasTotal });
      setProgresoInbound(100);

      sessionStorage.setItem("tabDespuesDeRefresh", "INB-Resumen");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setErrorInbound(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoInbound(false);
    }
  };

  const resetInbound = () => {
    setArchivosInbound([]);
    setResultadoInbound(null);
    setErrorInbound(null);
    setProgresoInbound(0);
    if (inputInboundRef.current) inputInboundRef.current.value = "";
  };

  // =========================================================================
  // ESTADO: INBOUND - RESUMEN (por arribar al CD / en CD)
  // =========================================================================
  interface InboundFila {
    legajo: number;
    proveedor: string | null;
    etapa: string | null;
    marca: string | null;
    unidades: number | null;
    fob_total_usd: number | null;
    transporte: string | null;
    tipo_carga: string | null;
    bultos: string | null;
    cbm: string | null;
    etd: string | null;
    eta: string | null;
    arribo_cd: string | null;
    status: string | null;
    updated_at: string | null;
  }

  const [inboundData, setInboundData] = useState<{
    pendientes: InboundFila[];
    enCd: InboundFila[];
    updatedAt: string | null;
  } | null>(null);
  const [inboundLoading, setInboundLoading] = useState(false);
  const [inboundError, setInboundError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarInbound() {
      setInboundLoading(true);
      setInboundError(null);
      try {
        const res = await fetch("/api/inbound/resumen", { cache: "no-store" });
        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar Inbound.");
        if (!cancelado) setInboundData({ pendientes: data.pendientes, enCd: data.enCd, updatedAt: data.updatedAt });
      } catch (err) {
        if (!cancelado) setInboundError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setInboundLoading(false);
      }
    }

    cargarInbound();
    return () => {
      cancelado = true;
    };
  }, [dataVersion]);

  const [filtroLegajoPendientes, setFiltroLegajoPendientes] = useState("");
  const [filtroSemanaPendientes, setFiltroSemanaPendientes] = useState(""); // "" = todas las semanas
  const [filtroLegajoEnCd, setFiltroLegajoEnCd] = useState("");

  // Solo mostramos en el desplegable las semanas que efectivamente tienen
  // algún legajo pendiente con ARRIBO AL CD en ese rango.
  const semanasConDatosInbound = (() => {
    const fechas = (inboundData?.pendientes ?? [])
      .map((f) => f.arribo_cd)
      .filter((f): f is string => !!f);
    if (fechas.length === 0) return [] as SemanaDelMes[];

    const minFecha = fechas.reduce((a, b) => (a < b ? a : b));
    const maxFecha = fechas.reduce((a, b) => (a > b ? a : b));
    const anioMin = Number(minFecha.slice(0, 4));
    const anioMax = Number(maxFecha.slice(0, 4));

    let todas: SemanaDelMes[] = [];
    for (let y = anioMin; y <= anioMax; y++) {
      todas = todas.concat(semanasDelAnio(y));
    }
    return todas.filter((s) => fechas.some((f) => f >= s.desde && f <= s.hasta));
  })();

  const pendientesFiltradosInbound = (inboundData?.pendientes ?? []).filter((f) => {
    if (filtroLegajoPendientes.trim() && !String(f.legajo).includes(filtroLegajoPendientes.trim())) return false;
    if (filtroSemanaPendientes) {
      const semana = semanasConDatosInbound.find((s) => s.desde === filtroSemanaPendientes);
      if (!semana) return false;
      if (!f.arribo_cd || f.arribo_cd < semana.desde || f.arribo_cd > semana.hasta) return false;
    }
    return true;
  });

  const enCdFiltradosInbound = (inboundData?.enCd ?? []).filter(
    (f) => !filtroLegajoEnCd.trim() || String(f.legajo).includes(filtroLegajoEnCd.trim())
  );

  // --- Edición de ARRIBO CD + botón "marcar arribado" (solo INB-EditarArribo) ---
  const [editandoArriboLegajo, setEditandoArriboLegajo] = useState<number | null>(null);
  const [valorArriboEdit, setValorArriboEdit] = useState("");
  const [guardandoArribo, setGuardandoArribo] = useState(false);
  const [accionInboundError, setAccionInboundError] = useState<string | null>(null);

  const iniciarEdicionArribo = (legajo: number, valorActual: string | null) => {
    setEditandoArriboLegajo(legajo);
    setValorArriboEdit(valorActual || "");
    setAccionInboundError(null);
  };

  const guardarArribo = async (legajo: number) => {
    if (!valorArriboEdit) {
      setEditandoArriboLegajo(null);
      return;
    }
    setGuardandoArribo(true);
    setAccionInboundError(null);
    try {
      const res = await fetch("/api/inbound/arribo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legajo, arriboCd: valorArriboEdit }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar la fecha.");
      setInboundData((prev) =>
        prev
          ? {
              ...prev,
              pendientes: prev.pendientes.map((f) =>
                f.legajo === legajo ? { ...f, arribo_cd: valorArriboEdit } : f
              ),
            }
          : prev
      );
      setEditandoArriboLegajo(null);
    } catch (err) {
      setAccionInboundError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoArribo(false);
    }
  };

  const marcarArriboCD = async (legajo: number) => {
    if (!confirm(`¿Confirmás que el legajo ${legajo} llegó al CD? Se moverá a la tabla "En CD".`)) return;
    setAccionInboundError(null);
    try {
      const res = await fetch("/api/inbound/marcar-cd", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legajo }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo actualizar el status.");
      setInboundData((prev) => {
        if (!prev) return prev;
        const fila = prev.pendientes.find((f) => f.legajo === legajo);
        if (!fila) return prev;
        const filaCd = { ...fila, status: "CD" };
        return {
          ...prev,
          pendientes: prev.pendientes.filter((f) => f.legajo !== legajo),
          enCd: [...prev.enCd, filaCd].sort((a, b) => a.legajo - b.legajo),
        };
      });
    } catch (err) {
      setAccionInboundError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  if (permisos === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fc]">
        <p className="text-sm text-slate-500">Cargando...</p>
      </div>
    );
  }

  if (permisosError) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fc] px-4">
        <div className="max-w-sm text-center">
          <p className="text-sm text-red-600 mb-4">{permisosError}</p>
          <button
            onClick={handleCerrarSesion}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (permisos.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fc] px-4">
        <div className="max-w-sm text-center">
          <p className="text-sm text-slate-600 mb-4">
            Tu usuario no tiene acceso a ninguna sección todavía. Contactá a un administrador para que te asigne un perfil.
          </p>
          <button
            onClick={handleCerrarSesion}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8f9fc] font-sans text-slate-800 overflow-hidden">
      
      {/* ================= BARRA LATERAL ================= */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-10 flex-shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
          <svg className="w-6 h-6 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <span className="text-lg font-bold text-white tracking-wide">WMS Analytics</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {seccionVisible(prepSubSections) && (
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
                {prepSubSections.filter(tienePermiso).map((sub, idx) => (
                  <button key={idx} onClick={() => irA(sub)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {seccionVisible(cargaInicialSubSections.map((s) => s.key)) && (
          <div className="pt-2">
            <button onClick={() => setIsCargaInicialOpen(!isCargaInicialOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Status carga inicial
              </div>
              <svg className={`w-4 h-4 transition-transform duration-200 ${isCargaInicialOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isCargaInicialOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {cargaInicialSubSections.filter((sub) => tienePermiso(sub.key)).map((sub) => (
                  <button key={sub.key} onClick={() => irA(sub.key)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub.key ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {seccionVisible(remanentesSubSections.map((s) => s.key)) && (
          <div className="pt-2">
            <button onClick={() => setIsRemanentesOpen(!isRemanentesOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                Status remanentes
              </div>
              <svg className={`w-4 h-4 transition-transform duration-200 ${isRemanentesOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isRemanentesOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {remanentesSubSections.filter((sub) => tienePermiso(sub.key)).map((sub) => (
                  <button key={sub.key} onClick={() => irA(sub.key)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub.key ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {seccionVisible(productividadSubSections.map((s) => s.key)) && (
          <div className="pt-2">
            <button onClick={() => setIsProductividadOpen(!isProductividadOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Producción por proceso
              </div>
              <svg className={`w-4 h-4 transition-transform duration-200 ${isProductividadOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isProductividadOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {productividadSubSections.filter((sub) => tienePermiso(sub.key)).map((sub) => (
                  <button key={sub.key} onClick={() => irA(sub.key)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub.key ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {seccionVisible(inboundSubSections.map((s) => s.key)) && (
          <div className="pt-2">
            <button onClick={() => setIsInboundOpen(!isInboundOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0l-1.5 5.5a2 2 0 01-1.94 1.5H7.44a2 2 0 01-1.94-1.5L4 13m16 0H4" /></svg>
                Inbound
              </div>
              <svg className={`w-4 h-4 transition-transform duration-200 ${isInboundOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isInboundOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {inboundSubSections.filter((sub) => tienePermiso(sub.key)).map((sub) => (
                  <button key={sub.key} onClick={() => irA(sub.key)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub.key ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {seccionVisible(adminSubSections.map((s) => s.key)) && (
          <div className="pt-2">
            <button onClick={() => setIsAdminOpen(!isAdminOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852 1 1.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
                Administración
              </div>
              <svg className={`w-4 h-4 transition-transform duration-200 ${isAdminOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isAdminOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {adminSubSections.filter((sub) => tienePermiso(sub.key)).map((sub) => (
                  <button key={sub.key} onClick={() => irA(sub.key)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub.key ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
        </nav>

        {/* ================= USUARIO / CERRAR SESIÓN ================= */}
        <div className="border-t border-slate-800 p-3">
          {usuarioActual && (
            <div className="px-3 py-2 mb-1">
              <p className="text-sm font-medium text-slate-200 truncate">{usuarioActual.nombre || usuarioActual.email}</p>
              <p className="text-xs text-slate-500 truncate">{usuarioActual.perfil}</p>
            </div>
          )}
          <button
            onClick={handleCerrarSesion}
            className="w-full flex items-center px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ================= ÁREA PRINCIPAL ================= */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-xl font-bold text-slate-800">
            {activeTab === "Resumen" ? "Status de Preparación - Resumen" : 
             activeTab === "Por fecha" ? "Status de Preparación - Por Fecha" :
             activeTab === "Por pedidos" ? "Status de Preparación - Por Pedidos" :
             activeTab === "Importar datos" ? "Status de Preparación - Importar Datos" :
             activeTab === "CI-Importar" ? "Status Carga Inicial - Importar Datos" :
             activeTab === "CI-Resumen" ? "Status Carga Inicial - Resumen" :
             activeTab === "CI-Avance" ? "Status Carga Inicial - Avance Plan" :
             activeTab === "CI-Carga" ? "Status Carga Inicial - Carga Datos" :
             activeTab === "REM-Importar" ? "Status Remanentes - Importar Datos" :
             activeTab === "REM-Resumen" ? "Status Remanentes - Resumen" :
             activeTab === "REM-Avance" ? "Status Remanentes - Avance Plan" :
             activeTab === "REM-Carga" ? "Status Remanentes - Carga Datos" :
             activeTab === "PROD-Importar" ? "Producción por Proceso - Importar Datos" :
             activeTab === "PROD-Resumen" ? "Producción por Proceso - Resumen" :
             activeTab === "INB-Importar" ? "Inbound - Importar Datos" :
             activeTab === "INB-Resumen" ? "Inbound - Resumen" :
             activeTab === "ADMIN-Perfiles" ? "Administración - Perfiles" :
             activeTab === "ADMIN-Usuarios" ? "Administración - Usuarios" :
             activeTab === "ADMIN-Accesos" ? "Administración - Accesos" :
             activeTab === "ADMIN-Feriados" ? "Administración - Feriados" : activeTab}
          </h1>
        </header>

        <div className="flex-1 overflow-auto p-8 space-y-6">
          
          {/* ================= PESTAÑA: RESUMEN ================= */}
          {activeTab === "Resumen" && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  { label: "Última semana", dias: 7 as const },
                  { label: "Últimos 14 días", dias: 14 as const },
                  { label: "Último mes", dias: 30 as const },
                ]).map((opcion) => (
                  <button
                    key={opcion.dias}
                    onClick={() => setRangoResumen(opcion.dias)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      rangoResumen === opcion.dias
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {opcion.label}
                  </button>
                ))}

                <button
                  onClick={() => setRangoResumen(null)}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>

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

              {/* --- BARRA DE PROGRESO --- */}
              {isProcesando && (
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Procesando datos...</span>
                    <span className="font-semibold text-slate-700">{progresoImport}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progresoImport}%` }}
                    />
                  </div>
                </div>
              )}

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

              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <div className="flex items-center gap-2">
                  {([
                    { label: "Última semana", dias: 7 as const },
                    { label: "Últimos 14 días", dias: 14 as const },
                    { label: "Último mes", dias: 30 as const },
                  ]).map((opcion) => (
                    <button
                      key={opcion.dias}
                      onClick={() => {
                        setRangoFecha(opcion.dias);
                        setFechaSeleccionada("");
                        setSemanaFecha(null);
                      }}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        !fechaSeleccionada && !semanaFecha && rangoFecha === opcion.dias
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {opcion.label}
                    </button>
                  ))}
                </div>

                <input
                  type="date"
                  value={fechaSeleccionada}
                  onChange={(e) => {
                    setFechaSeleccionada(e.target.value);
                    setSemanaFecha(null);
                  }}
                  max={hoyISO}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    fechaSeleccionada ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                />

                <select
                  value={semanaFecha ? semanaFecha.desde : ""}
                  onChange={(e) => {
                    const semana = semanasConDatos.find((s) => s.desde === e.target.value);
                    if (semana) {
                      setSemanaFecha({ desde: semana.desde, hasta: semana.hasta });
                      setFechaSeleccionada("");
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    semanaFecha ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <option value="">Semana del año...</option>
                  {semanasConDatos.map((s) => (
                    <option key={s.desde} value={s.desde}>{s.label}</option>
                  ))}
                </select>

                <select
                  value={filtroMarcaFecha}
                  onChange={(e) => setFiltroMarcaFecha(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todas las marcas</option>
                  {marcasDisponiblesFecha.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <select
                  value={filtroCanalFecha}
                  onChange={(e) => setFiltroCanalFecha(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todos los canales</option>
                  {canalesDisponiblesFecha.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <select
                  value={filtroGrupoFecha}
                  onChange={(e) => setFiltroGrupoFecha(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todos los grupos</option>
                  {gruposDisponiblesFecha.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setRangoFecha(7);
                    setFechaSeleccionada("");
                    setSemanaFecha(null);
                    setFiltroMarcaFecha("TODAS");
                    setFiltroCanalFecha("TODAS");
                    setFiltroGrupoFecha("TODAS");
                  }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Limpiar filtros
                </button>
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
                  <thead>
                    {fechasData.length > 0 && (
                      <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                        <td className="py-3 px-4 text-left" colSpan={2}>
                          Subtotal
                          {filtroMarcaFecha !== "TODAS" ? ` — ${filtroMarcaFecha}` : " — Todas las marcas"}
                          {filtroCanalFecha !== "TODAS" ? ` — ${filtroCanalFecha}` : ""}
                          {filtroGrupoFecha !== "TODAS" ? ` — ${filtroGrupoFecha}` : ""}
                        </td>
                        <td className="py-3 px-4 text-left">{fmtNum(subtotalFechaCalculado.uni)}</td>
                        <td className="py-3 px-4 text-left">{fmtNum(subtotalFechaCalculado.pick)}</td>
                        <td className="py-3 px-4 text-left">{fmtNum(subtotalFechaCalculado.sep)}</td>
                        <td className="py-3 px-4 text-left text-orange-600">{fmtNum(subtotalFechaCalculado.pendPick)}</td>
                        <td className="py-3 px-4 text-left text-red-600">{fmtNum(subtotalFechaCalculado.pendSep)}</td>
                        <td className="py-3 px-4 text-left">{fmtPct(subtotalFechaCalculado.eficPick)}</td>
                        <td className="py-3 px-4 text-left">{fmtPct(subtotalFechaCalculado.eficSep)}</td>
                      </tr>
                    )}
                    <tr className="text-slate-500 font-medium border-b border-slate-200">
                      <th className="py-4 px-4 text-left">Fecha</th>
                      <th className="py-4 px-4 text-left">Marca</th>
                      <th className="py-4 px-4 text-left">Unidades</th>
                      <th className="py-4 px-4 text-left">Pickeadas</th>
                      <th className="py-4 px-4 text-left">Separadas</th>
                      <th className="py-4 px-4 text-left">Pend. Picking</th>
                      <th className="py-4 px-4 text-left">Pend. Sep.</th>
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
                        <td className="py-4 px-4 text-left font-semibold text-orange-500">{row.pendPick}</td>
                        <td className="py-4 px-4 text-left font-semibold text-red-500">{row.pendSep}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.eficPick}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.eficSep}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: POR PEDIDOS ================= */}
          {activeTab === "Por pedidos" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-xl font-bold text-slate-800">Detalle por Pedidos</h2>
                {pedidosData && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(pedidosData.updatedAt)}</span>
                  </div>
                )}
              </div>

              {/* FILTROS */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <input
                  type="text"
                  value={busquedaPedidos}
                  onChange={(e) => setBusquedaPedidos(e.target.value)}
                  placeholder="Buscar por cliente o número de tienda..."
                  className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 min-w-[260px]"
                />

                <select
                  value={filtroMarcaPedidos}
                  onChange={(e) => setFiltroMarcaPedidos(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todas las marcas</option>
                  {marcasDisponiblesPedidos.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <select
                  value={filtroCanalPedidos}
                  onChange={(e) => setFiltroCanalPedidos(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todos los canales</option>
                  {canalesDisponiblesPedidos.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <select
                  value={filtroGrupoPedidos}
                  onChange={(e) => setFiltroGrupoPedidos(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todos los grupos</option>
                  {gruposDisponiblesPedidos.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>

                <button
                  onClick={exportarPedidosAExcel}
                  disabled={filasFiltradasPedidos.length === 0}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ml-auto ${
                    filasFiltradasPedidos.length === 0
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline strokeLinecap="round" strokeLinejoin="round" points="7 10 12 15 17 10" />
                    <line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Exportar a Excel
                </button>
              </div>

              {/* BOTONES DE RANGO DE FECHA */}
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                {([
                  { label: "Última semana", dias: 7 as const },
                  { label: "Últimos 14 días", dias: 14 as const },
                  { label: "Último mes", dias: 30 as const },
                ]).map((opcion) => (
                  <button
                    key={opcion.dias}
                    onClick={() => {
                      setRangoFechaPedidos(opcion.dias);
                      setSemanaPedidos(null);
                    }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      !semanaPedidos && rangoFechaPedidos === opcion.dias
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {opcion.label}
                  </button>
                ))}

                <select
                  value={semanaPedidos ? semanaPedidos.desde : ""}
                  onChange={(e) => {
                    const semana = semanasConDatos.find((s) => s.desde === e.target.value);
                    if (semana) setSemanaPedidos({ desde: semana.desde, hasta: semana.hasta });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    semanaPedidos ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <option value="">Semana del año...</option>
                  {semanasConDatos.map((s) => (
                    <option key={s.desde} value={s.desde}>{s.label}</option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setRangoFechaPedidos(7);
                    setSemanaPedidos(null);
                    setFiltroMarcaPedidos("TODAS");
                    setFiltroCanalPedidos("TODAS");
                    setFiltroGrupoPedidos("TODAS");
                    setBusquedaPedidos("");
                  }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>

              {pedidosError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el detalle por pedidos: {pedidosError}
                </div>
              )}
              {pedidosLoading && !pedidosData && (
                <div className="mb-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                  Cargando datos de tiendas_destino...
                </div>
              )}

              {/* TARJETAS DE SUBTOTAL */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                {[
                  { label: "Unidades", value: fmtNum(subtotalPedidosCalculado.uni), color: "text-slate-800" },
                  { label: "Pickeado", value: fmtNum(subtotalPedidosCalculado.pick), color: "text-slate-800" },
                  { label: "Separado", value: fmtNum(subtotalPedidosCalculado.sep), color: "text-slate-800" },
                  { label: "Pend. Pick", value: fmtNum(subtotalPedidosCalculado.pendPick), color: "text-orange-600" },
                  { label: "Pend. Sep.", value: fmtNum(subtotalPedidosCalculado.pendSep), color: "text-red-600" },
                ].map((card) => (
                  <div key={card.label} className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                    <p className="text-xs font-medium text-slate-500 mb-2">{card.label}</p>
                    <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                  </div>
                ))}
              </div>

              {/* TABLA DE DETALLE */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-4 px-4 text-left">Código Tienda</th>
                      <th className="py-4 px-4 text-left">Cliente</th>
                      <th className="py-4 px-4 text-left">N° Pedido</th>
                      <th className="py-4 px-4 text-left">Unidades</th>
                      <th className="py-4 px-4 text-left">Pickeadas</th>
                      <th className="py-4 px-4 text-left">Separadas</th>
                      <th className="py-4 px-4 text-left">Pend. Pick</th>
                      <th className="py-4 px-4 text-left">Pend. Sep</th>
                      <th className="py-4 px-4 text-left">Efic. Pick %</th>
                      <th className="py-4 px-4 text-left">Efic. Sep %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filasFiltradasPedidos.map((row, i) => (
                      <>
                        <tr
                          key={`${row.pedido}-${i}`}
                          onClick={() => handleTiendaClick(row.pedido)}
                          className={`cursor-pointer transition-colors ${
                            pedidoExpandido === row.pedido ? "bg-slate-100" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="py-4 px-4 text-left font-semibold text-slate-800">{row.codigoTienda}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{row.cliente}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{row.pedido}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.uni)}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.pick)}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.sep)}</td>
                          <td className="py-4 px-4 text-left font-semibold text-orange-500">{fmtNum(row.pendPick)}</td>
                          <td className="py-4 px-4 text-left font-semibold text-red-500">{fmtNum(row.pendSep)}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{fmtPct(row.eficPick)}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{fmtPct(row.eficSep)}</td>
                        </tr>

                        {pedidoExpandido === row.pedido && (
                          <tr>
                            <td colSpan={10} className="bg-slate-50 px-4 py-4">
                              <p className="text-xs font-semibold text-slate-500 mb-2">
                                Detalle por grupo — pedido {row.pedido}
                              </p>
                              {gruposLoading && (
                                <p className="text-sm text-slate-500">Cargando detalle...</p>
                              )}
                              {gruposError && (
                                <p className="text-sm text-red-600">Error: {gruposError}</p>
                              )}
                              {!gruposLoading && !gruposError && gruposDelPedido && (
                                <table className="w-full text-sm text-left bg-white rounded-lg overflow-hidden border border-slate-200">
                                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                      <th className="py-2 px-3 text-left">Grupo</th>
                                      <th className="py-2 px-3 text-left">Unidades</th>
                                      <th className="py-2 px-3 text-left">Pickeadas</th>
                                      <th className="py-2 px-3 text-left">Separadas</th>
                                      <th className="py-2 px-3 text-left">Pend. Pick</th>
                                      <th className="py-2 px-3 text-left">Pend. Sep</th>
                                      <th className="py-2 px-3 text-left">Efic. Pick %</th>
                                      <th className="py-2 px-3 text-left">Efic. Sep %</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {gruposDelPedido.map((g, gi) => (
                                      <tr key={gi}>
                                        <td className="py-2 px-3 text-left font-medium text-slate-700">{g.grupo}</td>
                                        <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.uni)}</td>
                                        <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.pick)}</td>
                                        <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.sep)}</td>
                                        <td className="py-2 px-3 text-left font-semibold text-orange-500">{fmtNum(g.pendPick)}</td>
                                        <td className="py-2 px-3 text-left font-semibold text-red-500">{fmtNum(g.pendSep)}</td>
                                        <td className="py-2 px-3 text-left text-slate-600">{fmtPct(g.eficPick)}</td>
                                        <td className="py-2 px-3 text-left text-slate-600">{fmtPct(g.eficSep)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
                {filasFiltradasPedidos.length === 0 && !pedidosLoading && (
                  <p className="text-sm text-slate-400 text-center py-8">No hay pedidos que coincidan con los filtros aplicados.</p>
                )}
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: PRODUCTIVIDAD POR PROCESO ================= */}
          {/* ================= PESTAÑA: PRODUCTIVIDAD - IMPORTAR DATOS ================= */}
          {activeTab === "PROD-Importar" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
              <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Producción</h2>
              <p className="text-sm text-slate-500 mb-6">
                Subí uno o varios archivos .xlsx (misma estructura). Al procesar, se busca cada
                &quot;Fecha&quot; en la base y se reemplaza toda su información por la del archivo nuevo.
              </p>

              <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
                <input
                  ref={inputProductividadRef}
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  className="hidden"
                  onChange={(e) => setArchivosProductividad(Array.from(e.target.files ?? []))}
                />
                <button
                  onClick={() => inputProductividadRef.current?.click()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  Seleccionar archivos .xlsx
                </button>
                {archivosProductividad.length > 0 && (
                  <p className="text-sm text-emerald-600 font-medium mt-3">
                    {archivosProductividad.length === 1
                      ? "1 archivo adjuntado"
                      : `${archivosProductividad.length} archivos adjuntados`}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={handleProcesarProductividad}
                  disabled={archivosProductividad.length === 0 || isProcesandoProductividad}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    archivosProductividad.length === 0 || isProcesandoProductividad
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isProcesandoProductividad ? "Procesando..." : "Procesar"}
                </button>
                <button
                  onClick={resetProductividad}
                  disabled={isProcesandoProductividad}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Limpiar
                </button>
              </div>

              {/* --- BARRA DE PROGRESO --- */}
              {isProcesandoProductividad && (
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Procesando datos...</span>
                    <span className="font-semibold text-slate-700">{progresoProductividad}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progresoProductividad}%` }}
                    />
                  </div>
                </div>
              )}

              {errorProductividad && (
                <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {errorProductividad}
                </div>
              )}

              {resultadoProductividad && !errorProductividad && (
                <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                  {resultadoProductividad.filasInsertadas} filas cargadas correctamente. Actualizando la app...
                </div>
              )}
            </div>
          )}

          {/* ================= PESTAÑA: PRODUCTIVIDAD - RESUMEN ================= */}
          {activeTab === "PROD-Resumen" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <h2 className="text-xl font-bold text-slate-800">Producción por Proceso</h2>
                {productividadResumen && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(productividadResumen.updatedAt)}</span>
                  </div>
                )}
              </div>

              {productividadResumenError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el resumen: {productividadResumenError}
                </div>
              )}
              {productividadResumenLoading && !productividadResumen && (
                <div className="mb-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                  Cargando datos de productividad...
                </div>
              )}

              {/* FILTROS */}
              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <div className="flex items-center gap-2">
                  {([
                    { label: "Última semana", dias: 7 as const },
                    { label: "Últimos 14 días", dias: 14 as const },
                    { label: "Último mes", dias: 30 as const },
                  ]).map((opcion) => (
                    <button
                      key={opcion.dias}
                      onClick={() => {
                        setRangoProductividad(opcion.dias);
                        setFechaSeleccionadaProductividad("");
                      }}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        !fechaSeleccionadaProductividad && rangoProductividad === opcion.dias
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {opcion.label}
                    </button>
                  ))}
                </div>

                <input
                  type="date"
                  value={fechaSeleccionadaProductividad}
                  onChange={(e) => {
                    setFechaSeleccionadaProductividad(e.target.value);
                    setRangoProductividad(null);
                  }}
                  max={hoyProductividadISO}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    fechaSeleccionadaProductividad ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                />

                <select
                  value={filtroTipoProcesoProductividad}
                  onChange={(e) => setFiltroTipoProcesoProductividad(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODOS">Todos los procesos</option>
                  <option value="CARGA INICIAL">Carga Inicial</option>
                  <option value="GUARDADO">Guardado</option>
                  <option value="REMANENTES">Remanentes</option>
                  <option value="ECOM">Ecom (Picking + Finishing)</option>
                  <option value="REPO">Repo (Picking + Finishing)</option>
                </select>

                <button
                  onClick={() => {
                    setRangoProductividad(null);
                    setFechaSeleccionadaProductividad("");
                    setFiltroTipoProcesoProductividad("TODOS");
                  }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-4 px-4 text-left">Fecha</th>
                      <th className="py-4 px-4 text-left">Tipo Proceso</th>
                      <th className="py-4 px-4 text-left">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filasProductividadFiltradas.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-4 text-left text-slate-600 font-medium">{row.fecha}</td>
                        <td className="py-4 px-4 text-left font-semibold text-slate-900">{row.tipoProceso}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.cantidad)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filasProductividadFiltradas.length === 0 && !productividadResumenLoading && (
                  <p className="text-sm text-slate-400 text-center py-8">No hay datos que coincidan con los filtros aplicados.</p>
                )}
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: INBOUND - IMPORTAR DATOS ================= */}
          {activeTab === "INB-Importar" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
              <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Inbound</h2>
              <p className="text-sm text-slate-500 mb-6">
                Subí uno o varios archivos .xlsx (misma estructura, columna LEGAJO obligatoria). Al procesar, se busca
                cada LEGAJO en la base y se reemplaza toda su información por la del archivo nuevo.
              </p>

              <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
                <input
                  ref={inputInboundRef}
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  className="hidden"
                  onChange={(e) => setArchivosInbound(Array.from(e.target.files ?? []))}
                />
                <button
                  onClick={() => inputInboundRef.current?.click()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  Seleccionar archivos .xlsx
                </button>
                {archivosInbound.length > 0 && (
                  <p className="text-sm text-emerald-600 font-medium mt-3">
                    {archivosInbound.length === 1
                      ? "1 archivo adjuntado"
                      : `${archivosInbound.length} archivos adjuntados`}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={handleProcesarInbound}
                  disabled={archivosInbound.length === 0 || isProcesandoInbound}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    archivosInbound.length === 0 || isProcesandoInbound
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isProcesandoInbound ? "Procesando..." : "Procesar"}
                </button>
                <button
                  onClick={resetInbound}
                  disabled={isProcesandoInbound}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Limpiar
                </button>
              </div>

              {isProcesandoInbound && (
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Procesando datos...</span>
                    <span className="font-semibold text-slate-700">{progresoInbound}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progresoInbound}%` }}
                    />
                  </div>
                </div>
              )}

              {errorInbound && (
                <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {errorInbound}
                </div>
              )}

              {resultadoInbound && !errorInbound && (
                <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                  {resultadoInbound.filasInsertadas} filas cargadas correctamente. Actualizando la app...
                </div>
              )}
            </div>
          )}

          {/* ================= PESTAÑA: INBOUND - RESUMEN ================= */}
          {activeTab === "INB-Resumen" && (
            <div className="space-y-6">
              {inboundError && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar Inbound: {inboundError}
                </div>
              )}
              {accionInboundError && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {accionInboundError}
                </div>
              )}
              {inboundLoading && !inboundData && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                  Cargando datos de Inbound...
                </div>
              )}

              {/* --- TARJETA: POR ARRIBAR AL CD --- */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <h2 className="text-lg font-bold text-slate-800">Por arribar al CD</h2>
                  {inboundData && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(inboundData.updatedAt)}</span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-slate-500 mb-4">Todos los legajos cuyo STATUS todavía no es CD.</p>

                {/* FILTROS */}
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                  <input
                    type="text"
                    value={filtroLegajoPendientes}
                    onChange={(e) => setFiltroLegajoPendientes(e.target.value)}
                    placeholder="Buscar por legajo..."
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-48"
                  />
                  <select
                    value={filtroSemanaPendientes}
                    onChange={(e) => setFiltroSemanaPendientes(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">Todas las semanas</option>
                    {semanasConDatosInbound.map((s) => (
                      <option key={s.desde} value={s.desde}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      setFiltroLegajoPendientes("");
                      setFiltroSemanaPendientes("");
                    }}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Limpiar filtros
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead>
                      <tr className="text-slate-500 font-medium border-b border-slate-200">
                        <th className="py-3 px-4 text-left">Legajo</th>
                        <th className="py-3 px-4 text-left">Etapa</th>
                        <th className="py-3 px-4 text-left">Marca</th>
                        <th className="py-3 px-4 text-left">Unidades</th>
                        <th className="py-3 px-4 text-left">Bultos</th>
                        <th className="py-3 px-4 text-left">CBM</th>
                        <th className="py-3 px-4 text-left">ETD</th>
                        <th className="py-3 px-4 text-left">ETA</th>
                        <th className="py-3 px-4 text-left">Arribo CD</th>
                        <th className="py-3 px-4 text-left">Status</th>
                        {tienePermiso("INB-EditarArribo") && <th className="py-3 px-4 text-left">Acción</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendientesFiltradosInbound.map((f) => (
                        <tr key={f.legajo} className="hover:bg-slate-50">
                          <td className="py-3 px-4 text-left font-bold text-slate-900">{f.legajo}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{f.etapa || "—"}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{f.marca || "—"}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{fmtNum(f.unidades ?? 0)}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{f.bultos || "—"}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{f.cbm || "—"}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{fmtSoloFecha(f.etd)}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{fmtSoloFecha(f.eta)}</td>
                          <td className="py-3 px-4 text-left text-slate-600">
                            {tienePermiso("INB-EditarArribo") && editandoArriboLegajo === f.legajo ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="date"
                                  value={valorArriboEdit}
                                  onChange={(e) => setValorArriboEdit(e.target.value)}
                                  className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                  onClick={() => guardarArribo(f.legajo)}
                                  disabled={guardandoArribo}
                                  className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                                >
                                  Guardar
                                </button>
                                <button
                                  onClick={() => setEditandoArriboLegajo(null)}
                                  disabled={guardandoArribo}
                                  className="text-xs text-slate-400 hover:underline disabled:opacity-50"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : tienePermiso("INB-EditarArribo") ? (
                              <button
                                onClick={() => iniciarEdicionArribo(f.legajo, f.arribo_cd)}
                                className="hover:underline hover:text-blue-600"
                                title="Editar fecha de arribo"
                              >
                                {fmtSoloFecha(f.arribo_cd)}
                              </button>
                            ) : (
                              fmtSoloFecha(f.arribo_cd)
                            )}
                          </td>
                          <td className="py-3 px-4 text-left text-slate-600">{f.status || "—"}</td>
                          {tienePermiso("INB-EditarArribo") && (
                            <td className="py-3 px-4 text-left">
                              <button
                                onClick={() => marcarArriboCD(f.legajo)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              >
                                Marcar arribado a CD
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pendientesFiltradosInbound.length === 0 && !inboundLoading && (
                    <p className="text-sm text-slate-400 text-center py-8">No hay legajos que coincidan con los filtros aplicados.</p>
                  )}
                </div>
              </div>

              {/* --- TARJETA: EN CD --- */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-1">En CD</h2>
                <p className="text-sm text-slate-500 mb-4">Todos los legajos cuyo STATUS ya es CD.</p>

                <div className="flex items-center gap-3 mb-6 flex-wrap">
                  <input
                    type="text"
                    value={filtroLegajoEnCd}
                    onChange={(e) => setFiltroLegajoEnCd(e.target.value)}
                    placeholder="Buscar por legajo..."
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-48"
                  />
                  <button
                    onClick={() => setFiltroLegajoEnCd("")}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Limpiar filtro
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead>
                      <tr className="text-slate-500 font-medium border-b border-slate-200">
                        <th className="py-3 px-4 text-left">Legajo</th>
                        <th className="py-3 px-4 text-left">Etapa</th>
                        <th className="py-3 px-4 text-left">Marca</th>
                        <th className="py-3 px-4 text-left">Unidades</th>
                        <th className="py-3 px-4 text-left">Bultos</th>
                        <th className="py-3 px-4 text-left">CBM</th>
                        <th className="py-3 px-4 text-left">ETD</th>
                        <th className="py-3 px-4 text-left">ETA</th>
                        <th className="py-3 px-4 text-left">Arribo CD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {enCdFiltradosInbound.map((f) => (
                        <tr key={f.legajo} className="hover:bg-slate-50">
                          <td className="py-3 px-4 text-left font-bold text-slate-900">{f.legajo}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{f.etapa || "—"}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{f.marca || "—"}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{fmtNum(f.unidades ?? 0)}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{f.bultos || "—"}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{f.cbm || "—"}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{fmtSoloFecha(f.etd)}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{fmtSoloFecha(f.eta)}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{fmtSoloFecha(f.arribo_cd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {enCdFiltradosInbound.length === 0 && !inboundLoading && (
                    <p className="text-sm text-slate-400 text-center py-8">No hay legajos que coincidan con el filtro aplicado.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: CARGA INICIAL - IMPORTAR DATOS ================= */}
          {activeTab === "CI-Importar" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
              <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Carga Inicial</h2>
              <p className="text-sm text-slate-500 mb-6">
                Subí uno o varios archivos .csv (misma estructura). Al procesar, se busca cada
                &quot;Numero&quot; en la base y se reemplaza toda su información por la del archivo nuevo.
              </p>

              <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
                <input
                  ref={inputCargaInicialRef}
                  type="file"
                  accept=".csv"
                  multiple
                  className="hidden"
                  onChange={(e) => setArchivosCargaInicial(Array.from(e.target.files ?? []))}
                />
                <button
                  onClick={() => inputCargaInicialRef.current?.click()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  Seleccionar archivos .csv
                </button>
                {archivosCargaInicial.length > 0 && (
                  <p className="text-sm text-emerald-600 font-medium mt-3">
                    {archivosCargaInicial.length === 1
                      ? "1 archivo adjuntado"
                      : `${archivosCargaInicial.length} archivos adjuntados`}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={handleProcesarCargaInicial}
                  disabled={archivosCargaInicial.length === 0 || isProcesandoCargaInicial}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    archivosCargaInicial.length === 0 || isProcesandoCargaInicial
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isProcesandoCargaInicial ? "Procesando..." : "Procesar"}
                </button>
                <button
                  onClick={resetCargaInicial}
                  disabled={isProcesandoCargaInicial}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Limpiar
                </button>
              </div>

              {/* --- BARRA DE PROGRESO --- */}
              {isProcesandoCargaInicial && (
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Procesando datos...</span>
                    <span className="font-semibold text-slate-700">{progresoCargaInicial}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progresoCargaInicial}%` }}
                    />
                  </div>
                </div>
              )}

              {errorCargaInicial && (
                <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {errorCargaInicial}
                </div>
              )}

              {resultadoCargaInicial && !errorCargaInicial && (
                <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                  {resultadoCargaInicial.filasInsertadas} filas cargadas correctamente. Actualizando la app...
                </div>
              )}
            </div>
          )}

          {/* ================= PESTAÑA: CARGA INICIAL - RESUMEN ================= */}
          {activeTab === "CI-Resumen" && (
            <div className="space-y-6">
              {/* --- TABLA DE DETALLE POR MARCA / CURVA --- */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <h2 className="text-lg font-bold text-slate-800">Detalle por Marca / Curva</h2>
                  {ciDetalleData && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(ciDetalleData.updatedAt)}</span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-slate-500 mb-4">Hacé click en una curva para ver el desglose por grupo</p>

                {/* FILTROS */}
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                  <select
                    value={filtroMarcaCI}
                    onChange={(e) => setFiltroMarcaCI(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas las marcas</option>
                    {marcasDisponiblesCI.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>

                  <select
                    value={filtroTemporadaCI}
                    onChange={(e) => setFiltroTemporadaCI(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas las temporadas</option>
                    {temporadasDisponiblesCI.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>

                  <select
                    value={filtroGrupoCI}
                    onChange={(e) => setFiltroGrupoCI(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="TODAS">Todos los grupos</option>
                    {gruposDisponiblesCI.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      setFiltroMarcaCI("TODAS");
                      setFiltroTemporadaCI("TODAS");
                      setFiltroGrupoCI("TODAS");
                    }}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Limpiar filtros
                  </button>
                </div>

                {ciDetalleError && (
                  <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    Error al cargar el detalle: {ciDetalleError}
                  </div>
                )}
                {ciDetalleLoading && !ciDetalleData && (
                  <div className="mb-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                    Cargando datos de carga_inicial...
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead>
                      {filasTablaCI.length > 0 && (
                        <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                          <td className="py-3 px-4 text-left" colSpan={2}>
                            Subtotal
                            {filtroMarcaCI !== "TODAS" ? ` — ${filtroMarcaCI}` : " — Todas las marcas"}
                            {filtroTemporadaCI !== "TODAS" ? ` — ${filtroTemporadaCI}` : ""}
                            {filtroGrupoCI !== "TODAS" ? ` — ${filtroGrupoCI}` : ""}
                          </td>
                          <td className="py-3 px-4 text-left">{fmtNum(subtotalCICalculado.pedidas)}</td>
                          <td className="py-3 px-4 text-left">{fmtNum(subtotalCICalculado.distribuidas)}</td>
                          <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(subtotalCICalculado.aRepartir)}</td>
                          <td className="py-3 px-4 text-left">{fmtPct(subtotalCICalculado.completitud)}</td>
                        </tr>
                      )}
                      <tr className="text-slate-500 font-medium border-b border-slate-200">
                        <th className="py-3 px-4 text-left">Marca</th>
                        <th className="py-3 px-4 text-left">Curva</th>
                        <th className="py-3 px-4 text-left">Unidades Pedidas</th>
                        <th className="py-3 px-4 text-left">Unidades Distribuidas</th>
                        <th className="py-3 px-4 text-left">Unidades a Repartir</th>
                        <th className="py-3 px-4 text-left">% Completitud</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filasTablaCI.map((row, i) => {
                        const estaExpandida =
                          filaExpandidaCI?.marca === row.marca && filaExpandidaCI?.curva === row.curva;
                        return (
                        <>
                          <tr
                            key={`${row.marca}-${row.curva}-${i}`}
                            onClick={() => handleFilaClickCI(row.marca, row.curva)}
                            className={`cursor-pointer transition-colors ${
                              estaExpandida ? "bg-slate-100" : "hover:bg-slate-50"
                            }`}
                          >
                            <td className="py-3 px-4 text-left font-bold text-slate-900">{row.marca}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{row.curva}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.pedidas)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.distribuidas)}</td>
                            <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(row.aRepartir)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtPct(row.completitud)}</td>
                          </tr>

                          {estaExpandida && (
                              <tr>
                                <td colSpan={6} className="bg-slate-50 px-4 py-4">
                                  <p className="text-xs font-semibold text-slate-500 mb-2">
                                    Desglose por grupo — {row.marca} / {row.curva}
                                  </p>
                                  <table className="w-full text-sm text-left bg-white rounded-lg overflow-hidden border border-slate-200">
                                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                                      <tr>
                                        <th className="py-2 px-3 text-left">Grupo</th>
                                        <th className="py-2 px-3 text-left">Unidades Pedidas</th>
                                        <th className="py-2 px-3 text-left">Unidades Distribuidas</th>
                                        <th className="py-2 px-3 text-left">Unidades a Repartir</th>
                                        <th className="py-2 px-3 text-left">% Completitud</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {desgloseGrupoCI.map((g, gi) => (
                                        <tr key={gi}>
                                          <td className="py-2 px-3 text-left font-medium text-slate-700">{g.grupo}</td>
                                          <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.pedidas)}</td>
                                          <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.distribuidas)}</td>
                                          <td className="py-2 px-3 text-left font-semibold text-orange-500">{fmtNum(g.aRepartir)}</td>
                                          <td className="py-2 px-3 text-left text-slate-600">{fmtPct(g.completitud)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                        </>
                        );
                      })}
                    </tbody>
                  </table>
                  {filasTablaCI.length === 0 && !ciDetalleLoading && (
                    <p className="text-sm text-slate-400 text-center py-8">No hay datos que coincidan con los filtros aplicados.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: CARGA INICIAL - AVANCE PLAN ================= */}
          {activeTab === "CI-Avance" && (
            <div className="space-y-6">
              {avancePlanError && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el avance del plan: {avancePlanError}
                </div>
              )}
              {avancePlanLoading && !avancePlanData && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                  Cargando avance del plan...
                </div>
              )}

              {!avancePlanLoading && avancePlanData && !avancePlanData.plan && (
                <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-2xl text-center">
                  <p className="text-sm text-slate-500 mb-4">
                    Todavía no se cargó el plan de carga inicial. Cargalo en la subsección &quot;Carga Datos&quot; para ver el avance acá.
                  </p>
                  <button
                    onClick={() => irA("CI-Carga")}
                    className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Ir a Carga Datos
                  </button>
                </div>
              )}

              {avancePlanData?.plan && avancePlanData.tabla && avancePlanData.tarjetas && (
                <>
                  {/* --- TABLA: DETALLE DEL PLAN --- */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Detalle del plan</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead>
                          <tr className="text-slate-500 font-medium border-b border-slate-200">
                            <th className="py-3 px-4 text-left">
                              Total a procesar al {fmtSoloFecha(avancePlanData.tarjetas.fechaFin)}
                            </th>
                            <th className="py-3 px-4 text-left">Proceso inicial</th>
                            <th className="py-3 px-4 text-left">
                              Para procesar a partir del {fmtSoloFecha(avancePlanData.tarjetas.fechaInicio)}
                            </th>
                            <th className="py-3 px-4 text-left">Días hábiles¹</th>
                            <th className="py-3 px-4 text-left">Necesidad por día²</th>
                            <th className="py-3 px-4 text-left">Producción actual³</th>
                            <th className="py-3 px-4 text-left">Diferencia⁴</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="py-3 px-4 text-left font-semibold text-slate-900">{fmtNum(avancePlanData.tabla.totalAProcesar)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanData.tabla.procesoInicial)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanData.tabla.paraProcesar)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanData.tabla.diasHabilesPlan)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanData.tabla.necesidadPorDia)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanData.tabla.produccionActual)}</td>
                            <td
                              className={`py-3 px-4 text-left font-semibold ${
                                avancePlanData.tabla.diferencia >= 0 ? "text-emerald-600" : "text-red-600"
                              }`}
                            >
                              {fmtNum(avancePlanData.tabla.diferencia)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 space-y-1 text-xs text-slate-400">
                      <p>¹ Días hábiles entre la fecha inicio y la fecha fin de plan.</p>
                      <p>² Para procesar a partir del inicio de plan / Días hábiles.</p>
                      <p>
                        ³ Promedio de los datos de carga inicial del reporte de producción por proceso, desde la fecha inicio de plan
                        hasta hoy (o hasta la fecha fin de plan si ya finalizó). Solo se promedia sobre los días hábiles ya
                        transcurridos; los datos cargados en un día no hábil no se consideran para este cálculo.
                      </p>
                      <p>⁴ Diferencia entre la necesidad por día y la producción actual.</p>
                    </div>
                  </div>

                  {/* --- TARJETAS DE SEGUIMIENTO --- */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">Fecha inicio / fin de plan</p>
                      <p className="text-lg font-bold text-slate-800">
                        {fmtSoloFecha(avancePlanData.tarjetas.fechaInicio)} — {fmtSoloFecha(avancePlanData.tarjetas.fechaFin)}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">Días hábiles transcurridos</p>
                      <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanData.tarjetas.diasHabilesTranscurridos)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">Avance ideal</p>
                      <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanData.tarjetas.avanceIdeal)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">Avance real</p>
                      <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanData.tarjetas.avanceReal)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">% Avance real</p>
                      <p className="text-2xl font-bold text-blue-600">{fmtPct(avancePlanData.tarjetas.pctAvance)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">Unidades pendientes</p>
                      <p
                        className={`text-2xl font-bold ${
                          avancePlanData.tarjetas.unidadesPendientes > 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {fmtNum(avancePlanData.tarjetas.unidadesPendientes)}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ================= PESTAÑA: CARGA INICIAL - CARGA DATOS ================= */}
          {activeTab === "CI-Carga" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-2xl">
              <h2 className="text-xl font-bold text-slate-800 mb-1">Carga Datos — Plan de Carga Inicial</h2>
              <p className="text-sm text-slate-500 mb-6">
                Estos datos alimentan el cálculo de la subsección &quot;Avance Plan&quot;.
              </p>

              {planError && (
                <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{planError}</div>
              )}
              {planLoading && !planCargaInicial && (
                <div className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">Cargando plan...</div>
              )}

              {(!planCargaInicial || editandoPlan) ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Fecha inicio de plan</label>
                    <input
                      type="date"
                      value={formPlanFechaInicio}
                      onChange={(e) => setFormPlanFechaInicio(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Fecha fin de plan</label>
                    <input
                      type="date"
                      value={formPlanFechaFin}
                      onChange={(e) => setFormPlanFechaFin(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Total a procesar</label>
                    <input
                      type="number"
                      min={0}
                      value={formPlanTotalAProcesar}
                      onChange={(e) => setFormPlanTotalAProcesar(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Proceso inicial</label>
                    <input
                      type="number"
                      min={0}
                      value={formPlanProcesoInicial}
                      onChange={(e) => setFormPlanProcesoInicial(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={guardarPlanCargaInicial}
                      disabled={!planFormValido || guardandoPlan}
                      className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                        !planFormValido || guardandoPlan
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {guardandoPlan ? "Guardando..." : "Confirmar datos"}
                    </button>
                    {planCargaInicial && (
                      <button
                        onClick={cancelarEdicionPlan}
                        disabled={guardandoPlan}
                        className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <dt className="text-xs font-medium text-slate-400 mb-1">Fecha inicio de plan</dt>
                      <dd className="text-sm font-semibold text-slate-800">{fmtSoloFecha(planCargaInicial.fecha_inicio)}</dd>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <dt className="text-xs font-medium text-slate-400 mb-1">Fecha fin de plan</dt>
                      <dd className="text-sm font-semibold text-slate-800">{fmtSoloFecha(planCargaInicial.fecha_fin)}</dd>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <dt className="text-xs font-medium text-slate-400 mb-1">Total a procesar</dt>
                      <dd className="text-sm font-semibold text-slate-800">{fmtNum(planCargaInicial.total_a_procesar)}</dd>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <dt className="text-xs font-medium text-slate-400 mb-1">Proceso inicial</dt>
                      <dd className="text-sm font-semibold text-slate-800">{fmtNum(planCargaInicial.proceso_inicial)}</dd>
                    </div>
                  </dl>
                  <button
                    onClick={() => setEditandoPlan(true)}
                    className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    Modificar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ================= PESTAÑA: REMANENTES - IMPORTAR DATOS ================= */}
          {activeTab === "REM-Importar" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
              <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Remanentes</h2>
              <p className="text-sm text-slate-500 mb-6">
                Subí uno o varios archivos .csv (misma estructura). Al procesar, se busca cada
                &quot;Numero&quot; en la base y se reemplaza toda su información por la del archivo nuevo.
              </p>

              <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
                <input
                  ref={inputRemanentesRef}
                  type="file"
                  accept=".csv"
                  multiple
                  className="hidden"
                  onChange={(e) => setArchivosRemanentes(Array.from(e.target.files ?? []))}
                />
                <button
                  onClick={() => inputRemanentesRef.current?.click()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  Seleccionar archivos .csv
                </button>
                {archivosRemanentes.length > 0 && (
                  <p className="text-sm text-emerald-600 font-medium mt-3">
                    {archivosRemanentes.length === 1
                      ? "1 archivo adjuntado"
                      : `${archivosRemanentes.length} archivos adjuntados`}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={handleProcesarRemanentes}
                  disabled={archivosRemanentes.length === 0 || isProcesandoRemanentes}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    archivosRemanentes.length === 0 || isProcesandoRemanentes
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isProcesandoRemanentes ? "Procesando..." : "Procesar"}
                </button>
                <button
                  onClick={resetRemanentes}
                  disabled={isProcesandoRemanentes}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Limpiar
                </button>
              </div>

              {/* --- BARRA DE PROGRESO --- */}
              {isProcesandoRemanentes && (
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Procesando datos...</span>
                    <span className="font-semibold text-slate-700">{progresoRemanentes}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progresoRemanentes}%` }}
                    />
                  </div>
                </div>
              )}

              {errorRemanentes && (
                <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {errorRemanentes}
                </div>
              )}

              {resultadoRemanentes && !errorRemanentes && (
                <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                  {resultadoRemanentes.filasInsertadas} filas cargadas correctamente. Actualizando la app...
                </div>
              )}
            </div>
          )}

          {/* ================= PESTAÑA: REMANENTES - RESUMEN ================= */}
          {activeTab === "REM-Resumen" && (
            <div className="space-y-6">
              {/* --- TABLA DE DETALLE POR MARCA / ARCHIVO --- */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <h2 className="text-lg font-bold text-slate-800">Detalle por Marca / Archivo</h2>
                  {remDetalleData && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(remDetalleData.updatedAt)}</span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-slate-500 mb-4">Hacé click en un archivo para ver el desglose por grupo</p>

                {/* FILTROS */}
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                  <select
                    value={filtroMarcaREM}
                    onChange={(e) => setFiltroMarcaREM(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas las marcas</option>
                    {marcasDisponiblesREM.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>

                  <select
                    value={filtroTemporadaREM}
                    onChange={(e) => setFiltroTemporadaREM(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas las temporadas</option>
                    {temporadasDisponiblesREM.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>

                  <select
                    value={filtroGrupoREM}
                    onChange={(e) => setFiltroGrupoREM(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="TODAS">Todos los grupos</option>
                    {gruposDisponiblesREM.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      setFiltroMarcaREM("TODAS");
                      setFiltroTemporadaREM("TODAS");
                      setFiltroGrupoREM("TODAS");
                    }}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Limpiar filtros
                  </button>
                </div>

                {remDetalleError && (
                  <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    Error al cargar el detalle: {remDetalleError}
                  </div>
                )}
                {remDetalleLoading && !remDetalleData && (
                  <div className="mb-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                    Cargando datos de remanentes...
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead>
                      {filasTablaREM.length > 0 && (
                        <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                          <td className="py-3 px-4 text-left" colSpan={2}>
                            Subtotal
                            {filtroMarcaREM !== "TODAS" ? ` — ${filtroMarcaREM}` : " — Todas las marcas"}
                            {filtroTemporadaREM !== "TODAS" ? ` — ${filtroTemporadaREM}` : ""}
                            {filtroGrupoREM !== "TODAS" ? ` — ${filtroGrupoREM}` : ""}
                          </td>
                          <td className="py-3 px-4 text-left">{fmtNum(subtotalREMCalculado.pedidas)}</td>
                          <td className="py-3 px-4 text-left">{fmtNum(subtotalREMCalculado.distribuidas)}</td>
                          <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(subtotalREMCalculado.aRepartir)}</td>
                          <td className="py-3 px-4 text-left">{fmtPct(subtotalREMCalculado.completitud)}</td>
                        </tr>
                      )}
                      <tr className="text-slate-500 font-medium border-b border-slate-200">
                        <th className="py-3 px-4 text-left">Marca</th>
                        <th className="py-3 px-4 text-left">Archivo</th>
                        <th className="py-3 px-4 text-left">Unidades Pedidas</th>
                        <th className="py-3 px-4 text-left">Unidades Distribuidas</th>
                        <th className="py-3 px-4 text-left">Unidades a Repartir</th>
                        <th className="py-3 px-4 text-left">% Completitud</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filasTablaREM.map((row, i) => {
                        const estaExpandida =
                          filaExpandidaREM?.marca === row.marca && filaExpandidaREM?.archivo === row.archivo;
                        return (
                        <>
                          <tr
                            key={`${row.marca}-${row.archivo}-${i}`}
                            onClick={() => handleFilaClickREM(row.marca, row.archivo)}
                            className={`cursor-pointer transition-colors ${
                              estaExpandida ? "bg-slate-100" : "hover:bg-slate-50"
                            }`}
                          >
                            <td className="py-3 px-4 text-left font-bold text-slate-900">{row.marca}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{row.archivo}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.pedidas)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.distribuidas)}</td>
                            <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(row.aRepartir)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtPct(row.completitud)}</td>
                          </tr>

                          {estaExpandida && (
                              <tr>
                                <td colSpan={6} className="bg-slate-50 px-4 py-4">
                                  <p className="text-xs font-semibold text-slate-500 mb-2">
                                    Desglose por grupo — {row.marca} / {row.archivo}
                                  </p>
                                  <table className="w-full text-sm text-left bg-white rounded-lg overflow-hidden border border-slate-200">
                                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                                      <tr>
                                        <th className="py-2 px-3 text-left">Grupo</th>
                                        <th className="py-2 px-3 text-left">Unidades Pedidas</th>
                                        <th className="py-2 px-3 text-left">Unidades Distribuidas</th>
                                        <th className="py-2 px-3 text-left">Unidades a Repartir</th>
                                        <th className="py-2 px-3 text-left">% Completitud</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {desgloseGrupoREM.map((g, gi) => (
                                        <tr key={gi}>
                                          <td className="py-2 px-3 text-left font-medium text-slate-700">{g.grupo}</td>
                                          <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.pedidas)}</td>
                                          <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.distribuidas)}</td>
                                          <td className="py-2 px-3 text-left font-semibold text-orange-500">{fmtNum(g.aRepartir)}</td>
                                          <td className="py-2 px-3 text-left text-slate-600">{fmtPct(g.completitud)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                        </>
                        );
                      })}
                    </tbody>
                  </table>
                  {filasTablaREM.length === 0 && !remDetalleLoading && (
                    <p className="text-sm text-slate-400 text-center py-8">No hay datos que coincidan con los filtros aplicados.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: REMANENTES - AVANCE PLAN ================= */}
          {activeTab === "REM-Avance" && (
            <div className="space-y-6">
              {avancePlanRemError && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el avance del plan: {avancePlanRemError}
                </div>
              )}
              {avancePlanRemLoading && !avancePlanRemData && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                  Cargando avance del plan...
                </div>
              )}

              {!avancePlanRemLoading && avancePlanRemData && !avancePlanRemData.plan && (
                <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-2xl text-center">
                  <p className="text-sm text-slate-500 mb-4">
                    Todavía no se cargó el plan de remanentes. Cargalo en la subsección &quot;Carga Datos&quot; para ver el avance acá.
                  </p>
                  <button
                    onClick={() => irA("REM-Carga")}
                    className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Ir a Carga Datos
                  </button>
                </div>
              )}

              {avancePlanRemData?.plan && avancePlanRemData.tabla && avancePlanRemData.tarjetas && (
                <>
                  {/* --- TABLA: DETALLE DEL PLAN --- */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Detalle del plan</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead>
                          <tr className="text-slate-500 font-medium border-b border-slate-200">
                            <th className="py-3 px-4 text-left">
                              Total a procesar al {fmtSoloFecha(avancePlanRemData.tarjetas.fechaFin)}
                            </th>
                            <th className="py-3 px-4 text-left">Proceso inicial</th>
                            <th className="py-3 px-4 text-left">
                              Para procesar a partir del {fmtSoloFecha(avancePlanRemData.tarjetas.fechaInicio)}
                            </th>
                            <th className="py-3 px-4 text-left">Días hábiles¹</th>
                            <th className="py-3 px-4 text-left">Necesidad por día²</th>
                            <th className="py-3 px-4 text-left">Producción actual³</th>
                            <th className="py-3 px-4 text-left">Diferencia⁴</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="py-3 px-4 text-left font-semibold text-slate-900">{fmtNum(avancePlanRemData.tabla.totalAProcesar)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanRemData.tabla.procesoInicial)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanRemData.tabla.paraProcesar)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanRemData.tabla.diasHabilesPlan)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanRemData.tabla.necesidadPorDia)}</td>
                            <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanRemData.tabla.produccionActual)}</td>
                            <td
                              className={`py-3 px-4 text-left font-semibold ${
                                avancePlanRemData.tabla.diferencia >= 0 ? "text-emerald-600" : "text-red-600"
                              }`}
                            >
                              {fmtNum(avancePlanRemData.tabla.diferencia)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 space-y-1 text-xs text-slate-400">
                      <p>¹ Días hábiles entre la fecha inicio y la fecha fin de plan.</p>
                      <p>² Para procesar a partir del inicio de plan / Días hábiles.</p>
                      <p>
                        ³ Promedio de los datos de remanentes del reporte de producción por proceso, desde la fecha inicio de plan hasta
                        hoy (o hasta la fecha fin de plan si ya finalizó). Solo se promedia sobre los días hábiles ya transcurridos; los
                        datos cargados en un día no hábil no se consideran para este cálculo.
                      </p>
                      <p>⁴ Diferencia entre la necesidad por día y la producción actual.</p>
                      <p>
                        El &quot;Total a procesar&quot; es la suma de Unidades Target (Unidades Pedidas x Target %) de todas las
                        marcas y grupos cargados en Remanentes (ver subsección Resumen).
                      </p>
                    </div>
                  </div>

                  {/* --- TARJETAS DE SEGUIMIENTO --- */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">Fecha inicio / fin de plan</p>
                      <p className="text-lg font-bold text-slate-800">
                        {fmtSoloFecha(avancePlanRemData.tarjetas.fechaInicio)} — {fmtSoloFecha(avancePlanRemData.tarjetas.fechaFin)}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">Días hábiles transcurridos</p>
                      <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanRemData.tarjetas.diasHabilesTranscurridos)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">Avance ideal</p>
                      <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanRemData.tarjetas.avanceIdeal)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">Avance real</p>
                      <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanRemData.tarjetas.avanceReal)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">% Avance real</p>
                      <p className="text-2xl font-bold text-blue-600">{fmtPct(avancePlanRemData.tarjetas.pctAvance)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 mb-2">Unidades pendientes</p>
                      <p
                        className={`text-2xl font-bold ${
                          avancePlanRemData.tarjetas.unidadesPendientes > 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {fmtNum(avancePlanRemData.tarjetas.unidadesPendientes)}
                      </p>
                    </div>
                  </div>

                  {/* --- TABLA DE RESUMEN POR MARCA / GRUPO (con Unidades Target) --- */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-1">Resumen por Marca / Grupo</h2>
                    <p className="text-sm text-slate-500 mb-4">
                      Unidades Target = Unidades Pedidas x Target ({fmtPct(targetPctREM)}) cargado en Carga Datos.
                    </p>

                    {/* FILTROS */}
                    <div className="flex items-center gap-3 mb-6 flex-wrap">
                      <select
                        value={filtroMarcaResumenREM}
                        onChange={(e) => setFiltroMarcaResumenREM(e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="TODAS">Todas las marcas</option>
                        {marcasDisponiblesREM.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>

                      <select
                        value={filtroGrupoResumenREM}
                        onChange={(e) => setFiltroGrupoResumenREM(e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="TODAS">Todos los grupos</option>
                        {gruposDisponiblesREM.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>

                      <button
                        onClick={() => {
                          setFiltroMarcaResumenREM("TODAS");
                          setFiltroGrupoResumenREM("TODAS");
                        }}
                        className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        Limpiar filtros
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead>
                          {filasTablaResumenMarcaGrupoREM.length > 0 && (
                            <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                              <td className="py-3 px-4 text-left" colSpan={2}>
                                Subtotal
                                {filtroMarcaResumenREM !== "TODAS" ? ` — ${filtroMarcaResumenREM}` : " — Todas las marcas"}
                                {filtroGrupoResumenREM !== "TODAS" ? ` — ${filtroGrupoResumenREM}` : ""}
                              </td>
                              <td className="py-3 px-4 text-left">{fmtNum(subtotalResumenMarcaGrupoREMCalculado.pedidas)}</td>
                              <td className="py-3 px-4 text-left">{fmtNum(subtotalResumenMarcaGrupoREMCalculado.unidadesTarget)}</td>
                              <td className="py-3 px-4 text-left">{fmtNum(subtotalResumenMarcaGrupoREMCalculado.distribuidas)}</td>
                              <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(subtotalResumenMarcaGrupoREMCalculado.aRepartir)}</td>
                              <td className="py-3 px-4 text-left">{fmtPct(subtotalResumenMarcaGrupoREMCalculado.pctAvance)}</td>
                            </tr>
                          )}
                          <tr className="text-slate-500 font-medium border-b border-slate-200">
                            <th className="py-3 px-4 text-left">Marca</th>
                            <th className="py-3 px-4 text-left">Grupo</th>
                            <th className="py-3 px-4 text-left">Unidades Pedidas</th>
                            <th className="py-3 px-4 text-left">Unidades Target</th>
                            <th className="py-3 px-4 text-left">Unidades Distribuidas</th>
                            <th className="py-3 px-4 text-left">Unidades a Repartir</th>
                            <th className="py-3 px-4 text-left">% Avance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filasTablaResumenMarcaGrupoREM.map((row, i) => (
                            <tr key={`${row.marca}-${row.grupo}-${i}`} className="hover:bg-slate-50">
                              <td className="py-3 px-4 text-left font-bold text-slate-900">{row.marca}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{row.grupo}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.pedidas)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.unidadesTarget)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.distribuidas)}</td>
                              <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(row.aRepartir)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtPct(row.pctAvance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filasTablaResumenMarcaGrupoREM.length === 0 && !remDetalleLoading && (
                        <p className="text-sm text-slate-400 text-center py-8">No hay datos que coincidan con los filtros aplicados.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ================= PESTAÑA: REMANENTES - CARGA DATOS ================= */}
          {activeTab === "REM-Carga" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-2xl">
              <h2 className="text-xl font-bold text-slate-800 mb-1">Carga Datos — Plan de Remanentes</h2>
              <p className="text-sm text-slate-500 mb-6">
                Estos datos alimentan el cálculo de la subsección &quot;Avance Plan&quot;. El &quot;Total a procesar&quot; ya no se
                carga a mano: se calcula automáticamente en base a los datos de la subsección &quot;Resumen&quot; (Unidades Pedidas x
                Target de cada marca y grupo).
              </p>

              {planRemanentesError && (
                <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{planRemanentesError}</div>
              )}
              {planRemanentesLoading && !planRemanentes && (
                <div className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">Cargando plan...</div>
              )}

              {(!planRemanentes || editandoPlanRemanentes) ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Fecha inicio de plan</label>
                    <input
                      type="date"
                      value={formPlanRemFechaInicio}
                      onChange={(e) => setFormPlanRemFechaInicio(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Fecha fin de plan</label>
                    <input
                      type="date"
                      value={formPlanRemFechaFin}
                      onChange={(e) => setFormPlanRemFechaFin(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Target (%)</label>
                    <input
                      type="number"
                      min={0}
                      value={formPlanRemTarget}
                      onChange={(e) => setFormPlanRemTarget(e.target.value)}
                      placeholder="Ej: 85"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Proceso inicial</label>
                    <input
                      type="number"
                      min={0}
                      value={formPlanRemProcesoInicial}
                      onChange={(e) => setFormPlanRemProcesoInicial(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={guardarPlanRemanentes}
                      disabled={!planRemanentesFormValido || guardandoPlanRemanentes}
                      className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                        !planRemanentesFormValido || guardandoPlanRemanentes
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {guardandoPlanRemanentes ? "Guardando..." : "Confirmar datos"}
                    </button>
                    {planRemanentes && (
                      <button
                        onClick={cancelarEdicionPlanRemanentes}
                        disabled={guardandoPlanRemanentes}
                        className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <dt className="text-xs font-medium text-slate-400 mb-1">Fecha inicio de plan</dt>
                      <dd className="text-sm font-semibold text-slate-800">{fmtSoloFecha(planRemanentes.fecha_inicio)}</dd>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <dt className="text-xs font-medium text-slate-400 mb-1">Fecha fin de plan</dt>
                      <dd className="text-sm font-semibold text-slate-800">{fmtSoloFecha(planRemanentes.fecha_fin)}</dd>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <dt className="text-xs font-medium text-slate-400 mb-1">Target</dt>
                      <dd className="text-sm font-semibold text-slate-800">{fmtPct(planRemanentes.target)}</dd>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <dt className="text-xs font-medium text-slate-400 mb-1">Proceso inicial</dt>
                      <dd className="text-sm font-semibold text-slate-800">{fmtNum(planRemanentes.proceso_inicial)}</dd>
                    </div>
                  </dl>
                  <button
                    onClick={() => setEditandoPlanRemanentes(true)}
                    className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    Modificar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ================= PESTAÑA: ADMIN - PERFILES ================= */}
          {activeTab === "ADMIN-Perfiles" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Perfiles</h2>
                {perfilesAdminError && (
                  <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{perfilesAdminError}</div>
                )}
                {perfilesAdminLoading && perfilesAdmin.length === 0 && (
                  <p className="text-sm text-slate-400">Cargando...</p>
                )}
                <div className="space-y-1 mb-4">
                  {perfilesAdmin.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => seleccionarPerfil(p)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        perfilSeleccionadoId === p.id ? "bg-blue-50 text-blue-700 font-semibold border border-blue-200" : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      {p.nombre}
                      <span className="block text-xs text-slate-400">{p.permisos.length} subsecciones habilitadas</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => seleccionarPerfil(null)}
                  className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  + Nuevo perfil
                </button>
              </div>

              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-4">
                  {perfilSeleccionadoId ? "Editar perfil" : "Nuevo perfil"}
                </h2>

                <label className="block text-sm font-medium text-slate-600 mb-1">Nombre</label>
                <input
                  type="text"
                  value={formPerfilNombre}
                  onChange={(e) => setFormPerfilNombre(e.target.value)}
                  placeholder="Ej: Supervisor Logística"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm mb-6 focus:ring-2 focus:ring-blue-500 outline-none"
                />

                <p className="text-sm font-medium text-slate-600 mb-3">Secciones y subsecciones habilitadas</p>
                <div className="space-y-4 mb-6">
                  {REGISTRO_SECCIONES.map((seccion) => (
                    <div key={seccion.nombre}>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{seccion.nombre}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {seccion.subsecciones.map((sub) => (
                          <label key={sub.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formPerfilPermisos.includes(sub.key)}
                              onChange={() => toggleFormPermiso(sub.key)}
                              className="rounded border-slate-300"
                            />
                            {sub.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={guardarPerfil}
                    disabled={!formPerfilNombre.trim() || guardandoPerfil}
                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      !formPerfilNombre.trim() || guardandoPerfil
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {guardandoPerfil ? "Guardando..." : perfilSeleccionadoId ? "Guardar cambios" : "Crear perfil"}
                  </button>
                  {perfilSeleccionadoId && (
                    <button
                      onClick={() => eliminarPerfil(perfilSeleccionadoId)}
                      className="px-5 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Eliminar perfil
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: ADMIN - USUARIOS ================= */}
          {activeTab === "ADMIN-Usuarios" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Nuevo usuario</h2>
                {usuariosAdminError && (
                  <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{usuariosAdminError}</div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <input
                    type="email"
                    placeholder="Email"
                    value={formUsuarioEmail}
                    onChange={(e) => setFormUsuarioEmail(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Contraseña"
                    value={formUsuarioPassword}
                    onChange={(e) => setFormUsuarioPassword(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Nombre (opcional)"
                    value={formUsuarioNombre}
                    onChange={(e) => setFormUsuarioNombre(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <select
                    value={formUsuarioPerfilId}
                    onChange={(e) => setFormUsuarioPerfilId(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Sin perfil</option>
                    {perfilesAdmin.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={crearUsuario}
                  disabled={!formUsuarioEmail.trim() || !formUsuarioPassword || creandoUsuario}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    !formUsuarioEmail.trim() || !formUsuarioPassword || creandoUsuario
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {creandoUsuario ? "Creando..." : "Crear usuario"}
                </button>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Usuarios</h2>
                {usuariosAdminLoading && usuariosAdmin.length === 0 && <p className="text-sm text-slate-400">Cargando...</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-left">Email</th>
                        <th className="py-3 px-4 text-left">Nombre</th>
                        <th className="py-3 px-4 text-left">Perfil</th>
                        <th className="py-3 px-4 text-left">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {usuariosAdmin.map((u) => (
                        <tr key={u.id}>
                          <td className="py-3 px-4 text-left text-slate-800 font-medium">{u.email}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{u.nombre || "—"}</td>
                          <td className="py-3 px-4 text-left">
                            <select
                              value={u.perfilId || ""}
                              onChange={(e) => cambiarPerfilUsuario(u.id, e.target.value)}
                              className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                              <option value="">Sin perfil</option>
                              {perfilesAdmin.map((p) => (
                                <option key={p.id} value={p.id}>{p.nombre}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4 text-left">
                            <button
                              onClick={() => eliminarUsuario(u.id)}
                              className="text-sm text-red-600 hover:underline"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {usuariosAdmin.length === 0 && !usuariosAdminLoading && (
                    <p className="text-sm text-slate-400 text-center py-8">No hay usuarios cargados todavía.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: ADMIN - ACCESOS ================= */}
          {activeTab === "ADMIN-Accesos" && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Log de Accesos</h2>
              {accesosAdminError && (
                <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{accesosAdminError}</div>
              )}
              {accesosAdminLoading && accesosAdmin.length === 0 && <p className="text-sm text-slate-400">Cargando...</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 text-left">Fecha y hora</th>
                      <th className="py-3 px-4 text-left">Usuario</th>
                      <th className="py-3 px-4 text-left">Sección / Subsección</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {accesosAdmin.map((a) => (
                      <tr key={a.id}>
                        <td className="py-3 px-4 text-left text-slate-600">{fmtFecha(a.fechaHora)}</td>
                        <td className="py-3 px-4 text-left text-slate-800 font-medium">{a.usuarioNombre || a.usuarioEmail}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{labelSubseccion(a.subseccionKey)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {accesosAdmin.length === 0 && !accesosAdminLoading && (
                  <p className="text-sm text-slate-400 text-center py-8">Todavía no hay accesos registrados.</p>
                )}
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: ADMIN - FERIADOS ================= */}
          {activeTab === "ADMIN-Feriados" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Nuevo feriado / fecha no laboral</h2>
                {feriadosAdminError && (
                  <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{feriadosAdminError}</div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                  <input
                    type="date"
                    value={formFeriadoFecha}
                    onChange={(e) => setFormFeriadoFecha(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Descripción (opcional, ej: Día de la Independencia)"
                    value={formFeriadoDescripcion}
                    onChange={(e) => setFormFeriadoDescripcion(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none sm:col-span-2"
                  />
                </div>
                <button
                  onClick={crearFeriado}
                  disabled={!formFeriadoFecha || creandoFeriado}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    !formFeriadoFecha || creandoFeriado
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {creandoFeriado ? "Guardando..." : "Agregar feriado"}
                </button>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Feriados cargados</h2>
                {feriadosAdminLoading && feriadosAdmin.length === 0 && <p className="text-sm text-slate-400">Cargando...</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-left">Fecha</th>
                        <th className="py-3 px-4 text-left">Descripción</th>
                        <th className="py-3 px-4 text-left">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {feriadosAdmin.map((f) => (
                        <tr key={f.id}>
                          <td className="py-3 px-4 text-left text-slate-800 font-medium">
                            {new Date(`${f.fecha}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </td>
                          <td className="py-3 px-4 text-left text-slate-600">{f.descripcion || "—"}</td>
                          <td className="py-3 px-4 text-left">
                            <button onClick={() => eliminarFeriado(f.id)} className="text-sm text-red-600 hover:underline">
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {feriadosAdmin.length === 0 && !feriadosAdminLoading && (
                    <p className="text-sm text-slate-400 text-center py-8">No hay feriados cargados todavía.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑAS EN DESARROLLO ================= */}
          {!["Resumen", "Por fecha", "Por pedidos", "Importar datos", "CI-Importar", "CI-Resumen", "CI-Avance", "CI-Carga", "REM-Importar", "REM-Resumen", "REM-Avance", "REM-Carga", "PROD-Importar", "PROD-Resumen", "INB-Importar", "INB-Resumen", "ADMIN-Perfiles", "ADMIN-Usuarios", "ADMIN-Accesos", "ADMIN-Feriados"].includes(activeTab) && (
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