import { DemoCopaView } from "@/features/demo/components/DemoCopaView"

export default async function DemoCopaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <DemoCopaView id={id} />
}
