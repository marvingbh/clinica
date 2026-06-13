import type { ScaleDefinition, ScaleOption } from "../types"

/**
 * Shared 0–3 frequency options for PHQ-9 / GAD-7 (pt-BR validated wording).
 */
export const FREQUENCY_OPTIONS_0_3: ScaleOption[] = [
  { value: 0, label: "Nenhuma vez" },
  { value: 1, label: "Vários dias" },
  { value: 2, label: "Mais da metade dos dias" },
  { value: 3, label: "Quase todos os dias" },
]

/**
 * PHQ-9 (Patient Health Questionnaire-9) — Brazilian Portuguese validated
 * wording. Public-domain instrument (Pfizer / PRIME-MD). Item 9 is the
 * risk item (passive death ideation / self-harm).
 */
export const PHQ9_DEFINITION: ScaleDefinition = {
  code: "PHQ9",
  version: 1,
  name: "PHQ-9 — Questionário de Saúde do Paciente",
  shortName: "PHQ-9",
  stem: "Durante as últimas 2 semanas, com que frequência você foi incomodado(a) por qualquer um dos problemas abaixo?",
  options: FREQUENCY_OPTIONS_0_3,
  maxScore: 27,
  items: [
    { id: "item1", text: "Pouco interesse ou pouco prazer em fazer as coisas" },
    { id: "item2", text: "Sentir-se \"para baixo\", deprimido(a) ou sem perspectiva" },
    {
      id: "item3",
      text: "Dificuldade para pegar no sono, permanecer dormindo ou dormir demais",
    },
    { id: "item4", text: "Sentir-se cansado(a) ou com pouca energia" },
    { id: "item5", text: "Falta de apetite ou comer demais" },
    {
      id: "item6",
      text: "Sentir-se mal consigo mesmo(a), achar que é um fracasso ou que decepcionou sua família ou a si mesmo(a)",
    },
    {
      id: "item7",
      text: "Dificuldade para se concentrar nas coisas, como ler o jornal ou ver televisão",
    },
    {
      id: "item8",
      text: "Lentidão para se movimentar ou falar, a ponto de outras pessoas perceberem; ou o oposto — estar tão agitado(a) que você fica se movimentando muito mais do que de costume",
    },
    {
      id: "item9",
      text: "Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a)",
    },
  ],
  severityBands: [
    { min: 0, max: 4, label: "Mínimo", color: "bg-emerald-100 text-emerald-800" },
    { min: 5, max: 9, label: "Leve", color: "bg-lime-100 text-lime-800" },
    { min: 10, max: 14, label: "Moderado", color: "bg-amber-100 text-amber-800" },
    {
      min: 15,
      max: 19,
      label: "Moderadamente grave",
      color: "bg-orange-100 text-orange-800",
    },
    { min: 20, max: 27, label: "Grave", color: "bg-red-100 text-red-800" },
  ],
  riskItemIds: ["item9"],
}
