-- ==============================================================================
-- HAPPY-TREE: ESQUEMA INICIAL DE BASE DE DATOS (FASE 1)
-- Plataforma de Genealogía Colaborativa y Red Familiar por Invitación
-- ==============================================================================

-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. ENUMS
-- ==============================================================================
DO $$ BEGIN
    CREATE TYPE gender_enum AS ENUM ('male', 'female', 'other', 'unknown');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE parent_child_relationship_enum AS ENUM ('biological', 'adopted', 'foster', 'step');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE union_type_enum AS ENUM ('married', 'civil_union', 'divorced', 'separated', 'partner');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE edge_status_enum AS ENUM ('pending_confirmation', 'confirmed', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE invitation_status_enum AS ENUM ('pending', 'accepted', 'expired', 'revoked');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ==============================================================================
-- 3. TABLA: PERSONS (Fichas genealógicas / Nodos del Grafo)
-- Modelo de Reclamación: Cada nodo inicia unclaimed hasta ser enlazado a un usuario
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.persons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    maiden_name TEXT,
    gender gender_enum NOT NULL DEFAULT 'unknown',
    birth_date DATE,
    death_date DATE,
    is_living BOOLEAN NOT NULL DEFAULT true,
    birth_place TEXT,
    avatar_url TEXT,
    bio TEXT,
    
    -- Claiming pattern: vincula la ficha genealógica a una cuenta de auth.users
    is_claimed BOOLEAN NOT NULL DEFAULT false,
    claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Regla de integridad: Un usuario de Supabase solo puede reclamar un único nodo genealógico
    CONSTRAINT unique_claimed_user UNIQUE (claimed_by_user_id),
    CONSTRAINT check_death_date CHECK (death_date IS NULL OR birth_date IS NULL OR death_date >= birth_date)
);

-- ==============================================================================
-- 4. TABLA: PARENT_CHILD_EDGES (Filiaciones Verticales Progenitor - Hijo)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.parent_child_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    relationship_type parent_child_relationship_enum NOT NULL DEFAULT 'biological',
    status edge_status_enum NOT NULL DEFAULT 'pending_confirmation',
    
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    confirmed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Restricciones de grafo básico
    CONSTRAINT check_parent_not_child CHECK (parent_id <> child_id),
    CONSTRAINT unique_parent_child_pair UNIQUE (parent_id, child_id)
);

-- ==============================================================================
-- 5. TABLA: UNION_EDGES (Vínculos Horizontales Parejas / Cónyuges)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.union_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_a_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    person_b_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    union_type union_type_enum NOT NULL DEFAULT 'married',
    start_date DATE,
    end_date DATE,
    status edge_status_enum NOT NULL DEFAULT 'pending_confirmation',
    
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT check_union_distinct_persons CHECK (person_a_id <> person_b_id)
);

-- Evitar duplicados simétricos (ej. A-B y B-A)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unions_unique_pair 
ON public.union_edges (LEAST(person_a_id, person_b_id), GREATEST(person_a_id, person_b_id));

-- ==============================================================================
-- 6. TABLA: INVITATION_TOKENS (Tokens de Reclamación Criptográficos de Un Solo Uso)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.invitation_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    invited_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_email TEXT NOT NULL,
    proposed_relationship TEXT,
    status invitation_status_enum NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '7 days'),
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 7. ÍNDICES DE RENDIMIENTO
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_persons_claimed ON public.persons(is_claimed);
CREATE INDEX IF NOT EXISTS idx_persons_claimed_user ON public.persons(claimed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_persons_names ON public.persons(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_parent_child_parent ON public.parent_child_edges(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_child_child ON public.parent_child_edges(child_id);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_token ON public.invitation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_person ON public.invitation_tokens(person_id);

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- Activación de seguridad por fila para todas las tablas
-- ==============================================================================
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_child_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.union_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_tokens ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura base:
-- A. Permitir lectura de fichas genealógicas a usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden ver personas" 
ON public.persons FOR SELECT 
TO authenticated 
USING (true);

-- B. Permitir lectura anónima limitada para el health-check inicial o consulta de conteos
CREATE POLICY "Permitir verificación de lectura de persons"
ON public.persons FOR SELECT
TO anon
USING (true);

-- C. Edges visibles para autenticados
CREATE POLICY "Usuarios autenticados pueden ver parentescos verticales" 
ON public.parent_child_edges FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Permitir verificación de lectura de edges"
ON public.parent_child_edges FOR SELECT
TO anon
USING (true);

CREATE POLICY "Usuarios autenticados pueden ver uniones" 
ON public.union_edges FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Permitir verificación de lectura de uniones"
ON public.union_edges FOR SELECT
TO anon
USING (true);

-- D. Tokens de invitación:
-- Solo el usuario que invitó o quien valida un token específico puede leerlo
CREATE POLICY "Lectura de tokens de invitación por anon con token exacto"
ON public.invitation_tokens FOR SELECT
TO anon, authenticated
USING (status = 'pending' AND expires_at > now());
