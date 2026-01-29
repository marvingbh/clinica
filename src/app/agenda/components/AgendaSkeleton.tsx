"use client"

import { Card, CardContent } from "@/shared/components/ui/card"
import { Skeleton } from "@/shared/components/ui/skeleton"
import { AppointmentCardSkeleton } from "./AppointmentCard"

export function AgendaHeaderSkeleton() {
  return (
    <div className="bg-gradient-to-br from-primary/5 via-background to-background">
      {/* Title Section Skeleton */}
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-10 w-24 rounded-xl" />
        </div>
      </div>

      {/* Week Day Picker Skeleton */}
      <div className="max-w-4xl mx-auto px-4 pb-4">
        <Card elevation="md" className="overflow-hidden">
          <CardContent className="py-3 px-2">
            <div className="flex items-center gap-1">
              <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
              <div className="flex-1 flex justify-center gap-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="w-[44px] h-[60px] rounded-xl" />
                ))}
              </div>
              <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
            </div>
            <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-border">
              <Skeleton className="h-8 w-14 rounded-lg" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Professional Tabs Skeleton */}
      <div className="max-w-4xl mx-auto px-4 pb-4">
        <div className="flex gap-2">
          <Skeleton className="h-10 w-16 rounded-xl" />
          <Skeleton className="h-10 w-24 rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export function AgendaTimelineSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Swipe hint skeleton */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <Skeleton className="w-8 h-0.5 rounded-full" />
        <Skeleton className="w-32 h-3 rounded" />
        <Skeleton className="w-8 h-0.5 rounded-full" />
      </div>

      {/* Timeline items skeleton */}
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-stretch min-h-[4.5rem]">
            {/* Time label skeleton */}
            <div className="w-16 flex-shrink-0 flex flex-col items-end pr-3">
              <Skeleton className="h-5 w-10" />
            </div>

            {/* Timeline connector skeleton */}
            <div className="w-px flex-shrink-0 relative">
              <div className="absolute top-0 bottom-0 w-px bg-border" />
              <Skeleton className="absolute top-3 -left-1 w-2.5 h-2.5 rounded-full" />
            </div>

            {/* Content skeleton */}
            <div className="flex-1 pl-4 pb-2">
              {index % 3 === 0 ? (
                <AppointmentCardSkeleton />
              ) : (
                <Skeleton className="h-[3rem] w-full rounded-xl" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AgendaPageSkeleton() {
  return (
    <main className="min-h-screen bg-background pb-20">
      <AgendaHeaderSkeleton />
      <AgendaTimelineSkeleton />
    </main>
  )
}
