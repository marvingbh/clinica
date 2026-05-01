"use client"

import { useEffect, useRef, useState } from "react"
import { ExpenseStatusBadge } from "./ExpenseStatusBadge"
import type { ExpenseStatus } from "@prisma/client"

interface Expense {
  id: string
  description: string
  supplierName: string | null
  amount: string
  dueDate: string
  paidAt: string | null
  status: ExpenseStatus
  paymentMethod: string | null
  category: { id: string; name: string; color: string } | null
}

interface Category {
  id: string
  name: string
  color: string
}

export type InlinePatch = {
  supplierName?: string | null
  categoryId?: string | null
}

interface ExpenseTableProps {
  expenses: Expense[]
  categories: Category[]
  formatCurrency: (value: string | number) => string
  formatDate: (dateStr: string) => string
  onPay: (id: string) => void
  onEdit: (expense: Expense) => void
  onDelete: (id: string) => void
  onPatch: (id: string, patch: InlinePatch) => Promise<void>
}

export function ExpenseTable({
  expenses, categories, formatCurrency, formatDate, onPay, onEdit, onDelete, onPatch,
}: ExpenseTableProps) {
  if (expenses.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg mb-2">Nenhuma despesa encontrada</p>
        <p className="text-sm">Cadastre sua primeira despesa clicando em &quot;Nova Despesa&quot;</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Vencimento</th>
            <th className="text-left px-4 py-2 font-medium">Descrição</th>
            <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Fornecedor</th>
            <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Categoria</th>
            <th className="text-right px-4 py-2 font-medium">Valor</th>
            <th className="text-center px-4 py-2 font-medium">Status</th>
            <th className="text-right px-4 py-2 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {expenses.map((expense) => (
            <tr key={expense.id} className="hover:bg-muted/30">
              <td className="px-4 py-2">{formatDate(expense.dueDate)}</td>
              <td className="px-4 py-2">{expense.description}</td>
              <td className="px-4 py-2 hidden md:table-cell">
                <SupplierCell
                  value={expense.supplierName}
                  onSave={(next) => onPatch(expense.id, { supplierName: next })}
                />
              </td>
              <td className="px-4 py-2 hidden md:table-cell">
                <CategoryCell
                  value={expense.category}
                  categories={categories}
                  onSave={(nextId) => onPatch(expense.id, { categoryId: nextId })}
                />
              </td>
              <td className="px-4 py-2 text-right font-medium">{formatCurrency(expense.amount)}</td>
              <td className="px-4 py-2 text-center"><ExpenseStatusBadge status={expense.status} /></td>
              <td className="px-4 py-2 text-right">
                <div className="flex justify-end gap-1">
                  {(expense.status === "OPEN" || expense.status === "OVERDUE") && (
                    <button
                      onClick={() => onPay(expense.id)}
                      className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200"
                    >
                      Pagar
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(expense)}
                    className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => onDelete(expense.id)}
                    className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                  >
                    Excluir
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline-edit cells
// ─────────────────────────────────────────────────────────────────────────────

function SupplierCell({
  value,
  onSave,
}: {
  value: string | null
  onSave: (next: string | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? "")
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync draft if the upstream value changes (e.g., after another save)
  useEffect(() => {
    if (!editing) setDraft(value ?? "")
  }, [value, editing])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  async function commit() {
    const trimmed = draft.trim()
    const next = trimmed === "" ? null : trimmed
    if (next === (value ?? null) || (next === null && (value === null || value === ""))) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(next)
      setEditing(false)
    } catch {
      // page-level handler reverts state and shows a toast — bring the cell
      // back to read mode showing the original value
      setDraft(value ?? "")
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(value ?? "")
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`text-left w-full block px-1 -mx-1 rounded hover:bg-muted/40 transition-colors ${value ? "" : "text-muted-foreground"} ${saving ? "opacity-60" : ""}`}
        title="Clique para editar fornecedor"
        disabled={saving}
      >
        {value || "—"}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
        } else if (e.key === "Escape") {
          e.preventDefault()
          cancel()
        }
      }}
      disabled={saving}
      placeholder="Fornecedor"
      className="w-full px-1 -mx-1 py-0.5 rounded border border-primary/40 bg-background outline-none focus:border-primary"
    />
  )
}

function CategoryCell({
  value,
  categories,
  onSave,
}: {
  value: { id: string; name: string; color: string } | null
  categories: Category[]
  onSave: (nextId: string | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (editing) selectRef.current?.focus()
  }, [editing])

  async function handleChange(nextId: string) {
    const normalized = nextId === "" ? null : nextId
    if (normalized === (value?.id ?? null)) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(normalized)
    } catch {
      // page-level handler reverts; just exit edit mode
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`text-left w-full block px-1 -mx-1 rounded hover:bg-muted/40 transition-colors ${saving ? "opacity-60" : ""}`}
        title="Clique para editar categoria"
        disabled={saving}
      >
        {value ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: value.color }} />
            {value.name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </button>
    )
  }

  return (
    <select
      ref={selectRef}
      defaultValue={value?.id ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          setEditing(false)
        }
      }}
      disabled={saving}
      className="w-full px-1 -mx-1 py-0.5 rounded border border-primary/40 bg-background outline-none focus:border-primary"
    >
      <option value="">— Sem categoria —</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )
}
