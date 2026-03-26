import { describe, it, expect } from "vitest"
import { ofxParser } from "./ofx-parser"

describe("ofxParser", () => {
  it("parses XML-style OFX transactions", () => {
    const ofx = `
      <OFX>
        <BANKMSGSRSV1>
          <STMTTRNRS>
            <STMTRS>
              <BANKTRANLIST>
                <STMTTRN>
                  <TRNAMT>-500.00</TRNAMT>
                  <DTPOSTED>20260315</DTPOSTED>
                  <FITID>ABC123</FITID>
                  <NAME>COPEL ENERGIA</NAME>
                  <MEMO>PAG ENERGIA</MEMO>
                </STMTTRN>
                <STMTTRN>
                  <TRNAMT>1500.00</TRNAMT>
                  <DTPOSTED>20260316120000</DTPOSTED>
                  <FITID>DEF456</FITID>
                  <NAME>JOAO SILVA</NAME>
                </STMTTRN>
              </BANKTRANLIST>
            </STMTRS>
          </STMTTRNRS>
        </BANKMSGSRSV1>
      </OFX>
    `

    const result = ofxParser.parse(ofx)
    expect(result).toHaveLength(2)

    expect(result[0].externalId).toBe("ABC123")
    expect(result[0].date).toBe("2026-03-15")
    expect(result[0].amount).toBe(500)
    expect(result[0].type).toBe("DEBIT")
    expect(result[0].description).toBe("COPEL ENERGIA - PAG ENERGIA")

    expect(result[1].externalId).toBe("DEF456")
    expect(result[1].date).toBe("2026-03-16")
    expect(result[1].amount).toBe(1500)
    expect(result[1].type).toBe("CREDIT")
  })

  it("generates hash-based externalId when FITID is missing", () => {
    const ofx = `
      <STMTTRN>
        <TRNAMT>-100.00</TRNAMT>
        <DTPOSTED>20260301</DTPOSTED>
        <NAME>PIX ENVIO</NAME>
      </STMTTRN>
    `
    const result = ofxParser.parse(ofx)
    expect(result).toHaveLength(1)
    expect(result[0].externalId).toHaveLength(16)
  })

  it("returns empty array for invalid OFX", () => {
    expect(ofxParser.parse("not an ofx file")).toEqual([])
  })

  it("skips transactions without amount or date", () => {
    const ofx = `
      <STMTTRN><TRNAMT>100</TRNAMT></STMTTRN>
      <STMTTRN><DTPOSTED>20260301</DTPOSTED></STMTTRN>
    `
    const result = ofxParser.parse(ofx)
    expect(result).toHaveLength(0)
  })
})
