// Imprime etiquetas de interlocal (código de barras Code128 con el texto
// "interlocal-00001", etc.) directo por red en una Zebra ZD421, mandando
// ZPL crudo por un socket TCP al puerto de impresión (9100 por defecto) --
// sin PDF, sin SumatraPDF, sin driver de Windows instalado. No usa
// Playwright/navegador para nada.
//
// Configuración (agente-config.json, bloque "zebra"):
//   { "zebra": { "ip": "10.249.0.225", "puerto": 9100, "dpi": 203, "anchoCm": 4.5, "largoCm": 15 } }
//
// "anchoCm" es el ancho real de la etiqueta, a lo ANCHO del cabezal (^PW) --
// tiene un máximo físico fijo según el cabezal de la impresora (4 pulgadas
// = 832 dots a 203dpi ≈ 10,4cm en esta ZD421; confirmado en la hoja de
// configuración impresa). "largoCm" es el largo de AVANCE de cada etiqueta
// (^LL), que sí puede ser bastante más largo (hasta 15in/380mm en esta
// impresora).
//
// Prueba manual (con la impresora ya configurada en agente-config.json):
//   node imprimir-etiquetas.js interlocal-00001 interlocal-00002

const net = require("net");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "agente-config.json");

// Ancho máximo del cabezal de la ZD421 (4 pulgadas) a 203dpi -- ver
// "PRINT WIDTH" en la hoja de configuración de la impresora.
const ANCHO_MAXIMO_DOTS_203DPI = 832;

function leerConfigZebra() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  return config.zebra || {};
}

// Traduce centímetros a dots según el DPI configurado (203 es el más común
// en la ZD421; el modelo de 300dpi también existe, por eso es configurable).
function cmADots(cm, dpi) {
  return Math.round((cm / 2.54) * dpi);
}

// Arma el ZPL de UNA etiqueta: código de barras Code128 con "texto" (el
// tercer parámetro de ^BC en "Y" hace que Zebra imprima el texto legible
// junto a las barras solo, sin necesidad de un ^FD de texto aparte).
//
// Con un ancho angosto (ej. 4,5cm) y un largo bastante mayor (ej. 15cm), un
// código de barras horizontal de un texto largo ("interlocal-00001", 17
// caracteres) no entraría legible -- se imprime ROTADO 90° (^BCR) para que
// corra a lo largo de la etiqueta, como una etiqueta tipo cinta/colgante.
function construirZplEtiqueta(texto, { dpi, anchoCm, largoCm }) {
  const anchoDots = cmADots(anchoCm, dpi);
  const largoDots = cmADots(largoCm, dpi);
  if (dpi === 203 && anchoDots > ANCHO_MAXIMO_DOTS_203DPI) {
    throw new Error(
      `El ancho configurado (${anchoCm}cm = ${anchoDots} dots) supera el máximo del cabezal de la ZD421 ` +
        `(${ANCHO_MAXIMO_DOTS_203DPI} dots ≈ 10,4cm). Revisá "zebra.anchoCm" en agente-config.json.`
    );
  }
  const margen = Math.round(anchoDots * 0.12);
  const altoBarra = Math.round(anchoDots * 0.55);

  return [
    "^XA",
    `^PW${anchoDots}`,
    `^LL${largoDots}`,
    `^FO${margen},${margen}`,
    `^BY2,3,${altoBarra}`,
    `^BCR,${altoBarra},Y,N,N`,
    `^FD${texto}^FS`,
    "^XZ",
  ].join("\n");
}

function construirZplLote(textos, opciones) {
  return textos.map((texto) => construirZplEtiqueta(texto, opciones)).join("\n");
}

// Manda el ZPL directo por TCP a la impresora, en una sola conexión para
// todo el lote. Timeout corto: si la Zebra no está prendida/en red,
// avisamos rápido en vez de dejar el pedido colgado.
function enviarZplAImpresora(zpl, { ip, puerto = 9100, timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    if (!ip) {
      reject(new Error('Falta la IP de la impresora Zebra (config "zebra.ip" en agente-config.json).'));
      return;
    }

    const socket = new net.Socket();
    let terminado = false;
    const cerrarConError = (err) => {
      if (terminado) return;
      terminado = true;
      socket.destroy();
      reject(err);
    };

    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => cerrarConError(new Error(`Timeout conectando/mandando datos a la impresora ${ip}:${puerto}.`)));
    socket.on("error", (err) => cerrarConError(new Error(`No se pudo conectar a la impresora ${ip}:${puerto}: ${err.message}`)));

    socket.connect(puerto, ip, () => {
      socket.write(zpl, "ascii", (err) => {
        if (err) {
          cerrarConError(new Error(`Error mandando datos a la impresora: ${err.message}`));
          return;
        }
        socket.end();
      });
    });

    socket.on("close", () => {
      if (terminado) return;
      terminado = true;
      resolve();
    });
  });
}

// Imprime el lote completo de textos usando la config de "zebra" en
// agente-config.json.
async function imprimirEtiquetas(textos) {
  const config = leerConfigZebra();
  const opciones = {
    dpi: config.dpi || 203,
    anchoCm: config.anchoCm || 4.5,
    largoCm: config.largoCm || 15,
  };
  const zpl = construirZplLote(textos, opciones);
  await enviarZplAImpresora(zpl, { ip: config.ip, puerto: config.puerto || 9100 });
}

module.exports = { construirZplEtiqueta, construirZplLote, enviarZplAImpresora, imprimirEtiquetas };

if (require.main === module) {
  const textos = process.argv.slice(2);
  if (textos.length === 0) {
    console.error("Uso: node imprimir-etiquetas.js <texto1> [texto2] ...");
    process.exit(1);
  }
  imprimirEtiquetas(textos)
    .then(() => console.log(`Mandé ${textos.length} etiqueta(s) a la impresora.`))
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}
