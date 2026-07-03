import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export default function LoginPage() {
  const ssoEnabled = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
  return (
    <Suspense>
      <AuthForm mode="login" ssoEnabled={ssoEnabled} />
    </Suspense>
  );
}
