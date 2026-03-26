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

interface ExpenseTableProps {
  expenses: Expense[]
  formatCurrency: (value: string | number) => string
  formatDate: (dateStr: string) => string
  onPay: (id: string) => void
  onEdit: (expense: Expense) => void
  onDelete: (id: string) => void
}

export function ExpenseTable({
  expenses, formatCurrency, formatDate, onPay, onEdit, onDelete,
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
              <td className="px-4 py-2 hidden md:table-cell text-muted-foreground">{expense.supplierName || "—"}</td>
              <td className="px-4 py-2 hidden md:table-cell">
                {expense.category ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: expense.category.color }} />
                    {expense.category.name}
                  </span>
                ) : "—"}
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
