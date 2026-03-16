"use client"

import React from "react"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import { LoaderIcon } from "@/shared/components/ui/icons"
import type { InvoiceItem, NfseEmissionRow } from "./types"
import { EMISSION_STATUS_STYLES } from "./NfseSectionShared"

interface PerItemNfseCardProps {
  item: InvoiceItem
  invoiceId: string
  emission: NfseEmissionRow | undefined
  description: string
  canEmit: boolean
  emittingItemId: string | null
  onEmit: (itemId: string) => void
  onStartCancel: (emissionId: string) => void
}

export default function PerItemNfseCard({
  item, invoiceId, emission, description, canEmit, emittingItemId, onEmit, onStartCancel,
}: PerItemNfseCardProps) {
  const dateStr = item.appointment?.scheduledAt ? formatDateBR(item.appointment.scheduledAt) : null

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2">
      {/* Header: date + amount + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {dateStr && <span className="text-xs font-medium">{dateStr}</span>}
          <span className="text-xs text-muted-foreground">{formatCurrencyBRL(Number(item.total))}</span>
        </div>
        {emission && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${EMISSION_STATUS_STYLES[emission.status] || ""}`}>
            {emission.status === "EMITIDA" ? `#${emission.numero}` : emission.status}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {description}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {/* Not yet emitted */}
        {!emission && canEmit && (
          <button
            onClick={() => onEmit(item.id)}
            disabled={emittingItemId === item.id}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {emittingItemId === item.id ? "Emitindo..." : "Emitir NFS-e"}
          </button>
        )}

        {/* ERRO — retry */}
        {emission?.status === "ERRO" && canEmit && (
          <>
            {emission.erro && <span className="text-[10px] text-destructive flex-1">{emission.erro}</span>}
            <button
              onClick={() => onEmit(item.id)}
              disabled={emittingItemId === item.id}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
            >
              {emittingItemId === item.id ? "..." : "Tentar novamente"}
            </button>
          </>
        )}

        {/* PENDENTE */}
        {emission?.status === "PENDENTE" && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <LoaderIcon className="w-3 h-3 animate-spin" /> Processando...
          </span>
        )}

        {/* EMITIDA — PDF + cancel */}
        {emission?.status === "EMITIDA" && (
          <>
            <a
              href={`/api/financeiro/faturas/${invoiceId}/nfse/pdf?emissionId=${emission.id}`}
              target="_blank" rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              PDF
            </a>
            <button
              onClick={() => onStartCancel(emission.id)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            >
              Cancelar
            </button>
            {emission.emitidaAt && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {new Date(emission.emitidaAt).toLocaleDateString("pt-BR")}
              </span>
            )}
          </>
        )}

        {/* CANCELADA */}
        {emission?.status === "CANCELADA" && canEmit && (
          <button
            onClick={() => onEmit(item.id)}
            disabled={emittingItemId === item.id}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            Re-emitir
          </button>
        )}
      </div>
    </div>
  )
}
