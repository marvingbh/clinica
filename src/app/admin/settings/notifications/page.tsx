"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { BottomSheet } from "@/shared/components/ui"
import { usePermission } from "@/shared/hooks/usePermission"

interface TemplateVariable {
  key: string
  label: string
  example: string
}

interface Template {
  type: string
  channel: string
  name: string
  subject: string | null
  content: string
  isCustom: boolean
  isActive: boolean
}

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  APPOINTMENT_CONFIRMATION: "Confirmação de Agendamento",
  APPOINTMENT_REMINDER: "Lembrete de Consulta",
  APPOINTMENT_CANCELLATION: "Cancelamento de Consulta",
  APPOINTMENT_RESCHEDULED: "Reagendamento de Consulta",
  PASSWORD_RESET: "Redefinição de Senha",
  WELCOME: "Boas-Vindas",
}

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
}

export default function NotificationTemplatesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { canRead } = usePermission("notifications")
  const [isLoading, setIsLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [variables, setVariables] = useState<TemplateVariable[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState<{
    subject: string | null
    content: string
  } | null>(null)

  // Edit form state
  const [editName, setEditName] = useState("")
  const [editSubject, setEditSubject] = useState("")
  const [editContent, setEditContent] = useState("")
  const [editIsActive, setEditIsActive] = useState(true)

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/notification-templates")
      if (!response.ok) {
        if (response.status === 403) {
          toast.error("Acesso negado")
          router.push("/")
          return
        }
        throw new Error("Failed to fetch templates")
      }
      const data = await response.json()
      setTemplates(data.templates)
      setVariables(data.variables)
    } catch {
      toast.error("Erro ao carregar templates")
    } finally {
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status === "authenticated") {
      if (!canRead) {
        toast.error("Sem permissao para acessar esta pagina")
        router.push("/")
        return
      }
      fetchTemplates()
    }
  }, [status, canRead, router, fetchTemplates])

  function openEditSheet(template: Template) {
    setSelectedTemplate(template)
    setEditName(template.name)
    setEditSubject(template.subject || "")
    setEditContent(template.content)
    setEditIsActive(template.isActive)
    setIsSheetOpen(true)
  }

  async function handleSave() {
    if (!selectedTemplate) return

    if (!editName.trim()) {
      toast.error("Nome é obrigatório")
      return
    }

    if (!editContent.trim()) {
      toast.error("Conteúdo é obrigatório")
      return
    }

    if (selectedTemplate.channel === "EMAIL" && !editSubject.trim()) {
      toast.error("Assunto é obrigatório para templates de email")
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch("/api/admin/notification-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: selectedTemplate.type,
          channel: selectedTemplate.channel,
          name: editName,
          subject: selectedTemplate.channel === "EMAIL" ? editSubject : null,
          content: editContent,
          isActive: editIsActive,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Falha ao salvar template")
      }

      toast.success("Template salvo com sucesso")
      setIsSheetOpen(false)
      fetchTemplates()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar template")
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePreview() {
    try {
      const response = await fetch("/api/admin/notification-templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editContent,
          subject: selectedTemplate?.channel === "EMAIL" ? editSubject : null,
        }),
      })

      if (!response.ok) {
        throw new Error("Falha ao gerar preview")
      }

      const data = await response.json()
      setPreviewContent(data.preview)
      setIsPreviewOpen(true)
    } catch {
      toast.error("Erro ao gerar preview")
    }
  }

  async function handleReset() {
    if (!selectedTemplate) return

    if (!confirm("Deseja restaurar este template para o padrão? As alterações serão perdidas.")) {
      return
    }

    try {
      const response = await fetch("/api/admin/notification-templates/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: selectedTemplate.type,
          channel: selectedTemplate.channel,
        }),
      })

      if (!response.ok) {
        throw new Error("Falha ao restaurar template")
      }

      toast.success("Template restaurado para o padrão")
      setIsSheetOpen(false)
      fetchTemplates()
    } catch {
      toast.error("Erro ao restaurar template")
    }
  }

  function insertVariable(variable: string) {
    const textarea = document.getElementById("template-content") as HTMLTextAreaElement
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newContent =
        editContent.substring(0, start) + `{{${variable}}}` + editContent.substring(end)
      setEditContent(newContent)
      // Set cursor position after the inserted variable
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + variable.length + 4, start + variable.length + 4)
      }, 0)
    }
  }

  // Group templates by type
  const groupedTemplates = templates.reduce(
    (acc, template) => {
      if (!acc[template.type]) {
        acc[template.type] = []
      }
      acc[template.type].push(template)
      return acc
    },
    {} as Record<string, Template[]>
  )

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-64 bg-muted rounded" />
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-muted rounded" />
              ))}
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Voltar
          </button>
        </div>

        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Templates de Notificação
        </h1>
        <p className="text-muted-foreground mb-8">
          Personalize as mensagens enviadas aos pacientes por WhatsApp e Email.
        </p>

        {/* Templates grouped by type */}
        <div className="space-y-8">
          {Object.entries(groupedTemplates).map(([type, typeTemplates]) => (
            <div key={type} className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-medium text-foreground mb-4">
                {NOTIFICATION_TYPE_LABELS[type] || type}
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {typeTemplates.map((template) => (
                  <button
                    key={`${template.type}-${template.channel}`}
                    onClick={() => openEditSheet(template)}
                    className="text-left p-4 border border-border rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-foreground">
                        {CHANNEL_LABELS[template.channel] || template.channel}
                      </span>
                      <div className="flex items-center gap-2">
                        {template.isCustom && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            Personalizado
                          </span>
                        )}
                        {!template.isActive && (
                          <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">
                            Inativo
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.content.substring(0, 100)}...
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Edit Sheet */}
        <BottomSheet
          isOpen={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          title={selectedTemplate ? `Editar ${selectedTemplate.name}` : "Editar Template"}
        >
          {selectedTemplate && (
            <div className="space-y-6 pb-6">
              {/* Template name */}
              <div>
                <label htmlFor="template-name" className="block text-sm font-medium text-foreground mb-2">
                  Nome do Template
                </label>
                <input
                  id="template-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
              </div>

              {/* Subject (only for email) */}
              {selectedTemplate.channel === "EMAIL" && (
                <div>
                  <label htmlFor="template-subject" className="block text-sm font-medium text-foreground mb-2">
                    Assunto do Email *
                  </label>
                  <input
                    id="template-subject"
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="Ex: Confirmação de Agendamento - {{clinicName}}"
                    className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                  />
                </div>
              )}

              {/* Available variables */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Variáveis Disponíveis
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Clique para inserir no conteúdo
                </p>
                <div className="flex flex-wrap gap-2">
                  {variables.map((variable) => (
                    <button
                      key={variable.key}
                      type="button"
                      onClick={() => insertVariable(variable.key)}
                      className="text-xs px-2 py-1 rounded border border-input bg-muted hover:bg-muted/80 transition-colors"
                      title={`${variable.label} (ex: ${variable.example})`}
                    >
                      {"{{"}
                      {variable.key}
                      {"}}"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content */}
              <div>
                <label htmlFor="template-content" className="block text-sm font-medium text-foreground mb-2">
                  Conteúdo *
                </label>
                <textarea
                  id="template-content"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={12}
                  className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none font-mono text-sm"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <input
                  id="template-active"
                  type="checkbox"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <label htmlFor="template-active" className="text-sm text-foreground">
                  Template ativo
                </label>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handlePreview}
                  className="h-12 px-6 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                >
                  Visualizar Preview
                </button>
                {selectedTemplate.isCustom && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="h-12 px-6 rounded-md border border-destructive/50 bg-background text-destructive font-medium hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                  >
                    Restaurar Padrão
                  </button>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setIsSheetOpen(false)}
                  className="h-12 px-6 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-12 px-6 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {isSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          )}
        </BottomSheet>

        {/* Preview Sheet */}
        <BottomSheet
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          title="Preview do Template"
        >
          {previewContent && (
            <div className="space-y-6 pb-6">
              <div className="bg-muted/50 border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-2">
                  Valores de exemplo para visualização:
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {variables.map((v) => (
                    <li key={v.key}>
                      <span className="font-mono">{`{{${v.key}}}`}</span> = {v.example}
                    </li>
                  ))}
                </ul>
              </div>

              {previewContent.subject && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Assunto
                  </label>
                  <div className="bg-background border border-border rounded-lg p-4">
                    <p className="text-foreground">{previewContent.subject}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Conteúdo
                </label>
                <div className="bg-background border border-border rounded-lg p-4">
                  <pre className="text-foreground whitespace-pre-wrap font-sans text-sm">
                    {previewContent.content}
                  </pre>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="w-full h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
              >
                Fechar
              </button>
            </div>
          )}
        </BottomSheet>
      </div>
    </main>
  )
}
