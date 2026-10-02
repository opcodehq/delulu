import { Suspense } from "react";
import { ReviewClient } from "@/app/(review)/review/[id]/review-client";

export const dynamic = "force-dynamic";

interface ReviewPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const postId = (await params).id;
  return (
    <Suspense>
      <ReviewClient postId={postId} />
    </Suspense>
  );
}
