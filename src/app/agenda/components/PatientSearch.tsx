"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import { LoaderIcon, CheckIcon } from "@/shared/components/ui/icons"
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

  return (
    <div className="relative">
      <label htmlFor="patientSearch" className="block text-sm font-medium text-foreground mb-2">
        Paciente *
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id="patientSearch"
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          placeholder="Digite o nome do paciente..."
          className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <LoaderIcon className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && patients.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {patients.map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => handleSelectPatient(patient)}
              className="w-full px-4 py-3 text-left hover:bg-muted transition-colors flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-foreground">{patient.name}</p>
                <p className="text-sm text-muted-foreground">{formatPhone(patient.phone)}</p>
              </div>
              {selectedPatient?.id === patient.id && (
                <CheckIcon className="w-5 h-5 text-primary" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {showDropdown && value.length >= 2 && patients.length === 0 && !isSearching && (
        <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg p-4 text-center text-muted-foreground">
          Nenhum paciente encontrado
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive mt-1">{error}</p>
      )}

      {selectedPatient && (
        <div className="mt-2 p-3 bg-muted/50 rounded-md">
          <p className="text-sm font-medium text-foreground">{selectedPatient.name}</p>
          <p className="text-xs text-muted-foreground">{formatPhone(selectedPatient.phone)}</p>
          {selectedPatient.email && (
            <p className="text-xs text-muted-foreground">{selectedPatient.email}</p>
          )}
        </div>
      )}
    </div>
  )
}
