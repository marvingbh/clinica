"use client"

import { usePortal } from "./PortalSessionProvider"

export function ProfileSwitcher() {
  const { me, activeProfileId, setActiveProfileId } = usePortal()
  if (!me || me.profiles.length <= 1) {
    return me?.profiles[0] ? (
      <span className="text-sm text-muted-foreground">{me.profiles[0].displayName}</span>
    ) : null
  }

  return (
    <select
      value={activeProfileId ?? ""}
      onChange={(e) => setActiveProfileId(e.target.value)}
      className="text-sm border border-border rounded px-2 py-1 bg-card text-foreground"
      aria-label="Selecionar perfil"
    >
      {me.profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.displayName}
        </option>
      ))}
    </select>
  )
}
