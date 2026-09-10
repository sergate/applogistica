// Imprime etiquetas de interlocal (código de barras Code128 con el texto
// "interlocal-00001", etc.) directo por red en una Zebra ZD421, mandando
// ZPL crudo por un socket TCP al puerto de impresión (9100 por defecto) --
// sin PDF, sin SumatraPDF, sin driver de Windows instalado. No usa
// Playwright/navegador para nada.
//
// Configuración (agente-config.json, bloque "zebra"):
//   { "zebra": { "ip": "10.249.0.225", "puerto": 9100, "dpi": 203, "anchoCm": 10, "largoCm": 15 } }
//
// "anchoCm" es el ancho real de la etiqueta, a lo ANCHO del cabezal (^PW) --
// tiene un máximo físico fijo según el cabezal de la impresora (4 pulgadas
// = 832 dots a 203dpi ≈ 10,4cm en esta ZD421; confirmado en la hoja de
// configuración impresa). "largoCm" es el largo de AVANCE de cada etiqueta
// física (^LL), que sí puede ser bastante más largo (hasta 15in/380mm).
//
// Cada etiqueta física (15cm de largo x 10cm de ancho) lleva DOS códigos
// -- uno en cada mitad de 7,5cm -- para aprovechar mejor el material: cada
// pedido de "imprimir N etiquetas" arma ceil(N/2) etiquetas físicas.
//
// Prueba manual (con la impresora ya configurada en agente-config.json):
//   node imprimir-etiquetas.js interlocal-00001 interlocal-00002 interlocal-00003

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

// Arma el ZPL de UNA etiqueta física con hasta DOS códigos (uno por mitad,
// apilados a lo largo de la etiqueta). Con 10cm de ancho ya entra sobrado
// un código de barras horizontal normal (sin rotar) -- el texto legible se
// dibuja aparte con una fuente grande (^A0), en vez de depender del tamaño
// fijo de la línea de interpretación del propio ^BC.
function construirZplParDeEtiquetas([texto1, texto2], { dpi, anchoCm, largoCm }) {
  const anchoDots = cmADots(anchoCm, dpi);
  const largoDots = cmADots(largoCm, dpi);
  if (dpi === 203 && anchoDots > ANCHO_MAXIMO_DOTS_203DPI) {
    throw new Error(
      `El ancho configurado (${anchoCm}cm = ${anchoDots} dots) supera el máximo del cabezal de la ZD421 ` +
        `(${ANCHO_MAXIMO_DOTS_203DPI} dots ≈ 10,4cm). Revisá "zebra.anchoCm" en agente-config.json.`
    );
  }

  const margenX = Math.round(anchoDots * 0.1);
  const altoBarra = Math.round(anchoDots * 0.35);
  const zonaAlto = Math.round(largoDots / 2);
  const separacionTexto = Math.round(zonaAlto * 0.06);
  const margenVertical = Math.round((zonaAlto - altoBarra - separacionTexto - 90) / 2);

  const campos = [];
  [texto1, texto2].forEach((texto, i) => {
    if (!texto) return;
    const offsetY = i * zonaAlto;
    const barraY = offsetY + margenVertical;
    const textoY = barraY + altoBarra + separacionTexto;
    campos.push(
      `^FO${margenX},${barraY}`,
      `^BY3,3,${altoBarra}`,
      "^BCN,,N,N,N",
      `^FD${texto}^FS`,
      `^FO${margenX},${textoY}`,
      "^A0N,90,75",
      `^FD${texto}^FS`
    );
  });

  return ["^XA", `^PW${anchoDots}`, `^LL${largoDots}`, ...campos, "^XZ"].join("\n");
}

// Agrupa los textos de a 2 (una etiqueta física por par) y arma el ZPL
// completo del lote en una sola conexión.
function construirZplLote(textos, opciones) {
  const etiquetas = [];
  for (let i = 0; i < textos.length; i += 2) {
    etiquetas.push(construirZplParDeEtiquetas([textos[i], textos[i + 1]], opciones));
  }
  return etiquetas.join("\n");
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
    anchoCm: config.anchoCm || 10,
    largoCm: config.largoCm || 15,
  };
  const zpl = construirZplLote(textos, opciones);
  await enviarZplAImpresora(zpl, { ip: config.ip, puerto: config.puerto || 9100 });
}

module.exports = { construirZplParDeEtiquetas, construirZplLote, enviarZplAImpresora, imprimirEtiquetas };

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
