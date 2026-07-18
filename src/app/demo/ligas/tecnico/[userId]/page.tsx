import { DemoTecnicoView } from "@/features/demo/components/DemoTecnicoView"

export default async function DemoTecnicoPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  return <DemoTecnicoView id={userId} />
}
