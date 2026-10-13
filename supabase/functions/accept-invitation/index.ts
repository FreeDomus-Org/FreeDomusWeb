import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { token } = await req.json()

    if (!token) {
      return json({ error: 'token is required' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // Buscar la invitación por token
    const { data: invitation, error: inviteError } = await adminClient
      .from('workspace_invitations')
      .select('id, workspace_id, invited_email, role, status, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (inviteError || !invitation) {
      return json({ error: 'Invitation not found' }, 404)
    }

    if (invitation.status === 'accepted') {
      return json({ error: 'Invitation already accepted' }, 400)
    }

    // Verificar expiración
    if (new Date(invitation.expires_at) < new Date()) {
      await adminClient
        .from('workspace_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id)
      return json({ error: 'Invitation expired' }, 410)
    }

    // Determinar el user_id: desde JWT si está autenticado
    const authHeader = req.headers.get('Authorization')
    let userId: string | null = null

    if (authHeader) {
      const jwt = authHeader.replace('Bearer ', '')
      const { data: { user } } = await adminClient.auth.getUser(jwt)
      userId = user?.id ?? null
    }

    // Si no hay JWT, verificar si el invited_email tiene cuenta
    if (!userId) {
      const { data: existingUser } = await adminClient
        .rpc('get_user_id_by_email', { email: invitation.invited_email })
        .maybeSingle()

      if (existingUser) {
        // Tiene cuenta pero no está logueado
        return json({
          error: 'Please sign in first',
          action: 'login',
          email: invitation.invited_email,
        }, 401)
      } else {
        // No tiene cuenta — generar magic link de registro
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: 'magiclink',
          email: invitation.invited_email,
          options: {
            redirectTo: `freedomus://invite?token=${token}`,
          },
        })

        if (linkError || !linkData) {
          return json({ error: 'Failed to generate sign-up link' }, 500)
        }

        return json({
          action: 'signup_required',
          magic_link: linkData.properties?.action_link,
          email: invitation.invited_email,
        }, 200)
      }
    }

    // Verificar que el usuario no sea ya miembro
    const { data: alreadyMember } = await adminClient
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', invitation.workspace_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (alreadyMember) {
      return json({ error: 'Already a member' }, 409)
    }

    // Insertar en workspace_members
    const { error: memberError } = await adminClient
      .from('workspace_members')
      .insert({
        workspace_id: invitation.workspace_id,
        user_id: userId,
        role: invitation.role,
      })

    if (memberError) {
      console.error('Insert member error:', memberError)
      return json({ error: 'Failed to join workspace' }, 500)
    }

    // Marcar invitación como aceptada
    await adminClient
      .from('workspace_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id)

    // Obtener info del workspace para retornar
    const { data: workspace } = await adminClient
      .from('workspaces')
      .select('id, name, icon')
      .eq('id', invitation.workspace_id)
      .single()

    return json({
      workspace: workspace ?? { id: invitation.workspace_id, name: '', icon: '🏠' },
      role: invitation.role,
    }, 200)
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
