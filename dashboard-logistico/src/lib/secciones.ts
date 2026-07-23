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
      { key: "Importar datos", label: "Importar Datos" },
      { key: "Resumen", label: "Resumen" },
      { key: "Por fecha", label: "Por Fecha" },
      { key: "Por pedidos", label: "Por Pedidos" },
    ],
  },
  {
    nombre: "Status Carga Inicial",
    subsecciones: [
      { key: "CI-Importar", label: "Importar Datos" },
      { key: "CI-Resumen", label: "Resumen" },
      { key: "CI-Avance", label: "Avance Plan" },
      { key: "CI-Carga", label: "Carga Datos" },
    ],
  },
  {
    nombre: "Status Remanentes",
    subsecciones: [
      { key: "REM-Importar", label: "Importar Datos" },
      { key: "REM-Resumen", label: "Resumen" },
      { key: "REM-Avance", label: "Avance Plan" },
      { key: "REM-Carga", label: "Carga Datos" },
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
    nombre: "Administración",
    subsecciones: [
      { key: "ADMIN-Perfiles", label: "Perfiles" },
      { key: "ADMIN-Usuarios", label: "Usuarios" },
      { key: "ADMIN-Accesos", label: "Accesos" },
      { key: "ADMIN-Feriados", label: "Feriados" },
    ],
  },
];

/** Lista plana de todas las claves de subsección (para validar o listar). */
export const TODAS_LAS_SUBSECCIONES: string[] = REGISTRO_SECCIONES.flatMap((s) =>
  s.subsecciones.map((sub) => sub.key)
);
