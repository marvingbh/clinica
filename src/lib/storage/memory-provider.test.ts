import { describe, it, expect } from "vitest"
import { MemoryStorageProvider } from "./memory-provider"

async function readAll(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

describe("MemoryStorageProvider", () => {
  it("round-trips bytes and mimeType through put/getDownloadStream", async () => {
    const p = new MemoryStorageProvider()
    const bytes = Buffer.from("hello world", "utf8")
    await p.put("clinics/c1/patients/p1/d1-x.pdf", bytes, {
      mimeType: "application/pdf",
    })
    const stream = await p.getDownloadStream("clinics/c1/patients/p1/d1-x.pdf")
    expect(stream).not.toBeNull()
    expect(stream!.mimeType).toBe("application/pdf")
    expect(stream!.sizeBytes).toBe(bytes.byteLength)
    const read = await readAll(stream!.body)
    expect(Buffer.from(read).toString("utf8")).toBe("hello world")
  })

  it("head returns the size", async () => {
    const p = new MemoryStorageProvider()
    await p.put("k", Buffer.from("abcde"), { mimeType: "text/plain" })
    const meta = await p.head("k")
    expect(meta?.sizeBytes).toBe(5)
  })

  it("delete is idempotent", async () => {
    const p = new MemoryStorageProvider()
    await p.put("k", Buffer.from("x"), { mimeType: "text/plain" })
    await expect(p.delete("k")).resolves.toBeUndefined()
    await expect(p.delete("k")).resolves.toBeUndefined()
    expect(await p.head("k")).toBeNull()
  })

  it("list filters by prefix", async () => {
    const p = new MemoryStorageProvider()
    await p.put("clinics/c1/patients/p1/a", Buffer.from("a"), { mimeType: "text/plain" })
    await p.put("clinics/c1/patients/p2/b", Buffer.from("b"), { mimeType: "text/plain" })
    await p.put("clinics/c2/patients/p1/c", Buffer.from("c"), { mimeType: "text/plain" })
    const c1 = await p.list("clinics/c1/")
    expect(c1.map((o) => o.key).sort()).toEqual([
      "clinics/c1/patients/p1/a",
      "clinics/c1/patients/p2/b",
    ])
  })

  it("getDownloadStream returns null for a missing key", async () => {
    const p = new MemoryStorageProvider()
    expect(await p.getDownloadStream("nope")).toBeNull()
  })
})
