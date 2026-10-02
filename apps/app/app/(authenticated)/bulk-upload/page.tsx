import { Suspense } from "react";
import { BulkUploadPage } from "@/features/publishing/bulk-upload/bulk-upload-page";

export const dynamic = "force-dynamic";

export default function BulkUploadRoute() {
  return (
    <Suspense>
      <BulkUploadPage />
    </Suspense>
  );
}
