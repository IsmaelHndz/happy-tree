"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Users,
  UserCheck,
  UserPlus,
  Shield,
  Check,
  X,
  Search,
  Loader2,
  Trash2,
  ArrowRight,
  ExternalLink,
  Sparkles,
  Info,
} from "lucide-react";
import type {
  TreePermissionTier,
  TreeAccessShareItem,
  UserSearchResultItem,
} from "../types";
import {
  searchUsersForSharingAction,
  requestTreeAccessAction,
  respondTreeAccessAction,
  getTreeAccessSharesAction,
  deleteOrCancelTreeAccessAction,
} from "../friends-actions";
import Link from "next/link";

interface FriendsManagerModalProps {
  initialPendingCount?: number;
}

export function FriendsManagerModal({ initialPendingCount = 0 }: FriendsManagerModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"incoming" | "friends" | "search">("incoming");
  const [isPending, startTransition] = useTransition();

  // Estados de datos
  const [incoming, setIncoming] = useState<TreeAccessShareItem[]>([]);
  const [friends, setFriends] = useState<TreeAccessShareItem[]>([]);
  const [treesSharedWithMe, setTreesSharedWithMe] = useState<TreeAccessShareItem[]>([]);
  const [outgoingPending, setOutgoingPending] = useState<TreeAccessShareItem[]>([]);

  // Estados de interacción
  const [selectedTiers, setSelectedTiers] = useState<Record<string, TreePermissionTier>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResultItem[]>([]);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestingUserId, setRequestingUserId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Cargar datos al abrir modal
  const loadData = () => {
    startTransition(async () => {
      try {
        const data = await getTreeAccessSharesAction();
        setIncoming(data.incomingPending);
        setFriends(data.activeFriends);
        setTreesSharedWithMe(data.treesSharedWithMe);
        setOutgoingPending(data.outgoingPending);

        // Inicializar tiers seleccionados en 'basic' por defecto para cada incoming
        const tiers: Record<string, TreePermissionTier> = {};
        data.incomingPending.forEach((item) => {
          tiers[item.id] = "basic";
        });
        setSelectedTiers(tiers);
      } catch (e) {
        console.error("Error al cargar accesos:", e);
      }
    });
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Manejar respuesta a solicitud (Aprobar / Rechazar)
  const handleRespond = (shareId: string, action: "approved" | "rejected") => {
    const tier = selectedTiers[shareId] || "basic";
    startTransition(async () => {
      setStatusMessage(null);
      const res = await respondTreeAccessAction(shareId, action, tier);
      if (res.success) {
        setStatusMessage({
          type: "success",
          text: action === "approved" ? `Acceso concedido con nivel ${tier}.` : "Solicitud rechazada.",
        });
        loadData();
      } else {
        setStatusMessage({ type: "error", text: res.error || "Error al procesar acción." });
      }
    });
  };

  // Cambiar nivel de permiso a un amigo ya aprobado
  const handleUpdateTier = (shareId: string, newTier: TreePermissionTier) => {
    startTransition(async () => {
      setStatusMessage(null);
      const res = await respondTreeAccessAction(shareId, "update_tier", newTier);
      if (res.success) {
        setStatusMessage({ type: "success", text: `Nivel actualizado a ${newTier}.` });
        loadData();
      } else {
        setStatusMessage({ type: "error", text: res.error || "Error al actualizar nivel." });
      }
    });
  };

  // Revocar acceso a un amigo
  const handleRevoke = (shareId: string) => {
    if (!confirm("¿Deseas revocar el permiso de visualización a este usuario?")) return;
    startTransition(async () => {
      setStatusMessage(null);
      const res = await respondTreeAccessAction(shareId, "revoked");
      if (res.success) {
        setStatusMessage({ type: "success", text: "Acceso revocado." });
        loadData();
      } else {
        setStatusMessage({ type: "error", text: res.error || "Error al revocar acceso." });
      }
    });
  };

  // Buscar usuarios para solicitar
  const handleSearch = () => {
    startTransition(async () => {
      setStatusMessage(null);
      const results = await searchUsersForSharingAction(searchTerm);
      setSearchResults(results);
    });
  };

  // Enviar solicitud de acceso
  const handleSendRequest = (targetUserId: string) => {
    startTransition(async () => {
      setStatusMessage(null);
      const res = await requestTreeAccessAction(targetUserId, requestMessage);
      if (res.success) {
        setStatusMessage({ type: "success", text: res.message || "Solicitud enviada." });
        setRequestingUserId(null);
        setRequestMessage("");
        handleSearch();
        loadData();
      } else {
        setStatusMessage({ type: "error", text: res.error || "Error al enviar solicitud." });
      }
    });
  };

  // Cancelar solicitud enviada
  const handleCancelOutgoing = (shareId: string) => {
    startTransition(async () => {
      const res = await deleteOrCancelTreeAccessAction(shareId);
      if (res.success) {
        loadData();
      }
    });
  };

  const pendingCount = incoming.length > 0 ? incoming.length : initialPendingCount;

  return (
    <>
      {/* Botón de apertura en la cabecera */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl transition shadow-sm"
      >
        <Users className="w-3.5 h-3.5 text-teal-400" />
        <span>Amigos & Accesos</span>
        {pendingCount > 0 && (
          <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold bg-amber-500 text-black rounded-full animate-pulse">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Cabecera */}
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-neutral-950 font-bold">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Red de Amigos & Permisos de Árbol</span>
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Controla quién puede ver tu árbol genealógico y con qué nivel de detalle.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pestañas */}
            <div className="flex border-b border-neutral-800 bg-neutral-950/60 p-1.5 gap-1.5">
              <button
                onClick={() => setActiveTab("incoming")}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition flex items-center justify-center gap-2 ${
                  activeTab === "incoming"
                    ? "bg-neutral-800 text-white shadow-sm"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Solicitudes Recibidas</span>
                {incoming.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full font-mono">
                    {incoming.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("friends")}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition flex items-center justify-center gap-2 ${
                  activeTab === "friends"
                    ? "bg-neutral-800 text-white shadow-sm"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Amigos con Acceso ({friends.length})</span>
              </button>

              <button
                onClick={() => setActiveTab("search")}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition flex items-center justify-center gap-2 ${
                  activeTab === "search"
                    ? "bg-neutral-800 text-white shadow-sm"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 text-teal-400" />
                <span>Explorar & Solicitar</span>
              </button>
            </div>

            {/* Alertas de Estado */}
            {statusMessage && (
              <div
                className={`mx-5 mt-4 p-3 rounded-xl text-xs flex items-center justify-between border ${
                  statusMessage.type === "success"
                    ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/40"
                    : "bg-red-950/40 text-red-300 border-red-800/40"
                }`}
              >
                <span>{statusMessage.text}</span>
                <button
                  onClick={() => setStatusMessage(null)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Contenido según pestaña activa */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* TAB 1: SOLICITUDES RECIBIDAS */}
              {activeTab === "incoming" && (
                <div className="space-y-4">
                  {incoming.length === 0 ? (
                    <div className="text-center py-10 text-neutral-500 text-xs">
                      No tienes solicitudes de acceso pendientes por responder.
                    </div>
                  ) : (
                    incoming.map((req) => (
                      <div
                        key={req.id}
                        className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="font-semibold text-white text-sm block">
                              {req.requesterName}
                            </span>
                            <span className="text-[11px] text-neutral-400">
                              Desea ver tu árbol genealógico
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-neutral-500">
                            {new Date(req.requestedAt).toLocaleDateString()}
                          </span>
                        </div>

                        {req.requestMessage && (
                          <p className="text-xs text-neutral-300 bg-neutral-900/80 p-2.5 rounded-xl italic border border-neutral-800/50">
                            &ldquo;{req.requestMessage}&rdquo;
                          </p>
                        )}

                        {/* Selector de Niveles de Permiso */}
                        <div className="space-y-1.5 pt-1">
                          <label className="text-[11px] font-medium text-neutral-400 block">
                            Selecciona el nivel de permiso que le otorgas:
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <label
                              className={`flex flex-col p-2.5 rounded-xl border cursor-pointer transition text-left ${
                                selectedTiers[req.id] === "basic"
                                  ? "bg-blue-950/40 border-blue-500/50 text-white"
                                  : "bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                                <input
                                  type="radio"
                                  name={`tier-${req.id}`}
                                  value="basic"
                                  checked={selectedTiers[req.id] === "basic"}
                                  onChange={() =>
                                    setSelectedTiers({ ...selectedTiers, [req.id]: "basic" })
                                  }
                                  className="accent-blue-500"
                                />
                                <span>Básico (Casa)</span>
                              </div>
                              <span className="text-[10px] text-neutral-400 mt-1">
                                Solo familia de casa: Padres, hermanos, hijos, pareja.
                              </span>
                            </label>

                            <label
                              className={`flex flex-col p-2.5 rounded-xl border cursor-pointer transition text-left ${
                                selectedTiers[req.id] === "intermediate"
                                  ? "bg-amber-950/40 border-amber-500/50 text-white"
                                  : "bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                                <input
                                  type="radio"
                                  name={`tier-${req.id}`}
                                  value="intermediate"
                                  checked={selectedTiers[req.id] === "intermediate"}
                                  onChange={() =>
                                    setSelectedTiers({ ...selectedTiers, [req.id]: "intermediate" })
                                  }
                                  className="accent-amber-500"
                                />
                                <span>Intermedio</span>
                              </div>
                              <span className="text-[10px] text-neutral-400 mt-1">
                                Incluye abuelos, tíos, primos, sobrinos y nietos.
                              </span>
                            </label>

                            <label
                              className={`flex flex-col p-2.5 rounded-xl border cursor-pointer transition text-left ${
                                selectedTiers[req.id] === "advanced"
                                  ? "bg-emerald-950/40 border-emerald-500/50 text-white"
                                  : "bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                                <input
                                  type="radio"
                                  name={`tier-${req.id}`}
                                  value="advanced"
                                  checked={selectedTiers[req.id] === "advanced"}
                                  onChange={() =>
                                    setSelectedTiers({ ...selectedTiers, [req.id]: "advanced" })
                                  }
                                  className="accent-emerald-500"
                                />
                                <span>Avanzado</span>
                              </div>
                              <span className="text-[10px] text-neutral-400 mt-1">
                                Acceso total al árbol genealógico a libertad.
                              </span>
                            </label>
                          </div>
                        </div>

                        {/* Botones de acción */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800/80">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleRespond(req.id, "rejected")}
                            className="px-3 py-1.5 rounded-xl text-xs font-medium text-red-400 hover:bg-red-950/30 border border-red-900/30 transition"
                          >
                            Rechazar
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleRespond(req.id, "approved")}
                            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
                          >
                            {isPending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Aceptar Solicitud</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 2: AMIGOS CON ACCESO ACTIVO */}
              {activeTab === "friends" && (
                <div className="space-y-4">
                  {friends.length === 0 ? (
                    <div className="text-center py-10 text-neutral-500 text-xs">
                      No has otorgado acceso a tu árbol a ninguna persona externa.
                    </div>
                  ) : (
                    friends.map((f) => (
                      <div
                        key={f.id}
                        className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-white text-sm block truncate">
                            {f.requesterName}
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            Autorizado desde el {new Date(f.requestedAt).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {/* Selector dinámico de nivel */}
                          <select
                            value={f.tier}
                            disabled={isPending}
                            onChange={(e) =>
                              handleUpdateTier(f.id, e.target.value as TreePermissionTier)
                            }
                            className="bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-teal-500 transition"
                          >
                            <option value="basic">Nivel Básico (Casa)</option>
                            <option value="intermediate">Nivel Intermedio</option>
                            <option value="advanced">Nivel Avanzado (Total)</option>
                          </select>

                          {/* Botón Revocar */}
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleRevoke(f.id)}
                            title="Revocar acceso inmediatamente"
                            className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-900 rounded-xl transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: EXPLORAR & SOLICITAR */}
              {activeTab === "search" && (
                <div className="space-y-5">
                  {/* Buscador */}
                  <div className="space-y-2">
                    <label className="text-xs text-neutral-300 font-medium block">
                      Buscar usuarios registrados por nombre:
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                          placeholder="Nombre o apellido del amigo..."
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-teal-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSearch}
                        disabled={isPending}
                        className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white transition shrink-0"
                      >
                        Buscar
                      </button>
                    </div>
                  </div>

                  {/* Resultados de búsqueda */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[11px] font-mono uppercase text-neutral-500 block">
                        Resultados encontrados:
                      </span>
                      <div className="space-y-2">
                        {searchResults.map((user) => (
                          <div
                            key={user.userId}
                            className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-col gap-2"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-white text-xs block">
                                  {user.fullName}
                                </span>
                                <span className="text-[10px] text-neutral-400">
                                  {user.alreadyRequested
                                    ? `Estado: ${user.existingStatus === "approved" ? "Acceso Concedido" : "Pendiente de aprobación"}`
                                    : "Usuario registrado en Happy Tree"}
                                </span>
                              </div>

                              {!user.alreadyRequested ? (
                                <button
                                  type="button"
                                  onClick={() => setRequestingUserId(user.userId)}
                                  className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-neutral-950 font-semibold text-xs transition"
                                >
                                  Solicitar Acceso
                                </button>
                              ) : user.existingStatus === "approved" ? (
                                <Link
                                  href={`/tree?friendId=${user.userId}`}
                                  onClick={() => setIsOpen(false)}
                                  className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-medium hover:bg-blue-500/30 transition flex items-center gap-1"
                                >
                                  <span>Ver Árbol</span>
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                              ) : (
                                <span className="text-[10px] font-mono px-2 py-1 rounded bg-amber-950/60 text-amber-400 border border-amber-800/40">
                                  Solicitud Pendiente
                                </span>
                              )}
                            </div>

                            {/* Campo de mensaje si se seleccionó este usuario */}
                            {requestingUserId === user.userId && (
                              <div className="pt-2 border-t border-neutral-800 space-y-2">
                                <input
                                  type="text"
                                  value={requestMessage}
                                  onChange={(e) => setRequestMessage(e.target.value)}
                                  placeholder="Escribe un mensaje de presentación opcional..."
                                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-xs text-white placeholder-neutral-500"
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setRequestingUserId(null)}
                                    className="px-2.5 py-1 rounded text-xs text-neutral-400 hover:text-white"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => handleSendRequest(user.userId)}
                                    className="px-3 py-1 rounded bg-teal-500 text-neutral-950 text-xs font-semibold hover:bg-teal-400 transition"
                                  >
                                    Enviar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Árboles de amigos a los que ya tengo acceso */}
                  {treesSharedWithMe.length > 0 && (
                    <div className="pt-4 border-t border-neutral-800 space-y-2">
                      <span className="text-[11px] font-mono uppercase text-emerald-400 block flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Árboles de amigos que puedes ver ({treesSharedWithMe.length}):</span>
                      </span>
                      <div className="space-y-1.5">
                        {treesSharedWithMe.map((item) => (
                          <div
                            key={item.id}
                            className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between"
                          >
                            <div>
                              <span className="text-xs font-medium text-white block">
                                {item.granterName}
                              </span>
                              <span className="text-[10px] text-neutral-400">
                                Nivel: {item.tier}
                              </span>
                            </div>
                            <Link
                              href={`/tree?friendId=${item.granterUserId}`}
                              onClick={() => setIsOpen(false)}
                              className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/30 transition flex items-center gap-1"
                            >
                              <span>Ver Árbol</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Solicitudes enviadas pendientes */}
                  {outgoingPending.length > 0 && (
                    <div className="pt-4 border-t border-neutral-800 space-y-2">
                      <span className="text-[11px] font-mono uppercase text-neutral-500 block">
                        Tus solicitudes enviadas pendientes ({outgoingPending.length}):
                      </span>
                      <div className="space-y-1.5">
                        {outgoingPending.map((item) => (
                          <div
                            key={item.id}
                            className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between"
                          >
                            <div>
                              <span className="text-xs font-medium text-white block">
                                {item.granterName}
                              </span>
                              <span className="text-[10px] text-neutral-500">
                                Enviada el {new Date(item.requestedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCancelOutgoing(item.id)}
                              className="text-[11px] text-neutral-400 hover:text-red-400 px-2 py-1 rounded transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pie del modal */}
            <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs text-neutral-500">
              <div className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span>Solo las personas que autorices explícitamente pueden ver tu árbol.</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
