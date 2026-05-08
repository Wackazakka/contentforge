import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F1EFE8' }}>
      <Suspense fallback={<div style={{ color: '#185FA5' }}>Laster...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
