import { Radio } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface ActivePage {
  path: string
  activeVisitors: number
}

interface RealtimePageListProps {
  pages: ActivePage[]
}

// Part 7 §7.10 — `analytics/realtime/realtime-page-list.tsx`. Presentational
// (Rule R-04): the page decides what "active" means and passes the rows in.
// An empty `pages` array renders the honest empty state itself, same
// treatment as the dashboard's and reports' breakdown tables.
export function RealtimePageList({ pages }: RealtimePageListProps) {
  if (pages.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Radio />
          </EmptyMedia>
          <EmptyTitle>No active visitors</EmptyTitle>
          <EmptyDescription>
            Pages being viewed right now will show up here within seconds of the first
            event.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Page</TableHead>
          <TableHead className="text-right">Active visitors</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pages.map((page) => (
          <TableRow key={page.path}>
            <TableCell className="max-w-xs truncate font-mono text-xs">{page.path}</TableCell>
            <TableCell className="text-right tabular-nums">{page.activeVisitors}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
