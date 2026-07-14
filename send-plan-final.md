# Revive outreach — final send plan

**FINAL STATE (Mon 13 Jul, 3:25 AM PT): everything sends from Gmail. revivelabs.app sends nothing.**

- **Gmail queue: 63 scheduled.** All Monday, 3:30 AM – 8:00 AM PT. Zero duplicates. Nothing after 8:00 AM.
- **Outlook queue: 0 scheduled.** All 27 (+1 test) cancelled. Bodies preserved as plain drafts.
- Reason for the abort: the srikanth@revivelabs.app **mailbox** can't receive mail, so replies to anything sent from it would vanish. A bounce ("Delivery incomplete") in the Gmail inbox corroborates this. The **website** revivelabs.app is fine and still linked in every signature.

Updated 12–13 Jul 2026, after fixing revivelabs.app email auth, recovering the quarantined batch, then aborting the domain entirely.

## Why two senders

- **revivelabs.app** had no SPF and no DKIM, while its DMARC record said `p=quarantine`. Every message failed DMARC and the domain's own DNS told receivers to quarantine it. Fixed 12 Jul: SPF TXT added, M365 DKIM enabled, both selector CNAMEs published. Verified passing.
- Domain is still ~10 days old with no sending history. Reputation, not authentication, is now the limiting factor.
- **srikanth.samy008@gmail.com** is an aged account with years of real outreach and replies. Strong sender reputation.

## The quarantined batch (Thu 9 Jul)

25 cold emails went out from revivelabs.app on Thu 9 Jul, 7:00–7:50 AM, while auth was broken. **Zero bounces, zero replies.** No bounce is expected — quarantine drops mail into spam silently rather than rejecting it. Working assumption: most were never seen.

**Key rule applied:** those 25 recipients' mail servers already spam-foldered a message from revivelabs.app. That domain now has negative history with those exact mailboxes. Re-sending to the same person from the same domain is worse than a cold start. So all recovery sends go from Gmail; revivelabs.app only mails people who have never seen it.

Of the 25:
- **17 agent companies** → rewritten and re-queued from Gmail (Group A2 below)
- **8 infra companies** (Paragon, Merge, Nango, Composio, Arcade, Trigger.dev, Browserbase, Firecrawl) → **not resent**. Adjacent infra, some arguably competitors. Different conversation, wrong channel for a personal Gmail. Revisit once the domain is warm.

---

## GROUP A — Gmail, all 36. Everything lands by 8:00 AM PT.

Sends marked ↺ are the quarantine-recovered ones (rewritten, new subject + opener — none is a verbatim resend).

