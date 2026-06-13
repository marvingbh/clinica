import { ScaleFillForm } from "./scale-fill-form"

/**
 * Public, mobile-first scale-fill page. No app header, no auth. The client
 * component fetches the public route by token and handles autosave/submit.
 */
export default async function EscalaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <main className="min-h-screen bg-gray-50">
      <ScaleFillForm token={token} />
    </main>
  )
}
