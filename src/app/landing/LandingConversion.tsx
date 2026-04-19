"use client"

import Link from "next/link"
import { CheckIcon, ArrowRightIcon } from "@/shared/components/ui/icons"

/** Dark facts card with 4 headline stats. */
export function LandingFacts() {
  const facts = [
    { n: "+40", suffix: "%", label: "menos faltas com lembretes automáticos por WhatsApp" },
    { n: "5", suffix: "min", label: "para configurar sua clínica do zero" },
    { n: "99.9", suffix: "%", label: "de uptime com backup diário" },
    { n: "120", suffix: "+", label: "clínicas usando o Clinica hoje" },
  ]
  return (
    <section className="pb-16 md:pb-20 lg:pb-24">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="bg-ink-900 text-white rounded-[8px] p-8 md:p-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {facts.map((f) => (
            <div key={f.label}>
              <div className="text-[32px] md:text-[40px] lg:text-[44px] font-semibold tracking-[-0.02em] text-white tabular-nums">
                {f.n}
                <span className="text-brand-400">{f.suffix}</span>
              </div>
              <div className="mt-2 text-[13px] text-[#94A3B8] max-w-[20ch]">{f.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Testimonial card. */
export function LandingTestimonial() {
  return (
    <section className="pb-16 md:pb-24 lg:pb-28" id="depoimento">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="relative max-w-[860px] mx-auto bg-card border border-ink-200 rounded-[8px] p-8 md:p-12">
          <span
            className="absolute top-7 left-8 text-[80px] leading-none text-brand-100 select-none pointer-events-none"
            style={{ fontFamily: "Georgia, serif" }}
            aria-hidden="true"
          >
            &ldquo;
          </span>
          <blockquote className="m-0 pl-[60px] text-[18px] md:text-[22px] leading-[1.45] text-ink-800 tracking-[-0.005em] text-pretty">
            Antes do Clinica eu passava 2 horas por dia organizando agenda e cobrando paciente.
            Hoje está tudo no piloto automático — sobra tempo pra atender mais gente e ainda saio
            do consultório no horário.
          </blockquote>
          <div className="flex items-center gap-3.5 mt-6 pl-[60px]">
            <div className="w-11 h-11 rounded-full bg-brand-100 text-brand-700 border border-brand-200 grid place-items-center font-semibold">
              ES
            </div>
            <div>
              <div className="font-semibold text-ink-900 text-[14px]">Dra. Elena Sabino</div>
              <div className="text-[13px] text-ink-500">Psicóloga · Clínica Aurora, São Paulo</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Pricing section with 3 plans — featured middle tier. */
export function LandingPricing() {
  const plans = [
    {
      name: "Básico",
      price: "49",
      sub: "Até 1 profissional",
      features: [
        { text: "Agenda completa", muted: false },
        { text: "Cadastro de pacientes", muted: false },
        { text: "Notificações por email", muted: false },
        { text: "WhatsApp ilimitado", muted: true },
        { text: "Relatórios avançados", muted: true },
      ],
      ctaLabel: "Começar grátis",
      featured: false,
    },
    {
      name: "Profissional",
      price: "99",
      sub: "Até 6 profissionais",
      features: [
        { text: "Tudo do Básico", muted: false },
        { text: "WhatsApp ilimitado", muted: false },
        { text: "Cobrança recorrente (Pix/cartão)", muted: false },
        { text: "Relatórios e dashboard", muted: false },
        { text: "Split de repasse", muted: false },
      ],
      ctaLabel: "Começar teste grátis",
      featured: true,
    },
    {
      name: "Clínica",
      price: "199",
      sub: "Até 20 profissionais",
      features: [
        { text: "Tudo do Profissional", muted: false },
        { text: "Multi-unidades", muted: false },
        { text: "API e integrações", muted: false },
        { text: "Suporte prioritário", muted: false },
        { text: "Treinamento da equipe", muted: false },
      ],
      ctaLabel: "Começar grátis",
      featured: false,
    },
  ]

  return (
    <section
      id="precos"
      className="py-16 md:py-24 lg:py-28 bg-ink-50 border-t border-b border-ink-100"
    >
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="text-center max-w-[640px] mx-auto mb-10 md:mb-14">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600 mb-3">
            Planos
          </div>
          <h2 className="text-[26px] md:text-[36px] lg:text-[40px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink-900 mb-3 text-balance">
            Preços honestos, sem surpresa
          </h2>
          <p className="text-[16px] text-ink-500">
            Escolha o plano ideal para sua clínica. Todos incluem 14 dias grátis, sem cartão.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-[1000px] mx-auto items-stretch">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative bg-card rounded-[8px] p-7 flex flex-col gap-[18px] border ${
                p.featured
                  ? "border-brand-500 shadow-[0_0_0_1px_var(--brand-500),_var(--shadow-lg)] md:-translate-y-1"
                  : "border-ink-200"
              }`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-6 bg-brand-500 text-white text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full">
                  Mais popular
                </span>
              )}
              <h4 className="text-[14px] text-ink-700 font-semibold m-0">{p.name}</h4>
              <div>
                <div className="text-[36px] font-semibold text-ink-900 tracking-[-0.02em] leading-none tabular-nums">
                  <span className="text-[16px] text-ink-500 font-medium mr-0.5 align-top">R$</span>
                  {p.price}
                  <span className="text-[13px] text-ink-500 font-normal ml-1">/mês</span>
                </div>
                <div className="text-[13px] text-ink-500 mt-1">{p.sub}</div>
              </div>
              <ul className="space-y-2.5 text-[13px]">
                {p.features.map((f) => (
                  <li
                    key={f.text}
                    className={`flex gap-2.5 items-start ${f.muted ? "text-ink-400" : "text-ink-700"}`}
                  >
                    <CheckIcon
                      className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                        f.muted ? "text-ink-300" : "text-brand-500"
                      }`}
                    />
                    {f.text}
                  </li>
                ))}
              </ul>
              <Link
                href="#final"
                className={`mt-auto w-full h-10 rounded-[4px] text-[13px] font-medium inline-flex items-center justify-center gap-2 transition-colors ${
                  p.featured
                    ? "bg-brand-500 text-white hover:bg-brand-600 border border-brand-500"
                    : "bg-card text-ink-800 hover:bg-ink-50 border border-ink-300 hover:border-ink-400"
                }`}
              >
                {p.ctaLabel}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** FAQ accordion. */
export function LandingFaq() {
  const items = [
    {
      q: "Como funciona o teste grátis?",
      a: "Você tem 14 dias para usar todos os recursos do plano Profissional sem precisar cadastrar cartão. No fim do período, escolha um plano ou continue no Básico gratuito.",
      open: true,
    },
    {
      q: "Preciso instalar alguma coisa?",
      a: "Não. O Clinica é 100% web — acesse de qualquer computador, tablet ou celular. Também temos app para iOS e Android.",
    },
    {
      q: "Os dados dos meus pacientes estão seguros?",
      a: "Sim. Seguimos a LGPD e usamos criptografia de ponta a ponta. Backups diários, servidores no Brasil e logs de acesso de cada profissional.",
    },
    {
      q: "Posso migrar meus dados do sistema atual?",
      a: "Sim. Importamos dados de planilhas, Google Agenda e dos principais sistemas do mercado. Nosso time faz a migração junto com você, sem custo.",
    },
    {
      q: "E se eu precisar cancelar?",
      a: "Cancele a qualquer momento, com 1 clique. Você leva seus dados em formato aberto (CSV e PDF) — sem burocracia, sem multa.",
    },
  ]
  return (
    <section id="faq" className="py-16 md:py-24 lg:py-28">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="text-center max-w-[640px] mx-auto mb-10 md:mb-14">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600 mb-3">
            Dúvidas frequentes
          </div>
          <h2 className="text-[26px] md:text-[36px] lg:text-[40px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink-900 text-balance">
            Tudo o que você precisa saber
          </h2>
        </div>
        <div className="max-w-[760px] mx-auto">
          {items.map((it) => (
            <details
              key={it.q}
              open={it.open}
              className="border-b border-ink-200 open:bg-ink-50 group"
            >
              <summary className="list-none cursor-pointer px-2 py-5 text-[15px] text-ink-900 font-medium flex items-center justify-between gap-3">
                <span>{it.q}</span>
                <span className="w-6 h-6 grid place-items-center rounded-full border border-ink-200 bg-card text-[18px] text-ink-500 font-normal transition-colors group-open:bg-brand-500 group-open:text-white group-open:border-brand-500 flex-shrink-0">
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <div className="px-2 pb-5 text-[14px] text-ink-600 leading-[1.6]">{it.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Final CTA — dark card with email capture. */
export function LandingFinalCta() {
  return (
    <section className="pb-12 md:pb-16 lg:pb-20">
      <div id="final" className="max-w-[1160px] mx-auto px-6">
        <div
          className="relative overflow-hidden max-w-[1000px] mx-auto rounded-[8px] text-white text-center p-10 md:p-14 lg:p-16"
          style={{
            background:
              "radial-gradient(600px 300px at 80% 20%, var(--brand-700), transparent 60%), linear-gradient(135deg, var(--brand-800), var(--brand-900))",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              WebkitMaskImage: "radial-gradient(ellipse at 50% 30%, black 30%, transparent 75%)",
              maskImage: "radial-gradient(ellipse at 50% 30%, black 30%, transparent 75%)",
            }}
          />
          <h2 className="relative text-[26px] md:text-[34px] lg:text-[38px] font-semibold leading-[1.15] tracking-[-0.02em] mb-3 text-balance">
            Comece a organizar sua clínica hoje
          </h2>
          <p className="relative text-[15px] text-white/75 mb-7 max-w-[48ch] mx-auto">
            Cadastre-se em menos de 1 minuto. Setup assistido, 14 dias grátis, sem cartão.
          </p>
          <form
            className="relative flex gap-2 p-1.5 max-w-[460px] mx-auto rounded-[4px] border border-white/15 bg-white/10 backdrop-blur-sm"
            onSubmit={(e) => {
              e.preventDefault()
              const btn = e.currentTarget.querySelector("button")
              if (btn) btn.textContent = "Enviado ✓"
            }}
          >
            <input
              type="email"
              placeholder="seu@email.com.br"
              required
              aria-label="Email"
              className="flex-1 bg-transparent border-0 outline-none px-3 h-10 text-[14px] text-white placeholder:text-white/60 min-w-0"
            />
            <button
              type="submit"
              className="h-10 px-4 rounded-[4px] bg-brand-500 text-white text-[13px] font-medium inline-flex items-center gap-2 hover:bg-brand-600 transition-colors whitespace-nowrap"
            >
              Criar conta
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </form>
          <div className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-3 text-[12px] text-white/60">
            <span className="inline-flex items-center gap-1.5 text-white/85">
              <CheckIcon className="w-3.5 h-3.5" />
              14 dias grátis
            </span>
            <span className="inline-flex items-center gap-1.5 text-white/85">
              <CheckIcon className="w-3.5 h-3.5" />
              Sem cartão
            </span>
            <span className="inline-flex items-center gap-1.5 text-white/85">
              <CheckIcon className="w-3.5 h-3.5" />
              Cancele quando quiser
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Footer. */
export function LandingFooter() {
  return (
    <footer className="py-10 border-t border-ink-100 mt-16">
      <div className="max-w-[1160px] mx-auto px-6 flex items-center justify-between flex-wrap gap-4 text-[12px] text-ink-500">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-[4px] bg-brand-500 text-white font-semibold text-[15px] grid place-items-center tracking-tight">
            C
          </span>
          <span className="text-[16px] font-semibold text-ink-900 tracking-tight">Clinica</span>
        </div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-ink-800 transition-colors">
            Termos
          </a>
          <a href="#" className="hover:text-ink-800 transition-colors">
            Privacidade
          </a>
          <a href="#" className="hover:text-ink-800 transition-colors">
            Suporte
          </a>
          <a
            href="mailto:contato@clinica.com.br"
            className="hover:text-ink-800 transition-colors"
          >
            contato@clinica.com.br
          </a>
        </div>
        <div>© {new Date().getFullYear()} Clinica · Todos os direitos reservados</div>
      </div>
    </footer>
  )
}
