from http.server import BaseHTTPRequestHandler
import pandas as pd
import io
import os
from supabase import create_client
from cgi import FieldStorage

supabase = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY"))

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            form = FieldStorage(fp=self.rfile, headers=self.headers, environ={'REQUEST_METHOD':'POST'})
            
            # --- 1. CLIENTES (Excel) ---
            if 'clientes' in form:
                df_c = pd.read_excel(io.BytesIO(form['clientes'].file.read()))
                # Mapeo: {Origen: Destino}
                df_c = df_c[['Codigo', 'Nombre', 'CP', 'Canal']].rename(columns={
                    'Codigo': 'codigo', 'Nombre': 'nombre', 'CP': 'cp', 'Canal': 'canal'
                })
                supabase.table('clientes').upsert(df_c.to_dict('records')).execute()

            # --- 2. GRUPO (CSV) ---
            if 'grupo' in form:
                df_g = pd.read_csv(io.StringIO(form['grupo'].file.read().decode('utf-8')))
                df_g = df_g[['Pedido', 'Nombre pedido', 'Grupo', 'Uni', 'Uni.Pick', 'Uni.Sep.', 'Seller', 'Fecha creacion']].rename(columns={
                    'Pedido': 'pedido', 'Nombre pedido': 'nombre_pedido', 'Grupo': 'grupo', 
                    'Uni': 'uni', 'Uni.Pick': 'uni_pick', 'Uni.Sep.': 'uni_sep', 
                    'Seller': 'seller', 'Fecha creacion': 'fecha_creacion'
                })
                supabase.table('grupo_pedidos').upsert(df_g.to_dict('records')).execute()

            # --- 3. TIENDA (CSV) ---
            if 'tienda' in form:
                df_t = pd.read_csv(io.StringIO(form['tienda'].file.read().decode('utf-8')))
                df_t = df_t[['Pedido', 'Tiendas destino']].rename(columns={
                    'Pedido': 'pedido', 'Tiendas destino': 'tiendas_destino'
                })
                supabase.table('tiendas_destino').upsert(df_t.to_dict('records')).execute()

            self._send_response(200, {"message": "Carga completa: Clientes, Grupo y Tiendas importados."})

        except Exception as e:
            self._send_response(500, {"error": str(e)})

    def _send_response(self, code, body):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode('utf-8'))