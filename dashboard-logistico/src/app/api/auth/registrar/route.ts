import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { sendNotificationEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------
// Autoregistro desde el login. Crea la cuenta con la Service Role Key
// (email_confirm: true) para que quede confirmada de entrada, sin depender
// de la configuración de "Confirm email" del proyecto de Supabase -- mismo
// mecanismo que ya usa /api/admin/usuarios para crear usuarios a mano.
// Queda sin perfil asignado y se le avisa al admin por mail.
// -----------------------------------------------------------------------
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email y contraseña son obligatorios." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ success: false, error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      throw new Error(
        authError?.message === "User already registered" ? "Ese email ya tiene una cuenta." : authError?.message || "No se pudo crear la cuenta."
      );
    }

    const { error: usuarioError } = await supabaseAdmin.from("usuarios").insert({
      id: authData.user.id,
      email,
      nombre: nombre || null,
      perfil_id: null,
    });

    if (usuarioError) {
      // Si falla el insert en "usuarios", limpiamos el usuario de Auth para no dejar huérfanos.
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
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
