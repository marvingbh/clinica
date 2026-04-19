"use client"

import { useRef, useCallback, useState } from "react"
import { useDebouncedValue } from "@/shared/hooks"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
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
  const debouncedValue = useDebouncedValue(value, 300)
  // Triggers search when debounced value settles (effect must react to value changes)
  useEffect(() => {
    if (debouncedValue) {
      searchPatients(debouncedValue)
    }
  }, [debouncedValue, searchPatients])

  // Check if a patient matched via parent name (not by name/email/phone)
  function getParentMatch(patient: Patient): string | null {
    if (!value || value.length < 2) return null
    const q = value.toLowerCase()
    // If the patient's own name, email, or phone already matches, don't show parent info
    if (patient.name.toLowerCase().includes(q)) return null
    if (patient.email?.toLowerCase().includes(q)) return null
    if (patient.phone.includes(q)) return null
    // Check parent names
    if (patient.motherName?.toLowerCase().includes(q)) return `Mãe: ${patient.motherName}`
    if (patient.fatherName?.toLowerCase().includes(q)) return `Pai: ${patient.fatherName}`
    return null
  }

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
        <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
          Paciente
        </label>
        <div className="relative rounded-[4px] border border-brand-200 bg-brand-50/50 px-2.5 py-1.5 transition-colors h-11 md:h-10 flex items-center">
          <div className="flex items-center gap-2.5 w-full">
            <div className="w-7 h-7 rounded-full bg-brand-100 border border-brand-200 flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-3.5 h-3.5 text-brand-700" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-medium text-[13px] text-ink-900 truncate leading-tight">
                {selectedPatient.name}
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-500 font-mono">
                  <PhoneIcon className="w-3 h-3" />
                  {formatPhone(selectedPatient.phone)}
                </span>
                {selectedPatient.email && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-500 truncate min-w-0">
                    <MailIcon className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{selectedPatient.email}</span>
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClearPatient}
              className="flex-shrink-0 w-6 h-6 rounded-[2px] text-ink-500 flex items-center justify-center hover:bg-ink-100 hover:text-ink-800 transition-colors"
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
      <label htmlFor="patientSearch" className="block text-[12px] font-medium text-ink-700 mb-1.5">
        Paciente *
      </label>
      <div className="relative">
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <SearchIcon className="w-4 h-4 text-ink-400" />
        </div>
        <input
          ref={inputRef}
          id="patientSearch"
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          placeholder="Buscar paciente..."
          className="w-full h-11 md:h-10 pl-9 pr-9 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] placeholder:text-ink-400 hover:border-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms]"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <LoaderIcon className="w-4 h-4 animate-spin text-ink-400" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && patients.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-card border border-ink-200 rounded-md shadow-lg max-h-60 overflow-y-auto animate-scale-in">
          {patients.map((patient) => {
            const parentMatch = getParentMatch(patient)
            return (
              <button
                key={patient.id}
                type="button"
                onClick={() => handleSelectPatient(patient)}
                className="w-full px-3 py-2 text-left hover:bg-ink-50 transition-colors flex items-center gap-2.5"
              >
                <div className="w-7 h-7 rounded-full bg-brand-100 border border-brand-200 text-brand-700 flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[13px] text-ink-900 truncate">{patient.name}</p>
                  <p className="text-[11px] text-ink-500 font-mono">{formatPhone(patient.phone)}</p>
                  {parentMatch && (
                    <p className="text-[11px] text-brand-700 truncate">({parentMatch})</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* No results */}
      {showDropdown && value.length >= 2 && patients.length === 0 && !isSearching && (
        <div className="absolute z-10 w-full mt-1 bg-card border border-ink-200 rounded-md shadow-lg p-4 text-center animate-scale-in">
          <p className="text-[13px] text-ink-500">Nenhum paciente encontrado</p>
        </div>
      )}

      {error && (
        <p className="text-[12px] text-err-700 mt-1">{error}</p>
      )}
    </div>
  )
}
