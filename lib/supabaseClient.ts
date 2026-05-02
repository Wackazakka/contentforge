import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

export type User = {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
}

// Helper: Get current user
export async function getCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser()
  return data.user
    ? {
        id: data.user.id,
        email: data.user.email || '',
        full_name: data.user.user_metadata?.full_name,
        avatar_url: data.user.user_metadata?.avatar_url,
      }
    : null
}

// Helper: Sign up
export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  })
  return { data, error }
}

// Helper: Sign in
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return { data, error }
}

// Helper: Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

// Helper: Get session
export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}
