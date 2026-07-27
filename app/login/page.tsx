import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--paper)', color: 'var(--ember-deep)' }}>Loading…</div>}>
      <LoginForm />
    </Suspense>
  )
}
