import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function SelectLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  )
}
