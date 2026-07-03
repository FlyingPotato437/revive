import type { Metadata } from "next";
import { LegalShell, Section } from "../legal/LegalShell";

export const metadata: Metadata = {
  title: "Privacy Policy | Revive",
  description: "How Revive collects, uses, and protects data across the agent recovery control plane.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="JULY 3, 2026"
      intro="This Privacy Policy explains how Revive Labs (“Revive”, “we”, “us”) collects, uses, and protects information when you use the Revive control plane, APIs, SDKs, and websites (the “Service”). Revive is designed to coordinate workflow recovery without taking custody of your provider tokens: token custody stays with your configured credential system."
    >
      <Section heading="1. Information we collect">
        <p>
          <strong>Account data:</strong> the email, name, and organization you provide when you sign up, and
          authentication metadata from our identity provider (Clerk) when you use hosted sign-in. We store a salted hash
          of passwords for email/password accounts, never the password itself.
        </p>
        <p>
          <strong>Connection metadata:</strong> for each credential connection you create, we store the provider, the
          connection identifier held by your vault, and the creation-time identity binding (subject and tenant) that we
          verify during recovery. We do not store your provider access or refresh tokens; those remain with your
          credential vault.
        </p>
        <p>
          <strong>Operational records:</strong> recovery cases, action ledger entries, idempotency keys, lease
          generations, and an append-only audit log of control-plane events. These describe what happened to a run, not
          the contents of your provider data.
        </p>
        <p>
          <strong>Billing data:</strong> plan and subscription state, and a customer identifier from our payment
          processor (Stripe). Card details are handled by Stripe; Revive does not receive or store full card numbers.
        </p>
        <p>
          <strong>Technical data:</strong> logs, IP addresses, and diagnostic information generated when you use the
          Service, used for security, rate limiting, and debugging.
        </p>
      </Section>

      <Section heading="2. How we use information">
        <p>
          We use information to provide and operate the Service (verify identity during recovery, coordinate and resume
          runs, prevent duplicate side effects), to secure the Service, to process billing, to communicate with you about
          your account, and to comply with legal obligations. We do not sell your personal information.
        </p>
      </Section>

      <Section heading="3. Sub-processors and sharing">
        <p>
          We share data with service providers that help us run the Service, under contractual confidentiality and
          data-protection obligations. Current categories include: hosting and compute (Vercel), managed database
          (Neon/Postgres), authentication (Clerk), credential custody (Nango and, where you configure it, Auth0),
          payments (Stripe), and, if you enable them, notifications (Slack, and email via Resend). We may disclose
          information if required by law or to protect the rights, safety, and security of Revive and its users.
        </p>
      </Section>

      <Section heading="4. Data retention">
        <p>
          We retain account and operational data for as long as your account is active and as needed to provide the
          Service, then delete or anonymize it within a reasonable period unless a longer period is required by law.
          Audit logs may be retained longer for security and compliance. You can request deletion as described below.
        </p>
      </Section>

      <Section heading="5. Security">
        <p>
          We use tenant isolation with row-level security, encrypted secrets at rest, constant-time credential checks,
          API-key hashing, and rate limiting. No system is perfectly secure; we work to protect your data and to notify
          affected users of incidents as required by law.
        </p>
      </Section>

      <Section heading="6. Your rights">
        <p>
          Depending on your location, you may have rights to access, correct, export, or delete your personal data, and
          to object to or restrict certain processing. To exercise these rights, contact us at
          founders@revivelabs.app. We will respond within the timeframe required by applicable law. If you are in the
          EEA or UK, our legal bases for processing are performance of our contract with you, our legitimate interests in
          operating and securing the Service, and compliance with legal obligations.
        </p>
      </Section>

      <Section heading="7. International transfers">
        <p>
          We may process and store data in the United States and other countries. Where required, we rely on appropriate
          safeguards for cross-border transfers.
        </p>
      </Section>

      <Section heading="8. Children">
        <p>The Service is not directed to children under 16, and we do not knowingly collect their personal data.</p>
      </Section>

      <Section heading="9. Changes and contact">
        <p>
          We may update this Policy; material changes will be posted here with a new date and, where appropriate,
          additional notice. Questions or requests: founders@revivelabs.app.
        </p>
      </Section>
    </LegalShell>
  );
}
