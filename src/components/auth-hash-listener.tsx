"use client";

import { useEffect } from "react";

/**
 * Escucha si la URL contiene un fragmento hash de recuperación de contraseña emitido por Supabase
 * (#access_token=...&type=recovery).
 * En arquitecturas SSR, los fragmentos '#' solo existen en el navegador y nunca llegan al servidor.
 * Este componente intercepta el hash y redirige inmediatamente al usuario a /reset-password
 * preservando los tokens criptográficos para que el formulario pueda procesarlos.
 */
export function AuthHashListener() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    if (
      hash &&
      hash.includes("type=recovery") &&
      !window.location.pathname.startsWith("/reset-password")
    ) {
      window.location.href = `/reset-password${hash}`;
      return;
    }

    const search = window.location.search;
    if (
      search &&
      search.includes("code=") &&
      window.location.pathname === "/"
    ) {
      window.location.href = `/auth/callback${search}&next=/reset-password`;
    }
  }, []);

  return null;
}
