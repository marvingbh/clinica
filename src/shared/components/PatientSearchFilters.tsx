"use client"

interface Professional {
  id: string
  name: string
  professionalProfile: { id: string } | null
}

interface PatientSearchFiltersProps {
  search: string
  filterActive: string
  filterProfessional: string
  professionals: Professional[]
  onSearchChange: (value: string) => void
  onFilterActiveChange: (value: string) => void
  onFilterProfessionalChange: (value: string) => void
}

export function PatientSearchFilters({
  search,
  filterActive,
  filterProfessional,
  professionals,
  onSearchChange,
  onFilterActiveChange,
  onFilterProfessionalChange,
}: PatientSearchFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <div className="flex-1">
        <input
          type="text"
          placeholder="Buscar por nome, email ou telefone..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
        />
      </div>
      <select
        value={filterProfessional}
        onChange={(e) => onFilterProfessionalChange(e.target.value)}
        className="h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
      >
        <option value="">Todos profissionais</option>
        {professionals
          .filter((prof) => prof.professionalProfile)
          .map((prof) => (
            <option key={prof.professionalProfile!.id} value={prof.professionalProfile!.id}>
              {prof.name}
            </option>
          ))}
      </select>
      <select
        value={filterActive}
        onChange={(e) => onFilterActiveChange(e.target.value)}
        className="h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
      >
        <option value="all">Todos</option>
        <option value="true">Ativos</option>
        <option value="false">Inativos</option>
      </select>
    </div>
  )
}
