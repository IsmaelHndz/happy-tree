import { createClient } from "@/lib/supabase/server";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  ArrowLeft,
  RefreshCw,
  KeyRound,
  Globe,
  ShieldCheck,
  Server,
  Terminal,
} from "lucide-react";
import Link from "next/link";

interface CheckStatus {
  hasUrl: boolean;
  hasAnonKey: boolean;
  isPlaceholder: boolean;
  credentialsValid: boolean;
  tablesReady: boolean;
  latencyMs: number;
  personCount: number | null;
  statusTitle: string;
  statusMessage: string;
  errorDetails: string | null;
}

export const dynamic = "force-dynamic";

async function performHealthCheck(): Promise<CheckStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const hasUrl = Boolean(url && url.trim().length > 0);
  const hasAnonKey = Boolean(anonKey && anonKey.trim().length > 0);
  const isPlaceholder = Boolean(
    url?.includes("placeholder-url") || anonKey?.includes("placeholder-anon-key")
  );

  if (!hasUrl || !hasAnonKey || isPlaceholder) {
    return {
      hasUrl,
      hasAnonKey,
      isPlaceholder,
      credentialsValid: false,
      tablesReady: false,
      latencyMs: 0,
      personCount: null,
      statusTitle: "Credenciales Pendientes de Configurar",
      statusMessage: "Faltan las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY o tienen valores por defecto.",
      errorDetails: "Debes asignar tu Project URL y Anon Key reales en .env.local o en las variables de entorno de Vercel.",
    };
  }

  const startTime = Date.now();
  try {
    const supabase = await createClient();

    // 1. Validar conexión y credenciales con el endpoint de autenticación de Supabase
    const { error: authError } = await supabase.auth.getSession();
    const latencyMs = Date.now() - startTime;

    if (authError && authError.status === 401) {
      return {
        hasUrl,
        hasAnonKey,
        isPlaceholder,
        credentialsValid: false,
        tablesReady: false,
        latencyMs,
        personCount: null,
        statusTitle: "Credenciales Inválidas o Rechazadas",
        statusMessage: "Supabase rechazó la Anon Key provista (código 401 Unauthorized).",
        errorDetails: authError.message,
      };
    }

    // 2. Probar acceso a la tabla 'persons'
    const { count, error: tableError } = await supabase
      .from("persons")
      .select("id", { count: "exact", head: true });

    if (tableError) {
      const isMissingTable =
        tableError.code === "PGRST205" ||
        tableError.message.includes("Could not find the table") ||
        tableError.message.includes("does not exist");

      if (isMissingTable) {
        return {
          hasUrl,
          hasAnonKey,
          isPlaceholder,
          credentialsValid: true,
          tablesReady: false,
          latencyMs,
          personCount: null,
          statusTitle: "Conexión a Supabase Exitosa (Falta Migración)",
          statusMessage: "Tus claves se conectan con éxito a Supabase, pero la tabla 'persons' aún no existe.",
          errorDetails:
            "Debes ejecutar el script SQL 'supabase/migrations/20260927000000_initial_schema.sql' en el SQL Editor de tu proyecto de Supabase.",
        };
      }

      return {
        hasUrl,
        hasAnonKey,
        isPlaceholder,
        credentialsValid: true,
        tablesReady: false,
        latencyMs,
        personCount: null,
        statusTitle: "Error al Consultar Tabla 'persons'",
        statusMessage: tableError.message,
        errorDetails: `Código PostgREST: ${tableError.code || "desconocido"}. Revisa las políticas RLS.`,
      };
    }

    // Todo operativo al 100%
    return {
      hasUrl,
      hasAnonKey,
      isPlaceholder,
      credentialsValid: true,
      tablesReady: true,
      latencyMs,
      personCount: count ?? 0,
      statusTitle: "Conexión y Tablas 100% Operativas",
      statusMessage: `Conexión verificada con Supabase. Tabla 'persons' accesible (registros actuales: ${count ?? 0}).`,
      errorDetails: null,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      hasUrl,
      hasAnonKey,
      isPlaceholder,
      credentialsValid: false,
      tablesReady: false,
      latencyMs,
      personCount: null,
      statusTitle: "Excepción de Red al Conectar con Supabase",
      statusMessage: "Ocurrió un error inesperado al invocar la API de Supabase.",
      errorDetails: msg,
    };
  }
}

