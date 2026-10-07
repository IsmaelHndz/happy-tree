"use client";

import type { CSSProperties } from "react";
import { Cake, Clock, PanelRightOpen, ShieldCheck } from "lucide-react";
import type { Gender } from "@/types/database.types";
import { formatFullName } from "../types";
import { ageLabel, PERSON_STATUS_LABEL, personStatus } from "../utils/person-display";

export interface PersonCardData {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  maternalLastName?: string | null;
  gender: Gender;
  birthDate: string | null;
  deathDate?: string | null;
  isLiving: boolean;
  isClaimed: boolean;
  invitationStatus?: string | null;
  relationshipLabel: string;
}

interface PersonCardProps {
  person: PersonCardData;
  // Franja superior: color de la familia de la que viene la persona
  stripeColor: string;
  isCenter?: boolean;
  isDimmed?: boolean;
  isSelected?: boolean;
  onOpenDetails: () => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Tarjeta tipo retrato (árbol y directorio): angosta para que el árbol crezca menos
 * hacia los lados. Las acciones viven en el panel de detalles, no en la tarjeta.
 */
export function PersonCard({
  person,
  stripeColor,
  isCenter = false,
  isDimmed = false,
  isSelected = false,
  onOpenDetails,
  onClick,
  className = "",
  style,
}: PersonCardProps) {
  const isFemale = person.gender === "female";
  const isMale = person.gender === "male";
  const status = personStatus(person);
  const age = ageLabel(person);
  const initials = `${person.firstName[0] || ""}${person.lastName[0] || ""}`.toUpperCase();
  const fullName = formatFullName(person);

  return (
    <div
      style={style}
      onClick={onClick}
      className={`tree-node-card relative flex flex-col items-center text-center px-3 pt-5 pb-3 rounded-2xl border transition-all shadow-xl ${
        onClick ? "cursor-pointer" : ""
      } ${isDimmed ? "opacity-20" : ""} ${
        isCenter
          ? "bg-gradient-to-b from-emerald-950/90 to-neutral-900 border-emerald-500/80 ring-2 ring-emerald-500/30"
          : `bg-neutral-900/95 ${
              // Gris en reposo; el contorno toma el color de su sexo y brilla al pasar el mouse o al abrir sus detalles
              isFemale
                ? `hover:border-pink-400/80 hover:shadow-pink-500/25 ${isSelected ? "border-pink-400/80 shadow-pink-500/25" : "border-neutral-800"}`
                : isMale
                ? `hover:border-blue-400/80 hover:shadow-blue-500/25 ${isSelected ? "border-blue-400/80 shadow-blue-500/25" : "border-neutral-800"}`
                : `hover:border-neutral-500 ${isSelected ? "border-neutral-500" : "border-neutral-800"}`
            }`
      } ${className}`}
    >
      <span
        aria-hidden
        className="absolute top-0 left-6 right-6 h-[3px] rounded-full"
        style={{ backgroundColor: stripeColor }}
      />

      {isCenter && (
        <span className="absolute top-2 left-2 text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          Centro
        </span>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetails();
        }}
        aria-label={`Ver detalles de ${fullName}`}
        title="Ver detalles"
        // En pantallas táctiles el área de toque crece hasta 44px sin cambiar el ícono
        className="absolute top-1.5 right-1.5 p-1.5 [@media(pointer:coarse)]:top-0 [@media(pointer:coarse)]:right-0 [@media(pointer:coarse)]:p-3.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition"
      >
        <PanelRightOpen className="w-3.5 h-3.5 [@media(pointer:coarse)]:w-4 [@media(pointer:coarse)]:h-4" />
      </button>

      {/* Avatar con el estado como insignia */}
      <div className="relative">
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-base border-[3px] ${
            isFemale
              ? "bg-gradient-to-tr from-pink-950 via-rose-900 to-pink-800 text-pink-100"
              : isMale
              ? "bg-gradient-to-tr from-blue-950 via-indigo-900 to-blue-800 text-blue-100"
              : "bg-neutral-800 text-neutral-200"
          } ${isCenter ? "border-emerald-500" : "border-transparent"} ${status === "deceased" ? "opacity-60 grayscale" : ""}`}
        >
          {initials}
        </div>
        {status && (
          <span
            title={PERSON_STATUS_LABEL[status]}
            className={`absolute -right-1 -bottom-0.5 w-5 h-5 rounded-full border-2 border-neutral-900 flex items-center justify-center text-[10px] font-bold ${
              status === "claimed"
                ? "bg-emerald-900 text-emerald-300"
                : status === "invited"
                ? "bg-amber-950 text-amber-300"
                : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {status === "claimed" ? (
              <ShieldCheck className="w-3 h-3" />
            ) : status === "invited" ? (
              <Clock className="w-3 h-3" />
            ) : (
              "†"
            )}
          </span>
        )}
      </div>

      <h4 className="mt-2 text-[13px] font-semibold text-white leading-tight line-clamp-2" title={fullName}>
        {fullName}
      </h4>
      <span
        className={`mt-0.5 text-[11px] font-medium line-clamp-1 ${
          isCenter ? "text-emerald-300" : isFemale ? "text-pink-400" : isMale ? "text-blue-400" : "text-emerald-400"
        }`}
      >
        {person.relationshipLabel}
      </span>

      <div className="mt-auto pt-1.5 text-[11px] text-neutral-400">
        {age ? (
          <span
            title={person.isLiving ? "Edad actual" : "Edad al fallecer"}
            className="inline-flex items-center gap-1"
          >
            <Cake className="w-3.5 h-3.5 shrink-0" />
            {age}
          </span>
        ) : (
          <span className="text-neutral-600 font-mono" title="Fecha de nacimiento no registrada">
            —
          </span>
        )}
      </div>
    </div>
  );
}
