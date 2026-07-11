# Revive — Alpha Customer Seed List (pre-Apollo enrichment)

**ICP locked:** AI agent startups, <20 people, whose product breaks when a *customer's* OAuth token dies.
**Persona:** Founder / CTO (at this size they are the buyer AND the person debugging `invalid_grant` at 2am).
**Source of company data:** YC W26 batch directory (via extruct.ai data room) + existing `revive-prospects.md`.
**Status:** companies confirmed. People + emails + LinkedIn pending Apollo.io enrichment.

## Why these and not "AI companies" generally

The filter is not "does it use AI." It's: **does a non-technical end user OAuth their own Gmail / Slack / QuickBooks / Shopify / EHR into this product, and does the product silently die when that grant expires?** That's the Revive wedge. Everything below passes that test.

---

## Tier 1 — Agent touches the end user's inbox / calendar / Slack (token death = product death)

| # | Company | Domain | What they do | Which token kills them |
|---|---|---|---|---|
| 1 | Tensol | tensol.ai | AI employees with their own email, phone, tool access | Google/M365 per-employee grants |
| 2 | Bubble Lab | bubblelab.ai | AI work automation for Slack teams | Slack workspace token |
| 3 | Klaus | klausai.com | Hosted OpenClaw AI employee | Gmail/Outlook + every connected tool |
| 4 | o11 | o11.ai | PLG automation inside M365 + Google Workspace | M365 / Workspace refresh token |
| 5 | Clice | clice.ai | AI assistants that coordinate scheduling + handoffs | Calendar + Slack |
| 6 | Ressl AI | ressl.ai | AI employees for trades/home services, event-triggered | Connected field-service tools |
| 7 | Glue | buildwithglue.com | AI brand operations on autopilot | Ad + social platform tokens |
| 8 | Cofia | cofia.ai | AI automations that observe workflows | Whatever it observes |
| 9 | Traverse | traverse.so | AI workflow discovery across existing tools | Broad OAuth surface |
| 10 | Oximy | oximy.com | AI adoption engine for enterprise teams | Workspace grants |

## Tier 2 — GTM / CRM agents (Gmail + Salesforce + HubSpot OAuth, non-technical users)

| # | Company | Domain | What they do |
|---|---|---|---|
| 11 | Fixture | fixture.app | AI-first CRM for startups |
| 12 | Cardinal | trycardinal.ai | Real-time sales intelligence for GTM teams |
| 13 | Terminal Use | terminaluse.com | AI platform for precision outbound |
| 14 | Envariant | envariant.ai | AI for sales research |
| 15 | Caretta | caretta.so | Realtime AI for sales calls |
| 16 | Unisson | unisson.ai | AI agents for customer-facing teams |
| 17 | Chasi AI | chasi.co | AI concierge for equipment sales/rentals |
| 18 | Q2Q | tryq2q.com | AI deal sourcing, meeting prep |
| 19 | Perfectly | perfectly.so | AI deal sourcing for acquisition teams |
| 20 | Sponge | sponge.com | AI customer intelligence, live user profiles |
| 21 | Coffee | coffee.ai | Agentic CRM; scans Gmail + calendar the instant you OAuth |
| 22 | Reevo | reevo.ai | Revenue OS: prospecting, dialing, email, scheduling |
| 23 | Carly | usecarly.com | AI agent, 70+ integrations = 70+ token lifecycles |
| 24 | Zatanna | zatanna.ai | AI agents for hardware procurement |
| 25 | Scout Out | scoutout.ai | AI estimating + CRM for contractors |

## Tier 3 — Finance / accounting agents (QuickBooks + banking + billing OAuth; long-running reconciliation runs)

| # | Company | Domain | What they do |
|---|---|---|---|
| 26 | Wayco | wayco.ai | AI finance teammate for accounting teams |
| 27 | FullSeam | fullseam.com | Agents across accounting, CRM, billing, banking systems |
| 28 | Balance | getbalance.ai | Fractional finance team for accounting |
| 29 | Copperlane | copperlane.ai | AI reconciliation for high-volume payments |
| 30 | Proximitty | proximitty.ai | AI operating system for commercial lending |
| 31 | Silas | silahq.com | AI-native mortgage origination |
| 32 | AutoSitu | autositu.com | Agentic AI for fraud investigations |
| 33 | Travo | travoai.com | AI-native internal audit automation |

## Tier 4 — Healthcare ops agents (EHR sessions expire constantly; runs are hours long; a dropped run is a dropped claim)

| # | Company | Domain | What they do |
|---|---|---|---|
| 34 | Beacon Health | beaconhealth.ai | AI healthcare ops agents for EHR workflows |
| 35 | Ruma Care | rumacare.com | Prior auth + reimbursement, EHR-integrated |
| 36 | Ndea | ndea.com | AI prior-auth automation for specialty practices |
| 37 | Patientdesk.ai | patientdesk.ai | AI receptionist for dental practices |
| 38 | Docura Health | docurahealth.com | AI medical-legal report writing |
| 39 | Mango Medical | mangomedical.io | AI medical billing + revenue cycle |
| 40 | MochaCare | mochacare.com | AI home care operations |
| 41 | Carson | usecarson.com | AI-native medspa software |
| 42 | Scheduling Wizard | schedulingwiz.com | Medical residency schedule automation |

## Tier 5 — Browser / UI automation (session death IS their product surface — the most visceral pitch)

| # | Company | Domain | What they do |
|---|---|---|---|
| 43 | ramAIn | ramain.ai | AI UI automation for manual ops tasks |
| 44 | Unifold | unifold.io | Workflow-to-API automation for portals |
| 45 | BrowserAct | browseract.com | Agent hits login wall, pauses, resumes (their own blog post) |
| 46 | ui.vision | ui.vision | Open-source RPA; scripts die on session death |
| 47 | Reframe | usereframe.ai | AI customer text layer for DTC (Shopify OAuth) |
| 48 | Asimov | tryasimov.ai | AI customer text layer for DTC brands |

## Tier 6 — Agent infra (buyer OR partner — they may embed Revive rather than buy a seat)

| # | Company | Domain | What they do |
|---|---|---|---|
| 49 | Salus | usesalus.ai | Policy-aware runtime for AI agents |
| 50 | Lucent | lucenthq.com | Observability for AI agents |
| 51 | Piris Labs | pirislabs.io | Evals + observability for AI agents |
| 52 | Rubric | therubric.ai | AI agent optimization for production workflows |
| 53 | Noetic | getnoetic.ai | AI infrastructure for agent monitoring |
| 54 | IncidentFox | incidentfox.ai | AI SRE for incident investigation |
| 55 | Canary | runcanary.ai | AI QA engineer / agents testing every PR |
| 56 | Sparkles | sparkles.dev | AI-native recruiting OS (ATS + Gmail + calendar OAuth) |

---

## Next: Apollo enrichment

For each: `apollo_search_people` (titles: Founder, Co-Founder, CTO, CEO) → `apollo_enrich_person` for verified email + LinkedIn. Drop anyone whose email comes back unverified — a guessed address is worse than no address.
