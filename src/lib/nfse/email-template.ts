export interface NfseEmailTemplateData {
  recipientName: string
  nfseNumero: string
  clinicName: string
  emissionDate: string // DD/MM/YYYY
  valor: string // formatted BRL e.g. "R$ 250,00"
  descricao: string
  codigoVerificacao: string | null
  clinicPhone: string | null
  clinicEmail: string | null
  clinicAddress: string | null
}

export function buildNfseEmailHtml(data: NfseEmailTemplateData): string {
  const {
    recipientName, nfseNumero, clinicName, emissionDate,
    valor, descricao, codigoVerificacao,
    clinicPhone, clinicEmail, clinicAddress,
  } = data

  const contactParts: string[] = []
  if (clinicPhone) contactParts.push(clinicPhone)
  if (clinicEmail) contactParts.push(clinicEmail)
  if (clinicAddress) contactParts.push(clinicAddress)
  const contactLine = contactParts.join(" &middot; ")

  const verificationBlock = codigoVerificacao
    ? `<tr>
        <td style="padding: 16px 24px; background-color: #f8f9fa; border-radius: 6px;">
          <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Verificação</p>
          <p style="margin: 0; font-size: 13px; color: #374151;">Código: <strong>${codigoVerificacao}</strong></p>
        </td>
      </tr>
      <tr><td style="height: 16px;"></td></tr>`
    : ""

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

          <!-- Header -->
          <tr>
            <td style="padding: 28px 24px 20px 24px; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">${clinicName}</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 24px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #374151;">
                Olá, <strong>${recipientName}</strong>.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.5; color: #374151;">
                Segue anexa a sua Nota Fiscal de Serviço eletrônica (NFS-e), com os seguintes dados:
              </p>
            </td>
          </tr>

          <!-- NFS-e Details Card -->
          <tr>
            <td style="padding: 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 6px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%" style="vertical-align: top; padding-bottom: 12px;">
                          <p style="margin: 0 0 2px 0; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Número</p>
                          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">#${nfseNumero}</p>
                        </td>
                        <td width="50%" style="vertical-align: top; padding-bottom: 12px; text-align: right;">
                          <p style="margin: 0 0 2px 0; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Data de emissão</p>
                          <p style="margin: 0; font-size: 14px; color: #374151;">${emissionDate}</p>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 4px; border-top: 1px solid #e5e7eb;">
                          <p style="margin: 8px 0 2px 0; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Descrição do serviço</p>
                          <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.4; color: #374151;">${descricao}</p>
                          <p style="margin: 0 0 2px 0; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Valor</p>
                          <p style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">${valor}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr><td style="height: 16px;"></td></tr>

          <!-- Verification -->
          ${verificationBlock}

          <!-- Attachment note -->
          <tr>
            <td style="padding: 8px 24px 24px 24px;">
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #6b7280;">
                O documento DANFSE em PDF está anexo a este e-mail.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 24px; background-color: #f8f9fa; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #9ca3af;">
                E-mail enviado automaticamente por <strong style="color: #6b7280;">${clinicName}</strong>
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
