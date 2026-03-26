"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"
import { Plus, Trash2 } from "lucide-react"

interface Category {
  id: string
  name: string
  color: string
  icon: string | null
  isDefault: boolean
  _count: { expenses: number }
}

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState("")
  const [color, setColor] = useState("#6B7280")
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    const res = await fetch("/api/financeiro/despesas/categorias")
    if (res.ok) setCategories(await res.json())
    setLoaded(true)
  }, [])

  useState(() => { loadData() })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/financeiro/despesas/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Categoria criada")
      setName("")
      setColor("#6B7280")
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/financeiro/despesas/categorias/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Categoria excluída")
      loadData()
    } else {
      const err = await res.json()
      toast.error(err.error || "Erro ao excluir")
    }
  }

  if (!loaded) return <div className="text-sm text-muted-foreground">Carregando...</div>

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Categorias de Despesas</h2>

      <form onSubmit={handleCreate} className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Nome</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-md border border-input px-3 py-2 text-sm" placeholder="Nova categoria" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Cor</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded-md border border-input cursor-pointer" />
        </div>
        <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50">
          <Plus className="h-4 w-4" /> Criar
        </button>
      </form>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Cor</th>
              <th className="text-left px-4 py-2 font-medium">Nome</th>
              <th className="text-center px-4 py-2 font-medium">Despesas</th>
              <th className="text-center px-4 py-2 font-medium">Tipo</th>
              <th className="text-right px-4 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories.map((cat) => (
              <tr key={cat.id} className="hover:bg-muted/30">
                <td className="px-4 py-2">
                  <span className="h-4 w-4 rounded-full inline-block" style={{ backgroundColor: cat.color }} />
                </td>
                <td className="px-4 py-2">{cat.name}</td>
                <td className="px-4 py-2 text-center text-muted-foreground">{cat._count.expenses}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cat.isDefault ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                    {cat.isDefault ? "Padrão" : "Personalizada"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="text-xs p-1 rounded text-red-600 hover:bg-red-100"
                    title="Excluir categoria"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
