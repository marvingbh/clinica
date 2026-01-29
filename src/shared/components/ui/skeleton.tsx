"use client"

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-muted rounded ${className}`}
      aria-hidden="true"
    />
  )
}

export function SkeletonText({
  lines = 1,
  className = "",
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"}`}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`bg-card border border-border rounded-lg p-4 ${className}`}
      aria-hidden="true"
    >
      <div className="animate-pulse space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}

export function SkeletonTimeSlot({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`flex items-stretch gap-3 min-h-[4rem] ${className}`}
      aria-hidden="true"
    >
      <div className="w-14 flex-shrink-0">
        <Skeleton className="h-5 w-12" />
      </div>
      <div className="flex-1">
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  )
}

export function SkeletonAgenda() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Carregando agenda">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonTimeSlot key={i} />
      ))}
    </div>
  )
}

export function SkeletonList({ items = 3 }: { items?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando lista">
      {Array.from({ length: items }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonPage() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando pagina">
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-4">
        <Skeleton className="h-12 flex-1" />
        <Skeleton className="h-12 w-32" />
      </div>
      <SkeletonList items={3} />
    </div>
  )
}

export function SkeletonForm() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando formulario">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
      <div className="flex gap-3 pt-4">
        <Skeleton className="h-12 flex-1" />
        <Skeleton className="h-12 w-32" />
      </div>
    </div>
  )
}
