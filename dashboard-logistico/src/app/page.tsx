"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsvFile, parseExcelFile, parseExcelFileConFechas, parseOcupacionAlmacenStreaming } from "@/lib/fileParsers";
import { createClient as createBrowserAuthClient } from "@/lib/supabase/client";
import { REGISTRO_SECCIONES } from "@/lib/secciones";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonCard, SkeletonTable } from "@/components/Skeleton";
import ActualizarAgenteBoton from "@/components/ActualizarAgenteBoton";
import AgenteTokenPanel from "@/components/AgenteTokenPanel";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import {
  fmtNum,
  fmtPct,
  fmtFecha,
  fmtSoloFecha,
  semanasDelAnio,
  type SemanaDelMes,
} from "@/components/dashboard/formatters";
import EcomResumen from "@/components/sections/ecom/EcomResumen";
import EcomImportar from "@/components/sections/ecom/EcomImportar";
import EcomPorFecha from "@/components/sections/ecom/EcomPorFecha";
import EcomPorPedidos from "@/components/sections/ecom/EcomPorPedidos";
import Resumen from "@/components/sections/statusPrep/Resumen";
import Importar from "@/components/sections/statusPrep/Importar";
import PorFecha from "@/components/sections/statusPrep/PorFecha";
import PorPedidos from "@/components/sections/statusPrep/PorPedidos";
import RemaManual from "@/components/sections/statusPrep/RemaManual";
import ProdImportar from "@/components/sections/produccion/ProdImportar";
import ProdResumen from "@/components/sections/produccion/ProdResumen";
import AdminPerfiles from "@/components/sections/admin/AdminPerfiles";
import AdminUsuarios from "@/components/sections/admin/AdminUsuarios";
import AdminAccesos from "@/components/sections/admin/AdminAccesos";
import AdminFeriados from "@/components/sections/admin/AdminFeriados";
import AdminConfiguracion from "@/components/sections/admin/AdminConfiguracion";
import AlmImportar from "@/components/sections/almacen/AlmImportar";
import AlmResumen from "@/components/sections/almacen/AlmResumen";
import AlmConfiguracion from "@/components/sections/almacen/AlmConfiguracion";
import CIImportar from "@/components/sections/cargaInicial/CIImportar";
import CIResumen from "@/components/sections/cargaInicial/CIResumen";
import CIAvance from "@/components/sections/cargaInicial/CIAvance";
import CICarga from "@/components/sections/cargaInicial/CICarga";
import RemImportar from "@/components/sections/remanentes/RemImportar";
import RemResumen from "@/components/sections/remanentes/RemResumen";
import RemAvance from "@/components/sections/remanentes/RemAvance";
import RemCarga from "@/components/sections/remanentes/RemCarga";
import PDImportar from "@/components/sections/pendienteDespacho/PDImportar";
import PDClientes from "@/components/sections/pendienteDespacho/PDClientes";
import PDPropios from "@/components/sections/pendienteDespacho/PDPropios";
import PDUrgencias from "@/components/sections/pendienteDespacho/PDUrgencias";
import PDCargaDatos from "@/components/sections/pendienteDespacho/PDCargaDatos";
import INBImportar from "@/components/sections/inbound/INBImportar";
import INBResumen from "@/components/sections/inbound/INBResumen";
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
          // Perfil dedicado exclusivamente a uno de los dos escáneres
          // (handheld o celular) -- lo mandamos directo ahí en vez del
          // Tablero completo, que no entra bien en una pantalla chica.
          // Cubre el caso de sesión ya guardada que entra directo a "/" sin
          // pasar por /login.
          const subsecciones: string[] = data.subsecciones || [];
          if (subsecciones.length === 1 && subsecciones[0] === "EXP-Escaner") {
            router.replace("/hoja-ruta/escaner");
            return;
          }
          if (subsecciones.length === 1 && subsecciones[0] === "EXP-EscanerCelular") {
            router.replace("/hoja-ruta/escaner-celular");
            return;
          }
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

  // Claves de las subsecciones de Status de Preparación (No Ecom / Ecom) --
  // se declaran acá arriba (y no más abajo junto al resto de *SubSections)
  // porque hacen falta para decidir, ya en el estado inicial del sidebar, si
  // esta sección debe arrancar abierta o cerrada.
  const prepNoEcomSubSections = ["Importar datos", "Resumen", "Por fecha", "Por pedidos", "REMA Manual"];
  const prepEcomSubSectionKeys = ["ECOM-Importar", "ECOM-Resumen", "ECOM-PorFecha", "ECOM-PorPedidos"];

  // Estados de navegación del Sidebar
  // Igual que el resto de las secciones (CI/REM/PROD/PD/INB/ALM/ADMIN):
  // arranca abierta solo si la pestaña de destino (guardada antes de un
  // reload tras un import, o la de aterrizaje por defecto) es de esta
  // sección -- si el import fue de OTRA sección, Status de Preparación debe
  // quedar cerrada, no abierta "porque sí".
  const [isPrepOpen, setIsPrepOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const tab = sessionStorage.getItem("tabDespuesDeRefresh") || "";
    if (!tab) return true; // sin flag guardada -> aterrizaje por defecto en "Resumen"
    return prepNoEcomSubSections.includes(tab) || prepEcomSubSectionKeys.includes(tab);
  });
  // Solo se abre automáticamente el subgrupo (No Ecom / Ecom) que corresponde
  // a la pestaña actual -- no los dos juntos.
  const [isPrepNoEcomOpen, setIsPrepNoEcomOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const tab = sessionStorage.getItem("tabDespuesDeRefresh") || "";
    if (!tab) return true;
    return prepNoEcomSubSections.includes(tab);
  });
  const [isPrepEcomOpen, setIsPrepEcomOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const tab = sessionStorage.getItem("tabDespuesDeRefresh") || "";
    return prepEcomSubSectionKeys.includes(tab);
  });

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
  const [isPendienteDespachoOpen, setIsPendienteDespachoOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (sessionStorage.getItem("tabDespuesDeRefresh") || "").startsWith("PD-");
  });
  const [isDespachoOpen, setIsDespachoOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (sessionStorage.getItem("tabDespuesDeRefresh") || "").startsWith("DESP-");
  });
  const [isInboundOpen, setIsInboundOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (sessionStorage.getItem("tabDespuesDeRefresh") || "").startsWith("INB-");
  });
  const [isAlmacenOpen, setIsAlmacenOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (sessionStorage.getItem("tabDespuesDeRefresh") || "").startsWith("ALM-");
  });
  const [isExpedicionOpen, setIsExpedicionOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (sessionStorage.getItem("tabDespuesDeRefresh") || "").startsWith("EXP-");
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


  const prepEcomSubSections = [
    { key: "ECOM-Importar", label: "Importar Datos" },
    { key: "ECOM-Resumen", label: "Resumen" },
    { key: "ECOM-PorFecha", label: "Por Fecha" },
    { key: "ECOM-PorPedidos", label: "Por Pedidos" },
  ];

  // Mantiene abierto solo el subgrupo (No Ecom / Ecom) de la pestaña activa
  // -- así, al terminar un import (que cambia activeTab a "Resumen" o
  // "ECOM-Resumen") o al navegar manualmente, se abre nada más el que
  // corresponde en vez de los dos juntos.
  useEffect(() => {
    if (prepNoEcomSubSections.includes(activeTab)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPrepNoEcomOpen(true);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPrepEcomOpen(false);
    } else if (prepEcomSubSections.some((s) => s.key === activeTab)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPrepEcomOpen(true);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPrepNoEcomOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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

  const pendienteDespachoSubSections = [
    { key: "PD-Importar", label: "Importar Datos" },
    { key: "PD-Clientes", label: "Clientes" },
    { key: "PD-Propios", label: "Propios" },
    { key: "PD-Urgencias", label: "Seguimiento Urgencias" },
    { key: "PD-CargaDatos", label: "Carga de Datos" },
  ];

  const despachoSubSections = [
    { key: "DESP-Imprimir", label: "Para Imprimir" },
    { key: "DESP-Reimprimir", label: "Guías Impresas" },
    { key: "DESP-Grupos", label: "Grupos de Clientes (Admin)" },
    { key: "DESP-SkuInsumos", label: "SKU de Insumos (Admin)" },
  ];

  interface DespachoGuiaFila {
    despacho_cab_id: number;
    guia: string | null;
    numero_guia: string | null;
    numero_comprobante: string | null;
    tipo: string | null;
    cliente: string | null;
    transporte: string | null;
    estado_wms: string | null;
    fecha_creacion: string | null;
    cajas: number | null;
    unidades: number | null;
    zona: string | null;
    patente: string | null;
    guia_impresa: boolean;
    guia_impresa_en: string | null;
    guia_impresa_por_nombre: string | null;
    remito_impreso: boolean;
    remito_impreso_en: string | null;
    remito_impreso_por_nombre: string | null;
    bultos_insumos: number | null;
    bultos_producto: number | null;
    grupos: string[];
  }

  function filasDespachoFiltradas(
    filas: DespachoGuiaFila[],
    filtroCliente: string,
    filtroTipo: string,
    filtroGrupo: string
  ): DespachoGuiaFila[] {
    return filas.filter((f) => {
      if (filtroCliente && !(f.cliente || "").toLowerCase().includes(filtroCliente.toLowerCase())) return false;
      if (filtroTipo !== "TODOS" && (f.tipo || "SIN TIPO") !== filtroTipo) return false;
      if (filtroGrupo !== "TODOS" && !(f.grupos.length > 0 ? f.grupos : ["SIN GRUPO"]).includes(filtroGrupo)) return false;
      return true;
    });
  }

  const [despachoImprimiendoEnCurso, setDespachoImprimiendoEnCurso] = useState(false);
  const {
    data: despachoImprimirData,
    error: despachoImprimirError,
    isLoading: despachoImprimirLoading,
  } = useTabData<{ filas: DespachoGuiaFila[]; updatedAt: string | null }>(
    activeTab,
    "DESP-Imprimir",
    "/api/despacho/guias?vista=imprimir",
    dataVersion,
    { refreshInterval: despachoImprimiendoEnCurso ? 3000 : 0 }
  );
  const [despachoImprimirSeleccion, setDespachoImprimirSeleccion] = useState<Set<number>>(new Set());
  const toggleDespachoImprimirFila = (id: number) => {
    setDespachoImprimirSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [filtroClienteImprimir, setFiltroClienteImprimir] = useState("");
  const [filtroTipoImprimir, setFiltroTipoImprimir] = useState("TODOS");
  const [filtroGrupoImprimir, setFiltroGrupoImprimir] = useState("TODOS");
  const tiposDisponiblesImprimir = [...new Set((despachoImprimirData?.filas || []).map((f) => f.tipo || "SIN TIPO"))].sort();
  const gruposDisponiblesImprimir = [
    ...new Set((despachoImprimirData?.filas || []).flatMap((f) => (f.grupos.length > 0 ? f.grupos : ["SIN GRUPO"]))),
  ].sort();
  const filasFiltradasImprimir = filasDespachoFiltradas(
    despachoImprimirData?.filas || [],
    filtroClienteImprimir,
    filtroTipoImprimir,
    filtroGrupoImprimir
  );
  const toggleDespachoImprimirTodas = () => {
    setDespachoImprimirSeleccion((prev) =>
      prev.size === filasFiltradasImprimir.length
        ? new Set()
        : new Set(filasFiltradasImprimir.map((f) => f.despacho_cab_id))
    );
  };
  const [marcandoManualImprimir, setMarcandoManualImprimir] = useState(false);
  const marcarSeleccionadasComoImpresas = async () => {
    if (despachoImprimirSeleccion.size === 0) return;
    if (
      !confirm(
        `¿Marcar ${despachoImprimirSeleccion.size} guía(s) como ya impresas manualmente? ` +
          `Se van a mover a "Guías Impresas" sin pasar por el Agente Local.`
      )
    ) {
      return;
    }
    setMarcandoManualImprimir(true);
    try {
      const guias = (despachoImprimirData?.filas || [])
        .filter((f) => despachoImprimirSeleccion.has(f.despacho_cab_id))
        .map((f) => ({ despachoCabId: f.despacho_cab_id, guia: f.guia }));
      const res = await fetch("/api/admin/despacho-guias/marcar-impresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guias }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error inesperado");
      setDataVersion((v) => v + 1);
      setDespachoImprimirSeleccion(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error inesperado marcando las guías como impresas.");
    } finally {
      setMarcandoManualImprimir(false);
    }
  };

  const [despachoReimprimiendoEnCurso, setDespachoReimprimiendoEnCurso] = useState(false);
  const {
    data: despachoReimprimirData,
    error: despachoReimprimirError,
    isLoading: despachoReimprimirLoading,
  } = useTabData<{ filas: DespachoGuiaFila[]; updatedAt: string | null }>(
    activeTab,
    "DESP-Reimprimir",
    "/api/despacho/guias?vista=reimprimir",
    dataVersion,
    { refreshInterval: despachoReimprimiendoEnCurso ? 3000 : 0 }
  );
  const [despachoReimprimirSeleccion, setDespachoReimprimirSeleccion] = useState<Set<number>>(new Set());
  const [despachoReimprimirDocumentos, setDespachoReimprimirDocumentos] = useState<"ambos" | "guia" | "remito">("ambos");
  const toggleDespachoReimprimirFila = (id: number) => {
    setDespachoReimprimirSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [filtroClienteReimprimir, setFiltroClienteReimprimir] = useState("");
  const [filtroTipoReimprimir, setFiltroTipoReimprimir] = useState("TODOS");
  const [filtroGrupoReimprimir, setFiltroGrupoReimprimir] = useState("TODOS");
  const tiposDisponiblesReimprimir = [...new Set((despachoReimprimirData?.filas || []).map((f) => f.tipo || "SIN TIPO"))].sort();
  const gruposDisponiblesReimprimir = [
    ...new Set((despachoReimprimirData?.filas || []).flatMap((f) => (f.grupos.length > 0 ? f.grupos : ["SIN GRUPO"]))),
  ].sort();
  const filasFiltradasReimprimir = filasDespachoFiltradas(
    despachoReimprimirData?.filas || [],
    filtroClienteReimprimir,
    filtroTipoReimprimir,
    filtroGrupoReimprimir
  );
  const toggleDespachoReimprimirTodas = () => {
    setDespachoReimprimirSeleccion((prev) =>
      prev.size === filasFiltradasReimprimir.length
        ? new Set()
        : new Set(filasFiltradasReimprimir.map((f) => f.despacho_cab_id))
    );
  };

  interface DespachoGrupoMiembro {
    codigoCliente: string;
    nombre: string | null;
  }
  interface DespachoGrupo {
    id: number;
    nombre: string;
    miembros: DespachoGrupoMiembro[];
  }
  const [despachoGrupos, setDespachoGrupos] = useState<DespachoGrupo[] | null>(null);
  const [despachoGruposError, setDespachoGruposError] = useState<string | null>(null);
  const [despachoGruposCargando, setDespachoGruposCargando] = useState(false);
  const [nombreNuevoGrupo, setNombreNuevoGrupo] = useState("");
  const [creandoGrupo, setCreandoGrupo] = useState(false);
  const [grupoExpandido, setGrupoExpandido] = useState<number | null>(null);
  const [codigoNuevoMiembro, setCodigoNuevoMiembro] = useState("");
  const [agregandoMiembro, setAgregandoMiembro] = useState(false);

  const [despachoOcultarTipoCliente, setDespachoOcultarTipoCliente] = useState<boolean | null>(null);
  const [despachoConfigError, setDespachoConfigError] = useState<string | null>(null);
  const [despachoConfigGuardando, setDespachoConfigGuardando] = useState(false);

  const cargarDespachoConfig = async () => {
    try {
      const res = await fetch("/api/admin/despacho-configuracion");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar la configuración.");
      setDespachoOcultarTipoCliente(data.ocultarTipoCliente);
    } catch (err) {
      setDespachoConfigError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const cambiarDespachoOcultarTipoCliente = async (valor: boolean) => {
    setDespachoConfigGuardando(true);
    setDespachoConfigError(null);
    try {
      const res = await fetch("/api/admin/despacho-configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocultarTipoCliente: valor }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar.");
      setDespachoOcultarTipoCliente(data.ocultarTipoCliente);
      setDataVersion((v) => v + 1);
    } catch (err) {
      setDespachoConfigError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setDespachoConfigGuardando(false);
    }
  };

  interface DespachoEvento {
    id: number;
    trabajo_id: number | null;
    despacho_cab_id: number;
    guia: string | null;
    tipo: string;
    paso: string;
    resultado: string;
    mensaje: string | null;
    usuario_nombre: string | null;
    ocurrido_en: string;
  }
  const [despachoEventos, setDespachoEventos] = useState<DespachoEvento[] | null>(null);
  const [despachoEventosError, setDespachoEventosError] = useState<string | null>(null);
  const [despachoEventosCargando, setDespachoEventosCargando] = useState(false);
  const [despachoEventosSoloErrores, setDespachoEventosSoloErrores] = useState(true);

  const cargarDespachoEventos = async () => {
    setDespachoEventosCargando(true);
    setDespachoEventosError(null);
    try {
      const res = await fetch(`/api/admin/despacho-eventos?limit=200${despachoEventosSoloErrores ? "&soloErrores=1" : ""}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el log.");
      setDespachoEventos(data.eventos);
    } catch (err) {
      setDespachoEventosError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setDespachoEventosCargando(false);
    }
  };

  const cargarDespachoGrupos = async () => {
    setDespachoGruposCargando(true);
    setDespachoGruposError(null);
    try {
      const res = await fetch("/api/admin/despacho-grupos");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los grupos.");
      setDespachoGrupos(data.grupos);
    } catch (err) {
      setDespachoGruposError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setDespachoGruposCargando(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "DESP-Grupos" && despachoGrupos === null) cargarDespachoGrupos();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "DESP-Grupos" && despachoOcultarTipoCliente === null) cargarDespachoConfig();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "DESP-Grupos" && despachoEventos === null) cargarDespachoEventos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "DESP-Grupos" && despachoEventos !== null) cargarDespachoEventos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [despachoEventosSoloErrores]);

  const crearDespachoGrupo = async () => {
    if (!nombreNuevoGrupo.trim()) return;
    setCreandoGrupo(true);
    setDespachoGruposError(null);
    try {
      const res = await fetch("/api/admin/despacho-grupos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreNuevoGrupo.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo crear el grupo.");
      setNombreNuevoGrupo("");
      await cargarDespachoGrupos();
    } catch (err) {
      setDespachoGruposError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCreandoGrupo(false);
    }
  };

  const borrarDespachoGrupo = async (id: number) => {
    if (!confirm("¿Borrar este grupo? Los clientes quedan sin grupo.")) return;
    try {
      const res = await fetch(`/api/admin/despacho-grupos/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo borrar el grupo.");
      await cargarDespachoGrupos();
    } catch (err) {
      setDespachoGruposError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const agregarMiembroGrupo = async (grupoId: number) => {
    if (!codigoNuevoMiembro.trim()) return;
    setAgregandoMiembro(true);
    setDespachoGruposError(null);
    try {
      const res = await fetch(`/api/admin/despacho-grupos/${grupoId}/miembros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoCliente: codigoNuevoMiembro.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo agregar el cliente.");
      setCodigoNuevoMiembro("");
      await cargarDespachoGrupos();
    } catch (err) {
      setDespachoGruposError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setAgregandoMiembro(false);
    }
  };

  const quitarMiembroGrupo = async (grupoId: number, codigoCliente: string) => {
    try {
      const res = await fetch(`/api/admin/despacho-grupos/${grupoId}/miembros/${encodeURIComponent(codigoCliente)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo quitar el cliente.");
      await cargarDespachoGrupos();
    } catch (err) {
      setDespachoGruposError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  // =========================================================================
  // ESTADO: DESPACHO - SKU DE INSUMOS (maestro admin de SKU catalogados insumo)
  // =========================================================================
  interface InsumoSku {
    sku: string;
    descripcion: string | null;
    creado_en: string;
    creado_por_nombre: string | null;
  }
  const [insumosSkus, setInsumosSkus] = useState<InsumoSku[] | null>(null);
  const [insumosSkusError, setInsumosSkusError] = useState<string | null>(null);
  const [insumosSkusCargando, setInsumosSkusCargando] = useState(false);
  const [nuevoSkuInsumo, setNuevoSkuInsumo] = useState("");
  const [nuevaDescripcionSkuInsumo, setNuevaDescripcionSkuInsumo] = useState("");
  const [agregandoSkuInsumo, setAgregandoSkuInsumo] = useState(false);

  const cargarInsumosSkus = async () => {
    setInsumosSkusCargando(true);
    setInsumosSkusError(null);
    try {
      const res = await fetch("/api/despacho/insumos-skus", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los SKU.");
      setInsumosSkus(data.items);
    } catch (err) {
      setInsumosSkusError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setInsumosSkusCargando(false);
    }
  };

  useEffect(() => {
    if (activeTab === "DESP-SkuInsumos" && insumosSkus === null) cargarInsumosSkus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const agregarSkuInsumo = async () => {
    const sku = nuevoSkuInsumo.trim();
    if (!sku) return;
    setAgregandoSkuInsumo(true);
    setInsumosSkusError(null);
    try {
      const res = await fetch("/api/despacho/insumos-skus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, descripcion: nuevaDescripcionSkuInsumo.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo agregar el SKU.");
      setNuevoSkuInsumo("");
      setNuevaDescripcionSkuInsumo("");
      await cargarInsumosSkus();
    } catch (err) {
      setInsumosSkusError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setAgregandoSkuInsumo(false);
    }
  };

  const quitarSkuInsumo = async (sku: string) => {
    setInsumosSkusError(null);
    try {
      const res = await fetch(`/api/despacho/insumos-skus?sku=${encodeURIComponent(sku)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo quitar el SKU.");
      await cargarInsumosSkus();
    } catch (err) {
      setInsumosSkusError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  // "INB-EditarArribo" NO va acá -- es un permiso de capacidad (habilita
  // editar Arribo CD / marcar arribado dentro de Resumen), no una pestaña.
  const inboundSubSections = [
    { key: "INB-Importar", label: "Importar Datos" },
    { key: "INB-Resumen", label: "Resumen" },
  ];

  // "ALM-ImportarLayout" NO va acá -- es un permiso de capacidad (habilita el
  // panel de importar el layout del almacén dentro de Importar Datos), no una pestaña.
  const almacenSubSections = [
    { key: "ALM-Importar", label: "Importar Datos" },
    { key: "ALM-Resumen", label: "Resumen" },
    { key: "ALM-Configuracion", label: "Configuración" },
  ];

  const expedicionSubSections = [
    { key: "EXP-Interlocales", label: "Interlocales" },
    { key: "EXP-HojaRuta", label: "Hoja de Ruta" },
    { key: "EXP-Historico", label: "Histórico Despachados" },
    { key: "EXP-Etiquetas", label: "Etiquetas" },
    { key: "EXP-Escaner", label: "Control de Bultos (Escáner)" },
    { key: "EXP-EscanerCelular", label: "Control de Bultos (Escáner Celular)" },
    { key: "EXP-EscaneoHistorico", label: "Histórico de Escaneos" },
  ];

  interface InterlocalFila {
    id: number;
    numero_movimiento: string;
    numero_remito: string | null;
    numero_etiqueta: string | null;
    etiquetas?: string[];
    local_origen_codigo: string;
    local_origen_nombre: string | null;
    local_destino_codigo: string;
    local_destino_nombre: string | null;
    fecha: string;
    marca: string | null;
    cantidad_bultos: number;
    observaciones: string | null;
    tipo_envio: string;
    estado: string;
    registrado_por_nombre: string | null;
    registrado_en: string;
  }

  const [filtroTextoInterlocalesPendientes, setFiltroTextoInterlocalesPendientes] = useState("");
  const filasFiltradasInterlocalesPendientes = (data: InterlocalFila[]) => {
    const texto = filtroTextoInterlocalesPendientes.trim().toLowerCase();
    if (!texto) return data;
    return data.filter((f) => {
      const campos = [
        f.local_origen_codigo,
        f.local_origen_nombre,
        f.local_destino_codigo,
        f.local_destino_nombre,
        f.marca,
        f.numero_movimiento,
        f.numero_remito,
        f.numero_etiqueta,
        f.observaciones,
        f.registrado_por_nombre,
      ];
      return campos.some((c) => (c || "").toLowerCase().includes(texto));
    });
  };

  const {
    data: interlocalesData,
    error: interlocalesError,
    isLoading: interlocalesLoading,
    mutate: mutateInterlocales,
  } = useTabData<{ filas: InterlocalFila[] }>(
    activeTab,
    "EXP-Interlocales",
    "/api/interlocales?estado=pendiente",
    dataVersion
  );

  // Prefijo fijo del rótulo impreso ("interlocal-00001", etc, ver pestaña
  // Etiquetas) -- se precarga en el campo para que el usuario solo tenga que
  // completar los dígitos que le falten, en vez de tipear todo el código.
  const PREFIJO_ETIQUETA_INTERLOCAL = "interlocal-0";

  // La numeración automática/compartida de N° de Movimiento aplica para
  // "productos" y "varios" (no para "control_calidad", que tiene su propia
  // nomenclatura) solo cuando el origen es el CD (33000) -- con cualquier
  // otro origen, ambos tipos vuelven a cargarse a mano. Mismo criterio que
  // en el backend (src/app/api/interlocales/route.ts).
  const ORIGEN_CODIGO_NUMERACION_AUTOMATICA = "33000";

  const interlocalFormVacio = {
    tipoEnvio: "",
    localDestinoCodigo: "",
    fecha: new Date().toISOString().slice(0, 10),
    localOrigenCodigo: "",
    numeroMovimiento: "",
    numeroRemito: "",
    numeroEtiqueta: PREFIJO_ETIQUETA_INTERLOCAL,
    etiquetas: [] as string[],
    marca: "",
    cantidadBultos: "1",
    observaciones: "",
  };
  const [interlocalForm, setInterlocalForm] = useState(interlocalFormVacio);
  const [interlocalGuardando, setInterlocalGuardando] = useState(false);
  const [interlocalGuardadoError, setInterlocalGuardadoError] = useState<string | null>(null);
  const [interlocalGuardadoOk, setInterlocalGuardadoOk] = useState(false);
  const [interlocalEditandoId, setInterlocalEditandoId] = useState<number | null>(null);
  const interlocalTipoEnvioElegido = interlocalForm.tipoEnvio !== "";
  const interlocalNumeroAutomatico =
    (interlocalForm.tipoEnvio === "productos" || interlocalForm.tipoEnvio === "varios") &&
    interlocalForm.localOrigenCodigo.trim() === ORIGEN_CODIGO_NUMERACION_AUTOMATICA;
  const interlocalRemitoEditable = interlocalTipoEnvioElegido && !interlocalNumeroAutomatico;
  const interlocalCantidadBultosNum = Math.max(1, parseInt(interlocalForm.cantidadBultos, 10) || 1);
  // Obligatorio cargar la etiqueta de cada bulto -- en modo 1 bulto, el
  // campo tiene que tener algo más que el prefijo precargado sin completar.
  const interlocalEtiquetasCompletas =
    interlocalCantidadBultosNum > 1
      ? interlocalForm.etiquetas.length === interlocalCantidadBultosNum
      : interlocalForm.numeroEtiqueta.trim() !== "" && interlocalForm.numeroEtiqueta.trim() !== PREFIJO_ETIQUETA_INTERLOCAL;
  const [busquedaOrigen, setBusquedaOrigen] = useState<{ codigo: string; nombre: string }[]>([]);
  const [busquedaDestino, setBusquedaDestino] = useState<{ codigo: string; nombre: string }[]>([]);
  const interlocalBusquedaTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscarClientesDebounced = (q: string, setResultados: (v: { codigo: string; nombre: string }[]) => void) => {
    if (interlocalBusquedaTimeout.current) clearTimeout(interlocalBusquedaTimeout.current);
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    interlocalBusquedaTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setResultados(data.success ? data.clientes || [] : []);
      } catch {
        setResultados([]);
      }
    }, 300);
  };

  const actualizarInterlocalForm = (campo: keyof typeof interlocalFormVacio, valor: string) => {
    setInterlocalForm((prev) => ({ ...prev, [campo]: valor }));
    setInterlocalGuardadoOk(false);
  };

  // Cambiar la cantidad de bultos reinicia la carga de etiquetas (pasar de 1
  // a varios, o viceversa, cambia el modo del campo -- más simple volver a
  // empezar que migrar el valor a medio cargar entre los dos modos).
  const actualizarCantidadBultosInterlocal = (valor: string) => {
    setInterlocalForm((prev) => ({
      ...prev,
      cantidadBultos: valor,
      etiquetas: [],
      numeroEtiqueta: PREFIJO_ETIQUETA_INTERLOCAL,
    }));
    setInterlocalGuardadoOk(false);
    setInterlocalGuardadoError(null);
  };

  // Núcleo de "agregar una etiqueta al interlocal", compartido entre la
  // carga manual (Enter en modo varios bultos) y el escaneo por lector USB
  // (ver más abajo) -- misma validación de duplicados/cupo sin importar de
  // dónde vino el código.
  const agregarEtiquetaALista = (codigo: string) => {
    if (!codigo || codigo === PREFIJO_ETIQUETA_INTERLOCAL) return;
    if (interlocalForm.etiquetas.length >= interlocalCantidadBultosNum) return;
    if (interlocalForm.etiquetas.includes(codigo)) {
      setInterlocalGuardadoError(`La etiqueta "${codigo}" ya se cargó para este interlocal.`);
      return;
    }
    setInterlocalGuardadoError(null);
    setInterlocalForm((prev) => ({
      ...prev,
      etiquetas: [...prev.etiquetas, codigo],
      numeroEtiqueta: PREFIJO_ETIQUETA_INTERLOCAL,
    }));
  };

  // Modo "varios bultos": cada Enter agrega la etiqueta tipeada a la lista y
  // reinicia el campo con el prefijo listo para la siguiente, hasta llegar a
  // la cantidad de bultos declarada.
  const agregarEtiquetaInterlocalMultiBulto = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    agregarEtiquetaALista(interlocalForm.numeroEtiqueta.trim());
  };

  // El prefijo "interlocal-0" del campo N° Etiqueta no se puede borrar ni
  // pisar en ninguna instancia (ni en modo 1 bulto ni en modo varios
  // bultos) -- si el cambio resultante no lo respeta, se ignora.
  const onChangeNumeroEtiquetaInterlocal = (valor: string) => {
    if (!valor.startsWith(PREFIJO_ETIQUETA_INTERLOCAL)) return;
    actualizarInterlocalForm("numeroEtiqueta", valor);
  };

  const onKeyDownNumeroEtiquetaInterlocal = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const min = PREFIJO_ETIQUETA_INTERLOCAL.length;
    const inicio = el.selectionStart ?? 0;
    const fin = el.selectionEnd ?? 0;
    if ((e.key === "Backspace" && inicio <= min && fin <= min) || (e.key === "Delete" && inicio < min)) {
      e.preventDefault();
      return;
    }
    if (interlocalCantidadBultosNum > 1) agregarEtiquetaInterlocalMultiBulto(e);
  };

  // Complemento: detección de escaneo con lector USB (teclado-wedge). Un
  // lector tipea el código completo carácter por carácter en pocos
  // milisegundos -- muchísimo más rápido que cualquier tipeo humano.
  //
  // Primera versión midió el tiempo entre keydowns dejando que cada tecla
  // pasara normal al input -- en producción eso rompía el prefijo
  // ("interlocal-0interlocal-00165"): como este componente es gigante, el
  // re-render de React que dispara cada tecla (vía onChange) demora lo
  // suficiente al hilo principal como para que los keydown siguientes del
  // lector lleguen a destiempo, así que el timing medido después del
  // render no reflejaba la velocidad real del lector y la ráfaga se
  // clasificaba mal como tipeo manual.
  //
  // Ahora NINGUNA tecla imprimible llega al input directamente (preventDefault
  // siempre): se acumulan en un buffer por fuera de React (sin disparar
  // re-render, así no hay forma de que el hilo se atrase entre teclas de
  // una ráfaga real) y recién se confirman contra el campo cuando: (a) llega
  // Enter, o (b) pasan TIMEOUT_SIN_TECLA_MS sin ninguna tecla nueva (el
  // lector no manda Enter, o el usuario dejó de tipear a mano). Si lo
  // acumulado en ese momento es largo, se trata como escaneo; si es corto,
  // se aplica al campo como tipeo manual normal (respetando el prefijo) y
  // sigue el flujo de siempre.
  const FORMATO_ETIQUETA_INTERLOCAL = /^interlocal-\d+$/i;
  const LARGO_MINIMO_ESCANEO = 5;
  const TIMEOUT_SIN_TECLA_MS = 60;
  const bufferEtiquetaRef = useRef<{
    chars: string;
    selStart: number;
    selEnd: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ chars: "", selStart: 0, selEnd: 0, timer: null });

  // Algunos lectores USB vienen configurados con un layout de teclado
  // distinto al de la PC (ej. "US" en una PC con teclado en español/LatAm)
  // y el guion sale cambiado por otro símbolo según esa combinación de
  // layouts (confirmado en la práctica: apareció como apóstrofo) -- en vez
  // de intentar listar cada símbolo posible, toleramos CUALQUIER carácter
  // único (o ninguno) en esa posición y reconstruimos el formato canónico
  // "interlocal-NNNNN" antes de validar/guardar.
  const normalizarCodigoEscaneado = (codigo: string): string => {
    const m = codigo.match(/^interlocal.?(\d+)$/i);
    return m ? `interlocal-${m[1]}` : codigo;
  };

  const procesarEtiquetaEscaneada = (codigoCrudo: string) => {
    const codigo = normalizarCodigoEscaneado(codigoCrudo.trim());
    if (!FORMATO_ETIQUETA_INTERLOCAL.test(codigo)) {
      setInterlocalGuardadoError(
        `Ese código no tiene el formato de una etiqueta interlocal ("interlocal-00001"): "${codigo}"`
      );
      return;
    }
    setInterlocalGuardadoError(null);
    if (interlocalCantidadBultosNum > 1) {
      agregarEtiquetaALista(codigo);
    } else {
      setInterlocalForm((prev) => ({ ...prev, numeroEtiqueta: codigo }));
    }
  };

  // Aplica lo bufferizado (que no llegó a ser un escaneo) al campo real,
  // insertándolo en la posición del cursor de cuando arrancó el buffer --
  // mismo chequeo de prefijo que onChangeNumeroEtiquetaInterlocal.
  const confirmarBufferComoTipeoManual = (pendiente: string, selStart: number, selEnd: number) => {
    const actual = interlocalForm.numeroEtiqueta;
    const nuevo = actual.slice(0, selStart) + pendiente + actual.slice(selEnd);
    if (nuevo.startsWith(PREFIJO_ETIQUETA_INTERLOCAL)) {
      actualizarInterlocalForm("numeroEtiqueta", nuevo);
    }
  };

  const onKeyDownEtiquetaConEscaneo = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const estado = bufferEtiquetaRef.current;

    if (e.key === "Enter") {
      if (estado.timer) {
        clearTimeout(estado.timer);
        estado.timer = null;
      }
      const pendiente = estado.chars;
      const { selStart, selEnd } = estado;
      estado.chars = "";
      if (pendiente.length >= LARGO_MINIMO_ESCANEO) {
        e.preventDefault();
        procesarEtiquetaEscaneada(pendiente);
        return;
      }
      if (pendiente.length > 0) {
        confirmarBufferComoTipeoManual(pendiente, selStart, selEnd);
      }
      onKeyDownNumeroEtiquetaInterlocal(e);
      return;
    }

    // Teclas imprimibles de un solo carácter (letras, números, "-"): nunca
    // llegan al input directo -- se bufferizan y se decide después.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (estado.chars === "") {
        const el = e.currentTarget;
        estado.selStart = el.selectionStart ?? el.value.length;
        estado.selEnd = el.selectionEnd ?? el.value.length;
      }
      estado.chars += e.key;
      if (estado.timer) clearTimeout(estado.timer);
      estado.timer = setTimeout(() => {
        estado.timer = null;
        const pendiente = estado.chars;
        const { selStart, selEnd } = estado;
        estado.chars = "";
        if (!pendiente) return;
        if (pendiente.length >= LARGO_MINIMO_ESCANEO) {
          procesarEtiquetaEscaneada(pendiente);
        } else {
          confirmarBufferComoTipeoManual(pendiente, selStart, selEnd);
        }
      }, TIMEOUT_SIN_TECLA_MS);
      return;
    }

    // Backspace, Delete, flechas, etc. -- no forman parte de un código
    // escaneado. Si había algo bufferizado sin confirmar, se aplica primero
    // para no perderlo, y después sigue el manejo existente de esa tecla.
    if (estado.timer) {
      clearTimeout(estado.timer);
      estado.timer = null;
    }
    if (estado.chars) {
      const pendiente = estado.chars;
      const { selStart, selEnd } = estado;
      estado.chars = "";
      confirmarBufferComoTipeoManual(pendiente, selStart, selEnd);
    }
    onKeyDownNumeroEtiquetaInterlocal(e);
  };

  // Además de bloquear borrar el prefijo, evitamos que el cursor/selección
  // quede posicionado adentro de él (click, foco, flechas) -- así el usuario
  // siempre escribe después del prefijo, nunca en medio.
  const clampCursorNumeroEtiquetaInterlocal = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const min = PREFIJO_ETIQUETA_INTERLOCAL.length;
    const inicio = el.selectionStart ?? 0;
    const fin = el.selectionEnd ?? 0;
    if (inicio < min || fin < min) {
      el.setSelectionRange(Math.max(inicio, min), Math.max(fin, min));
    }
  };

  const quitarEtiquetaInterlocalMultiBulto = (idx: number) => {
    setInterlocalForm((prev) => ({ ...prev, etiquetas: prev.etiquetas.filter((_, i) => i !== idx) }));
    setInterlocalGuardadoOk(false);
  };

  // Sincroniza el modo automático de N° de Movimiento/Remito según tipo +
  // origen (ver interlocalNumeroAutomatico) -- se llama explícitamente desde
  // los onChange del tipo y del origen, nunca de forma reactiva a un efecto,
  // para no pisar el número ya guardado al abrir una edición existente
  // (iniciarEdicionInterlocal solo setea el form, no pasa por acá).
  const sincronizarNumeroAutomaticoInterlocal = async (tipoEnvio: string, localOrigenCodigo: string) => {
    const automatico =
      (tipoEnvio === "productos" || tipoEnvio === "varios") &&
      localOrigenCodigo.trim() === ORIGEN_CODIGO_NUMERACION_AUTOMATICA;
    if (!automatico) {
      setInterlocalForm((prev) =>
        prev.tipoEnvio === tipoEnvio && prev.localOrigenCodigo === localOrigenCodigo && (prev.numeroMovimiento || prev.numeroRemito)
          ? { ...prev, numeroMovimiento: "", numeroRemito: "" }
          : prev
      );
      return;
    }
    try {
      const res = await fetch("/api/interlocales/proximo-numero-varios");
      const data = await res.json();
      if (data.success) {
        setInterlocalForm((prev) =>
          (prev.tipoEnvio === "productos" || prev.tipoEnvio === "varios") &&
          prev.localOrigenCodigo.trim() === ORIGEN_CODIGO_NUMERACION_AUTOMATICA
            ? { ...prev, numeroRemito: String(data.proximoNumero), numeroMovimiento: String(data.proximoNumero) }
            : prev
        );
      }
    } catch {
      // Si falla la vista previa no bloqueamos la carga -- el número real
      // se asigna igual al guardar.
    }
  };

  const cambiarTipoEnvioInterlocal = (valor: string) => {
    setInterlocalForm((prev) => ({ ...prev, tipoEnvio: valor }));
    setInterlocalGuardadoOk(false);
    sincronizarNumeroAutomaticoInterlocal(valor, interlocalForm.localOrigenCodigo);
  };

  const registrarInterlocal = async () => {
    setInterlocalGuardando(true);
    setInterlocalGuardadoError(null);
    setInterlocalGuardadoOk(false);
    const editando = interlocalEditandoId !== null;
    // El campo N° Etiqueta arranca precargado con el prefijo "interlocal-0"
    // como ayuda para tipear -- si el usuario no lo tocó (modo 1 bulto) hay
    // que tratarlo como vacío, sino se mandaría el prefijo como si fuera una
    // etiqueta real. En modo varios bultos la lista "etiquetas" ya excluye
    // el prefijo sin completar (ver agregarEtiquetaInterlocalMultiBulto).
    const numeroEtiquetaLimpio = interlocalForm.numeroEtiqueta.trim();
    const etiquetasParaEnviar =
      interlocalCantidadBultosNum > 1
        ? interlocalForm.etiquetas
        : numeroEtiquetaLimpio && numeroEtiquetaLimpio !== PREFIJO_ETIQUETA_INTERLOCAL
          ? [numeroEtiquetaLimpio]
          : [];
    try {
      const res = await fetch(editando ? `/api/interlocales/${interlocalEditandoId}` : "/api/interlocales", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...interlocalForm, etiquetas: etiquetasParaEnviar }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo registrar el interlocal.");
      setInterlocalForm(interlocalFormVacio);
      setInterlocalEditandoId(null);
      setInterlocalGuardadoOk(true);
      mutateInterlocales();
    } catch (err) {
      setInterlocalGuardadoError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setInterlocalGuardando(false);
    }
  };

  const iniciarEdicionInterlocal = (f: InterlocalFila) => {
    setInterlocalEditandoId(f.id);
    const esMultiBulto = f.cantidad_bultos > 1;
    const etiquetasExistentes = f.etiquetas && f.etiquetas.length > 0 ? f.etiquetas : f.numero_etiqueta ? [f.numero_etiqueta] : [];
    setInterlocalForm({
      tipoEnvio: f.tipo_envio || "productos",
      localDestinoCodigo: f.local_destino_codigo,
      fecha: f.fecha,
      localOrigenCodigo: f.local_origen_codigo,
      numeroMovimiento: f.numero_movimiento,
      numeroRemito: f.numero_remito || "",
      numeroEtiqueta: esMultiBulto ? PREFIJO_ETIQUETA_INTERLOCAL : f.numero_etiqueta || PREFIJO_ETIQUETA_INTERLOCAL,
      etiquetas: esMultiBulto ? etiquetasExistentes : [],
      marca: f.marca || "",
      cantidadBultos: String(f.cantidad_bultos),
      observaciones: f.observaciones || "",
    });
    setInterlocalGuardadoError(null);
    setInterlocalGuardadoOk(false);
  };

  const cancelarEdicionInterlocal = () => {
    setInterlocalEditandoId(null);
    setInterlocalForm(interlocalFormVacio);
    setInterlocalGuardadoError(null);
    setInterlocalGuardadoOk(false);
  };

  const [interlocalEliminandoId, setInterlocalEliminandoId] = useState<number | null>(null);

  // Requiere el permiso especial EXP-InterlocalesEliminar (aparte de
  // EXP-Interlocales) -- ver src/app/api/interlocales/[id]/route.ts (DELETE).
  const eliminarInterlocal = async (f: InterlocalFila) => {
    if (!window.confirm(`¿Eliminar el interlocal Mov. ${f.numero_movimiento}? Esta acción no se puede deshacer.`)) {
      return;
    }
    setInterlocalEliminandoId(f.id);
    try {
      const res = await fetch(`/api/interlocales/${f.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el interlocal.");
      if (interlocalEditandoId === f.id) cancelarEdicionInterlocal();
      mutateInterlocales();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setInterlocalEliminandoId(null);
    }
  };

  const {
    data: interlocalesHistoricoData,
    error: interlocalesHistoricoError,
    isLoading: interlocalesHistoricoLoading,
  } = useTabData<{ filas: InterlocalFila[] }>(
    activeTab,
    "EXP-Historico",
    "/api/interlocales?estado=despachado",
    dataVersion
  );
  const [filtroTextoHistorico, setFiltroTextoHistorico] = useState("");
  const [filtroMarcaHistorico, setFiltroMarcaHistorico] = useState("TODAS");
  const [filtroTipoEnvioHistorico, setFiltroTipoEnvioHistorico] = useState("TODOS");
  const [filtroFechaDesdeHistorico, setFiltroFechaDesdeHistorico] = useState("");
  const [filtroFechaHastaHistorico, setFiltroFechaHastaHistorico] = useState("");

  const filasFiltradasHistorico = (interlocalesHistoricoData?.filas || []).filter((f) => {
    if (filtroMarcaHistorico !== "TODAS" && (f.marca || "SIN MARCA") !== filtroMarcaHistorico) return false;
    if (filtroTipoEnvioHistorico !== "TODOS" && f.tipo_envio !== filtroTipoEnvioHistorico) return false;
    if (filtroFechaDesdeHistorico && f.fecha < filtroFechaDesdeHistorico) return false;
    if (filtroFechaHastaHistorico && f.fecha > filtroFechaHastaHistorico) return false;
    const texto = filtroTextoHistorico.trim().toLowerCase();
    if (texto) {
      const campos = [
        f.numero_movimiento,
        f.numero_remito,
        f.numero_etiqueta,
        f.local_origen_codigo,
        f.local_origen_nombre,
        f.local_destino_codigo,
        f.local_destino_nombre,
        f.observaciones,
      ];
      if (!campos.some((c) => (c || "").toLowerCase().includes(texto))) return false;
    }
    return true;
  });

  interface EtiquetaInterlocalFila {
    id: number;
    numero: number;
    texto: string;
    impreso_por_nombre: string | null;
    impreso_en: string;
  }

  const {
    data: etiquetasData,
    error: etiquetasError,
    isLoading: etiquetasLoading,
    mutate: mutateEtiquetas,
  } = useTabData<{ filas: EtiquetaInterlocalFila[] }>(activeTab, "EXP-Etiquetas", "/api/interlocales/etiquetas", dataVersion);

  const [cantidadEtiquetas, setCantidadEtiquetas] = useState("");
  const [imprimiendoEtiquetas, setImprimiendoEtiquetas] = useState(false);
  const [errorImprimirEtiquetas, setErrorImprimirEtiquetas] = useState<string | null>(null);
  const [ultimoLoteEtiquetas, setUltimoLoteEtiquetas] = useState<string[] | null>(null);

  const imprimirEtiquetasInterlocal = async () => {
    const cantidad = Number(cantidadEtiquetas);
    if (!Number.isInteger(cantidad) || cantidad < 1) return;

    setImprimiendoEtiquetas(true);
    setErrorImprimirEtiquetas(null);
    setUltimoLoteEtiquetas(null);
    try {
      const res = await fetch("/api/interlocales/etiquetas/imprimir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cantidad }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron imprimir las etiquetas.");
      setUltimoLoteEtiquetas(data.textos);
      setCantidadEtiquetas("");
      mutateEtiquetas();
    } catch (err) {
      setErrorImprimirEtiquetas(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setImprimiendoEtiquetas(false);
    }
  };

  interface HojaDeRutaFila {
    id: number;
    fecha: string;
    local_codigo: string;
    local_nombre: string | null;
    transporte: string | null;
    patente: string | null;
    chofer: string | null;
    estado: string;
    creado_por_nombre: string | null;
    creado_en: string;
    bloqueada_dp_cot_ok: boolean;
  }

  const {
    data: hojasDeRutaData,
    error: hojasDeRutaError,
    isLoading: hojasDeRutaLoading,
    mutate: mutateHojasDeRuta,
  } = useTabData<{ filas: HojaDeRutaFila[] }>(activeTab, "EXP-HojaRuta", "/api/hoja-ruta", dataVersion);

  interface EscaneoBultoDetalle {
    codigo: string;
    tipo: "despacho" | "interlocal";
    referencia: string;
    escaneado: boolean;
    escaneado_en: string | null;
  }
  interface EscaneoFila {
    id: number;
    hoja_de_ruta_id: number;
    usuario_nombre: string | null;
    iniciado_en: string;
    finalizado_en: string | null;
    bultos_esperados: number | null;
    bultos_escaneados: number | null;
    resultado: string | null;
    hoja: { id: number; fecha: string; local_codigo: string; local_nombre: string | null } | null;
    detalle: EscaneoBultoDetalle[];
  }
  const {
    data: escaneosData,
    error: escaneosError,
    isLoading: escaneosLoading,
  } = useTabData<{ filas: EscaneoFila[] }>(activeTab, "EXP-EscaneoHistorico", "/api/hoja-ruta/escaneos", dataVersion);

  const [filtroTextoEscaneos, setFiltroTextoEscaneos] = useState("");
  const [filtroFechaDesdeEscaneos, setFiltroFechaDesdeEscaneos] = useState("");
  const [filtroFechaHastaEscaneos, setFiltroFechaHastaEscaneos] = useState("");
  const [filtroResultadoEscaneos, setFiltroResultadoEscaneos] = useState("TODOS");
  const [escaneoExpandidoId, setEscaneoExpandidoId] = useState<number | null>(null);

  const escaneosFiltrados = (escaneosData?.filas || []).filter((e) => {
    if (filtroResultadoEscaneos !== "TODOS") {
      const estado = e.resultado || "en_curso";
      if (estado !== filtroResultadoEscaneos) return false;
    }
    const fechaHoja = e.hoja?.fecha || "";
    if (filtroFechaDesdeEscaneos && fechaHoja && fechaHoja < filtroFechaDesdeEscaneos) return false;
    if (filtroFechaHastaEscaneos && fechaHoja && fechaHoja > filtroFechaHastaEscaneos) return false;
    const texto = filtroTextoEscaneos.trim().toLowerCase();
    if (texto) {
      const campos = [
        String(e.hoja_de_ruta_id),
        e.hoja?.local_codigo,
        e.hoja?.local_nombre,
        e.usuario_nombre,
      ];
      if (!campos.some((c) => (c || "").toLowerCase().includes(texto))) return false;
    }
    return true;
  });

  // Fecha y hora en columnas separadas -- un único string de fecha+hora en
  // Excel obliga a formatear la celda a mano para que se lea bien.
  const fechaParteExcel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "");
  const horaParteExcel = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "";

  const exportarEscaneosExcel = async () => {
    const XLSX = await import("xlsx");
    const resumen = escaneosFiltrados.map((e) => ({
      hoja: e.hoja_de_ruta_id,
      local: e.hoja ? `${e.hoja.local_codigo} - ${e.hoja.local_nombre || ""}` : "",
      fecha_hoja: e.hoja?.fecha ? fmtSoloFecha(e.hoja.fecha) : "",
      usuario: e.usuario_nombre || "",
      fecha_inicio: fechaParteExcel(e.iniciado_en),
      hora_inicio: horaParteExcel(e.iniciado_en),
      fecha_fin: fechaParteExcel(e.finalizado_en),
      hora_fin: horaParteExcel(e.finalizado_en),
      bultos_escaneados: e.bultos_escaneados ?? "",
      bultos_esperados: e.bultos_esperados ?? "",
      resultado: e.resultado || "en curso",
    }));
    const detalle = escaneosFiltrados.flatMap((e) =>
      e.detalle.map((b) => ({
        hoja: e.hoja_de_ruta_id,
        local: e.hoja ? `${e.hoja.local_codigo} - ${e.hoja.local_nombre || ""}` : "",
        fecha_hoja: e.hoja?.fecha ? fmtSoloFecha(e.hoja.fecha) : "",
        codigo: b.codigo,
        tipo: b.tipo,
        referencia: b.referencia,
        escaneado: b.escaneado ? "Sí" : "No",
        fecha_escaneo: fechaParteExcel(b.escaneado_en),
        hora_escaneo: horaParteExcel(b.escaneado_en),
      }))
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(resumen), "Resumen");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(detalle), "Detalle");
    XLSX.writeFile(libro, `historico_escaneos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const [filtroTextoHojasDeRuta, setFiltroTextoHojasDeRuta] = useState("");
  const hojasDeRutaFiltradas = (hojasDeRutaData?.filas || []).filter((h) => {
    const texto = filtroTextoHojasDeRuta.trim().toLowerCase();
    if (!texto) return true;
    const campos = [h.local_codigo, h.local_nombre, h.transporte, h.patente, h.chofer, h.creado_por_nombre, h.estado];
    return campos.some((c) => (c || "").toLowerCase().includes(texto));
  });

  // La hoja en sí todavía guarda una fecha (para el listado histórico), pero
  // ya no se pide por pantalla -- se usa la de hoy sola, y buscar
  // "disponibles" ya no filtra por fecha (trae todo lo pendiente del local).
  const [hdrFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [hdrLocalCodigo, setHdrLocalCodigo] = useState("");
  const [busquedaLocalHdr, setBusquedaLocalHdr] = useState<{ codigo: string; nombre: string }[]>([]);
  const [hdrDisponiblesInterlocales, setHdrDisponiblesInterlocales] = useState<InterlocalFila[]>([]);
  const [hdrDisponiblesDespachos, setHdrDisponiblesDespachos] = useState<DespachoGuiaFila[]>([]);
  const [hdrBuscando, setHdrBuscando] = useState(false);
  const [hdrBuscarError, setHdrBuscarError] = useState<string | null>(null);
  const [hdrYaSeBusco, setHdrYaSeBusco] = useState(false);
  const [hdrSeleccionInterlocales, setHdrSeleccionInterlocales] = useState<Set<number>>(new Set());
  const [hdrSeleccionDespachos, setHdrSeleccionDespachos] = useState<Set<number>>(new Set());
  const [hdrTransporte, setHdrTransporte] = useState("");
  const [hdrPatente, setHdrPatente] = useState("");
  const [hdrChofer, setHdrChofer] = useState("");
  const [hdrCreando, setHdrCreando] = useState(false);
  const [hdrCrearError, setHdrCrearError] = useState<string | null>(null);
  // Modo edición: si tiene un id, "Confirmar" pasa a modificar esa hoja en
  // vez de crear una nueva.
  const [hdrEditandoId, setHdrEditandoId] = useState<number | null>(null);

  const buscarDisponiblesHdr = async (hojaIdEdicion?: number) => {
    if (!hdrLocalCodigo) return;
    setHdrBuscando(true);
    setHdrBuscarError(null);
    try {
      const urlHojaId = hojaIdEdicion ? `&hojaId=${hojaIdEdicion}` : "";
      const res = await fetch(`/api/hoja-ruta/disponibles?localDestino=${encodeURIComponent(hdrLocalCodigo)}${urlHojaId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo buscar lo disponible.");
      setHdrDisponiblesInterlocales(data.interlocales || []);
      setHdrDisponiblesDespachos(data.despachos || []);
      if (!hojaIdEdicion) {
        setHdrSeleccionInterlocales(new Set());
        setHdrSeleccionDespachos(new Set());
      }
      setHdrYaSeBusco(true);
    } catch (err) {
      setHdrBuscarError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setHdrBuscando(false);
    }
  };

  // Precarga el formulario con los datos de una hoja existente y trae lo
  // disponible para ese local (incluyendo lo que ya tiene esta hoja, para
  // poder sacarlo si hace falta).
  const iniciarEdicionHojaDeRuta = async (h: HojaDeRutaFila) => {
    setHdrCrearError(null);
    setHdrEditandoId(h.id);
    setHdrLocalCodigo(h.local_codigo);
    setHdrTransporte(h.transporte || "");
    setHdrPatente(h.patente || "");
    setHdrChofer(h.chofer || "");
    setHdrBuscando(true);
    setHdrBuscarError(null);
    try {
      const [resDisp, resDetalle] = await Promise.all([
        fetch(`/api/hoja-ruta/disponibles?localDestino=${encodeURIComponent(h.local_codigo)}&hojaId=${h.id}`),
        fetch(`/api/hoja-ruta/${h.id}`),
      ]);
      const dataDisp = await resDisp.json();
      const dataDetalle = await resDetalle.json();
      if (!resDisp.ok || !dataDisp.success) throw new Error(dataDisp.error || "No se pudo buscar lo disponible.");
      if (!resDetalle.ok || !dataDetalle.success) throw new Error(dataDetalle.error || "No se pudo cargar la hoja.");

      setHdrDisponiblesInterlocales(dataDisp.interlocales || []);
      setHdrDisponiblesDespachos(dataDisp.despachos || []);
      const items: { tipo: string; referencia_id: number }[] = dataDetalle.items || [];
      setHdrSeleccionInterlocales(new Set(items.filter((i) => i.tipo === "interlocal").map((i) => i.referencia_id)));
      setHdrSeleccionDespachos(new Set(items.filter((i) => i.tipo === "despacho").map((i) => i.referencia_id)));
      setHdrYaSeBusco(true);
    } catch (err) {
      setHdrBuscarError(err instanceof Error ? err.message : "Error inesperado.");
      setHdrEditandoId(null);
    } finally {
      setHdrBuscando(false);
    }
  };

  const cancelarEdicionHojaDeRuta = () => {
    setHdrEditandoId(null);
    setHdrLocalCodigo("");
    setHdrTransporte("");
    setHdrPatente("");
    setHdrChofer("");
    setHdrDisponiblesInterlocales([]);
    setHdrDisponiblesDespachos([]);
    setHdrSeleccionInterlocales(new Set());
    setHdrSeleccionDespachos(new Set());
    setHdrYaSeBusco(false);
    setHdrCrearError(null);
  };

  const toggleHdrInterlocal = (id: number) => {
    setHdrSeleccionInterlocales((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleHdrDespacho = (id: number) => {
    setHdrSeleccionDespachos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const crearHojaDeRuta = async () => {
    const items = [
      ...[...hdrSeleccionInterlocales].map((id) => ({ tipo: "interlocal", referenciaId: id })),
      ...[...hdrSeleccionDespachos].map((id) => ({ tipo: "despacho", referenciaId: id })),
    ];
    if (items.length === 0) return;
    setHdrCreando(true);
    setHdrCrearError(null);
    try {
      const editando = hdrEditandoId !== null;
      const res = await fetch(editando ? `/api/hoja-ruta/${hdrEditandoId}` : "/api/hoja-ruta", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: hdrFecha,
          localCodigo: hdrLocalCodigo,
          transporte: hdrTransporte,
          patente: hdrPatente,
          chofer: hdrChofer,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `No se pudo ${editando ? "modificar" : "crear"} la Hoja de Ruta.`);
      const hojaId = data.hoja.id;
      setHdrEditandoId(null);
      setHdrLocalCodigo("");
      setHdrTransporte("");
      setHdrPatente("");
      setHdrChofer("");
      setHdrDisponiblesInterlocales([]);
      setHdrDisponiblesDespachos([]);
      setHdrYaSeBusco(false);
      setDataVersion((v) => v + 1);
      mutateHojasDeRuta();
      // Al modificar no reabrimos la impresión sola -- puede que solo se
      // haya corregido un dato sin necesitar un papel nuevo. "Ver /
      // Reimprimir" desde el histórico queda para cuando sí haga falta.
      if (!editando) window.open(`/hoja-ruta/${hojaId}/imprimir`, "_blank");
    } catch (err) {
      setHdrCrearError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setHdrCreando(false);
    }
  };

  const [hdrAnulando, setHdrAnulando] = useState<number | null>(null);
  const anularHojaDeRuta = async (id: number) => {
    if (!confirm("¿Anular esta Hoja de Ruta? Los interlocales y guías que tenía adentro vuelven a quedar disponibles.")) return;
    setHdrAnulando(id);
    try {
      const res = await fetch(`/api/hoja-ruta/${id}/anular`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo anular la Hoja de Ruta.");
      mutateHojasDeRuta();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error inesperado anulando la Hoja de Ruta.");
    } finally {
      setHdrAnulando(null);
    }
  };

  const adminSubSections = [
    { key: "ADMIN-Perfiles", label: "Perfiles" },
    { key: "ADMIN-Usuarios", label: "Usuarios" },
    { key: "ADMIN-Accesos", label: "Accesos" },
    { key: "ADMIN-Feriados", label: "Feriados" },
    { key: "ADMIN-Configuracion", label: "Configuración" },
  ];

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
    <DashboardProvider
      value={{
        router,
        usuarioActual,
        activeTab,
        setActiveTab,
        dataVersion,
        setDataVersion,
        permisos,
        tienePermiso,
        seccionVisible,
        irA,
      }}
    >
    <div className="flex h-screen bg-[#f8f9fc] font-sans text-slate-800 overflow-hidden">
      
      {/* ================= BARRA LATERAL ================= */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-10 flex-shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
          <svg className="w-6 h-6 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <span className="text-lg font-bold text-white tracking-wide">WMS Analytics</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {seccionVisible([...prepNoEcomSubSections, ...prepEcomSubSections.map((s) => s.key)]) && (
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
                {seccionVisible(prepNoEcomSubSections) && (
                <div>
                  <button onClick={() => setIsPrepNoEcomOpen(!isPrepNoEcomOpen)} className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-800/50 transition-colors text-xs font-semibold uppercase tracking-wide text-slate-500">
                    No Ecom
                    <svg className={`w-3 h-3 transition-transform duration-200 ${isPrepNoEcomOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {isPrepNoEcomOpen && prepNoEcomSubSections.filter(tienePermiso).map((sub, idx) => (
                    <button key={idx} onClick={() => irA(sub)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                      {sub}
                    </button>
                  ))}
                </div>
                )}
                {seccionVisible(prepEcomSubSections.map((s) => s.key)) && (
                <div className="mt-1">
                  <button onClick={() => setIsPrepEcomOpen(!isPrepEcomOpen)} className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-800/50 transition-colors text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ecom
                    <svg className={`w-3 h-3 transition-transform duration-200 ${isPrepEcomOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {isPrepEcomOpen && prepEcomSubSections.filter((sub) => tienePermiso(sub.key)).map((sub) => (
                    <button key={sub.key} onClick={() => irA(sub.key)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub.key ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                      {sub.label}
                    </button>
                  ))}
                </div>
                )}
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

          {seccionVisible(pendienteDespachoSubSections.map((s) => s.key)) && (
          <div className="pt-2">
            <button onClick={() => setIsPendienteDespachoOpen(!isPendienteDespachoOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4m16 0l-4-4m4 4l-4 4M4 12l4-4m-4 4l4 4" /></svg>
                Pendiente de Despacho
              </div>
              <svg className={`w-4 h-4 transition-transform duration-200 ${isPendienteDespachoOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isPendienteDespachoOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {pendienteDespachoSubSections.filter((sub) => tienePermiso(sub.key)).map((sub) => (
                  <button key={sub.key} onClick={() => irA(sub.key)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub.key ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {seccionVisible(despachoSubSections.map((s) => s.key)) && (
          <div className="pt-2">
            <button onClick={() => setIsDespachoOpen(!isDespachoOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
                Despacho
              </div>
              <svg className={`w-4 h-4 transition-transform duration-200 ${isDespachoOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isDespachoOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {despachoSubSections.filter((sub) => tienePermiso(sub.key)).map((sub) => (
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

          {seccionVisible(almacenSubSections.map((s) => s.key)) && (
          <div className="pt-2">
            <button onClick={() => setIsAlmacenOpen(!isAlmacenOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4m0-14v14m9-14v10l-9 4" /></svg>
                Ocupación Almacén
              </div>
              <svg className={`w-4 h-4 transition-transform duration-200 ${isAlmacenOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isAlmacenOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {almacenSubSections.filter((sub) => tienePermiso(sub.key)).map((sub) => (
                  <button key={sub.key} onClick={() => irA(sub.key)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub.key ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {seccionVisible(expedicionSubSections.map((s) => s.key)) && (
          <div className="pt-2">
            <button onClick={() => setIsExpedicionOpen(!isExpedicionOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" /></svg>
                Expedición
              </div>
              <svg className={`w-4 h-4 transition-transform duration-200 ${isExpedicionOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isExpedicionOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {expedicionSubSections.filter((sub) => tienePermiso(sub.key)).map((sub) => (
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
             activeTab === "REMA Manual" ? "Status de Preparación - Pedidos REMA Manual" :
             activeTab === "ECOM-Resumen" ? "Status de Preparación (Ecom) - Resumen" :
             activeTab === "ECOM-PorFecha" ? "Status de Preparación (Ecom) - Por Fecha" :
             activeTab === "ECOM-PorPedidos" ? "Status de Preparación (Ecom) - Por Pedidos" :
             activeTab === "ECOM-Importar" ? "Status de Preparación (Ecom) - Importar Datos" :
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
             activeTab === "PD-Importar" ? "Pendiente de Despacho - Importar Datos" :
             activeTab === "PD-Clientes" ? "Pendiente de Despacho - Clientes" :
             activeTab === "PD-Propios" ? "Pendiente de Despacho - Propios" :
             activeTab === "PD-Urgencias" ? "Pendiente de Despacho - Seguimiento Urgencias" :
             activeTab === "PD-CargaDatos" ? "Pendiente de Despacho - Carga de Datos" :
             activeTab === "DESP-Imprimir" ? "Despacho - Para Imprimir" :
             activeTab === "DESP-Reimprimir" ? "Despacho - Guías Impresas" :
             activeTab === "DESP-Grupos" ? "Despacho - Grupos de Clientes" :
             activeTab === "DESP-SkuInsumos" ? "Despacho - SKU de Insumos" :
             activeTab === "INB-Importar" ? "Inbound - Importar Datos" :
             activeTab === "INB-Resumen" ? "Inbound - Resumen" :
             activeTab === "ALM-Importar" ? "Ocupación Almacén - Importar Datos" :
             activeTab === "ALM-Resumen" ? "Ocupación Almacén - Resumen" :
             activeTab === "ALM-Configuracion" ? "Ocupación Almacén - Configuración" :
             activeTab === "EXP-Interlocales" ? "Expedición - Interlocales" :
             activeTab === "EXP-HojaRuta" ? "Expedición - Hoja de Ruta" :
             activeTab === "EXP-Historico" ? "Expedición - Histórico Despachados" :
             activeTab === "EXP-Etiquetas" ? "Expedición - Etiquetas" :
             activeTab === "EXP-Escaner" ? "Expedición - Control de Bultos (Escáner)" :
             activeTab === "EXP-EscanerCelular" ? "Expedición - Control de Bultos (Escáner Celular)" :
             activeTab === "EXP-EscaneoHistorico" ? "Expedición - Histórico de Escaneos" :
             activeTab === "ADMIN-Perfiles" ? "Administración - Perfiles" :
             activeTab === "ADMIN-Usuarios" ? "Administración - Usuarios" :
             activeTab === "ADMIN-Accesos" ? "Administración - Accesos" :
             activeTab === "ADMIN-Feriados" ? "Administración - Feriados" :
             activeTab === "ADMIN-Configuracion" ? "Administración - Configuración" : activeTab}
          </h1>
        </header>

        <div key={activeTab} className="tab-fade-in flex-1 overflow-auto p-8 space-y-6">

          {activeTab === "Resumen" && <Resumen />}
          {activeTab === "Importar datos" && <Importar />}
          {activeTab === "Por fecha" && <PorFecha />}
          {activeTab === "Por pedidos" && <PorPedidos />}
          {activeTab === "REMA Manual" && <RemaManual />}

          {/* ================= PESTAÑA: ECOM - RESUMEN ================= */}
          {activeTab === "ECOM-Resumen" && <EcomResumen />}
          {activeTab === "ECOM-Importar" && <EcomImportar />}
          {activeTab === "ECOM-PorFecha" && <EcomPorFecha />}
          {activeTab === "ECOM-PorPedidos" && <EcomPorPedidos />}

          {/* ================= PESTAÑA: PRODUCTIVIDAD POR PROCESO ================= */}
          {activeTab === "PROD-Importar" && <ProdImportar />}
          {activeTab === "PROD-Resumen" && <ProdResumen />}

          {/* ================= PESTAÑA: PENDIENTE DE DESPACHO - IMPORTAR DATOS ================= */}
          {activeTab === "PD-Importar" && <PDImportar />}

          {/* ================= PESTAÑA: PENDIENTE DE DESPACHO - CLIENTES ================= */}
          {activeTab === "PD-Clientes" && <PDClientes />}

          {/* ================= PESTAÑA: PENDIENTE DE DESPACHO - PROPIOS ================= */}
          {activeTab === "PD-Propios" && <PDPropios />}

          {/* ================= PESTAÑA: PENDIENTE DE DESPACHO - SEGUIMIENTO URGENCIAS ================= */}
          {activeTab === "PD-Urgencias" && <PDUrgencias />}

          {/* ================= PESTAÑA: PENDIENTE DE DESPACHO - CARGA DE DATOS ================= */}
          {activeTab === "PD-CargaDatos" && <PDCargaDatos />}

          {/* ================= PESTAÑA: DESPACHO - PARA IMPRIMIR ================= */}
          {activeTab === "DESP-Imprimir" && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h2 className="text-lg font-bold text-slate-800">Despacho — Para Imprimir</h2>
                {despachoImprimirData && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Última actualización: <span className="font-medium text-slate-700">{fmtFecha(despachoImprimirData.updatedAt)}</span>
                  </div>
                )}
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Guías de despacho del WMS que todavía no se imprimieron completas (guía + remito). Importá las
                guías de hoy y después seleccioná cuáles mandar a imprimir.
              </p>

              {tienePermiso("DESP-Imprimir") && (
                <>
                  <AgenteTokenPanel />
                  <ActualizarAgenteBoton seccion="despacho_importar" onExito={() => setDataVersion((v) => v + 1)} />
                  <ActualizarAgenteBoton
                    seccion="despacho_imprimir"
                    label={`Imprimir seleccionadas (${despachoImprimirSeleccion.size})`}
                    deshabilitado={despachoImprimirSeleccion.size === 0}
                    payload={{
                      guias: (despachoImprimirData?.filas || [])
                        .filter((f) => despachoImprimirSeleccion.has(f.despacho_cab_id))
                        .map((f) => ({ despachoCabId: f.despacho_cab_id, guia: f.guia, tipo: f.tipo })),
                    }}
                    onCorriendoChange={setDespachoImprimiendoEnCurso}
                    onExito={() => {
                      setDataVersion((v) => v + 1);
                      setDespachoImprimirSeleccion(new Set());
                    }}
                  />
                  {tienePermiso("DESP-Grupos") && (
                    <button
                      type="button"
                      onClick={marcarSeleccionadasComoImpresas}
                      disabled={despachoImprimirSeleccion.size === 0 || marcandoManualImprimir}
                      title="Solo para casos donde la guía y el remito ya se imprimieron a mano, fuera del sistema."
                      className="ml-2 mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {marcandoManualImprimir
                        ? "Marcando..."
                        : `Marcar como impresas (manual) (${despachoImprimirSeleccion.size})`}
                    </button>
                  )}
                </>
              )}

              {despachoImprimirError && (
                <div className="mt-4 mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar las guías: {despachoImprimirError}
                </div>
              )}
              {despachoImprimirLoading && !despachoImprimirData && (
                <div className="mt-4 mb-4 rounded-lg border border-slate-200 overflow-hidden">
                  <SkeletonTable rows={6} columns={13} />
                </div>
              )}

              <div className="flex items-center gap-3 mt-4 mb-4 flex-wrap">
                <input
                  type="text"
                  value={filtroClienteImprimir}
                  onChange={(e) => setFiltroClienteImprimir(e.target.value)}
                  placeholder="Buscar por cliente..."
                  className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-56"
                />
                <select
                  value={filtroTipoImprimir}
                  onChange={(e) => setFiltroTipoImprimir(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODOS">Todos los tipos</option>
                  {tiposDisponiblesImprimir.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={filtroGrupoImprimir}
                  onChange={(e) => setFiltroGrupoImprimir(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODOS">Todos los grupos</option>
                  {gruposDisponiblesImprimir.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {(filtroClienteImprimir || filtroTipoImprimir !== "TODOS" || filtroGrupoImprimir !== "TODOS") && (
                  <button
                    onClick={() => {
                      setFiltroClienteImprimir("");
                      setFiltroTipoImprimir("TODOS");
                      setFiltroGrupoImprimir("TODOS");
                    }}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 text-left">
                        <input
                          type="checkbox"
                          checked={filasFiltradasImprimir.length > 0 && despachoImprimirSeleccion.size === filasFiltradasImprimir.length}
                          onChange={toggleDespachoImprimirTodas}
                          className="rounded border-slate-300"
                        />
                      </th>
                      <th className="py-3 px-4 text-left">Guía</th>
                      <th className="py-3 px-4 text-left">Fecha creación</th>
                      <th className="py-3 px-4 text-left">Cliente</th>
                      <th className="py-3 px-4 text-left">Grupo</th>
                      <th className="py-3 px-4 text-left">Transporte</th>
                      <th className="py-3 px-4 text-left">Tipo</th>
                      <th className="py-3 px-4 text-left">Cajas</th>
                      <th className="py-3 px-4 text-left">Unid.</th>
                      <th className="py-3 px-4 text-left">Bultos insumos</th>
                      <th className="py-3 px-4 text-left">Bultos producto</th>
                      <th className="py-3 px-4 text-left">Estado WMS</th>
                      <th className="py-3 px-4 text-left">Guía impresa</th>
                      <th className="py-3 px-4 text-left">Remito impreso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filasFiltradasImprimir.map((fila) => (
                      <tr key={fila.despacho_cab_id}>
                        <td className="py-3 px-4 text-left">
                          <input
                            type="checkbox"
                            checked={despachoImprimirSeleccion.has(fila.despacho_cab_id)}
                            onChange={() => toggleDespachoImprimirFila(fila.despacho_cab_id)}
                            className="rounded border-slate-300"
                          />
                        </td>
                        <td className="py-3 px-4 text-left font-medium text-slate-700">{fila.numero_guia || fila.guia}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fmtFecha(fila.fecha_creacion)}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.cliente || "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.grupos.length > 0 ? fila.grupos.join(", ") : "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.transporte || "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.tipo || "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.cajas ?? "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.unidades ?? "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.bultos_insumos ?? "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.bultos_producto ?? "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.estado_wms || "—"}</td>
                        <td className="py-3 px-4 text-left">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              fila.guia_impresa ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {fila.guia_impresa ? "Sí" : "No"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-left">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              fila.remito_impreso ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {fila.remito_impreso ? "Sí" : "No"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {despachoImprimirData && filasFiltradasImprimir.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-8">
                    {despachoImprimirData.filas.length === 0
                      ? "No hay guías pendientes de imprimir. Importá las guías de hoy desde el WMS."
                      : "Ninguna guía coincide con los filtros."}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: DESPACHO - PARA REIMPRIMIR ================= */}
          {activeTab === "DESP-Reimprimir" && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h2 className="text-lg font-bold text-slate-800">Despacho — Guías Impresas</h2>
                {despachoReimprimirData && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Última actualización: <span className="font-medium text-slate-700">{fmtFecha(despachoReimprimirData.updatedAt)}</span>
                  </div>
                )}
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Guías que ya se imprimieron completas (guía + remito). Cada reimpresión queda registrada con tu
                usuario y la fecha/hora.
              </p>

              {tienePermiso("DESP-Reimprimir") && (
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={despachoReimprimirDocumentos}
                    onChange={(e) => setDespachoReimprimirDocumentos(e.target.value as "ambos" | "guia" | "remito")}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="ambos">Guía y remito</option>
                    <option value="guia">Solo guía</option>
                    <option value="remito">Solo remito</option>
                  </select>
                  <ActualizarAgenteBoton
                    seccion="despacho_reimprimir"
                    label={`Reimprimir seleccionadas (${despachoReimprimirSeleccion.size})`}
                    deshabilitado={despachoReimprimirSeleccion.size === 0}
                    payload={{
                      documentos: despachoReimprimirDocumentos,
                      guias: (despachoReimprimirData?.filas || [])
                        .filter((f) => despachoReimprimirSeleccion.has(f.despacho_cab_id))
                        .map((f) => ({ despachoCabId: f.despacho_cab_id, guia: f.guia, tipo: f.tipo })),
                    }}
                    onCorriendoChange={setDespachoReimprimiendoEnCurso}
                    onExito={() => {
                      setDataVersion((v) => v + 1);
                      setDespachoReimprimirSeleccion(new Set());
                    }}
                  />
                </div>
              )}

              {despachoReimprimirError && (
                <div className="mt-4 mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar las guías: {despachoReimprimirError}
                </div>
              )}
              {despachoReimprimirLoading && !despachoReimprimirData && (
                <div className="mt-4 mb-4 rounded-lg border border-slate-200 overflow-hidden">
                  <SkeletonTable rows={6} columns={11} />
                </div>
              )}

              <div className="flex items-center gap-3 mt-4 mb-4 flex-wrap">
                <input
                  type="text"
                  value={filtroClienteReimprimir}
                  onChange={(e) => setFiltroClienteReimprimir(e.target.value)}
                  placeholder="Buscar por cliente..."
                  className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-56"
                />
                <select
                  value={filtroTipoReimprimir}
                  onChange={(e) => setFiltroTipoReimprimir(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODOS">Todos los tipos</option>
                  {tiposDisponiblesReimprimir.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={filtroGrupoReimprimir}
                  onChange={(e) => setFiltroGrupoReimprimir(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODOS">Todos los grupos</option>
                  {gruposDisponiblesReimprimir.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {(filtroClienteReimprimir || filtroTipoReimprimir !== "TODOS" || filtroGrupoReimprimir !== "TODOS") && (
                  <button
                    onClick={() => {
                      setFiltroClienteReimprimir("");
                      setFiltroTipoReimprimir("TODOS");
                      setFiltroGrupoReimprimir("TODOS");
                    }}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 text-left">
                        <input
                          type="checkbox"
                          checked={filasFiltradasReimprimir.length > 0 && despachoReimprimirSeleccion.size === filasFiltradasReimprimir.length}
                          onChange={toggleDespachoReimprimirTodas}
                          className="rounded border-slate-300"
                        />
                      </th>
                      <th className="py-3 px-4 text-left">Guía</th>
                      <th className="py-3 px-4 text-left">Cliente</th>
                      <th className="py-3 px-4 text-left">Grupo</th>
                      <th className="py-3 px-4 text-left">Transporte</th>
                      <th className="py-3 px-4 text-left">Tipo</th>
                      <th className="py-3 px-4 text-left">Bultos insumos</th>
                      <th className="py-3 px-4 text-left">Bultos producto</th>
                      <th className="py-3 px-4 text-left">Guía impresa</th>
                      <th className="py-3 px-4 text-left">Remito impreso</th>
                      <th className="py-3 px-4 text-left">Última impresión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filasFiltradasReimprimir.map((fila) => (
                      <tr key={fila.despacho_cab_id}>
                        <td className="py-3 px-4 text-left">
                          <input
                            type="checkbox"
                            checked={despachoReimprimirSeleccion.has(fila.despacho_cab_id)}
                            onChange={() => toggleDespachoReimprimirFila(fila.despacho_cab_id)}
                            className="rounded border-slate-300"
                          />
                        </td>
                        <td className="py-3 px-4 text-left font-medium text-slate-700">{fila.numero_guia || fila.guia}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.cliente || "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.grupos.length > 0 ? fila.grupos.join(", ") : "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.transporte || "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.tipo || "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.bultos_insumos ?? "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fila.bultos_producto ?? "—"}</td>
                        <td className="py-3 px-4 text-left">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            Sí
                          </span>
                        </td>
                        <td className="py-3 px-4 text-left">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            Sí
                          </span>
                        </td>
                        <td className="py-3 px-4 text-left text-slate-600">
                          {fmtFecha(fila.remito_impreso_en || fila.guia_impresa_en)}
                          {(fila.remito_impreso_por_nombre || fila.guia_impresa_por_nombre) && (
                            <span className="text-slate-400"> — {fila.remito_impreso_por_nombre || fila.guia_impresa_por_nombre}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {despachoReimprimirData && filasFiltradasReimprimir.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-8">
                    {despachoReimprimirData.filas.length === 0
                      ? "No hay guías impresas completas todavía."
                      : "Ninguna guía coincide con los filtros."}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: DESPACHO - GRUPOS DE CLIENTES (ADMIN) ================= */}
          {activeTab === "DESP-Grupos" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Configuración general</h2>
                <p className="text-sm text-slate-500 mb-4">
                  Estos ajustes afectan lo que ve cualquier usuario en Despacho → Para Imprimir / Guías Impresas.
                </p>
                {despachoConfigError && (
                  <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{despachoConfigError}</div>
                )}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={despachoOcultarTipoCliente ?? false}
                    disabled={despachoOcultarTipoCliente === null || despachoConfigGuardando}
                    onChange={(e) => cambiarDespachoOcultarTipoCliente(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">
                    Ocultar guías de tipo CLIENTE en Para Imprimir / Guías Impresas
                  </span>
                  {despachoConfigGuardando && <span className="text-xs text-slate-400">Guardando...</span>}
                </label>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Grupos de clientes</h2>
                <p className="text-sm text-slate-500 mb-4">
                  Los grupos aparecen como columna y filtro en Despacho → Para Imprimir / Guías Impresas. Un
                  cliente puede pertenecer a varios grupos a la vez (ej. entrega martes Y jueves).
                </p>
                {despachoGruposError && (
                  <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{despachoGruposError}</div>
                )}
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Nombre del grupo nuevo"
                    value={nombreNuevoGrupo}
                    onChange={(e) => setNombreNuevoGrupo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && crearDespachoGrupo()}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-72"
                  />
                  <button
                    onClick={crearDespachoGrupo}
                    disabled={!nombreNuevoGrupo.trim() || creandoGrupo}
                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      !nombreNuevoGrupo.trim() || creandoGrupo
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {creandoGrupo ? "Creando..." : "Crear grupo"}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Grupos existentes</h2>
                {despachoGruposCargando && despachoGrupos === null && <p className="text-sm text-slate-400">Cargando...</p>}
                {despachoGrupos !== null && despachoGrupos.length === 0 && (
                  <p className="text-sm text-slate-400">Todavía no creaste ningún grupo.</p>
                )}
                <div className="space-y-3">
                  {(despachoGrupos || []).map((g) => {
                    const expandido = grupoExpandido === g.id;
                    return (
                      <div key={g.id} className="border border-slate-200 rounded-lg">
                        <button
                          onClick={() => setGrupoExpandido(expandido ? null : g.id)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-slate-800">{g.nombre}</span>
                            <span className="text-xs text-slate-400">
                              {g.miembros.length} cliente{g.miembros.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                borrarDespachoGrupo(g.id);
                              }}
                              className="text-sm text-red-600 hover:underline"
                            >
                              Borrar
                            </span>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandido ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </div>
                        </button>
                        {expandido && (
                          <div className="border-t border-slate-200 p-4">
                            <div className="flex items-center gap-3 mb-4">
                              <input
                                type="text"
                                placeholder="Número de cliente"
                                value={codigoNuevoMiembro}
                                onChange={(e) => setCodigoNuevoMiembro(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && agregarMiembroGrupo(g.id)}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-48"
                              />
                              <button
                                onClick={() => agregarMiembroGrupo(g.id)}
                                disabled={!codigoNuevoMiembro.trim() || agregandoMiembro}
                                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                  !codigoNuevoMiembro.trim() || agregandoMiembro
                                    ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                }`}
                              >
                                Agregar cliente
                              </button>
                            </div>
                            {g.miembros.length === 0 ? (
                              <p className="text-sm text-slate-400">Sin clientes en este grupo todavía.</p>
                            ) : (
                              <table className="w-full text-sm text-left">
                                <thead className="text-slate-500 font-medium border-b border-slate-200">
                                  <tr>
                                    <th className="py-2 px-3 text-left">Número</th>
                                    <th className="py-2 px-3 text-left">Cliente</th>
                                    <th className="py-2 px-3 text-left">Acciones</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {g.miembros.map((m) => (
                                    <tr key={m.codigoCliente}>
                                      <td className="py-2 px-3 text-left font-medium text-slate-700">{m.codigoCliente}</td>
                                      <td className="py-2 px-3 text-left text-slate-600">{m.nombre || "—"}</td>
                                      <td className="py-2 px-3 text-left">
                                        <button
                                          onClick={() => quitarMiembroGrupo(g.id, m.codigoCliente)}
                                          className="text-sm text-red-600 hover:underline"
                                        >
                                          Quitar
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <h2 className="text-lg font-bold text-slate-800">Log de eventos de impresión</h2>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={despachoEventosSoloErrores}
                        onChange={(e) => setDespachoEventosSoloErrores(e.target.checked)}
                        className="w-3.5 h-3.5"
                      />
                      Solo errores
                    </label>
                    <button
                      onClick={cargarDespachoEventos}
                      disabled={despachoEventosCargando}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                    >
                      {despachoEventosCargando ? "Actualizando..." : "Actualizar"}
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                  Cada intento de imprimir la guía o el remito de un despacho (éxito o error), con quién y cuándo lo
                  pidió. Solo visible para admins -- útil para ver el motivo puntual de una falla sin depender de la
                  consola del Agente Local, que corre sin ventana visible.
                </p>
                {despachoEventosError && (
                  <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{despachoEventosError}</div>
                )}
                {despachoEventosCargando && despachoEventos === null && <p className="text-sm text-slate-400">Cargando...</p>}
                {despachoEventos !== null && despachoEventos.length === 0 && (
                  <p className="text-sm text-slate-400">
                    {despachoEventosSoloErrores ? "Sin errores registrados." : "Sin eventos registrados todavía."}
                  </p>
                )}
                {despachoEventos !== null && despachoEventos.length > 0 && (
                  <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-slate-500 font-medium border-b border-slate-200">
                          <th className="py-2 px-3 text-left">Fecha</th>
                          <th className="py-2 px-3 text-left">Guía</th>
                          <th className="py-2 px-3 text-left">Tipo</th>
                          <th className="py-2 px-3 text-left">Paso</th>
                          <th className="py-2 px-3 text-left">Resultado</th>
                          <th className="py-2 px-3 text-left">Usuario</th>
                          <th className="py-2 px-3 text-left">Mensaje</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {despachoEventos.map((ev) => (
                          <tr key={ev.id}>
                            <td className="py-2 px-3 text-left text-slate-500">{fmtFecha(ev.ocurrido_en)}</td>
                            <td className="py-2 px-3 text-left font-medium text-slate-700">{ev.guia || "—"}</td>
                            <td className="py-2 px-3 text-left text-slate-600">{ev.tipo}</td>
                            <td className="py-2 px-3 text-left text-slate-600">{ev.paso}</td>
                            <td className="py-2 px-3 text-left">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  ev.resultado === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                                }`}
                              >
                                {ev.resultado === "ok" ? "OK" : "Error"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-left text-slate-600">{ev.usuario_nombre || "—"}</td>
                            <td className="py-2 px-3 text-left text-slate-500 whitespace-pre-wrap max-w-md">{ev.mensaje || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: DESPACHO - SKU DE INSUMOS (ADMIN) ================= */}
          {activeTab === "DESP-SkuInsumos" && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-2xl">
              <h2 className="text-lg font-bold text-slate-800 mb-1">SKU de Insumos</h2>
              <p className="text-sm text-slate-500 mb-4">
                SKU catalogados como insumo (no producto). Se usan para clasificar, en el packing list de cada guía
                Propio, qué cajas son 100% insumo -- si una caja tiene aunque sea un SKU que no está acá, se cuenta
                como producto.
              </p>

              <div className="flex items-end gap-3 flex-wrap mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">SKU</label>
                  <input
                    type="text"
                    value={nuevoSkuInsumo}
                    onChange={(e) => setNuevoSkuInsumo(e.target.value)}
                    placeholder="Ej: V25LM001%018"
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-52"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Descripción (opcional)</label>
                  <input
                    type="text"
                    value={nuevaDescripcionSkuInsumo}
                    onChange={(e) => setNuevaDescripcionSkuInsumo(e.target.value)}
                    placeholder="Ej: BOLSA CHK FRIS GDE INST"
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-64"
                  />
                </div>
                <button
                  onClick={agregarSkuInsumo}
                  disabled={agregandoSkuInsumo || !nuevoSkuInsumo.trim()}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    agregandoSkuInsumo || !nuevoSkuInsumo.trim()
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {agregandoSkuInsumo ? "Agregando..." : "Agregar"}
                </button>
              </div>

              {insumosSkusError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {insumosSkusError}
                </div>
              )}
              {insumosSkusCargando && insumosSkus === null && <p className="text-sm text-slate-400">Cargando...</p>}

              {insumosSkus && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead>
                      <tr className="text-slate-500 font-medium border-b border-slate-200">
                        <th className="py-2 px-3 text-left">SKU</th>
                        <th className="py-2 px-3 text-left">Descripción</th>
                        <th className="py-2 px-3 text-left"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {insumosSkus.map((it) => (
                        <tr key={it.sku}>
                          <td className="py-2 px-3 text-left font-medium text-slate-700">{it.sku}</td>
                          <td className="py-2 px-3 text-left text-slate-600">{it.descripcion || "—"}</td>
                          <td className="py-2 px-3 text-left">
                            <button
                              onClick={() => quitarSkuInsumo(it.sku)}
                              className="text-xs font-medium text-red-600 hover:underline"
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {insumosSkus.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-8">Todavía no agregaste ningún SKU.</p>
                  )}
                  <p className="text-xs text-slate-400 mt-3">{insumosSkus.length} SKU cargados.</p>
                </div>
              )}
            </div>
          )}

          {/* ================= PESTAÑA: INBOUND - IMPORTAR DATOS ================= */}
          {activeTab === "INB-Importar" && <INBImportar />}

          {/* ================= PESTAÑA: INBOUND - RESUMEN ================= */}
          {activeTab === "INB-Resumen" && <INBResumen />}

          {/* ================= PESTAÑA: CARGA INICIAL - IMPORTAR DATOS ================= */}
          {activeTab === "CI-Importar" && <CIImportar />}

          {/* ================= PESTAÑA: CARGA INICIAL - RESUMEN ================= */}
          {activeTab === "CI-Resumen" && <CIResumen />}

          {/* ================= PESTAÑA: CARGA INICIAL - AVANCE PLAN ================= */}
          {activeTab === "CI-Avance" && <CIAvance />}

          {/* ================= PESTAÑA: CARGA INICIAL - CARGA DATOS ================= */}
          {activeTab === "CI-Carga" && <CICarga />}

          {/* ================= PESTAÑA: REMANENTES - IMPORTAR DATOS ================= */}
          {activeTab === "REM-Importar" && <RemImportar />}

          {/* ================= PESTAÑA: REMANENTES - RESUMEN ================= */}
          {activeTab === "REM-Resumen" && <RemResumen />}

          {/* ================= PESTAÑA: REMANENTES - AVANCE PLAN ================= */}
          {activeTab === "REM-Avance" && <RemAvance />}

          {/* ================= PESTAÑA: REMANENTES - CARGA DATOS ================= */}
          {activeTab === "REM-Carga" && <RemCarga />}

          {/* ================= PESTAÑA: OCUPACIÓN ALMACÉN - IMPORTAR DATOS ================= */}
          {activeTab === "ALM-Importar" && <AlmImportar />}

          {/* ================= PESTAÑA: OCUPACIÓN ALMACÉN - RESUMEN ================= */}
          {activeTab === "ALM-Resumen" && <AlmResumen />}

          {/* ================= PESTAÑA: OCUPACIÓN ALMACÉN - CONFIGURACIÓN ================= */}
          {activeTab === "ALM-Configuracion" && <AlmConfiguracion />}

          {/* ================= PESTAÑA: EXPEDICIÓN - INTERLOCALES ================= */}
          {activeTab === "EXP-Interlocales" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-4xl">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-bold text-slate-800">
                    {interlocalEditandoId ? `Modificar Interlocal #${interlocalEditandoId}` : "Registrar Interlocal"}
                  </h2>
                  {interlocalEditandoId && (
                    <button
                      onClick={cancelarEdicionInterlocal}
                      className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-500 mb-4">
                  Transcribí los datos del rótulo físico &quot;GRUPO ALTATEX / INTERLOCAL&quot; pegado al bulto, en el
                  mismo orden en que aparecen en el papel.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">¿Qué se va a enviar? *</label>
                    <select
                      value={interlocalForm.tipoEnvio}
                      onChange={(e) => cambiarTipoEnvioInterlocal(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccioná una opción...</option>
                      <option value="productos">Productos</option>
                      <option value="varios">Varios</option>
                      <option value="control_calidad">Control de Calidad</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Fecha *</label>
                    <input
                      type="date"
                      disabled={!interlocalTipoEnvioElegido}
                      value={interlocalForm.fecha}
                      onChange={(e) => actualizarInterlocalForm("fecha", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Marca (CHK / CQ / AW)</label>
                    <select
                      disabled={!interlocalTipoEnvioElegido}
                      value={interlocalForm.marca}
                      onChange={(e) => actualizarInterlocalForm("marca", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Sin marca</option>
                      <option value="CHEEKY">CHK - Cheeky</option>
                      <option value="COMO QUIERES">CQ - Como Quieres</option>
                      <option value="AWADA">AW - Awada</option>
                      <option value="ESTUDIO 5">ET5 - Estudio 5</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Local N° (origen) *</label>
                    <input
                      type="text"
                      list="interlocal-origen-list"
                      disabled={!interlocalTipoEnvioElegido}
                      value={interlocalForm.localOrigenCodigo}
                      onChange={(e) => {
                        actualizarInterlocalForm("localOrigenCodigo", e.target.value);
                        buscarClientesDebounced(e.target.value, setBusquedaOrigen);
                        if (interlocalForm.tipoEnvio === "productos" || interlocalForm.tipoEnvio === "varios") {
                          sincronizarNumeroAutomaticoInterlocal(interlocalForm.tipoEnvio, e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <datalist id="interlocal-origen-list">
                      {busquedaOrigen.map((c) => (
                        <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Destino (código local) *</label>
                    <input
                      type="text"
                      list="interlocal-destino-list"
                      disabled={!interlocalTipoEnvioElegido}
                      value={interlocalForm.localDestinoCodigo}
                      onChange={(e) => {
                        actualizarInterlocalForm("localDestinoCodigo", e.target.value);
                        buscarClientesDebounced(e.target.value, setBusquedaDestino);
                      }}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <datalist id="interlocal-destino-list">
                      {busquedaDestino.map((c) => (
                        <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      N° de Movimiento{!interlocalNumeroAutomatico ? " *" : ""}
                    </label>
                    <input
                      type="text"
                      disabled={!interlocalTipoEnvioElegido || !interlocalRemitoEditable}
                      placeholder={interlocalNumeroAutomatico ? "Se asigna automáticamente" : undefined}
                      value={interlocalForm.numeroMovimiento}
                      onChange={(e) => actualizarInterlocalForm("numeroMovimiento", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">N° de Remito</label>
                    <input
                      type="text"
                      disabled={!interlocalTipoEnvioElegido || !interlocalRemitoEditable}
                      placeholder={interlocalNumeroAutomatico ? "Se asigna automáticamente" : undefined}
                      value={interlocalForm.numeroRemito}
                      onChange={(e) => actualizarInterlocalForm("numeroRemito", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className={interlocalCantidadBultosNum > 1 ? "md:col-span-2" : undefined}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      N° Etiqueta *
                      {interlocalCantidadBultosNum > 1
                        ? ` (${interlocalForm.etiquetas.length}/${interlocalCantidadBultosNum} cargadas)`
                        : ""}
                    </label>
                    <input
                      type="text"
                      disabled={
                        !interlocalTipoEnvioElegido ||
                        (interlocalCantidadBultosNum > 1 && interlocalForm.etiquetas.length >= interlocalCantidadBultosNum)
                      }
                      placeholder="se usa como guía WMS"
                      value={interlocalForm.numeroEtiqueta}
                      onChange={(e) => onChangeNumeroEtiquetaInterlocal(e.target.value)}
                      onKeyDown={onKeyDownEtiquetaConEscaneo}
                      onKeyUp={clampCursorNumeroEtiquetaInterlocal}
                      onClick={clampCursorNumeroEtiquetaInterlocal}
                      onFocus={clampCursorNumeroEtiquetaInterlocal}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-400 mt-1">Podés escribirla a mano o escanearla con un lector USB.</p>
                    {interlocalCantidadBultosNum > 1 && interlocalForm.etiquetas.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {interlocalForm.etiquetas.map((et, i) => (
                          <li
                            key={et}
                            className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-slate-200 text-xs text-slate-600"
                          >
                            {et}
                            <button
                              type="button"
                              onClick={() => quitarEtiquetaInterlocalMultiBulto(i)}
                              className="w-4 h-4 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-300 hover:text-red-600"
                              aria-label={`Quitar etiqueta ${et}`}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {interlocalCantidadBultosNum > 1 && interlocalForm.etiquetas.length >= interlocalCantidadBultosNum && (
                      <p className="text-xs text-emerald-600 mt-1">Ya cargaste las {interlocalCantidadBultosNum} etiquetas.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Bultos</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      disabled={!interlocalTipoEnvioElegido}
                      value={interlocalForm.cantidadBultos}
                      onChange={(e) => actualizarCantidadBultosInterlocal(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Observaciones</label>
                    <input
                      type="text"
                      disabled={!interlocalTipoEnvioElegido}
                      placeholder="ej. qué va dentro del bulto"
                      value={interlocalForm.observaciones}
                      onChange={(e) => actualizarInterlocalForm("observaciones", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {interlocalGuardadoError && (
                  <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    {interlocalGuardadoError}
                  </div>
                )}
                {interlocalGuardadoOk && (
                  <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                    {interlocalEditandoId ? "Interlocal modificado correctamente." : "Interlocal registrado correctamente."}
                  </div>
                )}

                <div className="flex items-center gap-3 mt-6">
                  <button
                    onClick={registrarInterlocal}
                    disabled={
                      interlocalGuardando ||
                      !interlocalForm.tipoEnvio ||
                      !interlocalForm.numeroMovimiento ||
                      !interlocalForm.localOrigenCodigo ||
                      !interlocalForm.localDestinoCodigo ||
                      !interlocalForm.fecha ||
                      !interlocalEtiquetasCompletas
                    }
                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      interlocalGuardando
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {interlocalGuardando
                      ? interlocalEditandoId
                        ? "Guardando..."
                        : "Registrando..."
                      : interlocalEditandoId
                        ? "Guardar cambios"
                        : "Registrar Interlocal"}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Interlocales pendientes</h2>
                <p className="text-sm text-slate-500 mb-4">Todavía no se incluyeron en ninguna Hoja de Ruta.</p>

                <div className="mb-4">
                  <input
                    type="text"
                    value={filtroTextoInterlocalesPendientes}
                    onChange={(e) => setFiltroTextoInterlocalesPendientes(e.target.value)}
                    placeholder="Buscar por origen, destino, marca, N° movimiento, remito, etiqueta u observaciones..."
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-full max-w-md"
                  />
                </div>

                {interlocalesError && (
                  <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    Error al cargar los interlocales: {interlocalesError}
                  </div>
                )}
                {interlocalesLoading && !interlocalesData && (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <SkeletonTable rows={6} columns={11} />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-left">Fecha</th>
                        <th className="py-3 px-4 text-left">Origen</th>
                        <th className="py-3 px-4 text-left">Destino</th>
                        <th className="py-3 px-4 text-left">Marca</th>
                        <th className="py-3 px-4 text-left">N° Movimiento</th>
                        <th className="py-3 px-4 text-left">N° Remito</th>
                        <th className="py-3 px-4 text-left">Bultos</th>
                        <th className="py-3 px-4 text-left">Observaciones</th>
                        <th className="py-3 px-4 text-left">Registrado por</th>
                        <th className="py-3 px-4 text-left">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filasFiltradasInterlocalesPendientes(interlocalesData?.filas || []).map((f) => (
                        <tr key={f.id}>
                          <td className="py-3 px-4 text-left">{f.fecha}</td>
                          <td className="py-3 px-4 text-left">{f.local_origen_codigo} — {f.local_origen_nombre || "—"}</td>
                          <td className="py-3 px-4 text-left">{f.local_destino_codigo} — {f.local_destino_nombre || "—"}</td>
                          <td className="py-3 px-4 text-left">{f.marca || "—"}</td>
                          <td className="py-3 px-4 text-left">{f.numero_movimiento}</td>
                          <td className="py-3 px-4 text-left">{f.numero_remito || "—"}</td>
                          <td className="py-3 px-4 text-left">{f.cantidad_bultos}</td>
                          <td className="py-3 px-4 text-left">{f.observaciones || "—"}</td>
                          <td className="py-3 px-4 text-left">{f.registrado_por_nombre || "—"}</td>
                          <td className="py-3 px-4 text-left">
                            <button
                              onClick={() => iniciarEdicionInterlocal(f)}
                              className="text-sm text-blue-600 hover:underline mr-3"
                            >
                              Modificar
                            </button>
                            {tienePermiso("EXP-InterlocalesEliminar") && (
                              <button
                                onClick={() => eliminarInterlocal(f)}
                                disabled={interlocalEliminandoId === f.id}
                                className="text-sm text-red-600 hover:underline disabled:opacity-50"
                              >
                                {interlocalEliminandoId === f.id ? "Eliminando..." : "Eliminar"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {filasFiltradasInterlocalesPendientes(interlocalesData?.filas || []).length === 0 && !interlocalesLoading && (
                        <tr>
                          <td colSpan={10} className="py-6 px-4 text-center text-slate-400">
                            {(interlocalesData?.filas || []).length === 0
                              ? "No hay interlocales pendientes."
                              : "Ningún interlocal coincide con la búsqueda."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: EXPEDICIÓN - HOJA DE RUTA ================= */}
          {activeTab === "EXP-HojaRuta" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <h2 className="text-lg font-bold text-slate-800">
                    {hdrEditandoId ? `Modificar Hoja de Ruta #${hdrEditandoId}` : "Armar Hoja de Ruta"}
                  </h2>
                  {hdrEditandoId && (
                    <button
                      onClick={cancelarEdicionHojaDeRuta}
                      className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-500 mb-4">
                  {hdrEditandoId
                    ? "Tildá o destildá lo que quieras agregar o sacar, y guardá los cambios."
                    : "Elegí el local destino para traer todos los interlocales pendientes y los despachos del WMS todavía sin incluir en otra hoja."}
                </p>

                <div className="flex items-end gap-3 flex-wrap mb-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Local destino</label>
                    <input
                      type="text"
                      list="hdr-local-list"
                      value={hdrLocalCodigo}
                      disabled={!!hdrEditandoId}
                      onChange={(e) => {
                        setHdrLocalCodigo(e.target.value);
                        buscarClientesDebounced(e.target.value, setBusquedaLocalHdr);
                      }}
                      className="w-48 px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                    />
                    <datalist id="hdr-local-list">
                      {busquedaLocalHdr.map((c) => (
                        <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
                      ))}
                    </datalist>
                  </div>
                  {!hdrEditandoId && (
                    <button
                      onClick={() => buscarDisponiblesHdr()}
                      disabled={hdrBuscando || !hdrLocalCodigo}
                      className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        hdrBuscando || !hdrLocalCodigo
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {hdrBuscando ? "Buscando..." : "Buscar disponibles"}
                    </button>
                  )}
                </div>

                {hdrBuscarError && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{hdrBuscarError}</div>
                )}

                {hdrYaSeBusco && (
                  <>
                    <h3 className="text-sm font-bold text-slate-700 mt-4 mb-2">
                      Interlocales pendientes ({hdrDisponiblesInterlocales.length})
                    </h3>
                    {hdrDisponiblesInterlocales.length === 0 ? (
                      <p className="text-sm text-slate-400 mb-4">No hay interlocales pendientes para este local.</p>
                    ) : (
                      <div className="overflow-x-auto mb-4">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                          <thead className="text-slate-500 font-medium border-b border-slate-200">
                            <tr>
                              <th className="py-2 px-3"></th>
                              <th className="py-2 px-3 text-left">Origen</th>
                              <th className="py-2 px-3 text-left">Destino</th>
                              <th className="py-2 px-3 text-left">N° Movimiento</th>
                              <th className="py-2 px-3 text-left">N° Remito</th>
                              <th className="py-2 px-3 text-left">Marca</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {hdrDisponiblesInterlocales.map((f) => (
                              <tr key={f.id}>
                                <td className="py-2 px-3">
                                  <input
                                    type="checkbox"
                                    checked={hdrSeleccionInterlocales.has(f.id)}
                                    onChange={() => toggleHdrInterlocal(f.id)}
                                    className="rounded border-slate-300"
                                  />
                                </td>
                                <td className="py-2 px-3 text-left">{f.local_origen_codigo} — {f.local_origen_nombre || "—"}</td>
                                <td className="py-2 px-3 text-left">{f.local_destino_codigo} — {f.local_destino_nombre || "—"}</td>
                                <td className="py-2 px-3 text-left">{f.numero_movimiento}</td>
                                <td className="py-2 px-3 text-left">{f.numero_remito || "—"}</td>
                                <td className="py-2 px-3 text-left">{f.marca || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <h3 className="text-sm font-bold text-slate-700 mt-4 mb-2">
                      Despachos WMS disponibles ({hdrDisponiblesDespachos.length})
                    </h3>
                    {hdrDisponiblesDespachos.length === 0 ? (
                      <p className="text-sm text-slate-400 mb-4">No hay despachos WMS disponibles para este local.</p>
                    ) : (
                      <div className="overflow-x-auto mb-4">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                          <thead className="text-slate-500 font-medium border-b border-slate-200">
                            <tr>
                              <th className="py-2 px-3"></th>
                              <th className="py-2 px-3 text-left">Cliente</th>
                              <th className="py-2 px-3 text-left">Guía</th>
                              <th className="py-2 px-3 text-left">Tipo</th>
                              <th className="py-2 px-3 text-left">Cajas</th>
                              <th className="py-2 px-3 text-left">Unid.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {hdrDisponiblesDespachos.map((f) => (
                              <tr key={f.despacho_cab_id}>
                                <td className="py-2 px-3">
                                  <input
                                    type="checkbox"
                                    checked={hdrSeleccionDespachos.has(f.despacho_cab_id)}
                                    onChange={() => toggleHdrDespacho(f.despacho_cab_id)}
                                    className="rounded border-slate-300"
                                  />
                                </td>
                                <td className="py-2 px-3 text-left">{f.cliente || "—"}</td>
                                <td className="py-2 px-3 text-left">{f.numero_guia || f.guia || "—"}</td>
                                <td className="py-2 px-3 text-left">{f.tipo || "—"}</td>
                                <td className="py-2 px-3 text-left">{f.cajas ?? "—"}</td>
                                <td className="py-2 px-3 text-left">{f.unidades ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Transporte</label>
                        <input
                          type="text"
                          value={hdrTransporte}
                          onChange={(e) => setHdrTransporte(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Patente</label>
                        <input
                          type="text"
                          value={hdrPatente}
                          onChange={(e) => setHdrPatente(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Chofer</label>
                        <input
                          type="text"
                          value={hdrChofer}
                          onChange={(e) => setHdrChofer(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {hdrCrearError && (
                      <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{hdrCrearError}</div>
                    )}

                    <div className="mt-4">
                      <button
                        onClick={crearHojaDeRuta}
                        disabled={hdrCreando || hdrSeleccionInterlocales.size + hdrSeleccionDespachos.size === 0}
                        className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                          hdrCreando || hdrSeleccionInterlocales.size + hdrSeleccionDespachos.size === 0
                            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        }`}
                      >
                        {hdrCreando
                          ? hdrEditandoId
                            ? "Guardando..."
                            : "Creando..."
                          : hdrEditandoId
                          ? `Guardar cambios (${hdrSeleccionInterlocales.size + hdrSeleccionDespachos.size} ítems)`
                          : `Confirmar e imprimir (${hdrSeleccionInterlocales.size + hdrSeleccionDespachos.size} ítems)`}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Histórico de Hojas de Ruta</h2>

                <div className="mb-4">
                  <input
                    type="text"
                    value={filtroTextoHojasDeRuta}
                    onChange={(e) => setFiltroTextoHojasDeRuta(e.target.value)}
                    placeholder="Buscar por local, transporte, patente, chofer o estado..."
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-full max-w-md"
                  />
                </div>

                {hojasDeRutaError && (
                  <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    Error al cargar el histórico: {hojasDeRutaError}
                  </div>
                )}
                {hojasDeRutaLoading && !hojasDeRutaData && (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <SkeletonTable rows={6} columns={5} />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-left">Fecha</th>
                        <th className="py-3 px-4 text-left">Local</th>
                        <th className="py-3 px-4 text-left">Estado</th>
                        <th className="py-3 px-4 text-left">Creado por</th>
                        <th className="py-3 px-4 text-left">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {hojasDeRutaFiltradas.map((h) => (
                        <tr key={h.id}>
                          <td className="py-3 px-4 text-left">{h.fecha}</td>
                          <td className="py-3 px-4 text-left">{h.local_codigo} — {h.local_nombre || "—"}</td>
                          <td className="py-3 px-4 text-left">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                h.estado === "impresa"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : h.estado === "anulada"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {h.estado}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-left">{h.creado_por_nombre || "—"}</td>
                          <td className="py-3 px-4 text-left">
                            <a
                              href={`/hoja-ruta/${h.id}/imprimir`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline mr-3"
                            >
                              Ver / Reimprimir
                            </a>
                            {h.estado !== "anulada" && h.bloqueada_dp_cot_ok && (
                              <span
                                className="text-slate-400"
                                title="Alguna guía de esta hoja ya está en estado DP_COT_OK en el WMS -- no se puede modificar ni anular."
                              >
                                Bloqueada (DP_COT_OK)
                              </span>
                            )}
                            {h.estado !== "anulada" && !h.bloqueada_dp_cot_ok && (
                              <>
                                <button
                                  onClick={() => iniciarEdicionHojaDeRuta(h)}
                                  className="text-blue-600 hover:underline mr-3"
                                >
                                  Modificar
                                </button>
                                <button
                                  onClick={() => anularHojaDeRuta(h.id)}
                                  disabled={hdrAnulando === h.id}
                                  className="text-red-600 hover:underline disabled:opacity-50"
                                >
                                  {hdrAnulando === h.id ? "Anulando..." : "Anular"}
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                      {hojasDeRutaFiltradas.length === 0 && !hojasDeRutaLoading && (
                        <tr>
                          <td colSpan={5} className="py-6 px-4 text-center text-slate-400">
                            {(hojasDeRutaData?.filas || []).length === 0
                              ? "Todavía no se creó ninguna Hoja de Ruta."
                              : "Ninguna hoja de ruta coincide con la búsqueda."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: EXPEDICIÓN - HISTÓRICO DESPACHADOS ================= */}
          {activeTab === "EXP-Historico" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Histórico Despachados</h2>
                <p className="text-sm text-slate-500 mb-4">
                  Interlocales cuya Hoja de Ruta ya se imprimió -- confirma que salieron del depósito.
                </p>

                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <input
                    type="text"
                    value={filtroTextoHistorico}
                    onChange={(e) => setFiltroTextoHistorico(e.target.value)}
                    placeholder="Buscar por N° movimiento, remito, etiqueta, origen, destino u observaciones..."
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-80"
                  />
                  <select
                    value={filtroMarcaHistorico}
                    onChange={(e) => setFiltroMarcaHistorico(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas las marcas</option>
                    <option value="CHEEKY">CHK - Cheeky</option>
                    <option value="COMO QUIERES">CQ - Como Quieres</option>
                    <option value="AWADA">AW - Awada</option>
                    <option value="ESTUDIO 5">ET5 - Estudio 5</option>
                    <option value="SIN MARCA">Sin marca</option>
                  </select>
                  <select
                    value={filtroTipoEnvioHistorico}
                    onChange={(e) => setFiltroTipoEnvioHistorico(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="TODOS">Todos los tipos</option>
                    <option value="productos">Solo Productos</option>
                    <option value="varios">Solo Varios</option>
                    <option value="control_calidad">Solo Control de Calidad</option>
                  </select>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span>Desde</span>
                    <input
                      type="date"
                      value={filtroFechaDesdeHistorico}
                      onChange={(e) => setFiltroFechaDesdeHistorico(e.target.value)}
                      className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span>hasta</span>
                    <input
                      type="date"
                      value={filtroFechaHastaHistorico}
                      onChange={(e) => setFiltroFechaHastaHistorico(e.target.value)}
                      className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {(filtroTextoHistorico ||
                    filtroMarcaHistorico !== "TODAS" ||
                    filtroTipoEnvioHistorico !== "TODOS" ||
                    filtroFechaDesdeHistorico ||
                    filtroFechaHastaHistorico) && (
                    <button
                      onClick={() => {
                        setFiltroTextoHistorico("");
                        setFiltroMarcaHistorico("TODAS");
                        setFiltroTipoEnvioHistorico("TODOS");
                        setFiltroFechaDesdeHistorico("");
                        setFiltroFechaHastaHistorico("");
                      }}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>

                {interlocalesHistoricoError && (
                  <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    Error al cargar el histórico: {interlocalesHistoricoError}
                  </div>
                )}
                {interlocalesHistoricoLoading && !interlocalesHistoricoData && (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <SkeletonTable rows={6} columns={10} />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-left">Fecha</th>
                        <th className="py-3 px-4 text-left">Origen</th>
                        <th className="py-3 px-4 text-left">Destino</th>
                        <th className="py-3 px-4 text-left">Marca</th>
                        <th className="py-3 px-4 text-left">Tipo de envío</th>
                        <th className="py-3 px-4 text-left">N° Movimiento</th>
                        <th className="py-3 px-4 text-left">N° Remito</th>
                        <th className="py-3 px-4 text-left">N° Etiqueta</th>
                        <th className="py-3 px-4 text-left">Bultos</th>
                        <th className="py-3 px-4 text-left">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filasFiltradasHistorico.map((f) => (
                        <tr key={f.id}>
                          <td className="py-3 px-4 text-left">{f.fecha}</td>
                          <td className="py-3 px-4 text-left">{f.local_origen_codigo} — {f.local_origen_nombre || "—"}</td>
                          <td className="py-3 px-4 text-left">{f.local_destino_codigo} — {f.local_destino_nombre || "—"}</td>
                          <td className="py-3 px-4 text-left">{f.marca || "—"}</td>
                          <td className="py-3 px-4 text-left">
                            {f.tipo_envio === "varios" ? "Varios" : f.tipo_envio === "control_calidad" ? "Control de Calidad" : "Productos"}
                          </td>
                          <td className="py-3 px-4 text-left">{f.numero_movimiento}</td>
                          <td className="py-3 px-4 text-left">{f.numero_remito || "—"}</td>
                          <td className="py-3 px-4 text-left">
                            {f.etiquetas && f.etiquetas.length > 1 ? f.etiquetas.join(", ") : f.numero_etiqueta || "—"}
                          </td>
                          <td className="py-3 px-4 text-left">{f.cantidad_bultos}</td>
                          <td className="py-3 px-4 text-left">{f.observaciones || "—"}</td>
                        </tr>
                      ))}
                      {filasFiltradasHistorico.length === 0 && !interlocalesHistoricoLoading && (
                        <tr>
                          <td colSpan={10} className="py-6 px-4 text-center text-slate-400">
                            No hay interlocales despachados que coincidan con los filtros.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: EXPEDICIÓN - ETIQUETAS ================= */}
          {activeTab === "EXP-Etiquetas" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-xl">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Imprimir Etiquetas</h2>
                <p className="text-sm text-slate-500 mb-4">
                  Imprime etiquetas en blanco con un código de barras correlativo (
                  <span className="font-mono">interlocal-00001</span>, etc.) en la Zebra de red. Se pegan en el bulto
                  y ese número queda de referencia para completar &quot;N° Etiqueta&quot; al cargar el Interlocal.
                </p>

                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">¿Cuántas etiquetas imprimir?</label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      step={1}
                      value={cantidadEtiquetas}
                      onChange={(e) => setCantidadEtiquetas(e.target.value)}
                      className="w-40 px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={imprimirEtiquetasInterlocal}
                    disabled={imprimiendoEtiquetas || !Number.isInteger(Number(cantidadEtiquetas)) || Number(cantidadEtiquetas) < 1}
                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      imprimiendoEtiquetas
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {imprimiendoEtiquetas ? "Imprimiendo..." : "Imprimir"}
                  </button>
                </div>

                {errorImprimirEtiquetas && (
                  <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    {errorImprimirEtiquetas}
                  </div>
                )}
                {ultimoLoteEtiquetas && ultimoLoteEtiquetas.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                    Se mandó a imprimir de <span className="font-mono">{ultimoLoteEtiquetas[0]}</span> a{" "}
                    <span className="font-mono">{ultimoLoteEtiquetas[ultimoLoteEtiquetas.length - 1]}</span> (
                    {ultimoLoteEtiquetas.length} etiqueta{ultimoLoteEtiquetas.length === 1 ? "" : "s"}).
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Etiquetas impresas</h2>
                <p className="text-sm text-slate-500 mb-4">Últimas 300, más recientes primero.</p>

                {etiquetasError && (
                  <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    Error al cargar el historial: {etiquetasError}
                  </div>
                )}
                {etiquetasLoading && !etiquetasData && (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <SkeletonTable rows={6} columns={3} />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-left">Etiqueta</th>
                        <th className="py-3 px-4 text-left">Impreso por</th>
                        <th className="py-3 px-4 text-left">Fecha y hora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(etiquetasData?.filas || []).map((f) => (
                        <tr key={f.id}>
                          <td className="py-3 px-4 text-left font-mono">{f.texto}</td>
                          <td className="py-3 px-4 text-left">{f.impreso_por_nombre || "—"}</td>
                          <td className="py-3 px-4 text-left">{fmtFecha(f.impreso_en)}</td>
                        </tr>
                      ))}
                      {(etiquetasData?.filas || []).length === 0 && !etiquetasLoading && (
                        <tr>
                          <td colSpan={3} className="py-6 px-4 text-center text-slate-400">
                            Todavía no se imprimió ninguna etiqueta.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: EXPEDICIÓN - ESCÁNER (HANDHELD) ================= */}
          {activeTab === "EXP-Escaner" && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-xl">
              <h2 className="text-lg font-bold text-slate-800 mb-1">Control de Bultos (Escáner)</h2>
              <p className="text-sm text-slate-500 mb-6">
                Abrí esta herramienta desde el handheld (lector de código de barras físico) para controlar, hoja de
                ruta por hoja de ruta, que todos los bultos que salen coincidan con lo cargado. Escaneás el código
                de la Hoja de Ruta impresa y después cada bulto (caja de despacho o etiqueta de interlocal) uno por
                uno.
              </p>
              <a
                href="/hoja-ruta/escaner"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
              >
                Abrir escáner ↗
              </a>
            </div>
          )}

          {/* ================= PESTAÑA: EXPEDICIÓN - ESCÁNER CELULAR (CÁMARA) ================= */}
          {activeTab === "EXP-EscanerCelular" && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-xl">
              <h2 className="text-lg font-bold text-slate-800 mb-1">Control de Bultos (Escáner Celular)</h2>
              <p className="text-sm text-slate-500 mb-6">
                Misma herramienta de control de bultos que el escáner de handheld, pero pensada para un celular
                Android sin lector físico: usa la cámara para leer los códigos (necesita Chrome en Android). Abrila
                desde el celular, escaneá el código de la Hoja de Ruta y después cada bulto uno por uno.
              </p>
              <a
                href="/hoja-ruta/escaner-celular"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
              >
                Abrir escáner celular ↗
              </a>
            </div>
          )}

          {/* ================= PESTAÑA: EXPEDICIÓN - HISTÓRICO DE ESCANEOS ================= */}
          {activeTab === "EXP-EscaneoHistorico" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <h2 className="text-lg font-bold text-slate-800">Histórico de Escaneos</h2>
                  <button
                    onClick={exportarEscaneosExcel}
                    disabled={escaneosFiltrados.length === 0}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Exportar a Excel
                  </button>
                </div>
                <p className="text-sm text-slate-500 mb-4">Últimas 200 sesiones de escaneo, más recientes primero.</p>

                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <input
                    type="text"
                    value={filtroTextoEscaneos}
                    onChange={(e) => setFiltroTextoEscaneos(e.target.value)}
                    placeholder="Buscar por N° de hoja, local o usuario..."
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-64"
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Desde
                    <input
                      type="date"
                      value={filtroFechaDesdeEscaneos}
                      onChange={(e) => setFiltroFechaDesdeEscaneos(e.target.value)}
                      className="px-2 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Hasta
                    <input
                      type="date"
                      value={filtroFechaHastaEscaneos}
                      onChange={(e) => setFiltroFechaHastaEscaneos(e.target.value)}
                      className="px-2 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <select
                    value={filtroResultadoEscaneos}
                    onChange={(e) => setFiltroResultadoEscaneos(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="TODOS">Todos los resultados</option>
                    <option value="completo">Completo</option>
                    <option value="incompleto">Incompleto</option>
                    <option value="en_curso">En curso</option>
                  </select>
                  {(filtroTextoEscaneos || filtroFechaDesdeEscaneos || filtroFechaHastaEscaneos || filtroResultadoEscaneos !== "TODOS") && (
                    <button
                      onClick={() => {
                        setFiltroTextoEscaneos("");
                        setFiltroFechaDesdeEscaneos("");
                        setFiltroFechaHastaEscaneos("");
                        setFiltroResultadoEscaneos("TODOS");
                      }}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>

                {escaneosError && (
                  <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    Error al cargar el histórico: {escaneosError}
                  </div>
                )}
                {escaneosLoading && !escaneosData && (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <SkeletonTable rows={6} columns={8} />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-left"></th>
                        <th className="py-3 px-4 text-left">Hoja</th>
                        <th className="py-3 px-4 text-left">Local</th>
                        <th className="py-3 px-4 text-left">Usuario</th>
                        <th className="py-3 px-4 text-left">Inicio</th>
                        <th className="py-3 px-4 text-left">Fin</th>
                        <th className="py-3 px-4 text-left">Bultos</th>
                        <th className="py-3 px-4 text-left">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {escaneosFiltrados.map((e) => {
                        const faltantes = e.detalle.filter((b) => !b.escaneado);
                        const expandido = escaneoExpandidoId === e.id;
                        return (
                          <Fragment key={e.id}>
                            <tr>
                              <td className="py-3 px-4 text-left">
                                <button
                                  onClick={() => setEscaneoExpandidoId(expandido ? null : e.id)}
                                  className="text-slate-400 hover:text-slate-700"
                                  title="Ver detalle"
                                >
                                  {expandido ? "▾" : "▸"}
                                </button>
                              </td>
                              <td className="py-3 px-4 text-left">
                                <a href={`/hoja-ruta/${e.hoja_de_ruta_id}/imprimir`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                                  #{e.hoja_de_ruta_id}
                                </a>
                              </td>
                              <td className="py-3 px-4 text-left">
                                {e.hoja ? `${e.hoja.local_codigo} — ${e.hoja.local_nombre || "—"}` : "—"}
                              </td>
                              <td className="py-3 px-4 text-left">{e.usuario_nombre || "—"}</td>
                              <td className="py-3 px-4 text-left">{fmtFecha(e.iniciado_en)}</td>
                              <td className="py-3 px-4 text-left">{e.finalizado_en ? fmtFecha(e.finalizado_en) : "En curso..."}</td>
                              <td className="py-3 px-4 text-left">
                                {e.bultos_escaneados ?? "—"} / {e.bultos_esperados ?? "—"}
                              </td>
                              <td className="py-3 px-4 text-left">
                                {!e.resultado ? (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                                    En curso
                                  </span>
                                ) : e.resultado === "completo" ? (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                    Completo
                                  </span>
                                ) : (
                                  <div>
                                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                      Incompleto
                                    </span>
                                    <p className="text-xs text-slate-500 mt-1 whitespace-normal">
                                      Faltan: {faltantes.map((f) => f.codigo).join(", ")}
                                    </p>
                                  </div>
                                )}
                              </td>
                            </tr>
                            {expandido && (
                              <tr key={`${e.id}-detalle`}>
                                <td colSpan={8} className="bg-slate-50 px-4 py-3">
                                  <table className="w-full text-xs text-left">
                                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                                      <tr>
                                        <th className="py-2 px-3 text-left">Código</th>
                                        <th className="py-2 px-3 text-left">Tipo</th>
                                        <th className="py-2 px-3 text-left">Referencia</th>
                                        <th className="py-2 px-3 text-left">Escaneado</th>
                                        <th className="py-2 px-3 text-left">Hora</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                      {e.detalle.map((b) => (
                                        <tr key={b.codigo}>
                                          <td className="py-2 px-3 text-left font-mono">{b.codigo}</td>
                                          <td className="py-2 px-3 text-left">{b.tipo === "despacho" ? "Despacho" : "Interlocal"}</td>
                                          <td className="py-2 px-3 text-left">{b.referencia}</td>
                                          <td className="py-2 px-3 text-left">
                                            <span
                                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                b.escaneado ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                              }`}
                                            >
                                              {b.escaneado ? "Sí" : "No"}
                                            </span>
                                          </td>
                                          <td className="py-2 px-3 text-left">{b.escaneado_en ? fmtFecha(b.escaneado_en) : "—"}</td>
                                        </tr>
                                      ))}
                                      {e.detalle.length === 0 && (
                                        <tr>
                                          <td colSpan={5} className="py-4 px-3 text-center text-slate-400">
                                            Esta hoja no tiene bultos verificables (sin cajas ni etiquetas cargadas).
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                      {escaneosFiltrados.length === 0 && !escaneosLoading && (
                        <tr>
                          <td colSpan={8} className="py-6 px-4 text-center text-slate-400">
                            {(escaneosData?.filas || []).length === 0
                              ? "Todavía no se registró ningún escaneo."
                              : "Ningún escaneo coincide con los filtros."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA: ADMIN - PERFILES ================= */}
          {activeTab === "ADMIN-Perfiles" && <AdminPerfiles />}

          {/* ================= PESTAÑA: ADMIN - USUARIOS ================= */}
          {activeTab === "ADMIN-Usuarios" && <AdminUsuarios />}

          {/* ================= PESTAÑA: ADMIN - ACCESOS ================= */}
          {activeTab === "ADMIN-Accesos" && <AdminAccesos />}

          {/* ================= PESTAÑA: ADMIN - FERIADOS ================= */}
          {activeTab === "ADMIN-Feriados" && <AdminFeriados />}

          {/* ================= PESTAÑA: ADMIN - CONFIGURACIÓN ================= */}
          {activeTab === "ADMIN-Configuracion" && <AdminConfiguracion />}

          {/* ================= PESTAÑAS EN DESARROLLO ================= */}
          {!["Resumen", "Por fecha", "Por pedidos", "Importar datos", "REMA Manual", "ECOM-Importar", "ECOM-Resumen", "ECOM-PorFecha", "ECOM-PorPedidos", "CI-Importar", "CI-Resumen", "CI-Avance", "CI-Carga", "REM-Importar", "REM-Resumen", "REM-Avance", "REM-Carga", "PROD-Importar", "PROD-Resumen", "PD-Importar", "PD-Clientes", "PD-Propios", "PD-Urgencias", "PD-CargaDatos", "DESP-Imprimir", "DESP-Reimprimir", "DESP-Grupos", "INB-Importar", "INB-Resumen", "ALM-Importar", "ALM-Resumen", "ALM-Configuracion", "EXP-Interlocales", "EXP-HojaRuta", "EXP-Historico", "EXP-Etiquetas", "EXP-Escaner", "EXP-EscanerCelular", "EXP-EscaneoHistorico", "ADMIN-Perfiles", "ADMIN-Usuarios", "ADMIN-Accesos", "ADMIN-Feriados", "ADMIN-Configuracion"].includes(activeTab) && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 h-full flex flex-col items-center justify-center text-slate-400">
               <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
               <h2 className="text-lg font-medium text-slate-600">Sección en desarrollo: {activeTab}</h2>
               <p className="mt-2 text-sm text-center max-w-md">Esta vista aún no ha sido maquetada. Navega a las otras secciones del menú lateral.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  </DashboardProvider>
  );
}