"use client"

import {
  CheckIcon,
  PencilIcon,
  CopyIcon,
  TrashIcon,
  RepeatIcon,
  AlertCircleIcon,
} from "@/shared/components/ui/icons"
import { isOverdue, formatTodoRecurrenceSummary } from "@/lib/todos"
import type { TodoListItem, SortKey } from "../types"

interface Props {
  todos: TodoListItem[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAllVisible: () => void
  onToggleDone: (todo: TodoListItem) => void
  onEdit: (todo: TodoListItem) => void
  onDuplicate: (todo: TodoListItem) => void
  onDelete: (todo: TodoListItem) => void
  sort: { key: SortKey; dir: "asc" | "desc" }
  onSort: (key: SortKey) => void
  rounded?: "full" | "bottom" | "top" | "middle"
}

const dowLabels = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]

function fmtDay(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y.slice(2)}`
}
function dowFor(iso: string) {
  return dowLabels[new Date(iso.slice(0, 10) + "T12:00:00").getDay()]
}

export function TodosTable({
  todos,
  selected,
  onToggleSelect,
  onSelectAllVisible,
  onToggleDone,
  onEdit,
  onDuplicate,
  onDelete,
  sort,
  onSort,
  rounded = "full",
}: Props) {
  const allChecked = todos.length > 0 && todos.every((t) => selected.has(t.id))
  const arrow = (k: SortKey) =>
    sort.key === k ? (sort.dir === "asc" ? "↑" : "↓") : "↕"

  const roundedClass =
    rounded === "full"
      ? "rounded-[12px]"
      : rounded === "top"
        ? "rounded-t-[12px]"
        : rounded === "bottom"
          ? "rounded-b-[12px]"
          : ""

  if (todos.length === 0) {
    return (
      <div className={`text-center py-14 px-4 bg-card border border-ink-200 ${roundedClass}`}>
        <div className="text-[16px] font-semibold text-ink-700">Nenhuma tarefa encontrada</div>
        <div className="text-[12px] text-ink-500 mt-1">
          Ajuste os filtros ou crie uma nova tarefa.
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-card border border-ink-200 overflow-x-auto ${roundedClass}`}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-ink-50/40 border-b border-ink-200 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
            <th className="w-10 px-3.5 py-2.5 text-left">
              <Check checked={allChecked} onClick={onSelectAllVisible} />
            </th>
            <th className="w-10 px-2 py-2.5 text-left">OK</th>
            <ThSort label="Tarefa" k="title" sort={sort} arrow={arrow} onSort={onSort} />
            <ThSort label="Data" k="day" sort={sort} arrow={arrow} onSort={onSort} />
            <ThSort label="Responsável" k="assignee" sort={sort} arrow={arrow} onSort={onSort} />
            <th className="px-3.5 py-2.5 text-left">Recorrência</th>
            <ThSort label="Status" k="status" sort={sort} arrow={arrow} onSort={onSort} />
            <th className="px-3.5 py-2.5 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {todos.map((t) => {
            const overdue = isOverdue({ done: t.done, day: t.day.slice(0, 10) })
            return (
              <tr
                key={t.id}
                className={`border-b border-ink-100 last:border-b-0 hover:bg-ink-50/40 ${
                  t.done ? "text-ink-500" : ""
                }`}
              >
                <td className="px-3.5 py-3">
                  <Check checked={selected.has(t.id)} onClick={() => onToggleSelect(t.id)} />
                </td>
                <td className="px-2 py-3">
                  <Check
                    checked={t.done}
                    onClick={() => onToggleDone(t)}
                    title={t.done ? "Reabrir" : "Concluir"}
                  />
                </td>
                <td className="px-3.5 py-3">
                  <button
                    onClick={() => onEdit(t)}
                    className={`text-left text-[13px] font-semibold text-ink-900 ${
                      t.done ? "line-through text-ink-500" : ""
                    }`}
                  >
                    {t.title}
                  </button>
                  {t.notes && (
                    <div className="text-[11.5px] text-ink-500 mt-0.5 max-w-[360px] truncate">
                      {t.notes}
                    </div>
                  )}
                </td>
                <td className="px-3.5 py-3 whitespace-nowrap tabular-nums text-ink-700">
                  <div className="text-[10px] uppercase tracking-[0.05em] text-ink-500">
                    {dowFor(t.day)}
                  </div>
                  {fmtDay(t.day)}
                </td>
                <td className="px-3.5 py-3">
                  <div className="inline-flex items-center gap-1.5 text-[13px]">
                    <span className="w-2 h-2 rounded-full bg-brand-500" />
                    <span>{t.professionalProfile.user.name.split(" ")[0]}</span>
                  </div>
                </td>
                <td className="px-3.5 py-3">
                  {t.recurrence ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[11px] font-medium">
                      <RepeatIcon className="w-2.5 h-2.5" />
                      {formatTodoRecurrenceSummary(
                        t.recurrence.recurrenceType,
                        t.recurrence.recurrenceEndType,
                        t.recurrence.occurrences,
                        t.recurrence.endDate
                      )}
                    </span>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
                <td className="px-3.5 py-3">
                  {t.done ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-ok-50 text-ok-700 text-[11px] font-medium">
                      <CheckIcon className="w-2.5 h-2.5" /> Concluída
                    </span>
                  ) : overdue ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-err-50 text-err-700 text-[11px] font-semibold">
                      <AlertCircleIcon className="w-2.5 h-2.5" /> Atrasada
                    </span>
                  ) : (
                    <span className="text-ink-700 text-[12.5px]">A fazer</span>
                  )}
                </td>
                <td className="px-3.5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <IconBtn onClick={() => onEdit(t)} title="Editar">
                      <PencilIcon className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn onClick={() => onDuplicate(t)} title="Duplicar">
                      <CopyIcon className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn onClick={() => onDelete(t)} title="Excluir" danger>
                      <TrashIcon className="w-3.5 h-3.5" />
                    </IconBtn>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ThSort({
  label,
  k,
  sort,
  arrow,
  onSort,
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: "asc" | "desc" }
  arrow: (k: SortKey) => string
  onSort: (k: SortKey) => void
}) {
  return (
    <th
      onClick={() => onSort(k)}
      className={`px-3.5 py-2.5 text-left cursor-pointer select-none whitespace-nowrap ${
        sort.key === k ? "text-ink-800" : ""
      }`}
    >
      {label}{" "}
      <span
        className={`ml-1 ${sort.key === k ? "text-brand-600 opacity-100" : "text-ink-400 opacity-40"}`}
      >
        {arrow(k)}
      </span>
    </th>
  )
}

function Check({
  checked,
  onClick,
  title,
}: {
  checked: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-4 h-4 rounded border grid place-items-center transition-colors ${
        checked
          ? "bg-ok-500 border-ok-500 text-white"
          : "border-ink-300 bg-white hover:border-ink-500"
      }`}
    >
      {checked && <CheckIcon className="w-2.5 h-2.5" strokeWidth={3} />}
    </button>
  )
}

function IconBtn({
  onClick,
  title,
  children,
  danger,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded-[6px] grid place-items-center border border-ink-200 bg-card text-ink-600 hover:bg-ink-50 ${
        danger ? "hover:border-err-200 hover:text-err-600 hover:bg-err-50" : ""
      }`}
    >
      {children}
    </button>
  )
}
