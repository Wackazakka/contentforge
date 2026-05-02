import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Protected routes that require authentication
const protectedRoutes = ['/dashboard', '/api/']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  )

  if (!isProtectedRoute) {
    return NextResponse.next()
  }

  // Create Supabase client in middleware
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables')
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // Get session from cookies
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // If no session, redirect to login
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // User is authenticated, allow request
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
