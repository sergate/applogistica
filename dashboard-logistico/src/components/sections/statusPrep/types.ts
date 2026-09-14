export interface MarcaResumen {
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

export interface CanalResumen {
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

export interface FechaResumen {
  fecha: string;
  marca: string;
  canal: string;
  grupo: string;
  tipoPedido: "REMA" | "STD";
  uni: number;
  pick: number;
  sep: number;
  pendPick: number;
  pendSep: number;
  eficPick: number;
  eficSep: number;
}

export interface ResumenData {
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
