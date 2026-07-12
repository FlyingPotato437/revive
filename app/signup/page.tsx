import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";

function safeNext(value?: string): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app/quickstart";
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; method?: string }>;
}) {
  const params = await searchParams;
  const ssoEnabled = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
  if (ssoEnabled && params.method !== "password") {
    redirect(`/sign-up?next=${encodeURIComponent(safeNext(params.next))}`);
  }
  return (
    <Suspense>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
