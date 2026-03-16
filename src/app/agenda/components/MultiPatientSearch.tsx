"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import { LoaderIcon, SearchIcon, XIcon, UserIcon } from "@/shared/components/ui/icons"
import { Patient } from "../lib/types"

interface MultiPatientSearchProps {
  selectedPatients: Patient[]
  onAddPatient: (patient: Patient) => void
  onRemovePatient: (patientId: string) => void
  error?: string
}

export function MultiPatientSearch({
  selectedPatients,
  onAddPatient,
  onRemovePatient,
  error,
}: MultiPatientSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [patients, setPatients] = useState<Patient[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const selectedIds = new Set(selectedPatients.map(p => p.id))

  const searchPatients = useCallback(async (q: string) => {
    if (q.length < 2) {
      setPatients([])
      return
    }
    setIsSearching(true)
    try {
      const params = new URLSearchParams({ search: q, isActive: "true" })
      const response = await fetch(`/api/patients?${params.toString()}`)
      if (!response.ok) return
      const data = await response.json()
      setPatients(data.patients)
    } catch {
      // Silently fail
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) searchPatients(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, searchPatients])

  function handleSelect(patient: Patient) {
    if (selectedIds.has(patient.id)) return
    onAddPatient(patient)
    setQuery("")
    setPatients([])
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  // Filter out already-selected patients from results
  const filteredResults = patients.filter(p => !selectedIds.has(p.id))

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-foreground mb-1.5">
        Pacientes *
      </label>

      {/* Selected patients chips */}
      {selectedPatients.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedPatients.map(patient => (
            <span
              key={patient.id}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200"
            >
              {patient.name}
              <button
                type="button"
                onClick={() => onRemovePatient(patient.id)}
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
                aria-label={`Remover ${patient.name}`}
              >
                <XIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <SearchIcon className="w-4 h-4 text-muted-foreground" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowDropdown(true) }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Buscar paciente pelo nome..."
          className="w-full h-11 pl-10 pr-10 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
        />
        {isSearching && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <LoaderIcon className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && filteredResults.length > 0 && (
        <div className="absolute z-10 w-[calc(100%-2rem)] mt-1.5 bg-card border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto animate-scale-in">
          {filteredResults.map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => handleSelect(patient)}
              className="w-full px-3.5 py-2.5 text-left hover:bg-muted/60 transition-colors flex items-center gap-3 first:rounded-t-xl last:rounded-b-xl"
            >
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground truncate">{patient.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showDropdown && query.length >= 2 && filteredResults.length === 0 && !isSearching && (
        <div className="absolute z-10 w-[calc(100%-2rem)] mt-1.5 bg-card border border-border rounded-xl shadow-lg p-4 text-center animate-scale-in">
          <p className="text-sm text-muted-foreground">Nenhum paciente encontrado</p>
        </div>
      )}

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}

      <p className="text-xs text-muted-foreground mt-1">
        {selectedPatients.length} paciente{selectedPatients.length !== 1 ? "s" : ""} selecionado{selectedPatients.length !== 1 ? "s" : ""}
        {selectedPatients.length < 2 && " (mínimo 2)"}
      </p>
    </div>
  )
}
