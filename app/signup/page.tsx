import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export default function SignupPage() {
  const ssoEnabled = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
  return (
    <Suspense>
      <AuthForm mode="signup" ssoEnabled={ssoEnabled} />
    </Suspense>
  );
}
