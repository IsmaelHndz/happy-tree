/**
 * Familia de prueba que concentra los casos difíciles reales:
 *
 *   Abuela Audelia: hija Rubi con Hernández (divorciados); Luis, Iván y Tere con su esposo Juan.
 *   Rubi y Jorge (divorciados): Ismael (foco) y Jorge Jr.
 *   Rubi + Pedro (unión libre): Mía (media hermana materna). Pedro + Lupe (sin unión): Leo.
 *   Jorge + Karla (casados): Nico (medio hermano paterno). Karla + ex (sin registrar): Dani.
 *   Abuelos paternos Pablo y Paula; tía Ana casada con Beto, prima Sofi.
 *   Luis + Eva: Lucy. Eva + exEva (sin unión): Kevin y Karen (hijastros de Luis).
 *   Ismael + Wendy: Kiko, casado con Nora; nieta Gala.
 *   Jorge Jr + Jaz: sobrino Neto.
 *   Familia ajena: Xavi + Xime, hijo Xoel.
 *   Datos corruptos: unión Luis–Audelia (madre-hijo) y unión Ismael–Jorge Jr (hermanos).
 */
import type { KinshipPersonMeta } from "../kinship-inference";

type G = "male" | "female";
const P: Record<string, [string, string, G]> = {
  aud: ["Audelia", "Huerta", "female"],
  her: ["Ramón", "Hernández", "male"],
  juan: ["Juan", "Rodriguez", "male"],
  rubi: ["Rubi", "Hernández", "female"],
  luis: ["Luis", "Rodriguez", "male"],
  ivan: ["Iván", "Rodriguez", "male"],
  tere: ["Tere", "Rodriguez", "female"],
  jorge: ["Jorge", "Zamora", "male"],
  ism: ["Ismael", "Zamora", "male"],
  jr: ["Jorge Jr", "Zamora", "male"],
  pedro: ["Pedro", "López", "male"],
  mia: ["Mía", "López", "female"],
  lupe: ["Lupe", "Díaz", "female"],
  leo: ["Leo", "López", "male"],
  karla: ["Karla", "Ruiz", "female"],
  nico: ["Nico", "Zamora", "male"],
  dani: ["Dani", "Soto", "male"],
  pablo: ["Pablo", "Zamora", "male"],
  paula: ["Paula", "Vega", "female"],
  ana: ["Ana", "Zamora", "female"],
  beto: ["Beto", "Mora", "male"],
  sofi: ["Sofi", "Mora", "female"],
  eva: ["Eva", "Godoy", "female"],
  exeva: ["Ernesto", "Paz", "male"],
  lucy: ["Lucy", "Rodriguez", "female"],
  kevin: ["Kevin", "Paz", "male"],
  karen: ["Karen", "Paz", "female"],
  wendy: ["Wendy", "Luna", "female"],
  kiko: ["Kiko", "Zamora", "male"],
  nora: ["Nora", "Sol", "female"],
  gala: ["Gala", "Zamora", "female"],
  jaz: ["Jaz", "Rey", "female"],
  neto: ["Neto", "Zamora", "male"],
  xavi: ["Xavi", "Ajeno", "male"],
  xime: ["Xime", "Ajena", "female"],
  xoel: ["Xoel", "Ajeno", "male"],
};

export const genderOf = (id: string) => P[id][2];

export const personsMap = new Map<string, KinshipPersonMeta>(
  Object.entries(P).map(([id, [firstName, lastName, gender]]) => [id, { id, firstName, lastName, gender }])
);

const pc = (parent_id: string, ...children: string[]) => children.map((child_id) => ({ parent_id, child_id }));

export const parentEdges = [
  ...pc("aud", "rubi", "luis", "ivan", "tere"),
  ...pc("her", "rubi"),
  ...pc("juan", "luis", "ivan", "tere"),
  ...pc("rubi", "ism", "jr", "mia"),
  ...pc("jorge", "ism", "jr", "nico"),
  ...pc("pedro", "mia", "leo"),
  ...pc("lupe", "leo"),
  ...pc("karla", "nico", "dani"),
  ...pc("pablo", "jorge", "ana"),
  ...pc("paula", "jorge", "ana"),
  ...pc("ana", "sofi"),
  ...pc("beto", "sofi"),
  ...pc("luis", "lucy"),
  ...pc("eva", "lucy", "kevin", "karen"),
  ...pc("exeva", "kevin", "karen"),
  ...pc("ism", "kiko"),
  ...pc("wendy", "kiko"),
  ...pc("kiko", "gala"),
  ...pc("nora", "gala"),
  ...pc("jr", "neto"),
  ...pc("jaz", "neto"),
  ...pc("xavi", "xoel"),
  ...pc("xime", "xoel"),
];

const u = (a: string, b: string, union_type: string) => ({ person_a_id: a, person_b_id: b, union_type, status: "confirmed" });

export const validUnions = [
  u("aud", "her", "divorced"),
  u("aud", "juan", "married"),
  u("rubi", "jorge", "divorced"),
  u("rubi", "pedro", "partner"),
  u("jorge", "karla", "married"),
  u("pablo", "paula", "married"),
  u("ana", "beto", "married"),
  u("luis", "eva", "married"),
  u("ism", "wendy", "married"),
  u("kiko", "nora", "married"),
  u("jr", "jaz", "partner"),
  u("xavi", "xime", "married"),
];

export const corruptUnions = [u("luis", "aud", "married"), u("ism", "jr", "married")];

export const allUnions = [...validUnions, ...corruptUnions];

export const ALL_IDS = Object.keys(P);
