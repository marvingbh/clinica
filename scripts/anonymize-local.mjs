/**
 * Anonymize the LOCAL dev database for screenshots/demos (LGPD-safe).
 *
 * Replaces names + visible contact PII (patients, clinics, professionals/users,
 * groups) with deterministic fake data. Keeps all relationships, counts, dates
 * and amounts intact so the UI still looks realistic.
 *
 * SAFETY: refuses to run unless DATABASE_URL points at a localhost dev database.
 * Preserves the admin@x.com login (email + password) so capture scripts work.
 *
 * Run: node scripts/anonymize-local.mjs
 */
import { PrismaClient } from "@prisma/client"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
if (!process.env.DATABASE_URL) {
  const m = readFileSync(join(root, ".env"), "utf8").match(/^DATABASE_URL=(.*)$/m)
  if (m) process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, "")
}
const url = process.env.DATABASE_URL || ""
if (!/@(localhost|127\.0\.0\.1):/.test(url) || /neon|amazonaws|render|prod/i.test(url)) {
  console.error("ABORTED: DATABASE_URL is not a localhost dev database. This script never touches remote/prod data.")
  process.exit(1)
}

const FIRST = ["Ana","Beatriz","Camila","Daniela","Eduarda","Fernanda","Gabriela","Helena","Isabela","Juliana","Larissa","Mariana","Natalia","Patricia","Renata","Sofia","Tatiana","Vanessa","Yara","Bruno","Carlos","Daniel","Eduardo","Felipe","Gustavo","Henrique","Igor","Joao","Lucas","Marcelo","Rafael","Thiago","Vinicius","Rodrigo","Andre","Paulo","Ricardo","Fabio","Leonardo","Murilo"]
const LAST = ["Almeida","Barbosa","Cardoso","Dias","Esteves","Ferreira","Gomes","Henriques","Junqueira","Klein","Lima","Macedo","Nogueira","Oliveira","Pereira","Queiroz","Ribeiro","Santos","Teixeira","Vieira","Xavier","Zanetti","Costa","Moraes","Pinto","Rocha","Tavares","Bittencourt","Camargo","Fontes"]
const GROUPS = ["Grupo de Ansiedade","Grupo de Habilidades Sociais","Grupo de Apoio Parental","Grupo de Luto","Grupo de Mindfulness","Grupo de Adolescentes","Grupo de Casais","Grupo de Autoestima","Grupo de Manejo do Estresse","Grupo de Bem-Estar"]
const CLINICS = ["Clinica Bem-Estar","Espaco Saude Integral","Instituto Vida Plena","Centro Equilibrio"]
const STREETS = ["Rua das Acacias","Avenida das Palmeiras","Rua dos Ipes","Alameda dos Jacarandas","Rua das Hortensias"]
const CITIES = [["Sao Paulo","SP","01310-100"],["Campinas","SP","13010-001"],["Rio de Janeiro","RJ","20040-002"],["Belo Horizonte","MG","30110-001"]]

const pick = (a, i) => a[((i % a.length) + a.length) % a.length]
const fullName = (i) => `${pick(FIRST, i)} ${pick(LAST, i * 13 + 7)}`
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
const phone = (seed) => `(11) 9${String(90000 + (seed * 131 % 9999)).slice(0, 4)}-${String(1000 + (seed * 37 % 8999)).slice(0, 4)}`
function cpf(seed) {
  const n = []
  for (let k = 0; k < 9; k++) n.push((seed * 7 + k * 3 + 1) % 10)
  const dv = (arr) => { let s = 0; for (let k = 0; k < arr.length; k++) s += arr[k] * (arr.length + 1 - k); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  n.push(dv(n)); n.push(dv(n))
  return n.join("").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
}

const prisma = new PrismaClient()

const clinics = await prisma.clinic.findMany({ orderBy: { createdAt: "asc" } })
for (let i = 0; i < clinics.length; i++) {
  const name = pick(CLINICS, i), slug = slugify(name), c = clinics[i]
  await prisma.clinic.update({ where: { id: c.id }, data: {
    name, slug,
    email: c.email ? `contato@${slug}.com.br` : c.email,
    phone: c.phone ? phone(i + 1) : c.phone,
    address: c.address ? `${pick(STREETS, i)}, ${100 + i * 7} - ${pick(CITIES, i)[0]}/${pick(CITIES, i)[1]}` : c.address,
    emailSenderName: c.emailSenderName ? name : c.emailSenderName,
    emailFromAddress: c.emailFromAddress ? `naoresponda@${slug}.com.br` : c.emailFromAddress,
    emailBcc: null,
    paymentInfo: c.paymentInfo ? `PIX: contato@${slug}.com.br` : c.paymentInfo,
  } })
}

const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } })
for (let i = 0; i < users.length; i++) {
  const u = users[i], name = fullName(i * 3 + 2)
  const data = { name }
  if (u.email !== "admin@x.com") data.email = `${slugify(name)}.${i}@exemplo.com.br`
  await prisma.user.update({ where: { id: u.id }, data })
}

