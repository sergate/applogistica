"use client";

import { useState } from "react";

export default function DashboardLayout() {
  // Estado para controlar el menú desplegable de "Status de preparación"
  const [isPrepOpen, setIsPrepOpen] = useState(true);
  // Estado para simular la navegación y mostrar el contenido activo
  const [activeTab, setActiveTab] = useState("Resumen");

  // Lista de subsecciones
  const prepSubSections = [
    "Importar datos",
    "Resumen",
    "Por fecha",
    "Por marca",
    "Por canal",
    "Por categoría"
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      
      {/* ================= BARRA LATERAL (SIDEBAR) ================= */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-10 flex-shrink-0">
        
        {/* Cabecera del Sidebar */}
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
          <svg className="w-6 h-6 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-lg font-bold text-white tracking-wide">KPI WMS</span>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
          
          {/* 1. Producción por proceso */}
          <button 
            onClick={() => setActiveTab("Producción por proceso")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
              activeTab === "Producción por proceso" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"
            }`}
          >
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Producción por proceso
          </button>

          {/* 2. Status de preparación (Con Menú Desplegable) */}
          <div className="pt-2">
            <button 
              onClick={() => setIsPrepOpen(!isPrepOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium text-slate-200"
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 opacity-75 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                Status de preparación
              </div>
              <svg 
                className={`w-4 h-4 transition-transform duration-200 ${isPrepOpen ? "rotate-180" : ""}`} 
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* Subsecciones */}
            {isPrepOpen && (
              <div className="mt-1 mb-2 ml-4 pl-4 border-l border-slate-700 space-y-1">
                {prepSubSections.map((sub, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveTab(sub)}
                    className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${
                      activeTab === sub ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. Status carga inicial */}
          <button 
            onClick={() => setActiveTab("Status carga inicial")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
              activeTab === "Status carga inicial" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"
            }`}
          >
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Status carga inicial
          </button>

          {/* 4. Status remanentes */}
          <button 
            onClick={() => setActiveTab("Status remanentes")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
              activeTab === "Status remanentes" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"
            }`}
          >
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
            Status remanentes
          </button>

          {/* 5. Productividad por proceso */}
          <button 
            onClick={() => setActiveTab("Productividad por proceso")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
              activeTab === "Productividad por proceso" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"
            }`}
          >
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Productividad por proceso
          </button>

        </nav>
        
        {/* Pie del Sidebar */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center text-sm">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold mr-3">
              AL
            </div>
            <div>
              <p className="text-slate-200 font-medium">Analista Logístico</p>
              <p className="text-slate-500 text-xs">Operaciones</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ================= ÁREA DE CONTENIDO PRINCIPAL ================= */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50">
        
        {/* Cabecera Superior */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-xl font-bold text-slate-800">
            {activeTab}
          </h1>
          <div className="flex items-center space-x-4 text-sm text-slate-500">
            <span>Última actualización: Hoy, 15:00 hs</span>
            <button className="p-2 rounded-md hover:bg-slate-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </header>

        {/* Contenedor Dinámico */}
        <div className="flex-1 overflow-auto p-8">
          
          {/* Aquí puedes integrar las tablas que armamos anteriormente */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 h-full flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
            <h2 className="text-lg font-medium text-slate-600">Espacio reservado para: {activeTab}</h2>
            <p className="mt-2 text-sm text-center max-w-md">
              Selecciona una opción en el menú lateral para cambiar esta vista. Aquí es donde inyectaremos los componentes de tabla y botones de carga.
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}