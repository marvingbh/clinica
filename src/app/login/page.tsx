"use client"

import { Suspense, useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useMountEffect } from "@/shared/hooks"

// Server-side rate limit is 5 attempts per 15 min per (IP+email). We show a
// friendlier message on the client after the same number of failures to help
// legitimate users who've typoed their password. The server response is
// unchanged — attackers learn nothing new since the limit is trivially
// discoverable anyway. sessionStorage keeps the count across accidental
// page refreshes within the same tab.
const ATTEMPT_LIMIT = 5
const ATTEMPT_STORAGE_KEY = "clinica.loginFailedAttempts"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") || "/"
  const error = searchParams.get("error")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [errorMessage, setErrorMessage] = useState(
    error === "CredentialsSignin" ? "Email ou senha incorretos" : ""
  )

  useMountEffect(() => {
    try {
      const stored = sessionStorage.getItem(ATTEMPT_STORAGE_KEY)
      if (stored) setFailedAttempts(Number(stored) || 0)
    } catch {
      // sessionStorage may be blocked in private mode — fine
    }
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage("")

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    })

    if (result?.error) {
      const next = failedAttempts + 1
      setFailedAttempts(next)
      try {
        sessionStorage.setItem(ATTEMPT_STORAGE_KEY, String(next))
      } catch {}
      setErrorMessage(
        next >= ATTEMPT_LIMIT
          ? "Muitas tentativas. Aguarde alguns minutos e tente novamente."
          : "Email ou senha incorretos"
      )
      setIsLoading(false)
    } else if (result?.ok) {
      try {
        sessionStorage.removeItem(ATTEMPT_STORAGE_KEY)
      } catch {}
      router.push(callbackUrl)
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {errorMessage && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md p-3">
          {errorMessage}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-foreground mb-2"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="seu@email.com"
          className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-foreground mb-2"
        >
          Senha
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="Sua senha"
          className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {isLoading ? "Entrando..." : "Entrar"}
      </button>

      <p className="text-center text-sm text-muted-foreground mt-4">
        Nao tem conta?{" "}
        <Link href="/signup" className="text-primary hover:underline font-medium">
          Criar conta gratuitamente
        </Link>
      </p>
    </form>
  )
}

function LoginFormFallback() {
  return (
    <div className="space-y-5 animate-pulse">
      <div>
        <div className="h-4 w-12 bg-muted rounded mb-2" />
        <div className="h-12 bg-muted rounded" />
      </div>
      <div>
        <div className="h-4 w-12 bg-muted rounded mb-2" />
        <div className="h-12 bg-muted rounded" />
      </div>
      <div className="h-12 bg-muted rounded" />
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg p-6 sm:p-8 shadow-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-foreground">Clinica</h1>
            <p className="text-muted-foreground mt-2">
              Acesse sua conta para continuar
            </p>
          </div>

          <Suspense fallback={<LoginFormFallback />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
