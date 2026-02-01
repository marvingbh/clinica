import { toDateString } from "../lib/utils"
import type { GroupSession } from "../lib/types"

export interface FetchGroupSessionsParams {
  date?: Date
  startDate?: Date
  endDate?: Date
  professionalProfileId?: string
  signal?: AbortSignal
}

export interface FetchGroupSessionsResponse {
  groupSessions: GroupSession[]
}

export async function fetchGroupSessions({
  date,
  startDate,
  endDate,
  professionalProfileId,
  signal,
}: FetchGroupSessionsParams): Promise<FetchGroupSessionsResponse> {
  const params = new URLSearchParams()

  if (date) {
    params.set("date", toDateString(date))
  } else if (startDate && endDate) {
    params.set("startDate", toDateString(startDate))
    params.set("endDate", toDateString(endDate))
  }

  if (professionalProfileId) {
    params.set("professionalProfileId", professionalProfileId)
  }

  const url = `/api/group-sessions?${params.toString()}`

  const response = await fetch(url, { signal })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("ACCESS_DENIED")
    }
    throw new Error("Failed to fetch group sessions")
  }

  const data = await response.json()
  return data
}
