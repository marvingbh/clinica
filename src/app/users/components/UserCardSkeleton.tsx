"use client"

import { Card, CardContent } from "@/shared/components/ui/card"
import { Skeleton } from "@/shared/components/ui/skeleton"

export function UserCardSkeleton() {
  return (
    <Card elevation="sm" className="animate-pulse">
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          {/* Avatar Skeleton */}
          <Skeleton className="w-14 h-14 rounded-xl flex-shrink-0" />

          {/* Info Skeleton */}
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function UserGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      aria-busy="true"
      aria-label="Carregando usuários"
    >
      {Array.from({ length: count }).map((_, i) => (
        <UserCardSkeleton key={i} />
      ))}
    </div>
  )
}
