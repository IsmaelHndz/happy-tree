"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createFriendAction,
  removeFriendAction,
  searchUsersForSharingAction,
  setFriendTreeAccessAction,
  updateFriendKindAction,
} from "@/features/genealogy/friends-actions";
import { InviteModal } from "@/features/invitations/components/invite-modal";
import { EditMemberModal } from "@/features/genealogy/components/edit-member-modal";
import { formatFullName, type FriendItem, type TreePermissionTier, type UserSearchResultItem } from "../types";
import type { Gender } from "@/types/database.types";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Heart,
  KeyRound,
  Loader2,
  Pencil,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

const TIER_OPTIONS: { value: TreePermissionTier | "none"; label: string }[] = [
  { value: "none", label: "No ve tu árbol" },
  { value: "basic", label: "Básico · familia de casa" },
  { value: "intermediate", label: "Intermedio · familia extendida" },
  { value: "advanced", label: "Avanzado · árbol completo" },
];

const TIER_SHORT: Record<TreePermissionTier, string> = {
  basic: "Básico",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

const inputClass =
  "w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition";

function segmentClass(active: boolean) {
  return `flex-1 px-3 py-2 rounded-lg text-xs font-medium transition border ${
    active
      ? "bg-emerald-600 border-emerald-500 text-white"
      : "bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-white"
  }`;
}

interface FriendsDirectoryProps {
  friends: FriendItem[];
  loadError?: string;
}

export function FriendsDirectory({ friends, loadError }: FriendsDirectoryProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "friend" | "dating">("all");
  const [isAdding, setIsAdding] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<{ personId: string; name: string; label: string; token: string | null } | null>(null);
  const [editTarget, setEditTarget] = useState<FriendItem | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);

  const visible = friends.filter((f) => filter === "all" || f.kind === filter);
  const count = (kind: "friend" | "dating") => friends.filter((f) => f.kind === kind).length;

  const run = async (key: string, action: () => Promise<{ success: boolean; message?: string; error?: string }>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    const res = await action();
    setBusy(null);
    setPending(null);
    if (!res.success) setError(res.error ?? "No se pudo completar la acción.");
    else {
      setNotice(res.message ?? "Listo.");
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["all", `Todos (${friends.length})`],
              ["friend", `Amistades (${count("friend")})`],
              ["dating", `Noviazgo (${count("dating")})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                filter === value
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition"
        >
          <UserPlus className="w-4 h-4" />
          Agregar amigo
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="py-12 text-center text-neutral-500 text-sm flex flex-col items-center gap-2">
          <Users className="w-8 h-8 text-neutral-700" />
          {friends.length === 0
            ? "Aún no tienes amigos registrados. Los amigos no aparecen en tu árbol familiar."
            : "No hay vínculos en esta categoría."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((f) => {
            const name = formatFullName(f);
            const initials = `${f.firstName.charAt(0)}${f.lastName.charAt(0)}`.toUpperCase();
            const isDating = f.kind === "dating";
            const relationLabel = isDating
              ? f.gender === "female" ? "Novia" : f.gender === "male" ? "Novio" : "Noviazgo"
              : f.gender === "female" ? "Amiga" : f.gender === "male" ? "Amigo" : "Amistad";

            return (
              <div
                key={f.connectionId}
                className="flex flex-col justify-between gap-4 p-5 rounded-2xl bg-neutral-950/70 border border-neutral-800/80 hover:border-neutral-700/80 transition-all shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${
                        isDating
                          ? "bg-rose-950 text-rose-300 border-rose-800/60"
                          : "bg-sky-950 text-sky-300 border-sky-800/60"
                      }`}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white tracking-tight truncate">{name}</h3>
                      <span className={`text-[11px] font-medium flex items-center gap-1 ${isDating ? "text-rose-300" : "text-sky-300"}`}>
                        {isDating && <Heart className="w-3 h-3" />}
                        {relationLabel}
                      </span>
                    </div>
                  </div>

                  {f.isClaimed ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-800/50 px-2.5 py-0.5 rounded-full">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      Cuenta activa
                    </span>
                  ) : f.invitationToken ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-300 bg-amber-950/60 border border-amber-800/50 px-2.5 py-0.5 rounded-full">
                      <Clock className="w-3 h-3 text-amber-400" />
                      Invitación enviada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-400 bg-neutral-950 border border-neutral-800 px-2.5 py-0.5 rounded-full">
                      Sin cuenta todavía
                    </span>
                  )}

                  {/* Permisos: solo aplican cuando el amigo ya tiene cuenta */}
                  {f.isClaimed ? (
                    <div className="space-y-2 pt-1">
                      <label className="block text-[11px] text-neutral-400">
                        Qué ve de tu árbol
                        <select
                          value={f.grantedTier ?? "none"}
                          disabled={busy === `t:${f.connectionId}`}
                          onChange={(e) =>
                            run(`t:${f.connectionId}`, () =>
                              setFriendTreeAccessAction(f.personId, e.target.value as TreePermissionTier | "none")
                            )
                          }
                          className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-lg py-1.5 px-2 text-xs text-neutral-200"
                        >
                          {TIER_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {f.receivedTier && f.friendUserId ? (
                        <Link
                          href={`/tree?friendId=${f.friendUserId}`}
                          className="flex items-center gap-1.5 text-[11px] text-emerald-400 hover:text-emerald-300"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver su árbol ({TIER_SHORT[f.receivedTier]})
                        </Link>
                      ) : (
                        <p className="text-[11px] text-neutral-500">No te comparte su árbol.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-neutral-500">
                      Cuando acepte la invitación podrás elegir qué parte de tu árbol puede ver.
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-neutral-800/60 space-y-2">
                  {isDating &&
                    (pending === `k:${f.connectionId}` ? (
                      <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-300">
                        <span>¿Terminaron y quedaron como amigos?</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => run(`k:${f.connectionId}`, () => updateFriendKindAction(f.connectionId, "friend"))}
                            disabled={busy === `k:${f.connectionId}`}
                            className="px-2 py-1 rounded-lg bg-sky-700 hover:bg-sky-600 text-white font-semibold flex items-center gap-1"
                          >
                            {busy === `k:${f.connectionId}` && <Loader2 className="w-3 h-3 animate-spin" />}
                            Sí
                          </button>
                          <button onClick={() => setPending(null)} className="text-neutral-400 hover:text-white px-1">
                            No
                          </button>
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPending(`k:${f.connectionId}`)}
                        className="w-full text-[11px] text-sky-300 hover:text-sky-200 bg-sky-950/40 hover:bg-sky-950/70 border border-sky-900/60 rounded-lg py-1.5 transition"
                      >
                        Terminamos · quedamos como amigos
                      </button>
                    ))}

                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                    {!f.isClaimed && f.createdByMe && (
                      <button
                        onClick={() => setEditTarget(f)}
                        className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700/60 rounded-lg transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar
                      </button>
                    )}
                    {!f.isClaimed && (
                      <button
                        onClick={() =>
                          setInviteTarget({ personId: f.personId, name, label: relationLabel, token: f.invitationToken })
                        }
                        className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium bg-neutral-800/80 hover:bg-emerald-600 text-neutral-200 hover:text-white border border-neutral-700/60 rounded-lg transition"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        {f.invitationToken ? "Enlace" : "Invitar"}
                      </button>
                    )}
                    {pending === `r:${f.connectionId}` ? (
                      <span className="flex items-center gap-1.5">
                        <button
                          onClick={() => run(`r:${f.connectionId}`, () => removeFriendAction(f.connectionId))}
                          disabled={busy === `r:${f.connectionId}`}
                          className="h-8 px-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1"
                        >
                          {busy === `r:${f.connectionId}` && <Loader2 className="w-3 h-3 animate-spin" />}
                          Quitar
                        </button>
                        <button onClick={() => setPending(null)} className="text-xs text-neutral-400 hover:text-white px-1">
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setPending(`r:${f.connectionId}`)}
                        className="h-8 px-2.5 text-xs text-neutral-500 hover:text-red-300 rounded-lg hover:bg-red-950/30 transition"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAdding && (
        <AddFriendModal
          onClose={() => setIsAdding(false)}
          onCreated={(created) => {
            setIsAdding(false);
            setError(null);
            setNotice(created.message);
            router.refresh();
            if (created.invite) setInviteTarget(created.invite);
          }}
        />
      )}

      {inviteTarget && (
        <InviteModal
          personId={inviteTarget.personId}
          personName={inviteTarget.name}
          relationshipLabel={inviteTarget.label}
          existingToken={inviteTarget.token}
          isOpen
          onClose={() => {
            setInviteTarget(null);
            router.refresh();
          }}
        />
      )}

      {editTarget && (
        <EditMemberModal
          key={editTarget.personId}
          member={{
            id: editTarget.personId,
            firstName: editTarget.firstName,
            middleName: editTarget.middleName,
            lastName: editTarget.lastName,
            maternalLastName: editTarget.maternalLastName,
            maidenName: editTarget.maidenName,
            gender: editTarget.gender,
            birthDate: editTarget.birthDate,
            deathDate: editTarget.deathDate,
            isLiving: editTarget.isLiving,
            birthPlace: editTarget.birthPlace,
            bio: editTarget.bio,
            isClaimed: editTarget.isClaimed,
            relationshipLabel: editTarget.kind === "dating" ? "Noviazgo" : "Amistad",
          }}
          showFamilyTab={false}
          isOpen
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

function AddFriendModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: {
    message: string;
    invite: { personId: string; name: string; label: string; token: null } | null;
  }) => void;
}) {
  const [kind, setKind] = useState<"friend" | "dating">("friend");
  const [hasAccount, setHasAccount] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [maternalLastName, setMaternalLastName] = useState("");
  const [gender, setGender] = useState<Gender>("unknown");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserSearchResultItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchActive = hasAccount && query.trim().length >= 2;
  const shownResults = searchActive ? results : [];

  useEffect(() => {
    if (!searchActive) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      setSearching(true);
      const found = await searchUsersForSharingAction(query);
      if (cancelled) return;
      setResults(found.filter((r) => r.personId));
      setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchActive, query]);

  const label = (g: Gender) =>
    kind === "dating"
      ? g === "female" ? "Novia" : g === "male" ? "Novio" : "Noviazgo"
      : g === "female" ? "Amiga" : g === "male" ? "Amigo" : "Amistad";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = hasAccount
      ? await createFriendAction({ kind, existingPersonId: selected?.personId ?? null })
      : await createFriendAction({ kind, firstName, middleName, lastName, maternalLastName, gender });

    setSaving(false);
    if (!res.success) {
      setError(res.error ?? "No se pudo agregar.");
      return;
    }

    const name = [firstName, middleName, lastName, maternalLastName].filter((s) => s.trim()).join(" ");
    onCreated({
      message: res.message ?? "Agregado.",
      invite: !hasAccount && res.personId ? { personId: res.personId, name, label: label(gender), token: null } : null,
    });
  };

  const canSubmit = hasAccount ? Boolean(selected) : Boolean(firstName.trim() && lastName.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl space-y-4"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1.5 rounded-xl hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div>
          <h2 className="text-base font-bold text-white">Agregar amigo</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Los amigos y noviazgos no aparecen en tu árbol familiar ni ven a tu familia hasta que tú lo decidas.
          </p>
        </div>

        <div className="flex gap-1.5">
          <button type="button" onClick={() => setKind("friend")} className={segmentClass(kind === "friend")}>
            Amistad
          </button>
          <button type="button" onClick={() => setKind("dating")} className={segmentClass(kind === "dating")}>
            Noviazgo
          </button>
        </div>

        <div className="flex gap-1.5">
          <button type="button" onClick={() => setHasAccount(false)} className={segmentClass(!hasAccount)}>
            Aún no tiene cuenta
          </button>
          <button type="button" onClick={() => setHasAccount(true)} className={segmentClass(hasAccount)}>
            Ya está en Happy Tree
          </button>
        </div>

        {hasAccount ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                }}
                placeholder="Busca por nombre o correo"
                className={`${inputClass} pl-9`}
              />
            </div>
            {searching && (
              <p className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Buscando…
              </p>
            )}
            <div className="space-y-1.5">
              {shownResults.map((r) => (
                <button
                  type="button"
                  key={r.userId}
                  onClick={() => setSelected(r)}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition ${
                    selected?.userId === r.userId
                      ? "border-emerald-500 bg-emerald-950/40 text-white"
                      : "border-neutral-800 bg-neutral-950/60 text-neutral-300 hover:border-neutral-600"
                  }`}
                >
                  <span className="font-medium block">{r.fullName}</span>
                  <span className="text-[11px] text-neutral-500">{r.email}</span>
                </button>
              ))}
              {!searching && searchActive && shownResults.length === 0 && (
                <p className="text-[11px] text-neutral-500">
                  No encontramos a nadie con ese nombre. Puedes registrarlo en «Aún no tiene cuenta» e invitarlo.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Primer nombre *" className={inputClass} />
              <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder="Segundo nombre" className={inputClass} />
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Apellido paterno *" className={inputClass} />
              <input value={maternalLastName} onChange={(e) => setMaternalLastName(e.target.value)} placeholder="Apellido materno" className={inputClass} />
            </div>
            <div className="flex gap-1.5">
              {(
                [
                  ["male", "Hombre"],
                  ["female", "Mujer"],
                  ["unknown", "Prefiero no decir"],
                ] as const
              ).map(([value, text]) => (
                <button key={value} type="button" onClick={() => setGender(value)} className={segmentClass(gender === value)}>
                  {text}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500">
              Se crea su ficha y después puedes enviarle la invitación para que tenga su propia cuenta.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || saving}
          className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {hasAccount ? "Agregar" : "Agregar e invitar"}
        </button>
      </form>
    </div>
  );
}
