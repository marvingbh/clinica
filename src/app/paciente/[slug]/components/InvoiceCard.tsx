"use client"

import { Download } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { usePortal } from "./PortalSessionProvider"
import { MONTH_LABEL } from "./months"
import {
  formatCurrency,
  formatDate,
  invoiceStatusLabel,
  type PortalInvoiceView,
} from "./format"

export function InvoiceCard({ invoice }: { invoice: PortalInvoiceView }) {
  const { slug } = usePortal()
  const base = `/api/public/portal/${slug}/invoices/${invoice.id}`

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">
          {MONTH_LABEL[invoice.referenceMonth - 1]}/{invoice.referenceYear}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {invoiceStatusLabel(invoice.status)}
        </span>
      </div>
      <div className="text-sm text-foreground">{formatCurrency(invoice.totalAmount)}</div>
      <div className="text-xs text-muted-foreground">
        Vencimento: {formatDate(invoice.dueDate)}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <a href={`${base}/pdf`} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outlined">
            <Download className="w-4 h-4 mr-1" /> Baixar fatura (PDF)
          </Button>
        </a>
        {invoice.hasNfse && (
          <a href={`${base}/danfse`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="text">
              <Download className="w-4 h-4 mr-1" /> Baixar NFS-e
            </Button>
          </a>
        )}
      </div>
    </div>
  )
}
