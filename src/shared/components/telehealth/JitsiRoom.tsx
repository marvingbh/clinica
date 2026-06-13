"use client"

import { useRef, useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import type { JoinInfo } from "@/lib/telehealth"

/**
 * Client wrapper around the Jitsi external API. Loads `external_api.js` from the
 * provider domain on mount (useMountEffect — useEffect rule #4), disposes the
 * API instance on cleanup, and disables recording/livestreaming (RN-10). The
 * mock provider renders a static placeholder so dev/tests never hit the network.
 */
interface JitsiRoomProps {
  join: JoinInfo
  onLeft?: () => void
  onFailed?: () => void
}

// Minimal shape of the global injected by external_api.js.
type JitsiApi = { dispose: () => void; addListener: (e: string, cb: () => void) => void }
type JitsiCtor = new (domain: string, options: Record<string, unknown>) => JitsiApi

export function JitsiRoom({ join, onLeft, onFailed }: JitsiRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useMountEffect(() => {
    if (join.provider === "mock") return

    let api: JitsiApi | null = null
    let cancelled = false

    function start() {
      const Ctor = (window as unknown as { JitsiMeetExternalAPI?: JitsiCtor }).JitsiMeetExternalAPI
      if (!Ctor || !containerRef.current || cancelled) return
      api = new Ctor(join.domain, {
        roomName: join.roomName,
        parentNode: containerRef.current,
        userInfo: { displayName: join.displayName },
        configOverwrite: {
          prejoinConfig: { enabled: true },
          disableDeepLinking: true,
          startWithVideoMuted: false,
          subject: join.subject,
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [
            "microphone", "camera", "desktop", "fullscreen", "hangup",
            "chat", "settings", "raisehand", "videoquality", "tileview",
          ],
        },
      })
      api.addListener("readyToClose", () => onLeft?.())
      api.addListener("videoConferenceLeft", () => onLeft?.())
    }

    const existing = (window as unknown as { JitsiMeetExternalAPI?: JitsiCtor }).JitsiMeetExternalAPI
    if (existing) {
      start()
    } else {
      const script = document.createElement("script")
      script.src = `https://${join.domain}/external_api.js`
      script.async = true
      script.onload = start
      script.onerror = () => {
        if (cancelled) return
        setFailed(true)
        onFailed?.()
      }
      document.body.appendChild(script)
    }

    return () => {
      cancelled = true
      api?.dispose()
    }
  })

  if (join.provider === "mock") {
    return (
      <div className="flex h-full min-h-[300px] w-full items-center justify-center bg-slate-900 text-slate-200">
        <div className="text-center">
          <p className="text-sm font-medium">Sala de teleconsulta (modo desenvolvimento)</p>
          <p className="mt-1 text-xs text-slate-400">Sala: {join.roomName}</p>
        </div>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="flex h-full min-h-[300px] w-full items-center justify-center bg-slate-900 text-slate-200">
        <p className="text-sm">Não foi possível carregar a sala de vídeo.</p>
      </div>
    )
  }

  return <div ref={containerRef} className="h-full min-h-[300px] w-full" />
}
