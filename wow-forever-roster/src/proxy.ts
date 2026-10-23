import { NextResponse, type NextRequest } from "next/server";

// Protege toda la app (páginas, Server Actions y /api/*) con HTTP Basic Auth.
// Credenciales: APP_USER (por defecto "admin") y APP_PASSWORD.
// El addon puede enviar el mismo header: Authorization: Basic base64(user:password).

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;

  if (!password) {
    // Sin contraseña: abierto en desarrollo, cerrado en producción.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("APP_PASSWORD no está configurada.", { status: 503 });
  }

  const user = process.env.APP_USER || "admin";
  const header = request.headers.get("authorization");

  if (header?.startsWith("Basic ")) {
    try {
      const decoded = new TextDecoder().decode(
        Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0))
      );
      const sep = decoded.indexOf(":");
      if (
        sep >= 0 &&
        safeEqual(decoded.slice(0, sep), user) &&
        safeEqual(decoded.slice(sep + 1), password)
      ) {
        return NextResponse.next();
      }
    } catch {
      // header mal formado: cae en el 401
    }
  }

  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="WoW Forever Roster", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
