import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-white">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
