// Hace que Playwright busque el navegador Chromium DENTRO de esta carpeta
// (node_modules/playwright-core/.local-browsers) en vez del caché global
// del usuario (%LOCALAPPDATA%\ms-playwright) -- así toda la carpeta
// wms-reportes es autocontenida: copiarla a otra PC alcanza, no hace
// falta correr "npx playwright install" ahí.
//
// Requerido como PRIMERA línea en cada script que use Playwright (antes de
// requerir "playwright"), para que tome efecto sin importar cuál sea el
// punto de entrada.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
