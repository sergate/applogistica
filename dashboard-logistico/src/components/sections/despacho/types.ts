export interface DespachoGuiaFila {
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

export function filasDespachoFiltradas(
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
