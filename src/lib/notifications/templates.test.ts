import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationTemplate: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"
import {
  renderTemplate,
  getTemplate,
  getTemplatesForClinic,
  previewTemplate,
  DEFAULT_TEMPLATES,
  TEMPLATE_VARIABLES,
} from "./templates"

const mockFindUnique = vi.mocked(prisma.notificationTemplate.findUnique)
const mockFindMany = vi.mocked(prisma.notificationTemplate.findMany)

describe("renderTemplate", () => {
  it("replaces a single variable", () => {
    const result = renderTemplate("Olá, {{patientName}}!", { patientName: "João" })
    expect(result).toBe("Olá, João!")
  })

  it("replaces multiple different variables", () => {
    const result = renderTemplate(
      "{{patientName}} tem consulta em {{date}} às {{time}}",
      { patientName: "Maria", date: "15/04/2026", time: "14:00" }
    )
    expect(result).toBe("Maria tem consulta em 15/04/2026 às 14:00")
  })

  it("replaces the same variable appearing multiple times", () => {
    const result = renderTemplate(
      "{{clinicName}} - Atenciosamente, {{clinicName}}",
      { clinicName: "Clínica Saúde" }
    )
    expect(result).toBe("Clínica Saúde - Atenciosamente, Clínica Saúde")
  })

  it("leaves placeholder intact when variable is not provided", () => {
    const result = renderTemplate("Olá, {{patientName}}! Consulta: {{date}}", {
      patientName: "Ana",
    })
    expect(result).toBe("Olá, Ana! Consulta: {{date}}")
  })

  it("leaves placeholder intact when variable is undefined", () => {
    const result = renderTemplate("Olá, {{patientName}}!", {
      patientName: undefined,
    })
    expect(result).toBe("Olá, {{patientName}}!")
  })

  it("ignores extra variables not present in template", () => {
    const result = renderTemplate("Olá, {{patientName}}!", {
      patientName: "João",
      professionalName: "Dra. Maria",
      date: "10/04/2026",
    })
    expect(result).toBe("Olá, João!")
  })

  it("returns empty string for empty template", () => {
    const result = renderTemplate("", { patientName: "João" })
    expect(result).toBe("")
  })

  it("returns template as-is when variables object is empty", () => {
    const result = renderTemplate("Nenhuma variável aqui", {})
    expect(result).toBe("Nenhuma variável aqui")
  })

  it("returns template as-is when no placeholders exist", () => {
    const result = renderTemplate("Texto sem variáveis.", {
      patientName: "João",
    })
    expect(result).toBe("Texto sem variáveis.")
  })

  it("handles all available template variables at once", () => {
    const template =
      "{{patientName}} {{professionalName}} {{date}} {{time}} {{confirmLink}} {{cancelLink}} {{clinicName}} {{modality}}"
    const result = renderTemplate(template, {
      patientName: "João",
      professionalName: "Dra. Maria",
      date: "15/04/2026",
      time: "14:00",
      confirmLink: "https://confirm",
      cancelLink: "https://cancel",
      clinicName: "Clínica X",
      modality: "Presencial",
    })
    expect(result).toBe(
      "João Dra. Maria 15/04/2026 14:00 https://confirm https://cancel Clínica X Presencial"
    )
  })

  it("handles special regex characters in variable values", () => {
    const result = renderTemplate("Clínica: {{clinicName}}", {
      clinicName: "Saúde & Bem-Estar (Unidade $1)",
    })
    expect(result).toBe("Clínica: Saúde & Bem-Estar (Unidade $1)")
  })

  it("handles multiline templates", () => {
    const template = `Olá, {{patientName}}!

Sua consulta é em {{date}}.

{{clinicName}}`
    const result = renderTemplate(template, {
      patientName: "Carlos",
      date: "20/04/2026",
      clinicName: "Clínica Vida",
    })
    expect(result).toContain("Olá, Carlos!")
    expect(result).toContain("Sua consulta é em 20/04/2026.")
    expect(result).toContain("Clínica Vida")
  })
})

