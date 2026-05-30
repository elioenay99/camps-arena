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
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="flex items-center justify-center gap-4 py-2">
          <Skeleton className="h-9 w-10" />
          <Skeleton className="h-6 w-3" />
          <Skeleton className="h-9 w-10" />
        </CardContent>
        <CardFooter>
          <Skeleton className="h-10 w-full rounded-full" />
        </CardFooter>
      </Card>
    </li>
  )
}
