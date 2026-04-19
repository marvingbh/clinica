"use client"

import Link from "next/link"
import { CheckIcon, ArrowRightIcon } from "@/shared/components/ui/icons"

/** Logo strip — "Mais de 120 clínicas confiam..." on ink-50. */
export function LandingLogos() {
  const names = [
    "Clínica Aurora",
    "Consultório Dr. Lima",
    "Psico+",
    "Vita Saúde",
    "Núcleo Terapia",
    "Espaço Cuidar",
  ]
  return (
    <section
      aria-label="Clínicas que usam Clinica"
      className="py-8 border-t border-b border-ink-100 bg-ink-50"
    >
      <div className="max-w-[1160px] mx-auto px-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 items-center">
        <div className="text-[11px] uppercase tracking-[0.1em] text-ink-500 font-semibold leading-[1.5]">
          Mais de 120 clínicas
          <br />
          confiam no Clinica
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-4 items-center font-semibold text-[16px] text-ink-400">
          {names.map((n) => (
            <span key={n} className="tracking-[-0.01em]">
              {n}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

interface Feature {
  eyebrow: string
  title: string
  description: string
  bullets: string[]
  cta: { label: string; href: string }
  visual: React.ReactNode
  reverse?: boolean
}

/** Features section: 3 alternating rows of copy + mocked visual. */
export function LandingFeatures() {
  const features: Feature[] = [
    {
      eyebrow: "01 · Agenda",
      title: "Agenda inteligente, com recorrência de verdade",
      description:
        "Crie sessões semanais, quinzenais ou mensais em um clique. Bloqueios, atendimento online e visualização por profissional — tudo sem conflito.",
      bullets: [
        "Recorrência semanal / quinzenal / mensal com data final flexível",
        "Visão por dia, semana ou por profissional",
        "Reagendamento com arrastar e soltar",
        "Integração com Google Calendar",
      ],
      cta: { label: "Testar agenda", href: "#final" },
      visual: <MiniAgendaVisual />,
    },
    {
      eyebrow: "02 · Pacientes",
      title: "Prontuário completo, histórico à mão",
      description:
        "Cadastro, evolução clínica, documentos, consentimentos LGPD e histórico financeiro de cada paciente em uma única ficha.",
      bullets: [
        "Histórico cronológico unificado (consultas + pagamentos)",
        "Anamnese, evolução e anotações de sessão",
        "Consentimentos LGPD com assinatura digital",
        "Compartilhamento seguro com outros profissionais",
      ],
      cta: { label: "Ver prontuário", href: "#final" },
      visual: <PatientCardVisual />,
      reverse: true,
    },
    {
      eyebrow: "03 · Financeiro",
      title: "Cobrança automática e fluxo de caixa em tempo real",
      description:
        "Gere cobranças recorrentes, envie lembretes por WhatsApp e acompanhe o que entra, o que está pendente e quanto cada profissional produz.",
      bullets: [
        "Pix, cartão e boleto via link de pagamento",
        "Lembretes automáticos para inadimplentes",
        "Split de repasse por profissional",
        "Relatórios por período, convênio e modalidade",
      ],
      cta: { label: "Ver financeiro", href: "#final" },
      visual: <PayCardVisual />,
    },
  ]

  return (
    <section className="py-16 md:py-24 lg:py-28" id="recursos">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="text-center max-w-[640px] mx-auto mb-10 md:mb-14">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600 mb-3">
            Como funciona
          </div>
          <h2 className="text-[26px] md:text-[36px] lg:text-[40px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink-900 mb-3 text-balance">
            Um produto pensado para o dia-a-dia da clínica
          </h2>
          <p className="text-[16px] text-ink-500">
            Três ferramentas que conversam entre si — agenda, prontuário e financeiro — para tirar o
            peso do administrativo.
          </p>
        </div>

        {features.map((f, i) => (
          <div
            key={f.eyebrow}
            className={`grid md:grid-cols-2 gap-8 md:gap-12 lg:gap-[72px] items-center ${
              i < features.length - 1 ? "mb-16 md:mb-20" : ""
            }`}
          >
            <div className={f.reverse ? "md:order-2" : ""}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600 mb-3">
                {f.eyebrow}
              </div>
              <h3 className="text-[22px] md:text-[26px] lg:text-[30px] font-semibold leading-[1.2] tracking-[-0.015em] text-ink-900 mb-3">
                {f.title}
              </h3>
              <p className="text-[15px] text-ink-600 max-w-[46ch] mb-4">{f.description}</p>
              <ul className="space-y-2.5 mb-5">
                {f.bullets.map((b) => (
                  <li key={b} className="flex gap-2.5 items-start text-[14px] text-ink-700">
                    <CheckIcon className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                href={f.cta.href}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[13px] font-medium hover:bg-ink-50 hover:border-ink-400 transition-colors"
              >
                {f.cta.label}
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className={f.reverse ? "md:order-1" : ""}>
              <FeatureVisualFrame>{f.visual}</FeatureVisualFrame>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FeatureVisualFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-[8px] border border-ink-200 bg-ink-50 shadow-[var(--shadow-lg)] p-[18px] min-h-[320px] overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(600px 200px at 80% 0%, var(--brand-50) 0%, transparent 60%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

/** Mini agenda grid visual for the Agenda feature. */
function MiniAgendaVisual() {
  type Tone = "b" | "g" | "y" | null
  const days = [
    { wd: "SEG", dn: "27", today: false },
    { wd: "TER", dn: "28", today: true },
    { wd: "QUA", dn: "29", today: false },
    { wd: "QUI", dn: "30", today: false },
    { wd: "SEX", dn: "01", today: false },
  ]
  const grid: Array<{ hour: string; cells: Array<[string, Tone]> }> = [
    { hour: "09", cells: [["Mariana", "b"], ["", null], ["João", "g"], ["", null], ["Ana", "b"]] },
    { hour: "10", cells: [["Pedro", "g"], ["Beatriz", "b"], ["", null], ["Carla", "y"], ["", null]] },
    { hour: "11", cells: [["", null], ["Rafael", "b"], ["Lucia", "g"], ["", null], ["Tiago", "b"]] },
    { hour: "14", cells: [["Elena · sessão", "b"], ["", null], ["Online", "y"], ["Novo", "g"], ["", null]] },
    { hour: "15", cells: [["", null], ["Marcos", "g"], ["", null], ["Paula", "b"], ["Dup.", "b"]] },
    { hour: "16", cells: [["Recorr.", "g"], ["", null], ["Sara", "b"], ["", null], ["", null]] },
  ]
  return (
    <div className="relative">
      {/* Head */}
      <div className="flex items-center justify-between px-3 py-2 bg-card border border-ink-200 rounded-[4px] mb-2.5 text-[12px]">
        <div className="font-semibold text-ink-900">Semana de 27 abr</div>
        <div className="flex gap-0.5 text-[11px]">
          <span className="px-2.5 py-1 rounded-[2px] text-ink-500">Dia</span>
          <span className="px-2.5 py-1 rounded-[2px] bg-brand-50 text-brand-700 font-medium">
            Semana
          </span>
          <span className="px-2.5 py-1 rounded-[2px] text-ink-500">Mês</span>
        </div>
      </div>
      {/* Body */}
      <div className="bg-card border border-ink-200 rounded-[4px] p-3 grid grid-cols-[36px_repeat(5,1fr)] text-[10px] font-mono">
        <div />
        {days.map((d) => (
          <div
            key={d.wd}
            className="font-sans text-[9px] text-center text-ink-500 font-medium pb-1.5 border-b border-ink-100 uppercase tracking-wider"
          >
            {d.wd}
            <strong
              className={`block text-[14px] font-semibold mt-0.5 ${
                d.today ? "text-brand-600" : "text-ink-900"
              }`}
            >
              {d.dn}
            </strong>
          </div>
        ))}
        {grid.flatMap((row) => [
          <div
            key={`gut-${row.hour}`}
            className="text-ink-400 text-right pr-1.5 h-[22px] border-b border-dashed border-ink-100 py-0.5"
          >
            {row.hour}
          </div>,
          ...row.cells.map(([name, tone], ci) => (
            <div
              key={`${row.hour}-${ci}`}
              className="relative h-[22px] border-l border-ink-100 border-b border-dashed border-b-ink-100 py-0.5 px-0.5"
            >
              {tone && (
                <div
                  className={`absolute left-0.5 right-0.5 top-0.5 rounded-[2px] px-1 py-0.5 font-sans text-[8px] font-medium border-l-2 truncate ${
                    tone === "b"
                      ? "bg-brand-50 text-brand-800 border-brand-500"
                      : tone === "g"
                        ? "bg-ok-50 text-ok-700 border-ok-500"
                        : "bg-[#FFFBEB] text-[#92400E] border-warn-500"
                  }`}
                >
                  {name}
                </div>
              )}
            </div>
          )),
        ])}
      </div>
    </div>
  )
}

/** Patient card visual for the Pacientes feature. */
function PatientCardVisual() {
  const events = [
    { date: "13 abr", title: "Sessão — Elena Sabino", amount: "R$ 180 · pago", tone: "paid" as const },
    { date: "06 abr", title: "Sessão — Elena Sabino", amount: "R$ 180 · pago", tone: "paid" as const },
    { date: "30 mar", title: "Avaliação inicial", amount: "R$ 220 · pago", tone: "paid" as const },
    { date: "23 mar", title: "Termo de consentimento LGPD", amount: "assinado", tone: "brand" as const },
    { date: "20 mar", title: "Cadastro criado", amount: "—", tone: "muted" as const },
  ]
  return (
    <div className="bg-card border border-ink-200 rounded-[6px] p-[18px] shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-3 pb-3.5 border-b border-ink-100">
        <div className="w-11 h-11 rounded-full bg-brand-100 text-brand-700 border border-brand-200 grid place-items-center font-semibold text-[15px]">
          MS
        </div>
        <div>
          <div className="font-semibold text-ink-900 text-[15px]">Mariana Silva</div>
          <div className="text-[12px] text-ink-500 font-mono">34 anos · Paciente desde mar/2025</div>
        </div>
        <span className="ml-auto text-[11px] bg-ok-50 text-ok-700 px-2 py-0.5 rounded-full border border-[#BBF0D8] font-medium">
          Ativa
        </span>
      </div>
      <div className="flex gap-0.5 pt-3 border-b border-ink-100 text-[12px]">
        <span className="px-2.5 py-1 text-ink-500">Perfil</span>
        <span className="px-2.5 pb-2.5 text-brand-700 font-semibold border-b-2 border-brand-500 -mb-px">
          Histórico
        </span>
        <span className="px-2.5 py-1 text-ink-500">Financeiro</span>
        <span className="px-2.5 py-1 text-ink-500">Docs</span>
      </div>
      <div className="mt-4 space-y-2.5">
        {events.map((ev) => (
          <div key={ev.date} className="grid grid-cols-[64px_1fr_auto] gap-3 items-center text-[12px]">
            <span className="text-ink-500 font-mono text-[11px]">{ev.date}</span>
            <span className="text-ink-800">{ev.title}</span>
            <span
              className={`font-mono text-[11px] font-medium ${
                ev.tone === "paid"
                  ? "text-ok-700"
                  : ev.tone === "brand"
                    ? "text-brand-600"
                    : "text-ink-500"
              }`}
            >
              {ev.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Payments dashboard card for the Financeiro feature. */
function PayCardVisual() {
  return (
    <div className="bg-card border border-ink-200 rounded-[6px] p-[18px]">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-ink-50 border border-ink-100 rounded-[4px] px-3 py-2.5">
          <div className="text-[10px] text-ink-500 uppercase tracking-wider font-semibold">
            Recebido (abril)
          </div>
          <div className="text-[18px] font-semibold text-ok-700 font-mono tabular-nums mt-0.5 tracking-tight">
            <span className="text-[11px] text-ink-500 font-medium mr-0.5">R$</span>18.420
          </div>
        </div>
        <div className="bg-ink-50 border border-ink-100 rounded-[4px] px-3 py-2.5">
          <div className="text-[10px] text-ink-500 uppercase tracking-wider font-semibold">
            A receber
          </div>
          <div className="text-[18px] font-semibold text-warn-500 font-mono tabular-nums mt-0.5 tracking-tight">
            <span className="text-[11px] text-ink-500 font-medium mr-0.5">R$</span>2.180
          </div>
        </div>
        <div className="bg-ink-50 border border-ink-100 rounded-[4px] px-3 py-2.5">
          <div className="text-[10px] text-ink-500 uppercase tracking-wider font-semibold">
            Sessões
          </div>
          <div className="text-[18px] font-semibold text-ink-900 font-mono tabular-nums mt-0.5 tracking-tight">
            127
          </div>
        </div>
      </div>
      <div className="h-[100px] pt-2">
        <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="landingRevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 70 L30 60 L60 65 L90 45 L120 50 L150 30 L180 35 L210 22 L240 28 L270 15 L300 18 L300 100 L0 100 Z"
            fill="url(#landingRevGrad)"
          />
          <path
            d="M0 70 L30 60 L60 65 L90 45 L120 50 L150 30 L180 35 L210 22 L240 28 L270 15 L300 18"
            fill="none"
            stroke="#2563EB"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={270} cy={15} r={4} fill="#2563EB" />
          <circle cx={270} cy={15} r={8} fill="#2563EB" opacity="0.2" />
        </svg>
      </div>
      <div className="mt-2.5 divide-y divide-ink-100">
        {[
          { nm: "Mariana Silva · sessão", amt: "R$ 180,00", st: "paid" as const },
          { nm: "João Pereira · plano mensal", amt: "R$ 540,00", st: "pending" as const },
          { nm: "Ana Costa · avaliação", amt: "R$ 220,00", st: "paid" as const },
        ].map((r) => (
          <div
            key={r.nm}
            className="grid grid-cols-[1fr_auto_auto] gap-2.5 py-2 items-center text-[12px]"
          >
            <span className="text-ink-800 font-medium">{r.nm}</span>
            <span className="font-mono text-ink-900 font-medium">{r.amt}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${
                r.st === "paid"
                  ? "bg-ok-50 text-ok-700 border-[#BBF0D8]"
                  : "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]"
              }`}
            >
              {r.st === "paid" ? "Pago" : "Pendente"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
