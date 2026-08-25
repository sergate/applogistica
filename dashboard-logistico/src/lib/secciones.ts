// Registro único de secciones y subsecciones de la app. Cualquier
// subsección nueva que se agregue en el futuro debe sumarse acá -- el panel
// de administración lee de este archivo para mostrar los checkboxes de
// permisos, y el sidebar lo usa para saber qué mostrarle a cada usuario.

export interface SubseccionRegistro {
  key: string;
  label: string;
}

export interface SeccionRegistro {
  nombre: string;
  subsecciones: SubseccionRegistro[];
}

export const REGISTRO_SECCIONES: SeccionRegistro[] = [
  {
    nombre: "Status de Preparación",
    subsecciones: [
      { key: "Importar datos", label: "Importar Datos (No Ecom)" },
      { key: "NOECOM-ActualizarWMS", label: "Actualizar desde WMS (en Importar Datos No Ecom)" },
      { key: "Resumen", label: "Resumen (No Ecom)" },
      { key: "Por fecha", label: "Por Fecha (No Ecom)" },
      { key: "Por pedidos", label: "Por Pedidos (No Ecom)" },
      { key: "REMA Manual", label: "Pedidos REMA Manual (No Ecom)" },
      { key: "ECOM-Importar", label: "Importar Datos (Ecom)" },
      { key: "ECOM-ActualizarWMS", label: "Actualizar desde WMS (en Importar Datos Ecom)" },
      { key: "ECOM-Resumen", label: "Resumen (Ecom)" },
      { key: "ECOM-PorFecha", label: "Por Fecha (Ecom)" },
      { key: "ECOM-PorPedidos", label: "Por Pedidos (Ecom)" },
    ],
  },
  {
    nombre: "Status Carga Inicial",
    subsecciones: [
      { key: "CI-Importar", label: "Importar Datos" },
      { key: "CI-ActualizarWMS", label: "Actualizar desde WMS (en Importar Datos)" },
      { key: "CI-Resumen", label: "Resumen" },
      { key: "CI-Avance", label: "Avance Plan" },
      { key: "CI-Carga", label: "Carga Datos" },
      { key: "CI-EliminarArchivo", label: "Eliminar Archivo (en Resumen)" },
    ],
  },
  {
    nombre: "Status Remanentes",
    subsecciones: [
      { key: "REM-Importar", label: "Importar Datos" },
      { key: "REM-ActualizarWMS", label: "Actualizar desde WMS (en Importar Datos)" },
      { key: "REM-Resumen", label: "Resumen" },
      { key: "REM-Avance", label: "Avance Plan" },
      { key: "REM-Carga", label: "Carga Datos" },
      { key: "REM-EliminarArchivo", label: "Eliminar Archivo (en Resumen)" },
    ],
  },
  {
    nombre: "Producción por Proceso",
    subsecciones: [
      { key: "PROD-Importar", label: "Importar Datos" },
      { key: "PROD-Resumen", label: "Resumen" },
    ],
  },
  {
    nombre: "Pendiente de Despacho",
    subsecciones: [
      { key: "PD-Importar", label: "Importar Datos" },
      { key: "PD-Clientes", label: "Clientes" },
      { key: "PD-Propios", label: "Propios" },
      { key: "PD-Urgencias", label: "Seguimiento Urgencias" },
      { key: "PD-CargaDatos", label: "Carga de Datos" },
    ],
  },
  {
    nombre: "Inbound",
    subsecciones: [
      { key: "INB-Importar", label: "Importar Datos" },
      { key: "INB-Resumen", label: "Resumen" },
      { key: "INB-EditarArribo", label: "Editar Arribo CD (en Resumen)" },
    ],
  },
  {
    nombre: "Ocupación Almacén",
    subsecciones: [
      { key: "ALM-Importar", label: "Importar Datos" },
      { key: "ALM-Resumen", label: "Resumen" },
      { key: "ALM-Configuracion", label: "Configuración" },
      { key: "ALM-ImportarLayout", label: "Importar Layout (en Importar Datos)" },
    ],
  },
  {
    nombre: "Administración",
    subsecciones: [
      { key: "ADMIN-Perfiles", label: "Perfiles" },
      { key: "ADMIN-Usuarios", label: "Usuarios" },
      { key: "ADMIN-Accesos", label: "Accesos" },
      { key: "ADMIN-Feriados", label: "Feriados" },
      { key: "ADMIN-Configuracion", label: "Configuración" },
    ],
  },
];

/** Lista plana de todas las claves de subsección (para validar o listar). */
export const TODAS_LAS_SUBSECCIONES: string[] = REGISTRO_SECCIONES.flatMap((s) =>
  s.subsecciones.map((sub) => sub.key)
);
