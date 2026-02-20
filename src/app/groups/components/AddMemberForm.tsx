"use client"

interface AddMemberFormProps {
  selectedPatient: { id: string; name: string } | null
  patientSearch: string
  patientSearchResults: Array<{ id: string; name: string; phone: string }>
  isSearchingPatients: boolean
  memberJoinDate: string
  isSavingMember: boolean
  onPatientSearch: (value: string) => void
  onSelectPatient: (patient: { id: string; name: string }) => void
  onClearPatient: () => void
  onJoinDateChange: (value: string) => void
  onAdd: () => void
  onCancel: () => void
}

export function AddMemberForm({
  selectedPatient,
  patientSearch,
  patientSearchResults,
  isSearchingPatients,
  memberJoinDate,
  isSavingMember,
  onPatientSearch,
  onSelectPatient,
  onClearPatient,
  onJoinDateChange,
  onAdd,
  onCancel,
}: AddMemberFormProps) {
  return (
    <div className="mb-4 p-4 border border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50/50 dark:bg-purple-950/30">
      <h4 className="font-medium text-foreground mb-3">Adicionar Novo Membro</h4>

      {/* Patient Search */}
      <div className="relative mb-3">
        <label className="block text-sm text-muted-foreground mb-1">Paciente *</label>
        {selectedPatient ? (
          <div className="flex items-center justify-between h-10 px-3 rounded-md border border-input bg-background">
            <span className="text-foreground">{selectedPatient.name}</span>
            <button
              type="button"
              onClick={onClearPatient}
              className="text-muted-foreground hover:text-foreground"
            >
              &#x2715;
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={patientSearch}
              onChange={(e) => onPatientSearch(e.target.value)}
              placeholder="Buscar paciente por nome..."
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {/* Search Results Dropdown */}
            {(patientSearchResults.length > 0 || isSearchingPatients) && (
              <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {isSearchingPatients ? (
                  <div className="p-3 text-sm text-muted-foreground">Buscando...</div>
                ) : (
                  patientSearchResults.map((patient) => (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => onSelectPatient(patient)}
                      className="w-full px-3 py-2 text-left hover:bg-muted transition-colors"
                    >
                      <p className="font-medium text-foreground">{patient.name}</p>
                      <p className="text-xs text-muted-foreground">{patient.phone}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Join Date */}
      <div className="mb-3">
        <label className="block text-sm text-muted-foreground mb-1">Data de Entrada *</label>
        <input
          type="date"
          value={memberJoinDate}
          onChange={(e) => onJoinDateChange(e.target.value)}
          className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAdd}
          disabled={isSavingMember || !selectedPatient || !memberJoinDate}
          className="h-9 px-4 rounded-md bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSavingMember ? "Salvando..." : "Adicionar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 px-4 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
