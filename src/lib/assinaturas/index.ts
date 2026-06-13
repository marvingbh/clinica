// Barrel for the electronic-signature domain module (pure functions only).
// Heavy adapters (evidence-pdf, countersign) are imported by direct path,
// mirroring src/lib/financeiro/invoice-pdf.

export * from "./tokens"
export * from "./otp"
export * from "./hashing"
export * from "./verification-code"
export * from "./cpf"
export * from "./lifecycle"
export * from "./evidence"
export * from "./consent-sync"
export * from "./telepsych"
export * from "./signature-page"
export * from "./serialize"
