"use client"

import { useParams } from "next/navigation"
import { FormEditor } from "../components/FormEditor"

export default function FormTemplateEditorPage() {
  const params = useParams<{ id: string }>()
  // key resets all editor state when navigating between templates.
  return <FormEditor key={params.id} templateId={params.id} />
}
