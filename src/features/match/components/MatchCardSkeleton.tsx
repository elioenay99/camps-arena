import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Espelha o MatchCard 1:1 para evitar layout shift (CLS) durante a carga. */
export function MatchCardSkeleton() {
  return (
    <li aria-hidden="true">
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center gap-4 py-2 sm:gap-6">
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-11 w-10 sm:h-12" />
          </div>
          <Skeleton className="h-7 w-3" />
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-11 w-10 sm:h-12" />
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-10 w-full rounded-full" />
        </CardFooter>
      </Card>
    </li>
  )
}
