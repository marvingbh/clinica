export function Loading() {
  return <div className="animate-pulse text-muted-foreground py-8 text-center">Carregando...</div>
}

export function ErrorState() {
  return (
    <div className="text-destructive py-8 text-center">
      Não foi possível carregar o relatório. Tente novamente.
    </div>
  )
}
