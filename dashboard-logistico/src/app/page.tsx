"use client";

import { useState } from "react";

export default function DashboardLayout() {
  const [isPrepOpen, setIsPrepOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("Resumen");

  const prepSubSections = [
    "Importar datos",
    "Resumen",
    "Por fecha",
    "Por marca",
    "Por canal",
    "Por categoría"
  ];

  // Datos estructurados para las 8 tarjetas de la imagen
  const kpiData = [
    {
      title: "Total Unidades",
      value: "85.781",
      theme: "blue",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline strokeLinecap="round" strokeLinejoin="round" points="3.27 6.96 12 12.01 20.73 6.96" />
          <line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      )
    },
    {
      title: "Unidades Pickeadas",
      value: "2.794",
      theme: "green",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline strokeLinecap="round" strokeLinejoin="round" points="22 4 12 14.01 9 11.01" />
        </svg>
      )
    },
    {
      title: "Unidades Separadas",
      value: "2.712",
      theme: "purple",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <polygon strokeLinecap="round" strokeLinejoin="round" points="12 2 2 7 12 12 22 7 12 2" />
          <polyline strokeLinecap="round" strokeLinejoin="round" points="2 17 12 22 22 17" />
          <polyline strokeLinecap="round" strokeLinejoin="round" points="2 12 12 17 22 12" />
        </svg>
      )
    },
    {
      title: "Pendiente Picking",
      value: "83.002",
      theme: "orange",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <circle strokeLinecap="round" strokeLinejoin="round" cx="12" cy="12" r="10" />
          <polyline strokeLinecap="round" strokeLinejoin="round" points="12 6 12 12 16 14" />
        </svg>
      )
    },
    {
      title: "Pendiente Separación",
      value: "83.084",
      theme: "red",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="9" x2="12" y2="13" />
          <line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )
    },
    {
      title: "Efic. Picking",
      value: "3.3%",
      theme: "green",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <polyline strokeLinecap="round" strokeLinejoin="round" points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline strokeLinecap="round" strokeLinejoin="round" points="17 6 23 6 23 12" />
        </svg>
      )
    },
    {
      title: "Efic. Separación",
      value: "3.2%",
      theme: "purple",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <line strokeLinecap="round" strokeLinejoin="round" x1="18" y1="20" x2="18" y2="10" />
          <line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="20" x2="12" y2="4" />
          <line strokeLinecap="round" strokeLinejoin="round" x1="6" y1="20" x2="6" y2="14" />
        </svg>
      )
    },
    {
      title: "Total Registros",
      value: "1.316",
      theme: "blue",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline strokeLinecap="round" strokeLinejoin="round" points="3.27 6.96 12 12.01 20.73 6.96" />
          <line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      )
    }
  ];

  // Función para obtener las clases de colores de Tailwind basadas en el tema de la tarjeta
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

  return (
    <div className="flex h-screen bg-[#f8f9fc] font-sans text-slate-800 overflow-hidden">
      
      {/* ================= BARRA LATERAL (SIDEBAR) ================= */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-10 flex-shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
          <svg className="w-6 h-6 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-lg font-bold text-white tracking-wide">WMS Analytics</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
          <button 
            onClick={() => setActiveTab("Producción por proceso")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === "Producción por proceso" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"}`}
          >
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Producción por proceso
          </button>

          <div className="pt-2">
            <button 
              onClick={() => setIsPrepOpen(!isPrepOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200"
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                Status de preparación
              </div>
              <svg className={`w-4 h-4 transition-transform duration-200 ${isPrepOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isPrepOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {prepSubSections.map((sub, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveTab(sub)}
                    className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button 
            onClick={() => setActiveTab("Status carga inicial")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === "Status carga inicial" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"}`}
          >
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Status carga inicial
          </button>

          <button 
            onClick={() => setActiveTab("Status remanentes")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === "Status remanentes" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"}`}
          >
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
            Status remanentes
          </button>

          <button 
            onClick={() => setActiveTab("Productividad por proceso")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === "Productividad por proceso" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"}`}
          >
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Productividad por proceso
          </button>
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center text-sm">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold mr-3">AL</div>
            <div>
              <p className="text-slate-200 font-medium">Analista Logístico</p>
              <p className="text-slate-500 text-xs">Operaciones</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ================= ÁREA DE CONTENIDO PRINCIPAL ================= */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-xl font-bold text-slate-800">
            {activeTab === "Resumen" ? "Status de Preparación - Resumen" : activeTab}
          </h1>
        </header>

        <div className="flex-1 overflow-auto p-8">
          
          {/* Lógica Condicional: Mostrar KPIs si la pestaña activa es "Resumen" */}
          {activeTab === "Resumen" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiData.map((kpi, index) => {
                const themeClasses = getThemeClasses(kpi.theme);
                
                return (
                  <div key={index} className="relative overflow-hidden bg-white rounded-xl border border-slate-200 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] p-5 h-32 flex flex-col justify-center">
                    
                    {/* Fondo Curvo (Blob decorativo) */}
                    <div className={`absolute -right-8 -bottom-12 w-40 h-40 rounded-[100%] ${themeClasses.blob} opacity-80`}></div>
                    
                    {/* Contenido de la Tarjeta */}
                    <div className="relative z-10 w-full flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-medium text-slate-500 mb-1">{kpi.title}</h3>
                        <p className={`text-[32px] font-bold tracking-tight ${themeClasses.text} leading-none`}>
                          {kpi.value}
                        </p>
                      </div>
                      
                      {/* Ícono contenedor */}
                      <div className={`w-[46px] h-[46px] rounded-xl flex items-center justify-center ${themeClasses.bgIcon} ${themeClasses.textIcon}`}>
                        {kpi.icon}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Pantalla Placeholder para las otras secciones */
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 h-full flex flex-col items-center justify-center text-slate-400">
              <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
              <h2 className="text-lg font-medium text-slate-600">Espacio reservado para: {activeTab}</h2>
              <p className="mt-2 text-sm text-center max-w-md">
                Selecciona la opción "Resumen" dentro de Status de Preparación para ver el grid de KPIs implementado.
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}