# api/process-wms.py
from http.server import BaseHTTPRequestHandler
import json
import pandas as pd
import io
import datetime

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Leer el payload del request
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            file_type = payload.get('file_type') # 'diario' o 'plan'
            csv_data = payload.get('csv_data')
            
            if not csv_data or not file_type:
                self._send_response(400, {"error": "Faltan parámetros: file_type o csv_data"})
                return

            # Cargar en Pandas para limpieza y validación
            df = pd.read_csv(io.StringIO(csv_data))
            filas_procesadas = len(df)
            
            # ---------------------------------------------------------
            # LÓGICA DE BASE DE DATOS (Simulación de conexión Supabase)
            # ---------------------------------------------------------
            if file_type == 'diario':
                # Validar columnas
                required_cols = ['fecha', 'proceso', 'unidades_procesadas', 'horas_operativas', 'remanentes']
                if not all(col in df.columns for col in required_cols):
                     raise ValueError("Columnas inválidas para reporte diario")
                
                # Aquí iría tu cliente Supabase:
                # 1. supabase.table('kpi_procesos_diarios').delete().in_('fecha', df['fecha'].unique().tolist()).execute()
                # 2. supabase.table('kpi_procesos_diarios').insert(df.to_dict('records')).execute()
                
                accion_simulada = "Borrado por 'fecha' y 'proceso'. Inserción exitosa."

            elif file_type == 'plan':
                # Validar columnas
                required_cols = ['plan_id', 'ruta', 'carga_inicial', 'preparados']
                if not all(col in df.columns for col in required_cols):
                     raise ValueError("Columnas inválidas para reporte de plan")
                     
                # Aquí iría tu cliente Supabase:
                # 1. supabase.table('kpi_planes_picking').delete().in_('plan_id', df['plan_id'].tolist()).execute()
                # 2. supabase.table('kpi_planes_picking').insert(df.to_dict('records')).execute()
                
                accion_simulada = "Borrado por 'plan_id'. Inserción exitosa."
            else:
                raise ValueError("Tipo de archivo no soportado. Use 'diario' o 'plan'.")

            # Respuesta de Éxito
            self._send_response(200, {
                "success": True,
                "message": accion_simulada,
                "filas_procesadas": filas_procesadas,
                "timestamp": datetime.datetime.now().isoformat()
            })

        except Exception as e:
            self._send_response(500, {"success": False, "error": str(e)})

    def _send_response(self, status_code, body):
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode('utf-8'))