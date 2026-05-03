"use client"

import { SearchIcon } from "@/shared/components/ui/icons"
import type { ProfessionalLite, StatusFilter } from "../types"

interface Props {
  search: string
  onSearch: (v: string) => void
  status: StatusFilter
  onStatus: (v: StatusFilter) => void
  professional: string
  onProfessional: (v: string) => void
  professionals: ProfessionalLite[]
  canFilterByProfessional: boolean
  fromIso: string
  toIso: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
}

export function PendenciasFiltersBar({
  search,
  onSearch,
  status,
  onStatus,
  professional,
  onProfessional,
  professionals,
  canFilterByProfessional,
  fromIso,
  toIso,
  onFrom,
  onTo,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 p-3 bg-card border border-ink-200 rounded-[10px]">
      <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[320px] px-2.5 py-1.5 rounded-[8px] bg-ink-100/60 focus-within:bg-white focus-within:ring-1 focus-within:ring-brand-500">
        <SearchIcon className="w-3.5 h-3.5 text-ink-400" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar por paciente..."
          className="bg-transparent border-0 outline-none flex-1 text-[13px]! placeholder:text-ink-400"
        />
      </div>

      <FilterGroup label="Status">
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value as StatusFilter)}
          className="select-control"
        >
          <option value="pendentes">Pendentes (padrão)</option>
          <option value="agendado">Apenas agendado</option>
          <option value="confirmado">Apenas confirmado</option>
          <option value="todas">Todas (inclui canceladas/finalizadas)</option>
        </select>
      </FilterGroup>

      {canFilterByProfessional && (
        <FilterGroup label="Profissional">
          <select
            value={professional}
            onChange={(e) => onProfessional(e.target.value)}
            className="select-control"
          >
            <option value="all">Todos</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FilterGroup>
      )}

      <FilterGroup label="De">
        <input
          type="date"
          value={fromIso}
          onChange={(e) => onFrom(e.target.value)}
          className="select-control text-[12.5px]!"
        />
      </FilterGroup>
      <FilterGroup label="Até">
        <input
          type="date"
          value={toIso}
          onChange={(e) => onTo(e.target.value)}
          className="select-control text-[12.5px]!"
        />
      </FilterGroup>

      <style jsx>{`
        .select-control {
          background: white;
          border: 1px solid #e6e8ee;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 12.5px;
          color: #0f1729;
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}

function FilterGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.05em] text-ink-500">
        {label}
      </span>
      {children}
    </div>
  )
}
