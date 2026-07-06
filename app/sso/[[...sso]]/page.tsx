import Link from "next/link";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";

function safeNext(value?: string): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export default async function SsoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const clerkEnabled = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
  if (!clerkEnabled) redirect("/login");
  const next = safeNext((await searchParams).next);
  const bridgeUrl = `/api/auth/clerk/bridge?next=${encodeURIComponent(next)}`;
  return (
    <main className="min-h-[100dvh] bg-[#f4f5f1] text-[#151922]">
      <header className="border-b border-[#e0e3dd] bg-[#f7f8f6]">
        <div className="mx-auto flex h-[63px] max-w-[1240px] items-center px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Revive home" className="flex items-center gap-3">
            <span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span>
            <span className="text-[15px] font-semibold tracking-[-.035em]">Revive</span>
          </Link>
        </div>
      </header>
      <div className="flex flex-col items-center px-4 py-14 sm:py-20">
        <SignIn
          path="/sso"
          routing="path"
          signUpUrl={`/sign-up?next=${encodeURIComponent(next)}`}
          forceRedirectUrl={bridgeUrl}
          fallbackRedirectUrl={bridgeUrl}
          appearance={clerkAppearance}
        />
        <div className="mt-6 text-center text-[13px] text-[#66707e]">
          <Link href={`/login?method=password&next=${encodeURIComponent(next)}`} className="font-semibold text-[#151922] underline decoration-[#c7ccd2] underline-offset-4 transition hover:decoration-[#151922]">
            Use email and password instead
          </Link>
        </div>
      </div>
    </main>
  );
}

const clerkAppearance = {
  variables: {
    colorPrimary: "#151922",
    colorForeground: "#151922",
    colorBackground: "#fbfcf8",
    borderRadius: "7px",
    fontFamily: "var(--font-inter)",
  },
  elements: {
    rootBox: "w-full max-w-[420px]",
    cardBox: "w-full shadow-none",
    card: "w-full border border-[#d9ddd6] bg-[#fbfcf8] shadow-none",
    headerTitle: "tracking-[-.03em]",
    headerSubtitle: "text-[#66707e]",
    formButtonPrimary: "bg-[#151922] text-[13px] hover:bg-[#2b3340] shadow-none",
    formFieldInput: "border-[#c9cec7] bg-white",
    socialButtonsBlockButton: "border-[#c9cec7]",
    footer: "bg-transparent",
  },
};
