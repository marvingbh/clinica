export interface InvoiceItem {
  id: string
  type: string
  description: string
  quantity: number
  unitPrice: string
  total: string
  appointment: { id: string; scheduledAt: string; status: string } | null
}

export interface InvoiceDetail {
  id: string
  referenceMonth: number
  referenceYear: number
  status: string
  totalSessions: number
  creditsApplied: number
  extrasAdded: number
  totalAmount: string
  dueDate: string
  paidAt: string | null
  notes: string | null
  messageBody: string | null
  notaFiscalEmitida: boolean
  notaFiscalEmitidaAt: string | null
  hasNotaFiscalPdf: boolean
  // NFS-e fields
  nfseStatus: string | null
  nfseNumero: string | null
  nfseChaveAcesso: string | null
  nfseCodigoVerificacao: string | null
  nfseEmitidaAt: string | null
  nfseErro: string | null
  nfseCanceladaAt: string | null
  nfseCancelamentoMotivo: string | null
  nfseCodigoServico: string | null
  nfseDescricao: string | null
  nfseAliquotaIss: number | null
  patient: {
    id: string; name: string; phone: string; cpf: string | null
    billingCpf: string | null; billingResponsibleName: string | null
    addressStreet: string | null; addressNumber: string | null; addressNeighborhood: string | null
    addressCity: string | null; addressState: string | null; addressZip: string | null
    motherName: string | null; sessionFee: string | null
  }
  professionalProfile: { id: string; user: { name: string } }
  items: InvoiceItem[]
  consumedCredits: Array<{ id: string; reason: string; createdAt: string }>
}
