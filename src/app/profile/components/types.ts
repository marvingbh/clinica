export interface GoogleState {
  status: "ATIVA" | "ERRO" | "REVOGADA"
  googleAccountEmail: string | null
  privacyMode: "TOTAL" | "PRIMEIRO_NOME"
  targetCalendarId: string | null
  syncNonBlocking: boolean
  inboundEnabled: boolean
  selectedCalendarIds: string[]
  lastSyncAt: string | null
  lastErrorMessage: string | null
}

export interface IcsState {
  privacyMode: "TOTAL" | "PRIMEIRO_NOME"
  syncNonBlocking: boolean
  icsUrl: string
}

export interface CalendarSyncState {
  hasProfessionalProfile: boolean
  google: GoogleState | null
  ics: IcsState | null
}
