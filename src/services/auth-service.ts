import type { UserProfile } from "../types/models";
import { supabase } from "../lib/supabase";

const defaultWarehousePassword = "Tactical2026";
const adminPassword = "Sistemas2026#";

const localUsers: Record<string, UserProfile> = {
  "sistemas@tacticalsupport.com.mx": {
    id: "local-admin",
    email: "sistemas@tacticalsupport.com.mx",
    fullName: "Admin Sistemas",
    role: "admin",
    siteCode: "CEDIS",
  },
  "almacencedis@tacticalsupport.com.mx": {
    id: "local-almacen-cedis",
    email: "almacencedis@tacticalsupport.com.mx",
    fullName: "Almacen CEDIS",
    role: "almacen_cedis",
    siteCode: "CEDIS",
  },
  "almacenacuna@tacticalsupport.com.mx": {
    id: "local-almacen-acuna",
    email: "almacenacuna@tacticalsupport.com.mx",
    fullName: "Almacen ACUNA",
    role: "almacen_acuna",
    siteCode: "ACUNA",
  },
  "almacennld@tacticalsupport.com.mx": {
    id: "local-almacen-nld",
    email: "almacennld@tacticalsupport.com.mx",
    fullName: "Almacen NLD",
    role: "almacen_nld",
    siteCode: "NLD",
  },
};

const emailAliasMap: Record<string, string> = {
  "sistemas@tacticalsupport.com.mx": "sistemas@tacticalsupport.com.mx",
  "almacencedis@tacticalsupport.com.mx": "almacencedis@tacticalsupport.com.mx",
  "almacenacuna@tacticalsupport.com.mx": "almacenacuna@tacticalsupport.com.mx",
  "almacennld@tacticalsupport.com.mx": "almacennld@tacticalsupport.com.mx",
};

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return emailAliasMap[normalized] ?? normalized;
}

export async function signIn(email: string, password: string): Promise<UserProfile> {
  const normalizedEmail = normalizeEmail(email);

  if (!supabase) {
    if (!normalizedEmail || !password) throw new Error("Credenciales incompletas");
    const user = localUsers[normalizedEmail];
    if (!user) throw new Error("Correo no autorizado para acceso.");
    const expectedPassword =
      normalizedEmail === "sistemas@tacticalsupport.com.mx" ? adminPassword : defaultWarehousePassword;
    if (password !== expectedPassword) throw new Error("Contrasena incorrecta.");
    return user;
  }

  const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
  if (error) {
    throw new Error(
      error.message?.includes("Invalid login credentials")
        ? "Correo o contrasena incorrectos."
        : error.message ?? "No fue posible iniciar sesion.",
    );
  }

  const { data: authData, error: authUserError } = await supabase.auth.getUser();
  if (authUserError || !authData.user) {
    throw new Error("Sesion iniciada, pero no se pudo obtener el usuario autenticado.");
  }

  const { data, error: profileError } = await supabase
    .from("users")
    .select("id,email,full_name,role,site_code")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!data) {
    throw new Error("El usuario existe en Auth, pero no tiene perfil en la tabla public.users.");
  }

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    siteCode: data.site_code,
  };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}
