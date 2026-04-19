"use client"

import Link from "next/link"
import { CheckIcon, ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "@/shared/components/ui/icons"

/** Sticky top navigation with brand, links, and CTAs. */
export function LandingNav() {
  return (
    <nav className="sticky top-0 z-30 bg-card/85 backdrop-blur-md border-b border-ink-100">
      <div className="max-w-[1160px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-[4px] bg-brand-500 text-white font-semibold text-[15px] grid place-items-center tracking-tight">
            C
          </span>
          <span className="text-[16px] font-semibold text-ink-900 tracking-tight">Clinica</span>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-[14px] text-ink-600">
          <a href="#recursos" className="hover:text-ink-900 transition-colors">Recursos</a>
          <a href="#precos" className="hover:text-ink-900 transition-colors">Preços</a>
          <a href="#depoimento" className="hover:text-ink-900 transition-colors">Clientes</a>
          <a href="#faq" className="hover:text-ink-900 transition-colors">FAQ</a>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/login"
            className="h-8 px-3 rounded-[4px] text-ink-700 text-[12px] font-medium hover:bg-ink-100 transition-colors inline-flex items-center"
          >
            Entrar
          </Link>
          <Link
            href="/signup"
            className="h-8 px-3 rounded-[4px] bg-brand-500 text-white text-[12px] font-medium hover:bg-brand-600 transition-colors inline-flex items-center"
          >
            Teste grátis
          </Link>
        </div>
      </div>
    </nav>
  )
}

/** Hero section: pill + headline + lede + email capture + agenda peek visual. */
export function LandingHero() {
  return (
    <header className="relative overflow-hidden bg-card">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(1200px 500px at 90% 0%, var(--brand-50) 0%, transparent 55%), radial-gradient(800px 400px at 0% 20%, #F3F7FD 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(var(--ink-100) 1px, transparent 1px), linear-gradient(90deg, var(--ink-100) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)",
        }}
      />

      <div className="relative max-w-[1160px] mx-auto px-6 py-14 md:py-20 lg:py-24">
        <div className="grid md:grid-cols-[1.05fr_1fr] gap-8 md:gap-12 lg:gap-[72px] items-center">
          {/* Copy */}
          <div>
            <span className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full bg-brand-50 text-brand-700 text-[12px] font-medium border border-brand-100">
              <span
                className="w-1.5 h-1.5 rounded-full bg-ok-500"
                style={{ boxShadow: "0 0 0 3px rgba(16,185,129,.15)" }}
              />
              14 dias grátis · sem cartão de crédito
            </span>
            <h1 className="text-[32px] md:text-[48px] lg:text-[56px] font-semibold leading-[1.04] tracking-[-0.025em] text-ink-900 mt-5 mb-4 text-balance">
              A clínica{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(180deg, var(--brand-600), var(--brand-800))" }}
              >
                organizada
              </span>
              <br className="hidden sm:inline" /> no piloto automático.
            </h1>
            <p className="text-[15px] md:text-[18px] text-ink-600 max-w-[52ch] leading-[1.55] mb-7">
              Agenda, pacientes, notificações, pagamentos e relatórios em um só lugar. O Clinica
              cuida do administrativo para você focar no que importa — seus pacientes.
            </p>
            <form
              className="flex gap-2 p-1.5 rounded-[4px] border border-ink-200 bg-card shadow-[var(--shadow-lg)] max-w-[460px]"
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
                className="flex-1 bg-transparent border-0 outline-none px-3 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 min-w-0"
              />
              <button
                type="submit"
                className="h-10 px-4 rounded-[4px] bg-brand-500 text-white text-[13px] font-medium inline-flex items-center gap-2 hover:bg-brand-600 transition-colors whitespace-nowrap"
              >
                Começar grátis
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </button>
            </form>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-[12px] text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="w-3.5 h-3.5 text-ok-500" />
                Setup em 5 minutos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="w-3.5 h-3.5 text-ok-500" />
                Dados em conformidade LGPD
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="w-3.5 h-3.5 text-ok-500" />
                Cancele quando quiser
              </span>
            </div>
          </div>

          {/* Visual — agenda peek with floating cards */}
          <HeroVisual />
        </div>
      </div>
    </header>
  )
}

/** Agenda peek visual — mocked day view with 4 events and two floating cards. */
function HeroVisual() {
  const events = [
    { top: 8, tone: "brand" as const, time: "09:00 — 09:45", name: "Mariana Silva · Elena" },
    { top: 60, tone: "ok" as const, time: "10:00 — 10:45", name: "João Pereira · Cherlen" },
    { top: 114, tone: "warn" as const, time: "11:00 — 11:45", name: "Ana Costa · Online" },
    { top: 192, tone: "brand" as const, time: "12:45 — 13:30", name: "Lucas Nogueira" },
  ]
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[1.15/1] rounded-[8px] border border-ink-200 p-[18px] shadow-[var(--shadow-xl)] overflow-hidden max-w-[520px] mx-auto md:mx-0 md:max-w-none"
      style={{ background: "linear-gradient(180deg, #fff, var(--brand-50))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-ink-100 mb-3">
        <div className="flex items-baseline gap-2">
          <div className="font-mono text-[22px] font-semibold text-ink-900 tracking-tight">27</div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">Abril</div>
            <div className="font-mono text-[11px] text-ink-500 mt-0.5">Segunda-feira</div>
          </div>
        </div>
        <div className="flex gap-1">
          <span className="w-[22px] h-[22px] grid place-items-center border border-ink-200 rounded-[2px] text-ink-500 bg-card">
            <ChevronLeftIcon className="w-3 h-3" />
          </span>
          <span className="w-[22px] h-[22px] grid place-items-center border border-ink-200 rounded-[2px] text-ink-500 bg-card">
            <ChevronRightIcon className="w-3 h-3" />
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[28px_1fr] font-mono text-[10px]">
        <div>
          {["09", "10", "11", "12", "13", "14", "15", "16"].map((h) => (
            <div key={h} className="text-ink-400 text-right pr-2 leading-[26px]">
              {h}
            </div>
          ))}
        </div>
        <div className="relative border-l border-ink-100">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[26px] border-b border-dashed border-ink-100" />
          ))}
          {events.map((ev, i) => (
            <div
              key={i}
              className={`absolute left-1.5 right-1.5 rounded-[2px] px-2 py-1.5 border border-l-[3px] font-sans text-[10px] leading-[1.25] ${
                ev.tone === "brand"
                  ? "bg-brand-50 text-brand-800 border-brand-200 border-l-brand-500"
                  : ev.tone === "ok"
                    ? "bg-ok-50 text-ok-700 border-[#BBF0D8] border-l-ok-500"
                    : "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A] border-l-warn-500"
              }`}
              style={{ top: ev.top, height: 44 }}
            >
              <div className="font-mono text-[9px] font-medium opacity-80">{ev.time}</div>
              <div className="font-medium">{ev.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating cards */}
      <div
        className="absolute bg-card border border-ink-200 rounded-[6px] shadow-[var(--shadow-lg)] px-3 py-2.5 flex items-center gap-2.5 text-[12px]"
        style={{ bottom: "14%", left: -22 }}
      >
        <span
          className="w-2 h-2 rounded-full bg-ok-500 flex-shrink-0"
          style={{ animation: "ping 2s ease-out infinite" }}
        />
        <div>
          <div className="text-ink-900 font-medium">Consulta confirmada</div>
          <div className="text-ink-500 text-[11px]">Mariana · WhatsApp</div>
        </div>
      </div>
      <div
        className="absolute bg-brand-900 text-white border border-brand-800 rounded-[6px] shadow-[var(--shadow-lg)] px-3 py-2.5 text-[12px]"
        style={{ top: "10%", right: -24 }}
      >
        <div className="text-white/70 text-[11px]">Recebido hoje</div>
        <div className="text-white font-mono font-medium">R$ 1.350,00</div>
      </div>
    </div>
  )
}
