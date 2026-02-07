"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import { LoaderIcon, SearchIcon, XIcon, PhoneIcon, MailIcon, UserIcon } from "@/shared/components/ui/icons"
import { Patient } from "../lib/types"
import { formatPhone } from "../lib/utils"

interface PatientSearchProps {
  value: string
  onChange: (value: string) => void
  selectedPatient: Patient | null
  onSelectPatient: (patient: Patient) => void
  onClearPatient: () => void
  error?: string
}

export function PatientSearch({
  value,
  onChange,
  selectedPatient,
  onSelectPatient,
  onClearPatient,
  error,
}: PatientSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const searchPatients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setPatients([])
      return
    }

    setIsSearching(true)
    try {
      const params = new URLSearchParams({
        search: query,
        isActive: "true",
      })

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

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (value) {
        searchPatients(value)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [value, searchPatients])

  function handleInputChange(newValue: string) {
    onChange(newValue)
    setShowDropdown(true)
    if (selectedPatient && newValue !== selectedPatient.name) {
      onClearPatient()
    }
  }

  function handleSelectPatient(patient: Patient) {
    onSelectPatient(patient)
    onChange(patient.name)
    setShowDropdown(false)
    setPatients([])
  }

  // When a patient is selected, show a rich card instead of the search input
  if (selectedPatient) {
    return (
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Paciente
        </label>
        <div className="relative rounded-xl border border-primary/30 bg-primary/[0.03] p-3 transition-colors">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-5 h-5 text-primary/70" />
            </div>

            {/* Patient info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground truncate leading-tight">
                {selectedPatient.name}
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <PhoneIcon className="w-3 h-3" />
                  {formatPhone(selectedPatient.phone)}
                </span>
                {selectedPatient.email && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate min-w-0">
                    <MailIcon className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{selectedPatient.email}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Clear button */}
            <button
              type="button"
              onClick={onClearPatient}
              className="flex-shrink-0 w-7 h-7 rounded-lg bg-muted/80 text-muted-foreground flex items-center justify-center hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Trocar paciente"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <label htmlFor="patientSearch" className="block text-sm font-medium text-foreground mb-1.5">
        Paciente *
      </label>
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <SearchIcon className="w-4 h-4 text-muted-foreground" />
        </div>
        <input
          ref={inputRef}
          id="patientSearch"
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
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
      {showDropdown && patients.length > 0 && (
        <div className="absolute z-10 w-full mt-1.5 bg-card border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto animate-scale-in">
          {patients.map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => handleSelectPatient(patient)}
              className="w-full px-3.5 py-2.5 text-left hover:bg-muted/60 transition-colors flex items-center gap-3 first:rounded-t-xl last:rounded-b-xl"
            >
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground truncate">{patient.name}</p>
                <p className="text-xs text-muted-foreground">{formatPhone(patient.phone)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {showDropdown && value.length >= 2 && patients.length === 0 && !isSearching && (
        <div className="absolute z-10 w-full mt-1.5 bg-card border border-border rounded-xl shadow-lg p-4 text-center animate-scale-in">
          <p className="text-sm text-muted-foreground">Nenhum paciente encontrado</p>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
    </div>
  )
}
