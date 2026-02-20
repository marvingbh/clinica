"use client"

interface SessionGenerationPanelProps {
  isGeneratingOpen: boolean
  generateMode: "generate" | "regenerate" | "reschedule"
  generateStartDate: string
  generateEndDate: string
  isGenerating: boolean
  onOpenGenerating: () => void
  onCloseGenerating: () => void
  onModeChange: (mode: "generate" | "regenerate" | "reschedule") => void
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
  onGenerate: () => void
}

export function SessionGenerationPanel({
  isGeneratingOpen,
  generateMode,
  generateStartDate,
  generateEndDate,
  isGenerating,
  onOpenGenerating,
  onCloseGenerating,
  onModeChange,
  onStartDateChange,
  onEndDateChange,
  onGenerate,
}: SessionGenerationPanelProps) {
  return (
    <div className="border border-purple-200 dark:border-purple-800 rounded-lg p-4 bg-purple-50/50 dark:bg-purple-950/30">
      {isGeneratingOpen ? (
        <div className="space-y-4">
          <h4 className="font-medium text-foreground">Gerar Sessões</h4>

          {/* Mode selector */}
          <div className="flex rounded-lg border border-input overflow-hidden">
            <button
              type="button"
              onClick={() => onModeChange("generate")}
              className={`flex-1 h-10 text-sm font-medium transition-colors ${
                generateMode === "generate"
                  ? "bg-purple-600 text-white"
                  : "bg-background text-foreground hover:bg-muted"
              }`}
            >
              Criar Novas
            </button>
            <button
              type="button"
              onClick={() => onModeChange("regenerate")}
              className={`flex-1 h-10 text-sm font-medium transition-colors ${
                generateMode === "regenerate"
                  ? "bg-purple-600 text-white"
                  : "bg-background text-foreground hover:bg-muted"
              }`}
            >
              Atualizar Membros
            </button>
            <button
              type="button"
              onClick={() => onModeChange("reschedule")}
              className={`flex-1 h-10 text-sm font-medium transition-colors ${
                generateMode === "reschedule"
                  ? "bg-purple-600 text-white"
                  : "bg-background text-foreground hover:bg-muted"
              }`}
            >
              Reagendar
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {generateMode === "generate"
              ? "Cria novas sessões no período selecionado."
              : generateMode === "regenerate"
              ? "Adiciona novos membros a todas as sessões futuras já existentes."
              : "Cancela todas as sessões futuras e recria com as configurações atuais do grupo."}
          </p>

          {generateMode === "reschedule" && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              Todas as sessões futuras serão canceladas e recriadas com as configurações atuais do grupo.
            </p>
          )}

          {(generateMode === "generate" || generateMode === "reschedule") && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Data Início</label>
                <input
                  type="date"
                  value={generateStartDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Data Fim</label>
                <input
                  type="date"
                  value={generateEndDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground"
                />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              className="h-10 px-4 rounded-md bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {isGenerating
                ? "Processando..."
                : generateMode === "generate"
                ? "Gerar Sessões"
                : generateMode === "regenerate"
                ? "Atualizar Sessões"
                : "Reagendar Sessões"}
            </button>
            <button
              onClick={onCloseGenerating}
              className="h-10 px-4 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onOpenGenerating}
          className="w-full h-10 rounded-md bg-purple-600 text-white font-medium hover:bg-purple-700"
        >
          Gerar / Atualizar Sessões
        </button>
      )}
    </div>
  )
}
