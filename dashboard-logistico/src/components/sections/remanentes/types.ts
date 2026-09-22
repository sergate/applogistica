export interface PlanRemanentes {
  id: number;
  fecha_inicio: string;
  fecha_fin: string;
  proceso_inicial: number;
  target: number;
  updated_at: string;
}

export interface REMDetalleFila {
  marca: string;
  archivo: string;
  grupo: string;
  temporada: string;
  pedidas: number;
  distribuidas: number;
  aRepartir: number;
  stock: number;
}
