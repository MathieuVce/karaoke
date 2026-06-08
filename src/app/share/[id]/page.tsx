import ShareFollower from "@/components/ShareFollower";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShareFollower sessionId={id} />;
}
