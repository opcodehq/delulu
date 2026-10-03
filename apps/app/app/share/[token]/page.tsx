import type { Metadata } from "next";
import { SharedPostPage } from "@/features/sharing/shared-post-page";

export const dynamic = "force-dynamic";

// Share links carry a private token: keep them out of search engines and
// don't leak the URL to other sites through the Referer header.
export const metadata: Metadata = {
  title: "Post preview · Delulu",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  return <SharedPostPage token={token} />;
}
