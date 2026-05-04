import type { EntryColors, PaletteName } from "./types"

/**
 * Static class strings for every supported palette. Tailwind v4 scans this
 * file as source and emits each class into the bundle — DO NOT construct class
 * names dynamically (`bg-${name}-50`) anywhere; v4's content scanner cannot
 * extract them and the utilities will be missing in production.
 *
 * `as const satisfies Record<PaletteName, EntryColors>` keeps literal-string
 * inference for tooling AND enforces exhaustiveness across every PaletteName.
 *
 * Yellow and lime use `text-*-800` instead of `text-*-700` so the text stays
 * WCAG-AA on the lightest backgrounds.
 */
export const PALETTE_CLASSES = {
  red:     { bg: "bg-red-50",     border: "border-red-200",     borderLeft: "border-l-red-500",     text: "text-red-700",     accent: "bg-red-500"     },
  orange:  { bg: "bg-orange-50",  border: "border-orange-200",  borderLeft: "border-l-orange-500",  text: "text-orange-700",  accent: "bg-orange-500"  },
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   borderLeft: "border-l-amber-500",   text: "text-amber-700",   accent: "bg-amber-500"   },
  yellow:  { bg: "bg-yellow-50",  border: "border-yellow-200",  borderLeft: "border-l-yellow-500",  text: "text-yellow-800",  accent: "bg-yellow-500"  },
  lime:    { bg: "bg-lime-50",    border: "border-lime-200",    borderLeft: "border-l-lime-500",    text: "text-lime-800",    accent: "bg-lime-500"    },
  green:   { bg: "bg-green-50",   border: "border-green-200",   borderLeft: "border-l-green-500",   text: "text-green-700",   accent: "bg-green-500"   },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", borderLeft: "border-l-emerald-500", text: "text-emerald-700", accent: "bg-emerald-500" },
  teal:    { bg: "bg-teal-50",    border: "border-teal-200",    borderLeft: "border-l-teal-500",    text: "text-teal-700",    accent: "bg-teal-500"    },
  sky:     { bg: "bg-sky-50",     border: "border-sky-200",     borderLeft: "border-l-sky-500",     text: "text-sky-700",     accent: "bg-sky-500"     },
  blue:    { bg: "bg-blue-50",    border: "border-blue-200",    borderLeft: "border-l-blue-500",    text: "text-blue-700",    accent: "bg-blue-500"    },
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-200",  borderLeft: "border-l-indigo-500",  text: "text-indigo-700",  accent: "bg-indigo-500"  },
  violet:  { bg: "bg-violet-50",  border: "border-violet-200",  borderLeft: "border-l-violet-500",  text: "text-violet-700",  accent: "bg-violet-500"  },
  purple:  { bg: "bg-purple-50",  border: "border-purple-200",  borderLeft: "border-l-purple-500",  text: "text-purple-700",  accent: "bg-purple-500"  },
  fuchsia: { bg: "bg-fuchsia-50", border: "border-fuchsia-200", borderLeft: "border-l-fuchsia-500", text: "text-fuchsia-700", accent: "bg-fuchsia-500" },
  pink:    { bg: "bg-pink-50",    border: "border-pink-200",    borderLeft: "border-l-pink-500",    text: "text-pink-700",    accent: "bg-pink-500"    },
  rose:    { bg: "bg-rose-50",    border: "border-rose-200",    borderLeft: "border-l-rose-500",    text: "text-rose-700",    accent: "bg-rose-500"    },
  slate:   { bg: "bg-slate-50",   border: "border-slate-200",   borderLeft: "border-l-slate-500",   text: "text-slate-700",   accent: "bg-slate-500"   },
  // White is a special palette — pure white background with black text.
  // The `accent` is black so the swatch picker dot is visible against the grid.
  white:   { bg: "bg-white",      border: "border-slate-200",   borderLeft: "border-l-slate-700",   text: "text-black",       accent: "bg-black"       },
  // Two-tone: white background + blue stripe (the original todo brand look).
  // The picker renders this swatch as half-white / half-blue (handled by
  // the swatch component, since a flat Tailwind class can't express it).
  whiteBlue: { bg: "bg-white",    border: "border-slate-200",   borderLeft: "border-l-blue-500",    text: "text-blue-700",    accent: "bg-blue-500"    },
} as const satisfies Record<PaletteName, EntryColors>

/** Localized label per palette, for the settings picker UI. */
export const PALETTE_LABELS_PT_BR: Record<PaletteName, string> = {
  red: "Vermelho",
  orange: "Laranja",
  amber: "Âmbar",
  yellow: "Amarelo",
  lime: "Lima",
  green: "Verde",
  emerald: "Esmeralda",
  teal: "Turquesa",
  sky: "Azul claro",
  blue: "Azul",
  indigo: "Índigo",
  violet: "Violeta",
  purple: "Roxo",
  fuchsia: "Fúcsia",
  pink: "Rosa",
  rose: "Rosé",
  slate: "Cinza",
  white: "Branco",
  whiteBlue: "Branco + Azul",
}
