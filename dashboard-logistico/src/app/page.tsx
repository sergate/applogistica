"use client";

import { useState } from "react";

export default function DashboardLayout() {
  // Estados de navegación del Sidebar
  const [isPrepOpen, setIsPrepOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("Resumen");

  // Estados para la interactividad de las tablas (Drill-down)
  const [selectedMarca, setSelectedMarca] = useState<string | null>(null);
  const [selectedCanal, setSelectedCanal] = useState<string | null>(null);

  const prepSubSections = ["Importar datos", "Resumen", "Por fecha", "Por marca", "Por canal", "Por categoría"];

  // =========================================================================
  // DATOS MOCK (Basados exactamente en las imágenes proporcionadas)
  // =========================================================================
  const kpiData = [
    { title: "Total Unidades", value: "85.781", theme: "blue", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline strokeLinecap="round" strokeLinejoin="round" points="3.27 6.96 12 12.01 20.73 6.96" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="22.08" x2="12" y2="12" /></svg> },
    { title: "Unidades Pickeadas", value: "2.794", theme: "green", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline strokeLinecap="round" strokeLinejoin="round" points="22 4 12 14.01 9 11.01" /></svg> },
    { title: "Unidades Separadas", value: "2.712", theme: "purple", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polygon strokeLinecap="round" strokeLinejoin="round" points="12 2 2 7 12 12 22 7 12 2" /><polyline strokeLinecap="round" strokeLinejoin="round" points="2 17 12 22 22 17" /><polyline strokeLinecap="round" strokeLinejoin="round" points="2 12 12 17 22 12" /></svg> },
    { title: "Pendiente Picking", value: "83.002", theme: "orange", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle strokeLinecap="round" strokeLinejoin="round" cx="12" cy="12" r="10" /><polyline strokeLinecap="round" strokeLinejoin="round" points="12 6 12 12 16 14" /></svg> },
    { title: "Pendiente Separación", value: "83.084", theme: "red", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="9" x2="12" y2="13" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="17" x2="12.01" y2="17" /></svg> },
    { title: "Efic. Picking", value: "3.3%", theme: "green", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polyline strokeLinecap="round" strokeLinejoin="round" points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline strokeLinecap="round" strokeLinejoin="round" points="17 6 23 6 23 12" /></svg> },
    { title: "Efic. Separación", value: "3.2%", theme: "purple", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><line strokeLinecap="round" strokeLinejoin="round" x1="18" y1="20" x2="18" y2="10" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="20" x2="12" y2="4" /><line strokeLinecap="round" strokeLinejoin="round" x1="6" y1="20" x2="6" y2="14" /></svg> },
    { title: "Total Registros", value: "1.316", theme: "blue", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline strokeLinecap="round" strokeLinejoin="round" points="3.27 6.96 12 12.01 20.73 6.96" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="22.08" x2="12" y2="12" /></svg> }
  ];

  const marcasData = [
    { name: "AWADA", dot: "bg-purple-400", uni: "1.782", pick: "12", sep: "5", pendPick: "1.770", pendSep: "1.777", eficPick: "0.7%", eficSep: "0.3%", reg: "59" },
    { name: "FLY", dot: "bg-emerald-500", uni: "2.797", pick: "62", sep: "62", pendPick: "2.735", pendSep: "2.735", eficPick: "2.2%", eficSep: "2.2%", reg: "90" },
    { name: "CQQTQ", dot: "bg-blue-400", uni: "6.567", pick: "518", sep: "501", pendPick: "6.053", pendSep: "6.070", eficPick: "7.9%", eficSep: "7.6%", reg: "291" },
    { name: "CHEEKY", dot: "bg-red-400", uni: "74.635", pick: "2.202", sep: "2.144", pendPick: "72.444", pendSep: "72.502", eficPick: "3.0%", eficSep: "2.9%", reg: "876" }
  ];

  const canalesData = [
    { name: "CLIENTE", dot: "bg-pink-400", uni: "2", pick: "0", sep: "0", pendPick: "2", pendSep: "2", eficPick: "0.0%", eficSep: "0.0%" },
    { name: "PROPIO", dot: "bg-blue-400", uni: "1.476", pick: "12", sep: "5", pendPick: "1.464", pendSep: "1.471", eficPick: "0.8%", eficSep: "0.3%" },
    { name: "DEPOSITO", dot: "bg-emerald-500", uni: "2", pick: "0", sep: "0", pendPick: "2", pendSep: "2", eficPick: "0.0%", eficSep: "0.0%" },
    { name: "FRANQUICIA", dot: "bg-orange-400", uni: "302", pick: "0", sep: "0", pendPick: "302", pendSep: "302", eficPick: "0.0%", eficSep: "0.0%" }
  ];

  const clientesData = [
    { codigo: "300139", cliente: "GLUZ DEBORA RUTH", lineas: "2", uni: "2", pick: "0", sep: "0", pendPick: "2", pendSep: "2", eficPick: "0.0%", eficSep: "0.0%" }
  ];

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

  // Manejadores de Clics
  const handleMarcaClick = (marca: string) => {
    setSelectedMarca(marca === selectedMarca ? null : marca);
    setSelectedCanal(null); // Resetea el canal si cambio de marca
  };

  const handleCanalClick = (canal: string) => {
    setSelectedCanal(canal === selectedCanal ? null : canal);
  };

  return (
    <div className="flex h-screen bg-[#f8f9fc] font-sans text-slate-800 overflow-hidden">
      
      {/* ================= BARRA LATERAL ================= */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-10 flex-shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
          <svg className="w-6 h-6 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <span className="text-lg font-bold text-white tracking-wide">WMS Analytics</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <button onClick={() => setActiveTab("Producción por proceso")} className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${activeTab === "Producción por proceso" ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"}`}>
            <svg className="w-5 h-5 mr-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Producción por proceso
          </button>

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
                {prepSubSections.map((sub, idx) => (
                  <button key={idx} onClick={() => setActiveTab(sub)} className={`w-full flex items-center px-3 py-2 rounded-md transition-colors text-sm ${activeTab === sub ? "bg-slate-800 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-2 opacity-50"></span>
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>
      </aside>

      {/* ================= ÁREA PRINCIPAL ================= */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-xl font-bold text-slate-800">{activeTab === "Resumen" ? "Status de Preparación - Resumen" : activeTab}</h1>
        </header>

        <div className="flex-1 overflow-auto p-8 space-y-6">
          
          {activeTab === "Resumen" ? (
            <>
              {/* 1. TARJETAS DE KPIs SUPERIORES */}
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

              {/* 2. TABLA: DETALLE POR MARCA */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800">Detalle por Marca</h2>
                <p className="text-sm text-slate-500 mb-6">Haz click en una marca para ver el desglose por canal</p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Marca</th>
                        <th className="py-3 px-4">Unidades</th>
                        <th className="py-3 px-4">Pickeadas</th>
                        <th className="py-3 px-4">Separadas</th>
                        <th className="py-3 px-4">Pend. Picking</th>
                        <th className="py-3 px-4">Pend. Sep.</th>
                        <th className="py-3 px-4">Efic. Pick.</th>
                        <th className="py-3 px-4">Efic. Sep.</th>
                        <th className="py-3 px-4">Registros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {marcasData.map((marca, i) => (
                        <tr 
                          key={i} 
                          onClick={() => handleMarcaClick(marca.name)}
                          className={`cursor-pointer transition-colors ${selectedMarca === marca.name ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                        >
                          <td className="py-3 px-4 flex items-center gap-3 font-semibold text-slate-800">
                            <span className={`w-2.5 h-2.5 rounded-full ${marca.dot}`}></span> {marca.name}
                          </td>
                          <td className="py-3 px-4 text-slate-600">{marca.uni}</td>
                          <td className="py-3 px-4 text-slate-600">{marca.pick}</td>
                          <td className="py-3 px-4 text-slate-600">{marca.sep}</td>
                          <td className="py-3 px-4 font-semibold text-orange-500">{marca.pendPick}</td>
                          <td className="py-3 px-4 font-semibold text-red-500">{marca.pendSep}</td>
                          <td className="py-3 px-4 text-slate-600">{marca.eficPick}</td>
                          <td className="py-3 px-4 text-slate-600">{marca.eficSep}</td>
                          <td className="py-3 px-4 text-slate-600">{marca.reg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. TABLA: CANALES DE LA MARCA (Aparece al hacer click en una marca) */}
              {selectedMarca && (
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex gap-8">
                  
                  {/* Gráfico de Dona Simulado */}
                  <div className="w-1/3 flex flex-col">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      Canales de <span className="text-purple-600">{selectedMarca}</span>
                    </h2>
                    <p className="text-sm text-slate-500 mb-8">Haz click en un canal para ver el detalle de pedidos</p>
                    
                    <div className="flex-1 flex items-center justify-center relative">
                      {/* CSS Conic Gradient simulando el Donut Chart de la imagen */}
                      <div className="w-48 h-48 rounded-full relative" style={{ background: "conic-gradient(#f97316 0% 83%, #10b981 83% 100%)" }}>
                        <div className="absolute inset-5 bg-white rounded-full"></div>
                      </div>
                      <span className="absolute top-1/4 -left-4 text-xs font-bold text-orange-500">PROPIO 83%</span>
                      <span className="absolute bottom-1/4 -right-4 text-xs font-bold text-emerald-500">FRANQUICIA</span>
                    </div>
                  </div>

                  {/* Tabla de Canales */}
                  <div className="w-2/3 overflow-x-auto pt-10">
                    <table className="w-full text-sm text-left">
                      <thead className="text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Canal</th>
                          <th className="py-3 px-4">Unidades</th>
                          <th className="py-3 px-4">Pickeadas</th>
                          <th className="py-3 px-4">Separadas</th>
                          <th className="py-3 px-4">Pend. Pick.</th>
                          <th className="py-3 px-4">Pend. Sep.</th>
                          <th className="py-3 px-4">Efic. Pick.</th>
                          <th className="py-3 px-4">Efic. Sep.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {canalesData.map((canal, i) => (
                          <tr 
                            key={i} 
                            onClick={() => handleCanalClick(canal.name)}
                            className={`cursor-pointer transition-colors ${selectedCanal === canal.name ? 'bg-purple-50' : 'hover:bg-slate-50'}`}
                          >
                            <td className="py-3 px-4 flex items-center gap-3 font-bold text-slate-800">
                              <span className={`w-2.5 h-2.5 rounded-full ${canal.dot}`}></span> {canal.name}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{canal.uni}</td>
                            <td className="py-3 px-4 text-slate-600">{canal.pick}</td>
                            <td className="py-3 px-4 text-slate-600">{canal.sep}</td>
                            <td className="py-3 px-4 font-semibold text-orange-500">{canal.pendPick}</td>
                            <td className="py-3 px-4 font-semibold text-red-500">{canal.pendSep}</td>
                            <td className="py-3 px-4 text-slate-600">{canal.eficPick}</td>
                            <td className="py-3 px-4 text-slate-600">{canal.eficSep}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 4. TABLA: CLIENTES DEL CANAL Y MARCA (Aparece al hacer click en un canal) */}
              {selectedMarca && selectedCanal && (
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      Clientes de <span className="text-purple-600">{selectedMarca}</span>
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      <span className="text-orange-500">{selectedCanal}</span> 
                      <span className="text-sm font-normal text-slate-500 ml-2">(1 de 1 clientes)</span>
                    </h2>
                    
                    {/* Buscador de cliente */}
                    <div className="relative">
                      <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <input type="text" placeholder="Buscar cliente..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>

                  {/* Tarjetas resumen mini */}
                  <div className="grid grid-cols-5 gap-3 mb-6 text-center">
                    <div className="bg-sky-50 rounded-lg py-3 border border-sky-100">
                      <p className="text-xs text-slate-500 mb-1">Unidades</p>
                      <p className="text-xl font-bold text-sky-600">2</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg py-3 border border-emerald-100">
                      <p className="text-xs text-slate-500 mb-1">Pickeadas</p>
                      <p className="text-xl font-bold text-emerald-600">0</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg py-3 border border-purple-100">
                      <p className="text-xs text-slate-500 mb-1">Separadas</p>
                      <p className="text-xl font-bold text-purple-600">0</p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg py-3 border border-yellow-100">
                      <p className="text-xs text-slate-500 mb-1">Pend. Picking</p>
                      <p className="text-xl font-bold text-yellow-600">2</p>
                    </div>
                    <div className="bg-red-50 rounded-lg py-3 border border-red-100">
                      <p className="text-xs text-slate-500 mb-1">Pend. Separación</p>
                      <p className="text-xl font-bold text-red-600">2</p>
                    </div>
                  </div>

                  {/* Tabla de Clientes */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Código</th>
                          <th className="py-3 px-4">Cliente</th>
                          <th className="py-3 px-4">Líneas</th>
                          <th className="py-3 px-4">Unidades</th>
                          <th className="py-3 px-4">Pickeadas</th>
                          <th className="py-3 px-4">Separadas</th>
                          <th className="py-3 px-4">Pend. Pick.</th>
                          <th className="py-3 px-4">Pend. Sep.</th>
                          <th className="py-3 px-4">Efic. Pick.</th>
                          <th className="py-3 px-4">Efic. Sep.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {clientesData.map((cli, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-3 px-4"><span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs border border-slate-200">{cli.codigo}</span></td>
                            <td className="py-3 px-4 font-bold text-slate-900">{cli.cliente}</td>
                            <td className="py-3 px-4 text-slate-600">{cli.lineas}</td>
                            <td className="py-3 px-4 text-slate-600">{cli.uni}</td>
                            <td className="py-3 px-4 text-slate-600">{cli.pick}</td>
                            <td className="py-3 px-4 text-slate-600">{cli.sep}</td>
                            <td className="py-3 px-4 font-semibold text-orange-500">{cli.pendPick}</td>
                            <td className="py-3 px-4 font-semibold text-red-500">{cli.pendSep}</td>
                            <td className="py-3 px-4 text-slate-600">{cli.eficPick}</td>
                            <td className="py-3 px-4 text-slate-600">{cli.eficSep}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-8 h-full flex flex-col items-center justify-center text-slate-400">
               <p>Contenido para la pestaña: {activeTab}</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}