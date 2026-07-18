import { DemoCompetidorView } from "@/features/demo/components/DemoCompetidorView"

export default async function DemoCompetidorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <DemoCompetidorView id={id} />
}