const profs = await prisma.professionalProfile.findMany({ include: { user: true } })
for (let i = 0; i < profs.length; i++) {
  const pr = profs[i]
  await prisma.professionalProfile.update({ where: { id: pr.id }, data: {
    registrationNumber: pr.registrationNumber ? `CRP 06/${10000 + i * 137}` : pr.registrationNumber,
    cpf: pr.cpf ? cpf(500 + i) : pr.cpf,
    publicBookingSlug: pr.publicBookingSlug ? `${slugify(pr.user.name)}-${i}` : pr.publicBookingSlug,
    bio: pr.bio ? "Profissional da clinica." : pr.bio,
  } })
}

const patients = await prisma.patient.findMany({ orderBy: { createdAt: "asc" } })
for (let i = 0; i < patients.length; i++) {
  const p = patients[i], name = fullName(i), city = pick(CITIES, i)
  await prisma.patient.update({ where: { id: p.id }, data: {
    name,
    email: p.email ? `${slugify(name)}.${i}@exemplo.com.br` : p.email,
    phone: phone(i + 10),
    cpf: p.cpf ? cpf(i + 100) : p.cpf,
    billingCpf: p.billingCpf ? cpf(i + 4000) : p.billingCpf,
    billingResponsibleName: p.billingResponsibleName ? fullName(i + 500) : p.billingResponsibleName,
    fatherName: p.fatherName ? fullName(i + 600) : p.fatherName,
    motherName: p.motherName ? fullName(i + 700) : p.motherName,
    motherPhone: p.motherPhone ? phone(i + 2000) : p.motherPhone,
    fatherPhone: p.fatherPhone ? phone(i + 3000) : p.fatherPhone,
    schoolName: p.schoolName ? "Escola Modelo" : p.schoolName,
    addressStreet: p.addressStreet ? pick(STREETS, i) : p.addressStreet,
    addressNumber: p.addressNumber ? String(100 + i) : p.addressNumber,
    addressNeighborhood: p.addressNeighborhood ? "Centro" : p.addressNeighborhood,
    addressCity: p.addressCity ? city[0] : p.addressCity,
    addressState: p.addressState ? city[1] : p.addressState,
    addressZip: p.addressZip ? city[2] : p.addressZip,
    notes: p.notes ? "" : p.notes,
    therapeuticProject: p.therapeuticProject ? "Projeto terapeutico (exemplo)." : p.therapeuticProject,
    referralSourceDetail: p.referralSourceDetail ? "Indicacao" : p.referralSourceDetail,
    nfseObs: p.nfseObs ? "" : p.nfseObs,
  } })
}

const phones = await prisma.patientPhone.findMany()
for (let i = 0; i < phones.length; i++) {
  await prisma.patientPhone.update({ where: { id: phones[i].id }, data: { phone: phone(i + 5000) } })
}

const groups = await prisma.therapyGroup.findMany({ orderBy: { createdAt: "asc" } })
for (let i = 0; i < groups.length; i++) {
  await prisma.therapyGroup.update({ where: { id: groups[i].id }, data: { name: pick(GROUPS, i) } })
}

const adminClinic = await prisma.user.findFirst({ where: { email: "admin@x.com" }, select: { clinic: { select: { name: true, slug: true } } } })
console.log(`Anonymized: ${clinics.length} clinics, ${users.length} users, ${profs.length} professionals, ${patients.length} patients, ${phones.length} phones, ${groups.length} groups.`)
console.log(`ADMIN_CLINIC_NAME=${adminClinic?.clinic?.name}`)
console.log(`ADMIN_CLINIC_SLUG=${adminClinic?.clinic?.slug}`)
await prisma.$disconnect()