| Email | Company | PT send |
|---|---|---|
| alisa@lucenthq.com | Lucent | Sun 12 Jul, 3:15 PM — **sent** |
| vraja@terminaluse.com | Terminal Use | Sun 12 Jul, 11:30 PM |
| iqbol@wayco.ai | Wayco | Mon, 4:45 AM |
| tim@unifold.io | Unifold | Mon, 4:48 AM |
| hau@unifold.io | Unifold | Mon, 4:51 AM |
| aryah@o11.ai | o11 | Mon, 4:54 AM |
| tom@fullseam.com | FullSeam | Mon, 4:57 AM |
| ms@rumacare.com | Ruma Care | Mon, 5:00 AM |
| naman@oximy.com | Oximy | Mon, 5:08 AM |
| jesse@decagon.ai ↺ | Decagon | Mon, 5:16 AM |
| flo@lindy.ai ↺ | Lindy | Mon, 5:24 AM |
| hasan@11x.ai ↺ | 11x | Mon, 5:32 AM |
| sam@artisan.co ↺ | Artisan | Mon, 5:40 AM |
| jordan.dearsley@vapi.ai ↺ | Vapi | Mon, 5:48 AM |
| suchintan@skyvern.com ↺ | Skyvern | Mon, 5:56 AM |
| brendan@mercor.com ↺ | Mercor | Mon, 6:04 AM |
| steve@lorikeetcx.ai ↺ | Lorikeet | Mon, 6:12 AM |
| harry@usemotion.com ↺ | Motion | Mon, 6:20 AM |
| srinath@regie.ai ↺ | Regie | Mon, 6:28 AM |
| danielsaks@landbase.com ↺ | Landbase | Mon, 6:36 AM |
| ang@simular.ai ↺ | Simular | Mon, 6:44 AM |
| deepak@usefini.com ↺ | Fini | Mon, 6:52 AM |
| richard@fyxer.com ↺ | Fyxer | Mon, 7:00 AM |
| tyllen@paymanai.com ↺ | Payman | Mon, 7:08 AM |
| f@primeforge.ai ↺ | PrimeForge | Mon, 7:16 AM |
| founders@trymaven.com ↺ | Maven | Mon, 7:24 AM |
| arushi@ressl.ai | Ressl AI | Mon, 7:30 AM |
| athan@copperlane.ai | Copperlane | Mon, 7:33 AM |
| shourya@ramain.ai | RamAIn | Mon, 7:36 AM |
| vansh@ramain.ai | RamAIn | Mon, 7:39 AM |
| pratik@tensol.ai | Tensol | Mon, 7:42 AM |
| zachzhong@bubblelab.ai | Bubble Lab | Mon, 7:45 AM |
| lance@traverse.so | Traverse | Mon, 7:48 AM |
| vedant@usesalus.ai | Salus | Mon, 7:51 AM |
| alik@pirislabs.io | Piris Labs | Mon, 7:54 AM |
| bryan@usereframe.ai | Reframe | Mon, 7:57 AM |
| mark@beaconhealth.ai | Beacon Health | Mon, 8:00 AM |

**Gmail Monday total: 35 sends, 4:45 AM – 8:00 AM PT.** Nothing after 8:00. Spaced 3–8 min apart so it's a steady trickle, not a burst. Well inside Gmail's 500/day limit.

Most of these land pre-workday for US recipients, which puts them at the top of the inbox at open. Verified: no duplicate recipients anywhere in the queue.

## GROUP B — revivelabs.app, 27 in Outlook

Unchanged, all to recipients who have never received mail from the domain. This is the warmup traffic that builds its history: mathias@getbalance.ai, nick@mochacare.com, matthew@legalos.ai, sam@schedulingwiz.com, paola@cofia.ai, varun@envariant.ai, perbhat@buildwithglue.com, varun@unisson.ai, victor@perfectly.so, devi@trycardinal.ai, akash@chasi.co, ketan@usecarson.com, nolan@scoutout.ai, akhil@docurahealth.com, emre@patientdesk.ai, adrian@mangomedical.io, wyeyew@proximitty.ai, zi@proximitty.ai, clarence@travoai.com, david@lexius.ai, oskar@stilta.com, jad@verdexai.com, evan@verdexai.com, omar@caretta.so, abhishek@ressl.ai, sfilosidis@terminaluse.com, fbalucha@terminaluse.com.

---

## DNS state (revivelabs.app)

- `TXT @` → `v=spf1 include:spf.protection.outlook.com -all`
- `CNAME selector1._domainkey` → `selector1-revivelabs-app._domainkey.netorgft20889689.n-v1.dkim.mail.microsoft`
- `CNAME selector2._domainkey` → `selector2-revivelabs-app._domainkey.netorgft20889689.n-v1.dkim.mail.microsoft`
- `TXT _dmarc` → `v=DMARC1; p=quarantine; adkim=r; aspf=r;`
- M365 Defender → DKIM for revivelabs.app: **Enabled / Valid**

Clerk and Resend sign from their own subdomains and pass DMARC independently; the strict `-all` at the root does not break them.

---

## Monday

Watch both inboxes. The Gmail 36 are the real signal — if they draw replies and the revivelabs 27 don't, the domain needs more warmup before it carries anything that matters. If a batch bounces or lands in spam, pull the remainder before the next one fires.

The 8 infra companies stay unsent until there's a reason to contact them that isn't a cold pitch.