describe("getTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns custom template when one exists and is active", async () => {
    mockFindUnique.mockResolvedValue({
      id: "tmpl-1",
      clinicId: "clinic-1",
      type: "APPOINTMENT_CONFIRMATION",
      channel: "WHATSAPP",
      name: "Custom Confirmation",
      subject: "Custom Subject",
      content: "Custom content {{patientName}}",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await getTemplate(
      "clinic-1",
      "APPOINTMENT_CONFIRMATION",
      "WHATSAPP"
    )

    expect(result).toEqual({
      subject: "Custom Subject",
      content: "Custom content {{patientName}}",
    })
  })

  it("falls back to default template when custom template is inactive", async () => {
    mockFindUnique.mockResolvedValue({
      id: "tmpl-1",
      clinicId: "clinic-1",
      type: "APPOINTMENT_CONFIRMATION",
      channel: "WHATSAPP",
      name: "Inactive Template",
      subject: "Should not appear",
      content: "Should not appear",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await getTemplate(
      "clinic-1",
      "APPOINTMENT_CONFIRMATION",
      "WHATSAPP"
    )

    const defaultTmpl = DEFAULT_TEMPLATES.find(
      (t) => t.type === "APPOINTMENT_CONFIRMATION" && t.channel === "WHATSAPP"
    )!
    expect(result.content).toBe(defaultTmpl.content)
    expect(result.subject).toBe(defaultTmpl.subject)
  })

  it("falls back to default template when no custom template exists", async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = await getTemplate(
      "clinic-1",
      "APPOINTMENT_REMINDER",
      "EMAIL"
    )

    const defaultTmpl = DEFAULT_TEMPLATES.find(
      (t) => t.type === "APPOINTMENT_REMINDER" && t.channel === "EMAIL"
    )!
    expect(result.content).toBe(defaultTmpl.content)
    expect(result.subject).toBe(defaultTmpl.subject)
  })

  it("throws error when no template found for type/channel combination", async () => {
    mockFindUnique.mockResolvedValue(null)

    await expect(
      getTemplate("clinic-1", "WELCOME" as never, "WHATSAPP")
    ).rejects.toThrow("No template found for type WELCOME and channel WHATSAPP")
  })

  it("queries Prisma with correct composite key", async () => {
    mockFindUnique.mockResolvedValue(null)

    await getTemplate(
      "clinic-42",
      "APPOINTMENT_CANCELLATION",
      "EMAIL"
    ).catch(() => {})

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        clinicId_type_channel: {
          clinicId: "clinic-42",
          type: "APPOINTMENT_CANCELLATION",
          channel: "EMAIL",
        },
      },
    })
  })
})

describe("getTemplatesForClinic", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns all default templates when no custom templates exist", async () => {
    mockFindMany.mockResolvedValue([])

    const result = await getTemplatesForClinic("clinic-1")

    expect(result).toHaveLength(DEFAULT_TEMPLATES.length)
    result.forEach((tmpl) => {
      expect(tmpl.isCustom).toBe(false)
      expect(tmpl.isActive).toBe(true)
    })
  })

  it("merges custom template over its default counterpart", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "tmpl-1",
        clinicId: "clinic-1",
        type: "APPOINTMENT_CONFIRMATION",
        channel: "WHATSAPP",
        name: "My Custom Template",
        subject: null,
        content: "Custom WhatsApp content",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never)

    const result = await getTemplatesForClinic("clinic-1")

    const customized = result.find(
      (t) => t.type === "APPOINTMENT_CONFIRMATION" && t.channel === "WHATSAPP"
    )!
    expect(customized.isCustom).toBe(true)
    expect(customized.content).toBe("Custom WhatsApp content")
    expect(customized.name).toBe("My Custom Template")

    // Other templates remain as defaults
    const others = result.filter(
      (t) =>
        !(t.type === "APPOINTMENT_CONFIRMATION" && t.channel === "WHATSAPP")
    )
    others.forEach((t) => expect(t.isCustom).toBe(false))
  })

  it("preserves isActive=false for inactive custom templates", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "tmpl-1",
        clinicId: "clinic-1",
        type: "APPOINTMENT_REMINDER",
        channel: "EMAIL",
        name: "Disabled Reminder",
        subject: "Disabled",
        content: "Disabled content",
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never)

    const result = await getTemplatesForClinic("clinic-1")

    const disabled = result.find(
      (t) => t.type === "APPOINTMENT_REMINDER" && t.channel === "EMAIL"
    )!
    expect(disabled.isCustom).toBe(true)
    expect(disabled.isActive).toBe(false)
  })
})

