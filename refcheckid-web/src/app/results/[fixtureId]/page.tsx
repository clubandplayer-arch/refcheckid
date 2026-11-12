import { PublicGamePage } from "@/features/public-results/portal";
export default async function ResultPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  return <PublicGamePage fixtureId={(await params).fixtureId} />;
}
