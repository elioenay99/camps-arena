import { DemoTorneioView } from "@/features/demo/components/DemoTorneioView"

export default async function DemoTorneioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <DemoTorneioView id={id} />
}
