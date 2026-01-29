import type { AvailabilityRule, AvailabilityException, Professional } from "../lib/types"

export interface FetchAvailabilityRulesParams {
  professionalProfileId?: string
  signal?: AbortSignal
}

export interface FetchAvailabilityRulesResponse {
  rules: AvailabilityRule[]
}

export interface FetchAvailabilityExceptionsParams {
  startDate: string
  endDate: string
  professionalProfileId?: string
  signal?: AbortSignal
}

export interface FetchAvailabilityExceptionsResponse {
  exceptions: AvailabilityException[]
}

export interface FetchProfessionalsResponse {
  professionals: Professional[]
}

export async function fetchAvailabilityRules({
  professionalProfileId,
  signal,
}: FetchAvailabilityRulesParams): Promise<FetchAvailabilityRulesResponse> {
  const params = new URLSearchParams()
  if (professionalProfileId) {
    params.set("professionalProfileId", professionalProfileId)
  }

  const url = params.toString()
    ? `/api/availability?${params.toString()}`
    : "/api/availability"

  const response = await fetch(url, { signal })

  if (!response.ok) {
    return { rules: [] }
  }

  return response.json()
}

export async function fetchAvailabilityExceptions({
  startDate,
  endDate,
  professionalProfileId,
  signal,
}: FetchAvailabilityExceptionsParams): Promise<FetchAvailabilityExceptionsResponse> {
  const params = new URLSearchParams({ startDate, endDate })
  if (professionalProfileId) {
    params.set("professionalProfileId", professionalProfileId)
  }

  const response = await fetch(`/api/availability/exceptions?${params.toString()}`, { signal })

  if (!response.ok) {
    return { exceptions: [] }
  }

  return response.json()
}

export async function fetchProfessionals(): Promise<FetchProfessionalsResponse> {
  const response = await fetch("/api/professionals")

  if (!response.ok) {
    return { professionals: [] }
  }

  return response.json()
}
