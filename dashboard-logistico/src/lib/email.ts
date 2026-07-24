import { Resend } from "resend";

// Requiere RESEND_API_KEY en las variables de entorno (.env.local en
// desarrollo, Vercel > Settings > Environment Variables en producción).
// RESEND_FROM_EMAIL es opcional -- sin verificar un dominio propio en
// Resend, solo se puede enviar desde el remitente sandbox de abajo, y solo
// llega a la casilla dueña de la cuenta de Resend.
const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || "Panel Logístico <onboarding@resend.dev>";

export const emailEnvOk = !!resendApiKey;

/**
 * Envía un mail de notificación. No tira excepción si falla -- el llamador
 * decide si loguear el error, pero nunca debe interrumpir el flujo principal
 * (ej. el registro de un usuario) por un problema de envío de mail.
 */
export async function sendNotificationEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!emailEnvOk) {
    return { success: false, error: "Falta configurar RESEND_API_KEY." };
  }

  try {
    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error inesperado enviando el mail." };
  }
}