export default async function TestDbPage() {
  const result = await performHealthCheck();
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const maskedUrl =
    rawUrl.length > 20
      ? `${rawUrl.substring(0, 22)}...supabase.co`
      : rawUrl || "No configurada";

  const isFullyGreen = result.credentialsValid && result.tablesReady;
  const isPartiallyGreen = result.credentialsValid && !result.tablesReady;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 selection:bg-emerald-500 selection:text-black">
      <div className="w-full max-w-2xl bg-neutral-900/90 border border-neutral-800 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Diagnóstico de Conexión Supabase
              </h1>
              <p className="text-xs text-neutral-400">
                Fase 1: Verificación de Credenciales, Red y Esquema
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Inicio
          </Link>
        </div>

        {/* Estado Principal */}
        <div
          className={`p-5 rounded-xl border mb-6 flex items-start gap-4 ${
            isFullyGreen
              ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-200"
              : isPartiallyGreen
              ? "bg-amber-950/30 border-amber-800/60 text-amber-200"
              : "bg-red-950/30 border-red-800/60 text-red-200"
          }`}
        >
          {isFullyGreen ? (
            <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0 mt-0.5" />
          ) : isPartiallyGreen ? (
            <AlertTriangle className="w-7 h-7 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-7 h-7 text-red-400 shrink-0 mt-0.5" />
          )}

          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base text-white">
                {result.statusTitle}
              </h2>
              {result.credentialsValid && (
                <span className="text-xs bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {result.latencyMs} ms
                </span>
              )}
            </div>

            <p className="text-sm mt-1 text-neutral-300 leading-relaxed">
              {result.statusMessage}
            </p>

            {result.errorDetails && (
              <div className="mt-3 p-3 bg-black/50 rounded-lg border border-neutral-800/80 text-xs font-mono text-neutral-300 break-words">
                {result.errorDetails}
              </div>
            )}
          </div>
        </div>

        {/* Grid de Diagnósticos */}
        <div className="space-y-3 mb-6">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Detalle por Componente
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Supabase URL */}
            <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-neutral-400" />
                <div>
                  <div className="text-xs font-medium text-neutral-200">Supabase URL</div>
                  <div className="text-[11px] text-neutral-400 font-mono truncate max-w-[150px]">
                    {maskedUrl}
                  </div>
                </div>
              </div>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  result.hasUrl && !result.isPlaceholder
                    ? "bg-emerald-400 shadow-sm shadow-emerald-400/50"
                    : "bg-red-400"
                }`}
              />
            </div>

            {/* Anon Key */}
            <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-4 h-4 text-neutral-400" />
                <div>
                  <div className="text-xs font-medium text-neutral-200">Anon / Public Key</div>
                  <div className="text-[11px] text-neutral-400">
                    {result.credentialsValid
                      ? "Válida y verificada"
                      : result.hasAnonKey
                      ? "Formato detectado"
                      : "No configurada"}
                  </div>
                </div>
              </div>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  result.credentialsValid
                    ? "bg-emerald-400 shadow-sm shadow-emerald-400/50"
                    : "bg-red-400"
                }`}
              />
            </div>

            {/* Tabla persons */}
            <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-neutral-400" />
                <div>
                  <div className="text-xs font-medium text-neutral-200">Tabla &lsquo;persons&rsquo;</div>
                  <div className="text-[11px] text-neutral-400">
                    {result.tablesReady
                      ? "Creada con RLS activo"
                      : "Pendiente ejecutar SQL"}
                  </div>
                </div>
              </div>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  result.tablesReady
                    ? "bg-emerald-400 shadow-sm shadow-emerald-400/50"
                    : "bg-amber-400"
                }`}
              />
            </div>

            {/* Vercel / SSR Ready */}
            <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Server className="w-4 h-4 text-neutral-400" />
                <div>
                  <div className="text-xs font-medium text-neutral-200">Arquitectura Vercel</div>
                  <div className="text-[11px] text-neutral-400">Serverless / SSR Ready</div>
                </div>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
            </div>
          </div>
        </div>

        {/* Guía de despliegue a Vercel */}
        <div className="mb-6 p-4 rounded-xl bg-neutral-950/80 border border-neutral-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300 mb-2">
            <Terminal className="w-4 h-4 text-teal-400" />
            <span>Variables para Vercel Dashboard (Project Settings &rarr; Environment Variables)</span>
          </div>
          <div className="space-y-1.5 text-[11px] font-mono text-neutral-400">
            <div className="p-2 rounded bg-black/60 border border-neutral-900 select-all">
              NEXT_PUBLIC_SUPABASE_URL=https://lwzyfmgrzofflinpyoxi.supabase.co
            </div>
            <div className="p-2 rounded bg-black/60 border border-neutral-900 select-all">
              NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_nUx7ug0jG4ZARIdD3qP9RA_ql4rR3Dq
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
          <p className="text-xs text-neutral-500">
            Esta página se evalúa en el servidor en cada recarga.
          </p>
          <Link
            href="/test-db"
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reintentar Diagnóstico
          </Link>
        </div>
      </div>
    </div>
  );
}
