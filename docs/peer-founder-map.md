# Funded peer-founder map

Updated July 9, 2026. This is a market map, not a prospect list and not a
claim that any of these companies endorse Revive. The LinkedIn links are public
professional profiles, collected so the team can study their public positioning
and build useful relationships in the ecosystem.

## Direct category collision

### Arcade.dev - agent action runtime

- **Why it matters:** This is the closest top-line competitor. Arcade calls
  itself the action runtime for enterprise agents and sells authorization,
  execution, and governance across systems.
- **Funding:** [Arcade's Series A announcement](https://www.arcade.dev/blog/arcade-series-a/)
  says it raised $60M in June 2026, bringing total financing to $72M.
- **Founders:** [Alex Salazar](https://www.linkedin.com/in/alexsalazar) and
  [Sam Partee](https://www.linkedin.com/in/sampartee).
- **Revive implication:** Do not try to win by calling Revive an "agent action
  layer." Arcade already has the money and language. Own transaction outcome:
  *was the provider side effect committed exactly once, and what is the safe
  next action when the answer is unknown?*

## Human oversight and integration rails

### HumanLayer - human input and agent collaboration

- **Why it matters:** HumanLayer began as human-in-the-loop infrastructure,
  then evolved its product. It proves approvals are a useful wedge but do not
  alone create a company boundary.
- **Backing:** [YC's company page](https://www.ycombinator.com/companies/humanlayer)
  lists HumanLayer as F24 and Dexter Horthy as founder.
- **Founder:** [Dexter Horthy](https://www.linkedin.com/in/dexterihorthy).
- **Revive implication:** Revive approvals should always be coupled to the
  action ledger, provider reconciliation, and an exact resume contract. The
  buyer should never see Revive as an approval inbox only.

### Nango - authentication and integration infrastructure

- **Why it matters:** Nango is an integration/authentication rail that agents
  use to reach real providers. It is both a close ecosystem partner and an
  adjacent competitor.
- **Backing:** [YC's Nango page](https://www.ycombinator.com/companies/nango/jobs)
  lists the company as W23 and names Robin Guldener and Bastien Beurier as
  founders.
- **Founder profile:** [Bastien Beurier](https://www.linkedin.com/in/bastienbeurier).
- **Revive implication:** Keep token custody with Nango. Revive should become
  the post-auth transaction layer: normalized provider commit checks, fencing,
  and recovery evidence. That division gives Nango a reason to partner rather
  than rebuild the product.

## Durable execution and authorization incumbents

### Temporal - durable execution

- **Why it matters:** Temporal owns workflow durability. Its founders created
  AWS Simple Workflow Service, Azure Durable Task Framework, and Uber Cadence
  before founding Temporal.
- **Backing:** [Temporal's company page](https://temporal.io/about) lists
  a16z, Sequoia, Index, Lightspeed, and other investors. Temporal's own
  [funding announcement](https://temporal.io/news/temporal-investors-expand-funding-with-usd75m-round)
  reported more than $200M total financing in 2023.
- **Founders:** [Samar Abbas](https://www.linkedin.com/in/samar-abbas-381997)
  and [Maxim Fateev](https://www.linkedin.com/in/fateev).
- **Revive implication:** Never claim to be a replacement runtime. Revive is
  the provider-side transaction and policy contract that can run alongside
  Temporal, LangGraph, and bespoke workers.

### Permit.io - authorization policy and MCP enforcement

- **Why it matters:** Permit.io brings policy-as-code into authorization and is
  now publicly discussing an MCP gateway for agent security. This is the
  closest policy-control adjacency.
- **Backing:** Permit.io's public company profile lists an $8M Series A led by
  Scale Venture Partners and NFX; its earlier launch announcement reported a
  $6M seed round. [Company profile](https://www.linkedin.com/company/permitio)
  and [seed announcement](https://www.linkedin.com/posts/permitio_permitio-raises-6m-to-make-permissions-activity-6899369831519637505-WN-A).
- **Founder:** [Or Weis](https://il.linkedin.com/in/orweis).
- **Revive implication:** Authorization asks "may this agent do this?" Revive
  must own the different question: "what happened after we let it try, and is a
  replay safe?" Integrate with authorization engines when needed. Do not
  pretend policy matching alone guarantees a provider effect.

## Positioning decision

The funded market has clear owners for identity, integration rails, durable
execution, and authorization. Revive's defensible product is the neutral
**agent transaction record**:

1. Turn a tool call into a compact action contract.
2. Make a decision before the provider call.
3. Record the attempted commit boundary.
4. Reconcile the real provider effect after ambiguity or failure.
5. Return the stored outcome, or resume the original workflow with a fenced
   credential generation.

The action-contract work in this repository is the first visible product proof
of that position. It supports policies such as "approve an outbound message to
25+ recipients" while retaining only recipient count, not recipient addresses
or message content.
