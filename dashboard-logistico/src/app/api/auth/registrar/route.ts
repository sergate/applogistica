import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { sendNotificationEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------
// Se llama desde el login, justo después de que el navegador crea la cuenta
// con supabase.auth.signUp() (con la anon key). Esta ruta usa la Service
// Role Key para: 1) confirmar que el userId es una cuenta de Auth real
// (evita que cualquiera mande un id/email inventado), 2) crear la fila en
// "usuarios" sin perfil asignado, 3) avisarle al admin por mail.
// -----------------------------------------------------------------------
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  try {
    const body = await request.json();
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";

    if (!userId || !email) {
      return NextResponse.json({ success: false, error: "Faltan datos del usuario." }, { status: 400 });
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authError || !authUser.user || (authUser.user.email || "").toLowerCase() !== email) {
      return NextResponse.json({ success: false, error: "No se pudo verificar la cuenta creada." }, { status: 400 });
    }

    const { error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .upsert({ id: userId, email, nombre: nombre || null, perfil_id: null }, { onConflict: "id" });

    if (usuarioError) {
      throw new Error(`Supabase (usuarios): ${usuarioError.message}`);
    }

    // El aviso por mail no debe interrumpir el registro si falla o no está configurado.
    const { data: config } = await supabaseAdmin
      .from("app_config")
      .select("notification_email")
      .eq("id", 1)
      .maybeSingle();

    if (config?.notification_email) {
      await sendNotificationEmail({
        to: config.notification_email,
        subject: "Nuevo usuario registrado en el Panel Logístico",
        html: `
          <p>Se registró un usuario nuevo y todavía no tiene perfil asignado:</p>
          <ul>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Nombre:</strong> ${nombre || "(sin nombre)"}</li>
          </ul>
          <p>Asignale un perfil desde Administración &gt; Usuarios para que pueda usar la app.</p>
        `,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
