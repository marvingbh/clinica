export interface NormalizedTransaction {
  externalId: string
  date: string        // YYYY-MM-DD
  amount: number      // always positive
  type: "CREDIT" | "DEBIT"
  description: string
  payerName?: string
  reference?: string
}

export interface BankStatementProvider {
  parse(data: string): NormalizedTransaction[]
}

export interface CsvParseOptions {
  dateColumn: number
  amountColumn: number
  descriptionColumn: number
  delimiter?: string
  skipHeader?: boolean
  dateFormat?: "DD/MM/YYYY" | "YYYY-MM-DD"
}
