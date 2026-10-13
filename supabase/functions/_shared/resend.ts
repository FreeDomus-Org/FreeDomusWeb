const RESEND_API_URL = 'https://api.resend.com/emails'

interface EmailTemplateVars {
  inviter_name: string
  workspace_name: string
  token: string
  expires_at: string
}

function formatDateSpanish(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function emailTemplate({ inviter_name, workspace_name, token, expires_at }: EmailTemplateVars): string {
  const webFallbackLink = `https://freedomus.site/invite?token=${token}`
  const expiresFormatted = formatDateSpanish(expires_at)

  const siteUrl = 'https://freedomus.site'
  const heading = "'Bricolage Grotesque', 'Segoe UI', Arial, sans-serif"
  const body = "'Instrument Sans', 'Segoe UI', Arial, sans-serif"

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Invitación a FreeDomus</title>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #e9eee3; font-family: ${body};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #e9eee3; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 520px; background-color: #ffffff; border-radius: 28px; overflow: hidden; box-shadow: 0 12px 30px rgba(30, 60, 30, 0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color: #17251c; padding: 28px 36px;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td valign="middle">
                    <img src="${siteUrl}/apple-icon.png" width="40" height="40" alt="" style="display: block; border-radius: 20px;">
                  </td>
                  <td valign="middle" style="padding-left: 12px; font-family: ${heading}; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.4px;">
                    FreeDomus
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 36px 8px;">
              <span style="display: inline-block; background-color: #c8f169; color: #2f5a1a; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 999px; letter-spacing: 0.3px;">
                Nueva invitación
              </span>
              <h1 style="margin: 16px 0 12px; font-family: ${heading}; color: #17251c; font-size: 28px; font-weight: 800; line-height: 1.2; letter-spacing: -0.5px;">
                Te invitaron a cocinar en equipo
              </h1>
              <p style="margin: 0 0 20px; color: #44564a; font-size: 15px; line-height: 1.6;">
                <strong style="color: #17251c;">${inviter_name}</strong> te ha invitado a unirte a su espacio de trabajo en FreeDomus.
              </p>

              <!-- Workspace card -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f1f5ec; border-radius: 20px;">
                <tr>
                  <td style="padding: 18px 22px;">
                    <p style="margin: 0 0 4px; color: #6b7a6e; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Espacio de trabajo</p>
                    <p style="margin: 0; font-family: ${heading}; color: #17251c; font-size: 20px; font-weight: 800; letter-spacing: -0.3px;">${workspace_name}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 24px 36px 8px;">
              <a href="${webFallbackLink}"
                 style="display: inline-block; background-color: #17251c; color: #c8f169;
                        padding: 15px 32px; border-radius: 999px; text-decoration: none;
                        font-family: ${heading}; font-size: 16px; font-weight: 700;">
                Aceptar invitación
              </a>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding: 12px 36px 0;">
              <p style="margin: 0; color: #6b7a6e; font-size: 12px; line-height: 1.5; word-break: break-all;">
                ¿El botón no funciona? Copia este enlace en tu navegador:<br>
                <a href="${webFallbackLink}" style="color: #2f7a4a; text-decoration: underline;">${webFallbackLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 28px 36px 32px;">
              <hr style="border: none; border-top: 1px solid #e4ebdc; margin: 0 0 18px;">
              <p style="margin: 0 0 6px; color: #6b7a6e; font-size: 12px; line-height: 1.5;">
                Esta invitación vence el <strong style="color: #44564a;">${expiresFormatted}</strong>.
              </p>
              <p style="margin: 0; color: #9aa89d; font-size: 12px; line-height: 1.5;">
                Si no esperabas este correo, puedes ignorarlo con tranquilidad.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

export async function sendInvitationEmail(
  to: string,
  workspaceName: string,
  inviterName: string,
  token: string,
  expiresAt: string,
): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) throw new Error('RESEND_API_KEY is not set')

  // Accepts "email@x.com" or "Name <email@x.com>"; strips stray quotes/spaces
  const rawFrom = (Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@freedomus.site').trim().replace(/^["']|["']$/g, '')
  const from = rawFrom.includes('<') ? rawFrom : `FreeDomus <${rawFrom}>`

  const html = emailTemplate({
    inviter_name: inviterName,
    workspace_name: workspaceName,
    token,
    expires_at: expiresAt,
  })

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${inviterName} te invitó a "${workspaceName}" en FreeDomus`,
      html,
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Resend error: ${error}`)
  }
}
