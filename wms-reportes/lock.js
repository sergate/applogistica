// Lock de archivo para que solo UN proceso a la vez use los perfiles de
// Chrome (perfil-chrome / perfil-chrome-tablero). Sin esto, si el .bat
// manual (descargar-y-actualizar-todo.bat) corre justo cuando la Tarea
// Programada del Agente (agente-local.js --once) toma un pedido, los dos
// Chromium abren el mismo perfil al mismo tiempo -- Chrome fusiona la
// segunda apertura con la primera, y cuando uno de los dos procesos cierra
// "su" navegador se lleva puesto al otro a mitad de descarga/subida
// ("Target page, context or browser has been closed").

const fs = require("fs");
const path = require("path");

const LOCK_PATH = path.join(__dirname, ".navegador.lock");

function pidVivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function intentarAdquirir() {
  try {
    const fd = fs.openSync(LOCK_PATH, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    // Si el proceso dueño del lock ya no existe (crasheó sin liberarlo), es
    // un lock huérfano -- lo borramos y reintentamos una vez.
    const pidDueño = Number((fs.readFileSync(LOCK_PATH, "utf8") || "").trim() || "0");
    if (!pidDueño || !pidVivo(pidDueño)) {
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {}
      return intentarAdquirir();
    }
    return false;
  }
}

function liberar() {
  try {
    if ((fs.readFileSync(LOCK_PATH, "utf8") || "").trim() === String(process.pid)) {
      fs.unlinkSync(LOCK_PATH);
    }
  } catch {}
}

// Corre fn() con el lock tomado. Si otro proceso ya lo tiene, reintenta cada
// esperaMs hasta agotar maxEsperaMs -- pasado eso, tira un error (o, con
// silencioso=true, devuelve null sin correr fn en vez de tirar error).
async function conLock(fn, { maxEsperaMs = 5 * 60_000, esperaMs = 3000, silencioso = false } = {}) {
  const limite = Date.now() + maxEsperaMs;
  while (!intentarAdquirir()) {
    if (Date.now() >= limite) {
      if (silencioso) return null;
      throw new Error(
        "El navegador del Agente está ocupado en otra corrida (descarga/subida en curso). " +
          "Esperá a que termine y volvé a intentar."
      );
    }
    await new Promise((r) => setTimeout(r, esperaMs));
  }
  try {
    return await fn();
  } finally {
    liberar();
  }
}

module.exports = { conLock };
