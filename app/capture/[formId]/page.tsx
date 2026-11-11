import { Suspense } from "react";
import PublicCaptureForm from "./public-capture-form";

async function CapturePageContent({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  return <PublicCaptureForm publicId={formId} />;
}

export default function CapturePage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm text-slate-500">
          Loading enquiry form…
        </main>
      }
    >
      <CapturePageContent params={params} />
    </Suspense>
  );
}
