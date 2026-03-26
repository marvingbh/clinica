import { Plus, Upload, Building2, Repeat, PieChart } from "lucide-react"
import Link from "next/link"

interface Category {
  id: string
  name: string
  color: string
}

interface ExpenseToolbarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  statusFilter: string
  onStatusChange: (value: string) => void
  categoryFilter: string
  onCategoryChange: (value: string) => void
  categories: Category[]
  onNewExpense: () => void
}

export function ExpenseToolbar({
  searchQuery, onSearchChange, statusFilter, onStatusChange,
  categoryFilter, onCategoryChange, categories, onNewExpense,
}: ExpenseToolbarProps) {
  return (
    <div className="flex flex-wrap justify-between items-center gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar descrição, fornecedor..."
          className="rounded-md border border-input px-3 py-1.5 text-sm w-48 md:w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="rounded-md border border-input px-3 py-1.5 text-sm"
        >
          <option value="">Todos os status</option>
          <option value="OPEN">Em aberto</option>
          <option value="OVERDUE">Vencido</option>
          <option value="PAID">Pago</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="rounded-md border border-input px-3 py-1.5 text-sm"
        >
          <option value="">Todas as categorias</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Link href="/financeiro/despesas/analise" className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input hover:bg-muted">
          <PieChart className="h-4 w-4" /> Análise
        </Link>
        <Link href="/financeiro/despesas/recorrencias" className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input hover:bg-muted">
          <Repeat className="h-4 w-4" /> Recorrentes
        </Link>
        <Link href="/financeiro/despesas/import" className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input hover:bg-muted">
          <Upload className="h-4 w-4" /> Importar Extrato
        </Link>
        <Link href="/financeiro/despesas/inter" className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input hover:bg-muted">
          <Building2 className="h-4 w-4" /> Importar do Inter
        </Link>
        <button
          onClick={onNewExpense}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nova Despesa
        </button>
      </div>
    </div>
  )
}
