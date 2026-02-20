"use client"

import {
  EyeIcon,
  PencilIcon,
  BanIcon,
  RotateCcwIcon,
} from "@/shared/components/ui"
import { Patient, formatPhone, formatDate } from "./types"

interface PatientsTableProps {
  patients: Patient[]
  canWrite: boolean
  onView: (patient: Patient) => void
  onEdit: (patient: Patient) => void
  onDeactivate: (patient: Patient) => void
  onReactivate: (patient: Patient) => void
}

export function PatientsTable({
  patients,
  canWrite,
  onView,
  onEdit,
  onDeactivate,
  onReactivate,
}: PatientsTableProps) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Nome</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">Telefone</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground hidden md:table-cell">Profissional</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground hidden lg:table-cell">Ultima Visita</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {patients.map((patient) => (
              <tr
                key={patient.id}
                className={`hover:bg-muted/30 transition-colors ${!patient.isActive ? "opacity-60" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onView(patient)}
                      className="font-medium text-foreground hover:text-primary transition-colors text-left"
                    >
                      {patient.name}
                    </button>
                    <div className="flex gap-1">
                      {patient.consentWhatsApp && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          WA
                        </span>
                      )}
                      {patient.consentEmail && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          Email
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Mobile: show phone below name */}
                  <p className="text-sm text-muted-foreground sm:hidden mt-1">
                    {formatPhone(patient.phone)}
                  </p>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                  {formatPhone(patient.phone)}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                  {patient.referenceProfessional?.user.name || "-"}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">
                  {formatDate(patient.lastVisitAt)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex text-xs px-2 py-1 rounded-full ${
                      patient.isActive
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {patient.isActive ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onView(patient)}
                      title="Ver detalhes"
                      className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <EyeIcon className="w-4 h-4" />
                    </button>
                    {canWrite && (
                      <>
                        <button
                          onClick={() => onEdit(patient)}
                          title="Editar"
                          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        {patient.isActive ? (
                          <button
                            onClick={() => onDeactivate(patient)}
                            title="Desativar"
                            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <BanIcon className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => onReactivate(patient)}
                            title="Reativar"
                            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <RotateCcwIcon className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
