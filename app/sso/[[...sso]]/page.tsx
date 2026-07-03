import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { ArrowLeft, Fingerprint, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

function safeNext(value?: string): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export default async function SsoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  const bridgeUrl = `/api/auth/clerk/bridge?next=${encodeURIComponent(next)}`;
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#f4f5f1] text-[#151922]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,rgba(21,25,34,.035)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:linear-gradient(to_bottom,#000,transparent_78%)]" />
      <header className="relative border-b border-[#151922] bg-[#f4f5f1]/95 backdrop-blur-md">
        <div className="mx-auto flex h-[63px] max-w-[1180px] items-center px-4 sm:px-6">
          <Link href="/" aria-label="Revive home" className="flex items-center gap-3"><span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span><span className="text-[15px] font-semibold tracking-[-.035em]">Revive</span></Link>
          <div className="ml-auto flex items-center gap-2 font-mono text-[8px] tracking-[.1em] text-[#596273]"><ShieldCheck size={13} weight="bold" className="text-[#2e49c8]" />HOSTED IDENTITY</div>
        </div>
      </header>
      <div className="relative mx-auto grid max-w-[1180px] gap-0 px-4 py-10 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:py-20">
        <section className="border border-[#151922] bg-[#e9ecff] p-7 shadow-[10px_10px_0_#d9ddd6] sm:p-10 lg:flex lg:min-h-[590px] lg:flex-col lg:justify-between">
          <div>
            <div className="font-mono text-[9px] tracking-[.12em] text-[#2e49c8]">COMPANY ACCESS</div>
            <h1 className="mt-5 text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[.92] tracking-[-.065em]">Enter through your identity boundary.</h1>
            <p className="mt-6 max-w-[38ch] text-[12px] leading-6 text-[#5c6573]">Your identity provider completes sign-in. Revive keeps workspace roles and recovery permissions inside the control plane.</p>
          </div>
          <div className="mt-12 border-t border-[#aeb8de] pt-6">
            <div className="flex items-center gap-3 text-[11px] font-semibold"><Fingerprint size={17} weight="bold" className="text-[#2e49c8]" />One identity, one workspace boundary</div>
            <Link href="/login" className="mt-6 inline-flex items-center gap-2 text-[10.5px] font-semibold text-[#2e49c8]"><ArrowLeft size={12} weight="bold" />Use password instead</Link>
          </div>
        </section>
        <section className="flex min-h-[520px] items-center justify-center border border-t-0 border-[#151922] bg-[#fbfcf8] p-5 lg:border-l-0 lg:border-t lg:p-10">
          <SignIn
            path="/sso"
            routing="path"
            forceRedirectUrl={bridgeUrl}
            fallbackRedirectUrl={bridgeUrl}
            appearance={{
              variables: { colorPrimary: "#2e49c8", colorForeground: "#151922", colorBackground: "#fbfcf8", borderRadius: "2px", fontFamily: "var(--font-inter)" },
              elements: {
                rootBox: "w-full max-w-[430px]",
                cardBox: "w-full shadow-none",
                card: "w-full border border-[#c7ccd2] bg-[#fbfcf8] shadow-none",
                headerTitle: "tracking-[-.04em]",
                headerSubtitle: "text-[#66707e]",
                formButtonPrimary: "rounded-none bg-[#151922] text-[11px] hover:bg-[#2b3340]",
                formFieldInput: "rounded-none border-[#bfc5cc] bg-[#f4f5f1]",
                socialButtonsBlockButton: "rounded-none border-[#bfc5cc]",
                footer: "bg-transparent",
              },
            }}
          />
        </section>
      </div>
    </main>
  );
}
