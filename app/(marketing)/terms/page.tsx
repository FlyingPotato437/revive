import type { Metadata } from "next";
import { LegalShell, Section } from "../legal/LegalShell";

export const metadata: Metadata = {
  title: "Terms of Service | Revive",
  description: "The terms that govern use of the Revive user-action and continuation layer.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="JULY 11, 2026"
      intro="These Terms of Service (“Terms”) govern your access to and use of the Revive control plane, APIs, SDKs, and websites (the “Service”), operated by Revive Labs (“Revive”, “we”, “us”). By creating an account, connecting a credential, or otherwise using the Service, you agree to these Terms. If you use the Service on behalf of an organization, you represent that you are authorized to bind that organization."
    >
      <Section heading="1. The Service">
        <p>
          Revive detects automated runs that terminate at human-dependent blockers, classifies the blocker, creates a
          secure action request for a recipient selected by the customer, validates the structured response, and sends a
          continuation signal for the original run. Action types may include reauthorization, clarification, approval,
          verification, permission, document collection, and browser handoff. Revive does not take custody of provider
          tokens; token custody remains with your configured credential system (for example Nango, Auth0, or Microsoft
          Entra).
        </p>
        <p>
          The Service is provided for legitimate operation of your own workflows and the accounts you are authorized to
          act on. You are responsible for having the rights and consents necessary for every account and system you
          connect.
        </p>
      </Section>

      <Section heading="2. Accounts and access">
        <p>
          You must provide accurate registration information and keep your credentials, API keys, and workspace access
          secure. You are responsible for all activity under your account and API keys. Notify us promptly at
          founders@revivelabs.app if you suspect unauthorized use. We may suspend access that we reasonably believe is
          compromised or violates these Terms.
        </p>
      </Section>

      <Section heading="3. Acceptable use">
        <p>You agree not to:</p>
        <p>
          (a) use the Service to access systems or accounts you are not authorized to use; (b) attempt to defeat the
          Service’s identity verification, generation fencing, or reconciliation controls; (c) reverse engineer, resell,
          or provide the Service to third parties except as expressly permitted; (d) interfere with or overload the
          Service, or circumvent rate limits; or (e) use the Service to violate law or the terms of any provider you
          connect.
        </p>
      </Section>

      <Section heading="4. Plans, fees, and billing">
        <p>
          Paid plans are billed in advance through our payment processor (Stripe) on a recurring basis until cancelled.
          Some plans may also include usage fees for completed resolution actions, as stated at purchase. Fees are stated
          at the time of purchase and are non-refundable except where required by law. We may change prices on renewal
          with notice. Taxes are your responsibility unless we are required to collect them. You can cancel at any time
          through the billing portal; cancellation takes effect at the end of the current billing period.
        </p>
      </Section>

      <Section heading="5. Your data and connected systems">
        <p>
          You retain all rights to the data you submit and to the accounts you connect. You grant Revive a limited
          license to process that data solely to provide the Service. Our handling of personal data is described in the
          <a href="/privacy"> Privacy Policy</a>, which forms part of these Terms.
        </p>
      </Section>

      <Section heading="6. Service availability and changes">
        <p>
          We work to keep the Service available and reliable but do not guarantee uninterrupted operation. We may modify,
          suspend, or discontinue features, and will use reasonable efforts to give notice of material changes. The
          Service is under active development; some capabilities are labeled as previews and may change.
        </p>
      </Section>

      <Section heading="7. Disclaimers">
        <p>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR
          STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          Revive is a coordination layer; it does not guarantee that any specific workflow, provider action, or recovery
          will succeed.
        </p>
      </Section>

      <Section heading="8. Limitation of liability">
        <p>
          To the maximum extent permitted by law, Revive will not be liable for any indirect, incidental, special,
          consequential, or punitive damages, or for lost profits, revenues, data, or goodwill. Revive’s total liability
          arising out of or relating to the Service will not exceed the amounts you paid to Revive in the twelve months
          before the event giving rise to the claim.
        </p>
      </Section>

      <Section heading="9. Indemnification">
        <p>
          You will defend and indemnify Revive against claims arising from your use of the Service, your data, or your
          violation of these Terms or applicable law, except to the extent caused by Revive.
        </p>
      </Section>

      <Section heading="10. Termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate access for material breach of these
          Terms. On termination, your right to use the Service ends; sections that by their nature should survive
          (including 5 through 9 and 11) will survive.
        </p>
      </Section>

      <Section heading="11. Governing law and changes to these Terms">
        <p>
          These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict of
          law rules. We may update these Terms; material changes will be posted here with an updated date and, where
          appropriate, additional notice. Continued use after changes take effect constitutes acceptance.
        </p>
      </Section>
    </LegalShell>
  );
}
