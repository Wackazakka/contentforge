import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Lazy initialization — only throw error when supabase is actually used
let supabaseInstance: any = null

function initSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      `Missing Supabase environment variables. 
       URL: ${supabaseUrl ? '✓' : '✗'} 
       Key: ${supabaseAnonKey ? '✓' : '✗'}`
    )
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
}

export function getSupabase() {
  if (!supabaseInstance) {
    supabaseInstance = initSupabase()
  }
  return supabaseInstance
}

// Keep backward compatibility export
export const supabase = new Proxy({} as any, {
  get: (target, prop) => {
    return getSupabase()[prop]
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
  try {
    const sb = getSupabase()
    const { data } = await sb.auth.getUser()
    return data.user
      ? {
          id: data.user.id,
          email: data.user.email || '',
          full_name: data.user.user_metadata?.full_name,
          avatar_url: data.user.user_metadata?.avatar_url,
        }
      : null
  } catch (error) {
    console.error('getCurrentUser error:', error)
    return null
  }
}

// Helper: Sign up
export async function signUp(email: string, password: string, fullName: string) {
  try {
    const sb = getSupabase()
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })
    return { data, error }
  } catch (error) {
    console.error('signUp error:', error)
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// Helper: Sign in
export async function signIn(email: string, password: string) {
  try {
    const sb = getSupabase()
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  } catch (error) {
    console.error('signIn error:', error)
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// Helper: Sign out
export async function signOut() {
  try {
    const sb = getSupabase()
    const { error } = await sb.auth.signOut()
    return { error }
  } catch (error) {
    console.error('signOut error:', error)
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// Helper: Get session
export async function getSession() {
  try {
    const sb = getSupabase()
    const { data } = await sb.auth.getSession()
    return data.session
  } catch (error) {
    console.error('getSession error:', error)
    return null
  }
}
