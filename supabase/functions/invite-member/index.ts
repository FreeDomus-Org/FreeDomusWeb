import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sendInvitationEmail } from '../_shared/resend.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Parse body
    const { workspace_id, invited_email, role: requestedRole } = await req.json()
    const role = requestedRole === 'admin' ? 'admin' : 'member'

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!invited_email || !emailRegex.test(invited_email)) {
      return json({ error: 'Invalid email' }, 422)
    }

    if (!workspace_id) {
      return json({ error: 'workspace_id is required' }, 400)
    }

    // Create Supabase client with caller's JWT (respects RLS)
    const authHeader = req.headers.get('Authorization')
    console.log('authHeader present:', !!authHeader)
    if (!authHeader) return json({ error: 'No authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Admin client for all operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // Verify user JWT by passing the token directly to getUser()
    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await adminClient.auth.getUser(jwt)
    console.log('getUser result - user:', user?.id, 'error:', userError?.message)
    if (userError || !user) return json({ error: 'Unauthorized - getUser failed', detail: userError?.message }, 401)

    // Validate caller is owner or admin of the workspace
    const { data: callerMember } = await adminClient
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single()

    if (!callerMember || !['owner', 'admin'].includes(callerMember.role)) {
      return json({ error: 'Not authorized' }, 403)
    }

    // Check if invited_email is already a member
    const { data: existingMember } = await adminClient
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspace_id)
      .eq('user_id',
        // Lookup user id by email
        adminClient
          .from('auth.users')
          .select('id')
          .eq('email', invited_email)
          .single()
      )
      .maybeSingle()

    // Simpler check: look up by email in auth.users and workspace_members
    const { data: invitedUser } = await adminClient
      .rpc('get_user_id_by_email', { email: invited_email })
      .maybeSingle()

    if (invitedUser) {
      const { data: alreadyMember } = await adminClient
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspace_id)
        .eq('user_id', invitedUser)
        .maybeSingle()

      if (alreadyMember) {
        return json({ error: 'Already a member' }, 409)
      }
    }

    // Check for existing pending invitation
    const { data: existingInvite } = await adminClient
      .from('workspace_invitations')
      .select('id')
      .eq('workspace_id', workspace_id)
      .eq('invited_email', invited_email)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingInvite) {
      return json({ error: 'Already invited' }, 409)
    }

    // Get workspace name and inviter name for the email
    const { data: workspace } = await adminClient
      .from('workspaces')
      .select('name')
      .eq('id', workspace_id)
      .single()

    const inviterName = user.email ?? 'Un usuario'
    const workspaceName = workspace?.name ?? 'un workspace'

    // Generate token and expiry before inserting — email must succeed first
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // Send email FIRST — if it fails, no invitation is saved
    await sendInvitationEmail(
      invited_email,
      workspaceName,
      inviterName,
      token,
      expiresAt,
    )

    // Email sent successfully — now insert the invitation
    const { data: invitation, error: insertError } = await adminClient
      .from('workspace_invitations')
      .insert({
        workspace_id,
        invited_by: user.id,
        invited_email,
        role,
        token,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('id, expires_at')
      .single()

    if (insertError || !invitation) {
      console.error('Insert error:', insertError)
      return json({ error: 'Failed to save invitation' }, 500)
    }

    return json({ invitation_id: invitation.id, expires_at: invitation.expires_at }, 200)
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ error: 'Internal server error', detail: err instanceof Error ? err.message : String(err) }, 500)
  }
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
