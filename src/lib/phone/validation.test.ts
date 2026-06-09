import { describe, it, expect } from "vitest"
import {
  phoneRegex,
  normalizePhone,
  isValidPhone,
  formatPhoneInput,
  formatPhoneDisplay,
} from "./validation"

describe("phoneRegex", () => {
  it("accepts Brazilian numbers without country code", () => {
    expect(phoneRegex.test("11999999999")).toBe(true) // 9-digit mobile
    expect(phoneRegex.test("1133334444")).toBe(true) // 8-digit landline
  })

  it("accepts Brazilian numbers with country code", () => {
    expect(phoneRegex.test("5511999999999")).toBe(true)
    expect(phoneRegex.test("+5511999999999")).toBe(true)
  })

  it("accepts international numbers with leading +", () => {
    expect(phoneRegex.test("+4791234567")).toBe(true) // Norway
    expect(phoneRegex.test("+351912345678")).toBe(true) // Portugal
    expect(phoneRegex.test("+12025550123")).toBe(true) // US
  })

  it("rejects international numbers without leading +", () => {
    expect(phoneRegex.test("479123456")).toBe(false) // 9 digits, no +, not BR shape
  })

  it("rejects too-short and too-long numbers", () => {
    expect(phoneRegex.test("119999")).toBe(false)
    expect(phoneRegex.test("+1234567")).toBe(false) // 7 digits after +
    expect(phoneRegex.test("+1234567890123456")).toBe(false) // 16 digits after +
    expect(phoneRegex.test("119999999999999")).toBe(false)
  })

  it("rejects formatted input (validation expects normalized values)", () => {
    expect(phoneRegex.test("(11) 99999-9999")).toBe(false)
  })
})

describe("normalizePhone", () => {
  it("strips Brazilian mask characters", () => {
    expect(normalizePhone("(11) 99999-9999")).toBe("11999999999")
  })

  it("preserves the leading + on international numbers", () => {
    expect(normalizePhone("+47 912 34 567")).toBe("+4791234567")
    expect(normalizePhone(" +351 912-345-678")).toBe("+351912345678")
  })

  it("drops a + that is not leading", () => {
    expect(normalizePhone("11+999999999")).toBe("11999999999")
  })
})

describe("isValidPhone", () => {
  it("accepts masked Brazilian input", () => {
    expect(isValidPhone("(11) 99999-9999")).toBe(true)
  })

  it("accepts spaced international input", () => {
    expect(isValidPhone("+47 912 34 567")).toBe(true)
  })

  it("rejects garbage", () => {
    expect(isValidPhone("abc")).toBe(false)
    expect(isValidPhone("")).toBe(false)
  })
})

describe("formatPhoneInput", () => {
  it("applies the Brazilian mask by default", () => {
    expect(formatPhoneInput("11")).toBe("11")
    expect(formatPhoneInput("119999")).toBe("(11) 9999")
    expect(formatPhoneInput("11999999999")).toBe("(11) 99999-9999")
  })

  it("caps Brazilian input at 11 digits", () => {
    expect(formatPhoneInput("119999999990000")).toBe("(11) 99999-9999")
  })

  it("switches to free entry when input starts with +", () => {
    expect(formatPhoneInput("+47 912 34 567")).toBe("+4791234567")
    expect(formatPhoneInput("+")).toBe("+")
  })

  it("caps international input at 15 digits", () => {
    expect(formatPhoneInput("+1234567890123456789")).toBe("+123456789012345")
  })
})

describe("formatPhoneDisplay", () => {
  it("formats stored Brazilian numbers", () => {
    expect(formatPhoneDisplay("11999999999")).toBe("(11) 99999-9999")
    expect(formatPhoneDisplay("1133334444")).toBe("(11) 3333-4444")
  })

  it("formats Brazilian numbers stored with country code", () => {
    expect(formatPhoneDisplay("5511999999999")).toBe("(11) 99999-9999")
    expect(formatPhoneDisplay("+5511999999999")).toBe("(11) 99999-9999")
  })

  it("passes international numbers through unchanged", () => {
    expect(formatPhoneDisplay("+4791234567")).toBe("+4791234567")
    expect(formatPhoneDisplay("+351912345678")).toBe("+351912345678")
  })

  it("returns unknown shapes unchanged", () => {
    expect(formatPhoneDisplay("12345")).toBe("12345")
  })
})
