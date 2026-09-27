# Happy Tree 🌳

Plataforma de Genealogía Colaborativa y Red Familiar Privada por Invitación Criptográfica.

## 🚀 Arquitectura y Tecnologías
- **Framework:** [Next.js](https://nextjs.org/) (App Router con Turbopack)
- **Lenguaje:** [TypeScript](https://www.typescriptlang.org/) (Tipado estricto)
- **Estilos:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Base de Datos & Auth:** [Supabase](https://supabase.com/) (`@supabase/ssr` y PostgreSQL con Row Level Security)
- **Despliegue:** [Vercel](https://vercel.com/) (Serverless / SSR)

## 📌 Modelo de Dominio
1. **Modelo de Reclamación (Claiming Pattern):** Los perfiles genealógicos se inicializan en estado preliminar (*unclaimed*) y se reclaman cuando el familiar accede.
2. **Acceso Estricto por Invitación:** Registro exclusivamente mediante tokens criptográficos de un solo uso vinculados a nodos específicos.
3. **Validación Bilateral:** Consenso mutuo en relaciones verticales (padre/hijo) y uniones de pareja para evitar árboles duplicados o fraudulentos.
4. **Red de Confianza:** Sistema de reconocimientos mínimos para habilitar permisos de invitación.

## 🛠️ Configuración de Variables de Entorno
Copia el archivo `.env.local.example` a `.env.local` y asigna tus credenciales de Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

En Vercel, agrega estas mismas variables en **Project Settings** > **Environment Variables**.

## 🧪 Verificación de Conexión
Visita la ruta `/test-db` en local (`http://localhost:3000/test-db`) o en tu despliegue de Vercel para comprobar el diagnóstico de conexión en tiempo real con Supabase.
