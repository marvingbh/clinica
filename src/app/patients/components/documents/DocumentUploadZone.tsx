"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Upload, Loader2 } from "lucide-react"
import {
  validateUpload,
  getMaxFileSizeBytes,
  formatBytes,
} from "@/lib/storage"
import {
  CATEGORY_LABELS,
  CATEGORY_VALUES,
  type PatientDocumentCategoryString,
} from "@/lib/patient-documents"

interface Props {
  patientId: string
  onUploaded: () => void
  onQuotaExceeded: (message: string) => void
}

/**
 * Drag-and-drop / file-picker upload zone. Validates type+size on the client
 * (reusing the pure validateUpload) and posts a multipart upload per file with
 * the chosen category / description / share flag. Progress via XHR.
 */
export function DocumentUploadZone({ patientId, onUploaded, onQuotaExceeded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState<PatientDocumentCategoryString>("DOCUMENTO")
  const [description, setDescription] = useState("")
  const [sharedWithPatient, setSharedWithPatient] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const maxSizeBytes = getMaxFileSizeBytes(undefined)

  async function uploadFile(file: File): Promise<boolean> {
    const validation = validateUpload({
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      maxSizeBytes,
    })
    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }

    const form = new FormData()
    form.append("file", file)
    form.append("category", category)
    if (description.trim()) form.append("description", description.trim())
    form.append("sharedWithPatient", String(sharedWithPatient))

    const res = await fetch(`/api/patients/${patientId}/documents`, {
      method: "POST",
      body: form,
    })
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}))
      if (data.code === "STORAGE_QUOTA_EXCEEDED") {
        onQuotaExceeded(data.error ?? "Limite de armazenamento atingido.")
        return false
      }
      toast.error(data.error ?? "Sem permissão para anexar.")
      return false
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? `Falha ao enviar ${file.name}. Tente novamente.`)
      return false
    }
    return true
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    let okCount = 0
    for (const file of Array.from(files)) {
      const ok = await uploadFile(file)
      if (ok) okCount++
    }
    setUploading(false)
    setDescription("")
    if (inputRef.current) inputRef.current.value = ""
    if (okCount > 0) {
      toast.success(okCount === 1 ? "Documento anexado" : `${okCount} documentos anexados`)
      onUploaded()
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-muted-foreground block mb-1">Categoria</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PatientDocumentCategoryString)}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {CATEGORY_VALUES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground block mb-1">Descrição (opcional)</span>
          <input
            type="text"
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            placeholder="Ex.: exame de sangue"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sharedWithPatient}
          onChange={(e) => setSharedWithPatient(e.target.checked)}
        />
        Compartilhar com paciente
        <span className="text-xs text-muted-foreground">
          (visível no portal do paciente quando disponível)
        </span>
      </label>

      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
          dragOver ? "border-blue-500 bg-blue-50" : "border-input hover:bg-muted/50"
        }`}
      >
        {uploading ? (
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        ) : (
          <Upload className="w-6 h-6 text-muted-foreground" />
        )}
        <p className="text-sm text-foreground">
          Arraste arquivos aqui ou clique para selecionar
        </p>
        <p className="text-xs text-muted-foreground">
          PDF, imagens e documentos do Office até {formatBytes(maxSizeBytes)}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  )
}
