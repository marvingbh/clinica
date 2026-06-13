import type { ScaleDefinition } from "../types"
import { FREQUENCY_OPTIONS_0_3 } from "./phq9"

/**
 * GAD-7 (Generalized Anxiety Disorder-7) — Brazilian Portuguese validated
 * wording. Public-domain instrument (Pfizer / PRIME-MD). No risk item.
 */
export const GAD7_DEFINITION: ScaleDefinition = {
  code: "GAD7",
  version: 1,
  name: "GAD-7 — Transtorno de Ansiedade Generalizada",
  shortName: "GAD-7",
  stem: "Durante as últimas 2 semanas, com que frequência você foi incomodado(a) pelos seguintes problemas?",
  options: FREQUENCY_OPTIONS_0_3,
  maxScore: 21,
  items: [
    { id: "item1", text: "Sentir-se nervoso(a), ansioso(a) ou muito tenso(a)" },
    {
      id: "item2",
      text: "Não ser capaz de impedir ou de controlar as preocupações",
    },
    { id: "item3", text: "Preocupar-se muito com diversas coisas" },
    { id: "item4", text: "Dificuldade para relaxar" },
    { id: "item5", text: "Ficar tão agitado(a) que se torna difícil permanecer sentado(a)" },
    { id: "item6", text: "Ficar facilmente aborrecido(a) ou irritado(a)" },
    { id: "item7", text: "Sentir medo como se algo terrível fosse acontecer" },
  ],
  severityBands: [
    { min: 0, max: 4, label: "Mínima", color: "bg-emerald-100 text-emerald-800" },
    { min: 5, max: 9, label: "Leve", color: "bg-lime-100 text-lime-800" },
    { min: 10, max: 14, label: "Moderada", color: "bg-amber-100 text-amber-800" },
    { min: 15, max: 21, label: "Grave", color: "bg-red-100 text-red-800" },
  ],
  riskItemIds: [],
}
