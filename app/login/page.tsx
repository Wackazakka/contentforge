import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <Suspense fallback={<div className="text-blue-600">Laster...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