describe("previewTemplate", () => {
  it("renders content with sample data", () => {
    const result = previewTemplate("Olá, {{patientName}}!", null)
    expect(result.content).toBe("Olá, João Silva!")
    expect(result.subject).toBeNull()
  })

  it("renders subject with sample data when provided", () => {
    const result = previewTemplate(
      "Corpo do email",
      "Consulta - {{clinicName}}"
    )
    expect(result.subject).toBe("Consulta - Clínica Exemplo")
    expect(result.content).toBe("Corpo do email")
  })

  it("replaces all sample variables in a full template", () => {
    const content = "{{patientName}} com {{professionalName}} em {{date}} às {{time}} - {{modality}}"
    const result = previewTemplate(content, null)
    expect(result.content).not.toContain("{{")
    expect(result.content).toContain("João Silva")
    expect(result.content).toContain("Dra. Maria Santos")
    expect(result.content).toContain("15/02/2026")
    expect(result.content).toContain("14:00")
    expect(result.content).toContain("Presencial")
  })
})

describe("DEFAULT_TEMPLATES", () => {
  it("has templates for APPOINTMENT_CONFIRMATION on both channels", () => {
    const whatsapp = DEFAULT_TEMPLATES.find(
      (t) => t.type === "APPOINTMENT_CONFIRMATION" && t.channel === "WHATSAPP"
    )
    const email = DEFAULT_TEMPLATES.find(
      (t) => t.type === "APPOINTMENT_CONFIRMATION" && t.channel === "EMAIL"
    )
    expect(whatsapp).toBeDefined()
    expect(email).toBeDefined()
  })

  it("has templates for APPOINTMENT_REMINDER on both channels", () => {
    const whatsapp = DEFAULT_TEMPLATES.find(
      (t) => t.type === "APPOINTMENT_REMINDER" && t.channel === "WHATSAPP"
    )
    const email = DEFAULT_TEMPLATES.find(
      (t) => t.type === "APPOINTMENT_REMINDER" && t.channel === "EMAIL"
    )
    expect(whatsapp).toBeDefined()
    expect(email).toBeDefined()
  })

  it("has templates for APPOINTMENT_CANCELLATION on both channels", () => {
    const whatsapp = DEFAULT_TEMPLATES.find(
      (t) => t.type === "APPOINTMENT_CANCELLATION" && t.channel === "WHATSAPP"
    )
    const email = DEFAULT_TEMPLATES.find(
      (t) => t.type === "APPOINTMENT_CANCELLATION" && t.channel === "EMAIL"
    )
    expect(whatsapp).toBeDefined()
    expect(email).toBeDefined()
  })

  it("has a template for INTAKE_FORM_SUBMITTED", () => {
    const intake = DEFAULT_TEMPLATES.find(
      (t) => t.type === "INTAKE_FORM_SUBMITTED"
    )
    expect(intake).toBeDefined()
    expect(intake!.channel).toBe("EMAIL")
  })

  it("all templates have non-empty content", () => {
    DEFAULT_TEMPLATES.forEach((tmpl) => {
      expect(tmpl.content.length).toBeGreaterThan(0)
    })
  })

  it("email templates have a subject, whatsapp templates do not", () => {
    DEFAULT_TEMPLATES.forEach((tmpl) => {
      if (tmpl.channel === "EMAIL") {
        expect(tmpl.subject).toBeTruthy()
      } else {
        expect(tmpl.subject).toBeNull()
      }
    })
  })

  it("all templates have a name", () => {
    DEFAULT_TEMPLATES.forEach((tmpl) => {
      expect(tmpl.name.length).toBeGreaterThan(0)
    })
  })
})

describe("TEMPLATE_VARIABLES", () => {
  it("includes all expected variable keys", () => {
    const keys = TEMPLATE_VARIABLES.map((v) => v.key)
    expect(keys).toContain("patientName")
    expect(keys).toContain("professionalName")
    expect(keys).toContain("date")
    expect(keys).toContain("time")
    expect(keys).toContain("confirmLink")
    expect(keys).toContain("cancelLink")
    expect(keys).toContain("clinicName")
    expect(keys).toContain("modality")
  })

  it("each variable has a label and example", () => {
    TEMPLATE_VARIABLES.forEach((v) => {
      expect(v.label.length).toBeGreaterThan(0)
      expect(v.example.length).toBeGreaterThan(0)
    })
  })
})
