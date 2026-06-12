export interface DocumentEmailTemplateData {
  recipientName: string
  documentTitle: string
  documentTypeLabel: string
  clinicName: string
  generatedDate: string // DD/MM/YYYY
  clinicPhone: string | null
  clinicEmail: string | null
  clinicAddress: string | null
}

/** Simple HTML email body for a document delivered as an attachment. */
export function buildDocumentEmailHtml(data: DocumentEmailTemplateData): string {
  const { recipientName, documentTitle, documentTypeLabel, clinicName, generatedDate, clinicPhone, clinicEmail, clinicAddress } = data

  const contactParts: string[] = []
  if (clinicPhone) contactParts.push(clinicPhone)
  if (clinicEmail) contactParts.push(clinicEmail)
  if (clinicAddress) contactParts.push(clinicAddress)
  const contactLine = contactParts.join(" &middot; ")

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width: 560px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <tr>
            <td style="padding: 28px 24px 20px 24px; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">${clinicName}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #374151;">
                Olá, <strong>${recipientName}</strong>.
              </p>
              <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.5; color: #374151;">
                Segue anexo o documento solicitado:
              </p>
              <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #111827;">${documentTitle}</p>
              <p style="margin: 0 0 16px 0; font-size: 13px; color: #6b7280;">${documentTypeLabel} &middot; ${generatedDate}</p>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #6b7280;">
                O documento em PDF está anexo a este e-mail.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 24px; background-color: #f8f9fa; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #9ca3af;">
                E-mail enviado por <strong style="color: #6b7280;">${clinicName}</strong>
              </p>
              ${contactLine ? `<p style="margin: 0; font-size: 12px; color: #9ca3af;">${contactLine}</p>` : ""}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** WhatsApp message body containing the secure download link (never the file). */
export function buildDocumentWhatsAppMessage(data: {
  clinicName: string
  documentTypeLabel: string
  downloadUrl: string
}): string {
  return `${data.clinicName}: seu documento "${data.documentTypeLabel}" está disponível para download pelo link seguro a seguir (válido por 7 dias):\n\n${data.downloadUrl}`
}
