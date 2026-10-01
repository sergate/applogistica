// Guarda tableroEmail/tableroClave en agente-config.json (sin pisar el
// resto de la configuración) -- usado por agregar-login-tablero.bat para no
// tener que editar el JSON a mano en cada PC. Ver leerCredencialesTablero()
// en actualizar-tablero.js para cómo se usan.

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "agente-config.json");
const email = process.env.TABLERO_EMAIL;
const clave = process.env.TABLERO_CLAVE;

if (!email || !clave) {
  console.error("Faltan TABLERO_EMAIL / TABLERO_CLAVE (correlo vía agregar-login-tablero.bat, no a mano).");
  process.exit(1);
}

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`No encontré ${CONFIG_PATH}. Corré primero instalar-agente.bat para configurar el Agente.`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
config.tableroEmail = email;
config.tableroClave = clave;
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");

console.log("Guardado tableroEmail/tableroClave en agente-config.json.");
