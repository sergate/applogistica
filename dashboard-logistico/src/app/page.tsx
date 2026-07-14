"use client";

import { useState } from "react";

export default function DashboardLayout() {
  const [isPrepOpen, setIsPrepOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("Resumen");
  const [selectedMarca, setSelectedMarca] = useState<string | null>(null);
  const [selectedCanal, setSelectedCanal] = useState<string | null>(null);
  const [files, setFiles] = useState<{ clientes: File | null; grupo: File | null; tienda: File | null }>({ 
    clientes: null, grupo: null, tienda: null 
  });

  const prepSubSections = ["Importar datos", "Resumen", "Por fecha", "Por marca", "Por canal", "Por categoría"];

  // =========================================================================
  // DATOS MOCK
  // =========================================================================
  const kpiData = [
    { title: "Total Unidades", value: "85.781", theme: "blue" },
    { title: "Unidades Pickeadas", value: "2.794", theme: "green" },
    { title: "Unidades Separadas", value: "2.712", theme: "purple" },
    { title: "Pendiente Picking", value: "83.002", theme: "orange" },
    { title: "Pendiente Separación", value: "83.084", theme: "red" },
    { title: "Efic. Picking", value: "3.3%", theme: "green" },
    { title: "Efic. Separación", value: "3.2%", theme: "purple" },
    { title: "Total Registros", value: "1.316", theme: "blue" }
  ];

  const marcasData = [
    { name: "AWADA", dot: "bg-purple-400", uni: "1.782", pick: "12", sep: "5", pendPick: "1.770", pendSep: "1.777", eficPick: "0.7%", eficSep: "0.3%", reg: "59" },
    { name: "FLY", dot: "bg-emerald-500", uni: "2.797", pick: "62", sep: "62", pendPick: "2.735", pendSep: "2.735", eficPick: "2.2%", eficSep: "2.2%", reg: "90" },
    { name: "CQQTQ", dot: "bg-blue-400", uni: "6.567", pick: "518", sep: "501", pendPick: "6.053", pendSep: "6.070", eficPick: "7.9%", eficSep: "7.6%", reg: "291" },
    { name: "CHEEKY", dot: "bg-red-400", uni: "74.635", pick: "2.202", sep: "2.144", pendPick: "72.444", pendSep: "72.502", eficPick: "3.0%", eficSep: "2.9%", reg: "876" }
  ];

  const procesosData = [
    { id: '1', proceso: 'Recepción', unidades: "1.500", horas: 8.5, prod: 176, remanentes: 200 },
    { id: '2', proceso: 'Putaway', unidades: "1.250", horas: 7.0, prod: 178, remanentes: 50 },
  ];

  const cargaInicialData = [
    { id: '1', plan: 'PLN-202610-01', ruta: 'Ruta Norte', meta: "500", preparado: "480", pendiente: "20", avance: 96.0 },
  ];

  const fechasData = [
    { fecha: "2026-07-13", marca: "CHEEKY", dot: "bg-red-500", uni: "17.367", pick: "0", sep: "0", eficPick: "0.0%", eficSep: "0.0%" },
  ];

  // LOGICA
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, key: 'clientes' | 'grupo' | 'tienda') => {
    if (e.target.files) setFiles(prev => ({ ...prev, [key]: e.target.files![0] }));
  };

  return (
    <div className="flex h-screen bg-[#f8f9fc] font-sans text-slate-800">
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0">
        <div className="h-16 flex items-center px-6 bg-slate-950 font-bold text-white">WMS Analytics</div>
        <nav className="flex-1 p-3 space-y-1">
          <button onClick={() => setActiveTab("Producción por proceso")} className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-slate-800">Producción por proceso</button>
          <div className="pt-2">
            <button onClick={() => setIsPrepOpen(!isPrepOpen)} className="w-full flex justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800 text-sm">Status de preparación ▾</button>
            {isPrepOpen && prepSubSections.map(sub => (
              <button key={sub} onClick={() => setActiveTab(sub)} className={`w-full text-left pl-8 py-2 text-sm ${activeTab === sub ? "text-blue-400" : "text-slate-400"}`}>{sub}</button>
            ))}
          </div>
          <button onClick={() => setActiveTab("Status carga inicial")} className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-slate-800">Status carga inicial</button>
          <button onClick={() => setActiveTab("Status remanentes")} className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-slate-800">Status remanentes</button>
          <button onClick={() => setActiveTab("Productividad por proceso")} className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-slate-800">Productividad por proceso</button>
        </nav>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-auto p-8">
        <h1 className="text-xl font-bold mb-6">{activeTab}</h1>

        {activeTab === "Importar datos" && (
          <div className="bg-white rounded-xl border p-8 max-w-4xl shadow-sm">
            <h2 className="font-bold mb-6">Importar Archivos WMS</h2>
            <div className="grid grid-cols-3 gap-6">
              {['clientes', 'grupo', 'tienda'].map(key => (
                <div key={key} className="border-2 border-dashed p-4 rounded text-center">
                  <p className="text-xs mb-2 uppercase">{key}</p>
                  <input type="file" onChange={(e) => handleFileChange(e, key as any)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Resumen" && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              {kpiData.map((kpi, i) => <div key={i} className="bg-white rounded-xl border p-5"><h3 className="text-xs text-slate-500">{kpi.title}</h3><p className="text-2xl font-bold">{kpi.value}</p></div>)}
            </div>
            <div className="bg-white rounded-xl border p-6">
              <table className="w-full text-sm text-left">
                <thead><tr className="border-b text-slate-500"><th className="py-2">Marca</th><th>Unidades</th></tr></thead>
                <tbody>{marcasData.map(m => <tr key={m.name} className="border-b"><td className="py-2">{m.name}</td><td>{m.uni}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Por fecha" && (
          <div className="bg-white rounded-xl border p-8">
            <table className="w-full text-sm text-left">
              <thead><tr className="border-b text-slate-500"><th className="py-2">Fecha</th><th>Marca</th><th>Unidades</th></tr></thead>
              <tbody>{fechasData.map((r, i) => <tr key={i} className="border-b"><td className="py-2">{r.fecha}</td><td>{r.marca}</td><td>{r.uni}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {activeTab === "Productividad por proceso" && (
          <div className="bg-white rounded-xl border p-8">
             <table className="w-full text-sm text-left">
              <thead><tr className="border-b text-slate-500"><th className="py-2">Proceso</th><th>Productividad</th></tr></thead>
              <tbody>{procesosData.map(p => <tr key={p.id} className="border-b"><td className="py-2">{p.proceso}</td><td>{p.prod}</td></tr>)}</tbody>
             </table>
          </div>
        )}

        {activeTab === "Status carga inicial" && (
          <div className="bg-white rounded-xl border p-8">
             <table className="w-full text-sm text-left">
              <thead><tr className="border-b text-slate-500"><th className="py-2">Plan</th><th>Avance</th></tr></thead>
              <tbody>{cargaInicialData.map(c => <tr key={c.id} className="border-b"><td className="py-2">{c.plan}</td><td>{c.avance}%</td></tr>)}</tbody>
             </table>
          </div>
        )}
      </main>
    </div>
  );
}