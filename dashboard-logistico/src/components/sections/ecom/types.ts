// Igual que MarcaResumen/CanalResumen (No Ecom), pero en vez de Efic. Pick./Efic.
// Sep./Registros muestra Unidades Canceladas por Clientes/sin stock y
// Cantidad de Pedidos (columnas de Detalle por Marca / desglose por Canal).
export interface MarcaResumenEcom {
  name: string;
  uni: number;
  pick: number;
  sep: number;
  pendPick: number;
  pendSep: number;
  unidadesCanceladasPorClientes: number;
  unidadesCanceladasSinStock: number;
  porcentajeCancelaciones: number;
  cantidadPedidos: number;
}

export interface CanalResumenEcom {
  name: string;
  uni: number;
  pick: number;
  sep: number;
  pendPick: number;
  pendSep: number;
  unidadesCanceladasPorClientes: number;
  unidadesCanceladasSinStock: number;
  porcentajeCancelaciones: number;
  cantidadPedidos: number;
}

// Igual que ResumenData (No Ecom), pero en vez de Efic. Pick./Efic. Sep./Total
// Registros expone Unidades Canceladas por Clientes/sin stock y Cantidad de
// Pedidos (no se puede reusar ResumenData: ese tipo también lo usa el
// useTabData de Resumen No Ecom).
export interface ResumenEcomData {
  kpis: {
    totalUni: number;
    totalPick: number;
    totalSep: number;
    pendPick: number;
    pendSep: number;
    unidadesCanceladasPorClientes: number;
    unidadesCanceladasSinStock: number;
    cantidadPedidos: number;
  };
  marcas: MarcaResumenEcom[];
  // Fechas únicas presentes en la tabla (sin filtrar), para poder armar el
  // selector de "Semana del año" sin depender de los datos de otras pestañas.
  fechasDisponibles: string[];
  updatedAt: string | null;
}

// Ecom no agrupa por "grupo" ni distingue REMA/STD -- mismos campos que los
// equivalentes del general, sin esas dos columnas.
export interface FechaResumenEcom {
  fecha: string;
  marca: string;
  canal: string;
  uni: number;
  pick: number;
  sep: number;
  pendPick: number;
  pendSep: number;
  eficPick: number;
  eficSep: number;
}

export interface PedidoResumenEcom {
  pedido: string;
  nombrePedido: string;
  marca: string;
  canal: string;
  sector: string;
  fecha: string;
  uni: number;
  pick: number;
  sep: number;
  pendPick: number;
  pendSep: number;
  eficPick: number;
  eficSep: number;
}
