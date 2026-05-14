import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-cf-bg">
      <Suspense fallback={<div className="text-[#185FA5]">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
