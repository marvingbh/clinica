import { TeleconsultaFlow } from "../components/TeleconsultaFlow"

export const metadata = {
  title: "Teleconsulta",
}

export default async function TeleconsultaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <div className="min-h-screen bg-muted/30">
      <TeleconsultaFlow token={token} />
    </div>
  )
}
