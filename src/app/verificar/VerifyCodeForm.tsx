"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

function maskCode(value: string): string {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)
  const parts: string[] = []
  for (let i = 0; i < clean.length; i += 4) parts.push(clean.slice(i, i + 4))
  return parts.join("-")
}

export function VerifyCodeForm() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const clean = code.replace(/[^A-Za-z0-9]/g, "")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (clean.length === 12) router.push(`/verificar/${clean}`)
      }}
      className="space-y-3"
    >
      <input
        value={code}
        onChange={(e) => setCode(maskCode(e.target.value))}
        placeholder="K7XF-2MQ9-PA4D"
        className="w-full h-12 rounded-md border border-input bg-background px-3 text-center font-mono tracking-widest"
      />
      <button type="submit" disabled={clean.length !== 12} className="w-full h-11 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50">
        Verificar
      </button>
    </form>
  )
}
