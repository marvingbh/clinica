import { XMLBuilder } from "fast-xml-parser"
import type { NfseEmissionData } from "./types"

// ============================================================================
// Constants
// ============================================================================

const DPS_NAMESPACE = "http://www.sped.fazenda.gov.br/nfse"
const DPS_VERSION = "1.00"
const VER_APLIC = "CLINICA1.0"
const XNOME_MAX_LENGTH = 40
const XDESCSERV_MAX_LENGTH = 2000
const PAIS_BRASIL = "BR"

// ============================================================================
// Types
// ============================================================================

export interface DpsBuildConfig {
  codigoMunicipio: string
  serie?: string
  numero?: number
  tpAmb?: 1 | 2
}

// ============================================================================
// Helpers
// ============================================================================

function formatDecimal(value: number, decimals = 2): string {
  return value.toFixed(decimals)
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function buildIdAttribute(
  codigoMunicipio: string,
  cnpj: string,
  serie: string,
  numero: number
): string {
  // DPS (3) + codigoMunicipio (7) + tipoInscricao (1) + CNPJ (14) + serie (5) + numero (15) = 45 chars
  const paddedSerie = serie.padStart(5, "0").slice(0, 5)
  const paddedNumero = String(numero).padStart(15, "0")
  return `DPS${codigoMunicipio}2${cnpj}${paddedSerie}${paddedNumero}`
}

function formatBrazilIso8601(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-03:00`
}

// ============================================================================
// Builder
// ============================================================================

export function buildDpsXml(
  data: NfseEmissionData,
  config: DpsBuildConfig
): string {
  const serie = config.serie ?? "1"
  const numero = config.numero ?? 1
  const tpAmb = config.tpAmb ?? 2

  const id = buildIdAttribute(
    config.codigoMunicipio,
    data.prestadorCnpj,
    serie,
    numero
  )

  const vISSQN = (data.valor * data.aliquotaIss) / 100

  // dCompet = competency month (YYYY-MM) — use current month
  const now = new Date()
  const dCompet = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

  // XSD order: tpAmb, dhEmi, verAplic, serie, nDPS, dCompet, tpEmit, prest, toma, interm, serv, valores
  const dpsObj = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    DPS: {
      "@_xmlns": DPS_NAMESPACE,
      "@_versao": DPS_VERSION,
      infDPS: {
        "@_Id": id,
        tpAmb: tpAmb,
        dhEmi: formatBrazilIso8601(now),
        verAplic: VER_APLIC,
        serie: serie,
        nDPS: numero,
        dCompet: dCompet,
        tpEmit: 1, // 1 = Prestador
        cLocEmi: config.codigoMunicipio, // Required: IBGE code of emission location
        prest: {
          CNPJ: data.prestadorCnpj,
          // xNome not allowed when tpEmit=1 (prestador is the emitter) — E0121
          // IM not sent — E0120 (BH has no CNC complementary data)
          regTrib: {
            opSimpNac: data.prestadorOpSimpNac, // 1=optante SN, 2=nao optante. Configurable per clinic.
            regEspTrib: 0, // 0 = Nenhum regime especial
          },
        },
        toma: {
          CPF: data.tomadorCpf,
          xNome: truncate(data.tomadorNome, XNOME_MAX_LENGTH),
          end: {
            endNac: {
              cMun: data.tomadorCodigoMunicipio || config.codigoMunicipio,
              CEP: (data.tomadorCep || "00000000").replace(/\D/g, ""),
            },
            xLgr: data.tomadorLogradouro || "Nao informado",
            nro: data.tomadorNumero || "SN",
            xBairro: data.tomadorBairro || "Nao informado",
          },
        },
        serv: {
          locPrest: {
            cLocPrestacao: config.codigoMunicipio,
          },
          cServ: {
            cTribNac: data.codigoServico.replace(/\D/g, "").slice(0, 6),
            ...(data.codigoServicoMunicipal ? { cTribMun: data.codigoServicoMunicipal } : {}),
            xDescServ: truncate(data.descricao, XDESCSERV_MAX_LENGTH),
            ...(data.codigoNbs ? { cNBS: data.codigoNbs } : {}),
          },
        },
        valores: {
          vServPrest: {
            vServ: formatDecimal(data.valor),
          },
          trib: {
            tribMun: {
              tribISSQN: 1,
              tpRetISSQN: 1,
              // opSimpNac: 1=Nao Optante, 2=MEI, 3=ME/EPP
              // pAliq only sent for SN optantes (2 or 3). Nao optante (1) with active municipality = municipality determines aliquota.
              ...(data.prestadorOpSimpNac > 1 ? { pAliq: formatDecimal(data.aliquotaIss) } : {}),
            },
            totTrib: data.prestadorOpSimpNac > 1
              ? { indTotTrib: 0 }
              : { vTotTrib: { vTotTribFed: formatDecimal(0), vTotTribEst: formatDecimal(0), vTotTribMun: formatDecimal(0) } },
          },
        },
      },
    },
  }

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    suppressEmptyNode: true,
    processEntities: false,
  })

  return builder.build(dpsObj)
}
