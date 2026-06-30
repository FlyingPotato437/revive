const pptx = require("pptxgenjs");
const p = new pptx();
p.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
p.author = "Revive Labs";
p.title = "Revive Seed Deck";

// --- palette (warm editorial brand) ---
const PAPER = "F6F1E7", PANEL = "FCF9F2", INK = "211C16", INKMUT = "5C5346",
  INKFAINT = "938A7A", COBALT = "1F47C8", COBALTSOFT = "E5E9F8", OK = "2F6B47",
  FAIL = "A8341F", WARN = "9A6B12", HAIR = "DFD7C6", ICE = "CADCFC", PAPER2 = "EFE7D7";
const SERIF = "Cambria", SANS = "Calibri", MONO = "Courier New";
const W = 13.33, H = 7.5, M = 0.75;

const shadow = () => ({ type: "outer", color: "000000", blur: 7, offset: 3, angle: 90, opacity: 0.12 });

// wordmark "Revive" + cobalt dot (the dot is a cobalt period at the baseline)
function wordmark(s, x, y, size, dark) {
  s.addText([
    { text: "Revive", options: { color: dark ? PAPER : INK } },
    { text: ".", options: { color: COBALT } },
  ], { x, y, w: 4, h: size * 0.03, fontFace: SERIF, fontSize: size, bold: true, margin: 0, align: "left", valign: "top" });
}

function eyebrow(s, text, x, y, color) {
  s.addText(text.toUpperCase(), { x, y, w: 8, h: 0.3, margin: 0, fontFace: MONO, fontSize: 11, color: color || INKFAINT, charSpacing: 2, align: "left" });
}

function card(s, x, y, w, h, fill) {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill || PANEL }, line: { color: HAIR, width: 1 }, shadow: shadow() });
}

// ============================================================ SLIDE 1 — TITLE
let s = p.addSlide();
s.background = { color: INK };
wordmark(s, M, 1.0, 40, true);
s.addText([
  { text: "Keep agents running", options: { color: PAPER, breakLine: true } },
  { text: "when their token expires.", options: { color: ICE } },
], { x: M, y: 2.5, w: 11.5, h: 2.4, fontFace: SERIF, fontSize: 50, bold: true, lineSpacingMultiple: 1.0, margin: 0 });
s.addText("OAuth recovery for long-running agents.", { x: M, y: 5.2, w: 11, h: 0.5, fontFace: SANS, fontSize: 18, color: INKFAINT, margin: 0 });
s.addText("Seed  ·  2026  ·  founders@revive.dev", { x: M, y: 6.7, w: 11, h: 0.4, fontFace: MONO, fontSize: 12, color: INKFAINT, charSpacing: 1, margin: 0 });
s.addNotes("Hook: multi-day agents now outlive their OAuth refresh tokens. When the token dies mid-run the agent silently breaks — and re-auth doesn't fix the live run. We make the run survive it.");

// ============================================================ SLIDE 2 — PAIN
s = p.addSlide();
s.background = { color: PAPER };
eyebrow(s, "The problem", M, 0.6, FAIL);
s.addText("Re-authenticating doesn't fix a running agent.", { x: M, y: 1.0, w: 12, h: 0.9, fontFace: SERIF, fontSize: 34, bold: true, color: INK, margin: 0 });
s.addText("A token expires after 90 days, or the moment a password changes. The agent hits it, keeps retrying with the dead token, and the run is lost. Reported across every agent runtime:", { x: M, y: 1.95, w: 11.8, h: 0.9, fontFace: SANS, fontSize: 15, color: INKMUT, margin: 0 });
const bugs = [
  ["openai / codex", "#14144", "After a successful re-auth, the same session keeps failing with invalid_grant."],
  ["anthropics / claude-code", "#12447", "OAuth token expires during long autonomous tasks; the run halts until restart."],
  ["github / copilot-cli", "#2779", "Tokens expire mid-autopilot (AADSTS9010010); manual reload required."],
];
const cw = (11.83 - 0.6) / 3;
bugs.forEach(([repo, num, q], i) => {
  const x = M + i * (cw + 0.3);
  card(s, x, 3.25, cw, 2.9);
  s.addText([{ text: "●  ", options: { color: FAIL } }, { text: repo, options: { color: INKMUT } }], { x: x + 0.3, y: 3.55, w: cw - 0.6, h: 0.3, fontFace: MONO, fontSize: 11, margin: 0 });
  s.addText(num, { x: x + 0.3, y: 3.95, w: cw - 0.6, h: 0.5, fontFace: SERIF, fontSize: 24, bold: true, color: INK, margin: 0 });
  s.addText('"' + q + '"', { x: x + 0.3, y: 4.6, w: cw - 0.6, h: 1.3, fontFace: SANS, fontSize: 14, italic: true, color: INKMUT, margin: 0 });
});
s.addText("All three are still open.", { x: M, y: 6.45, w: 12, h: 0.4, fontFace: MONO, fontSize: 11, color: INKFAINT, margin: 0 });
s.addNotes("Lead with the quotes on screen. The point: this isn't theoretical, it's a recurring, documented, unsolved failure across OpenAI, Anthropic, and GitHub's own tools.");

// ============================================================ SLIDE 3 — WEDGE
s = p.addSlide();
s.background = { color: PAPER };
eyebrow(s, "Why it's not solved", M, 0.6, COBALT);
s.addText("Two kinds of tools get close. Neither finishes.", { x: M, y: 1.0, w: 12, h: 1.4, fontFace: SERIF, fontSize: 32, bold: true, color: INK, margin: 0 });
const wedges = [
  { t: "Auth tools", ex: "Scalekit · Nango · Arcade", a: "They notice the dead token.", b: "Then they fix the connection and assume you'll run again later.", hot: false },
  { t: "Revive", ex: "the sidecar", a: "Notices, gets re-approval, resumes the live run.", b: "The one piece neither side does.", hot: true },
  { t: "Workflow tools", ex: "Temporal · Inngest · Trigger.dev", a: "They can pause and resume a run.", b: "But they can't tell a token died, or ask a human.", hot: false },
];
wedges.forEach((wd, i) => {
  const x = M + i * (cw + 0.3);
  card(s, x, 2.6, cw, 3.0, wd.hot ? PANEL : PAPER2);
  if (wd.hot) s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 2.6, w: cw, h: 3.0, rectRadius: 0.08, fill: { type: "solid", color: PANEL, transparency: 100 }, line: { color: COBALT, width: 2 } });
  s.addText(wd.t, { x: x + 0.3, y: 2.85, w: cw - 0.6, h: 0.5, fontFace: SERIF, fontSize: 18, bold: true, color: wd.hot ? COBALT : INK, margin: 0 });
  s.addText(wd.ex, { x: x + 0.3, y: 3.35, w: cw - 0.6, h: 0.3, fontFace: MONO, fontSize: 11, color: INKFAINT, margin: 0 });
  s.addText([{ text: "✓  ", options: { color: OK, bold: true } }, { text: wd.a, options: { color: INK } }], { x: x + 0.3, y: 3.85, w: cw - 0.6, h: 0.6, fontFace: SANS, fontSize: 14, bold: true, margin: 0 });
  s.addText(wd.b, { x: x + 0.3, y: 4.55, w: cw - 0.6, h: 0.95, fontFace: SANS, fontSize: 13, color: INKMUT, margin: 0 });
});
s.addText("Auth tools handle connections. Workflow tools handle run state. The recovery sits between them, so neither one builds it.", { x: M, y: 5.9, w: 11.9, h: 0.8, fontFace: SANS, fontSize: 14, color: INKMUT, margin: 0 });
s.addNotes("This is the core insight. Two well-funded categories bracket the problem; the seam between them is the product. Draw the line on screen.");

// ============================================================ SLIDE 4 — PRODUCT
s = p.addSlide();
s.background = { color: PAPER };
eyebrow(s, "What it does", M, 0.6, COBALT);
s.addText("Four steps when a token dies.", { x: M, y: 1.0, w: 12, h: 0.8, fontFace: SERIF, fontSize: 34, bold: true, color: INK, margin: 0 });
const steps = [
  ["01", "Classify", "Is the token really dead, or just due for a routine refresh? Only real failures reach a human."],
  ["02", "Checkpoint", "Save the exact step the agent was on, so nothing is lost while it waits."],
  ["03", "Re-consent", "Send a re-approval link to Slack, email, or a webhook. The run pauses until someone approves."],
  ["04", "Splice", "Put the new token into the running agent and continue from the same step. No restart."],
];
const sw = (11.83 - 0.9) / 4;
steps.forEach(([n, t, d], i) => {
  const x = M + i * (sw + 0.3);
  card(s, x, 2.1, sw, 2.7);
  s.addShape(p.shapes.OVAL, { x: x + 0.28, y: 2.4, w: 0.6, h: 0.6, fill: { color: COBALTSOFT }, line: { color: COBALT, width: 1 } });
  s.addText(n, { x: x + 0.28, y: 2.4, w: 0.6, h: 0.6, fontFace: MONO, fontSize: 16, bold: true, color: COBALT, align: "center", valign: "middle", margin: 0 });
  s.addText(t, { x: x + 0.28, y: 3.15, w: sw - 0.5, h: 0.4, fontFace: SERIF, fontSize: 19, bold: true, color: INK, margin: 0 });
  s.addText(d, { x: x + 0.28, y: 3.6, w: sw - 0.5, h: 1.1, fontFace: SANS, fontSize: 12.5, color: INKMUT, margin: 0 });
});
card(s, M, 5.15, 11.83, 1.55, INK);
s.addText([
  { text: "from revive import wrap\n", options: { color: ICE } },
  { text: "graph = wrap(graph, project=\"rvk_live_…\", on_reconsent=\"slack:#ops\")", options: { color: PAPER } },
], { x: M + 0.4, y: 5.45, w: 11, h: 1.0, fontFace: MONO, fontSize: 16, margin: 0, valign: "middle", lineSpacingMultiple: 1.3 });
s.addText("Drop-in. Framework-neutral. Zero-dependency core.", { x: M + 0.4, y: 6.25, w: 11, h: 0.3, fontFace: MONO, fontSize: 11, color: INKFAINT, margin: 0 });
s.addNotes("It's one wrapper around your existing agent graph. The four-part splice is the whole product. Mention the core is open-source and zero-dependency.");

// ============================================================ SLIDE 5 — PROOF (dark)
s = p.addSlide();
s.background = { color: INK };
eyebrow(s, "Proof", M, 0.6, ICE);
s.addText("It runs on a real agent.", { x: M, y: 1.0, w: 12, h: 0.9, fontFace: SERIF, fontSize: 36, bold: true, color: PAPER, margin: 0 });
s.addText("A real LangGraph agent with a dead Microsoft token, recovered on the same run. Real sign-in flow, real checkpoint, no restart.", { x: M, y: 2.0, w: 11.5, h: 0.8, fontFace: SANS, fontSize: 16, color: ICE, margin: 0 });
const stats = [["8 / 8", "steps recovered"], ["0", "restarts"], ["0.5s", "recovery time"], ["0 / 3", "others that do this"]];
const stw = (11.83 - 0.9) / 4;
stats.forEach(([v, l], i) => {
  const x = M + i * (stw + 0.3);
  s.addText(v, { x, y: 3.4, w: stw, h: 1.0, fontFace: SERIF, fontSize: 48, bold: true, color: i === 3 ? ICE : PAPER, align: "left", margin: 0 });
  s.addText(l, { x, y: 4.45, w: stw, h: 0.6, fontFace: MONO, fontSize: 12, color: INKFAINT, charSpacing: 1, align: "left", margin: 0 });
});
s.addText([
  { text: "$ pip install revive-sidecar", options: { color: ICE, breakLine: true } },
  { text: "$ python -m examples.langgraph_agent   →   COMPLETED 8/8 on the same thread · 0 restarts", options: { color: INKFAINT } },
], { x: M, y: 5.7, w: 11.8, h: 1.0, fontFace: MONO, fontSize: 13, margin: 0, lineSpacingMultiple: 1.4 });
s.addNotes("This is the money slide — run the live demo here. Show the terminal recovering a real LangGraph agent, then the side-by-side web demo. The 0/3 is from an adversarial uniqueness check.");

// ============================================================ SLIDE 6 — WHY NOW
s = p.addSlide();
s.background = { color: PAPER };
eyebrow(s, "Why now", M, 0.6, COBALT);
s.addText("Three things just changed.", { x: M, y: 1.0, w: 12, h: 0.8, fontFace: SERIF, fontSize: 34, bold: true, color: INK, margin: 0 });
const now = [
  ["Agents got long", "Runs now last days and outlive the 90-day and 6-month token limits. This wasn't a common problem until 2026."],
  ["Re-approval got a standard", "The MCP spec added a standard way to ask a human to re-approve out of band. That's the piece Revive needed."],
  ["Pause and resume went mainstream", "Temporal, Trigger.dev, and Restate made resuming a run normal. Now there's something to build on."],
  ["The failures are public", "Open bugs across Codex, Claude Code, and Copilot show people hit this every week."],
];
now.forEach(([t, d], i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = M + col * (5.9 + 0.3), y = 2.15 + row * 2.0;
  s.addShape(p.shapes.OVAL, { x, y: y + 0.05, w: 0.45, h: 0.45, fill: { color: COBALTSOFT }, line: { color: COBALT, width: 1 } });
  s.addText(String(i + 1), { x, y: y + 0.05, w: 0.45, h: 0.45, fontFace: MONO, fontSize: 14, bold: true, color: COBALT, align: "center", valign: "middle", margin: 0 });
  s.addText(t, { x: x + 0.65, y: y, w: 5.1, h: 0.5, fontFace: SERIF, fontSize: 18, bold: true, color: INK, margin: 0 });
  s.addText(d, { x: x + 0.65, y: y + 0.5, w: 5.1, h: 1.2, fontFace: SANS, fontSize: 13, color: INKMUT, margin: 0 });
});
s.addNotes("Three structural shifts converged in 2025-2026: agents got long, re-consent got a standard, and durable execution went mainstream. The splice is newly buildable but unbuilt.");

// ============================================================ SLIDE 7 — COMPETITION
s = p.addSlide();
s.background = { color: PAPER };
eyebrow(s, "Competition", M, 0.6, COBALT);
s.addText("What each tool does.", { x: M, y: 1.0, w: 12.2, h: 0.95, fontFace: SERIF, fontSize: 34, bold: true, color: INK, margin: 0 });
const caps = ["Detect a dead refresh token", "Durable step-accurate checkpoint", "Out-of-band human re-consent", "Resume the SAME run (no restart)", "Neutral & cross-framework", "Per-provider recovery corpus"];
const colsC = ["Revive", "Arcade", "Scalekit / Nango", "Temporal / Trigger", "Google ADK", "AWS AgentCore"];
// grid[capability][vendor], vendors = [Revive, Arcade, Scalekit/Nango, Temporal/Trigger, Google ADK, AWS AgentCore]
const grid = [
  ["Y", "P", "Y", "N", "N", "N"], // detect dead refresh token
  ["Y", "N", "N", "Y", "Y", "P"], // durable checkpoint
  ["Y", "P", "Y", "N", "P", "P"], // out-of-band re-consent
  ["Y", "N", "N", "Y", "Y", "P"], // resume the SAME run
  ["Y", "P", "P", "Y", "N", "N"], // neutral & cross-framework
  ["Y", "N", "P", "N", "N", "N"], // per-provider corpus
];
// build matrix per-capability rows. grid[col][cap]; transpose to rows by cap.
const glyph = { Y: ["●", OK], P: ["◐", WARN], N: ["○", INKFAINT] };
const header = [{ text: "Capability", options: { fontFace: MONO, fontSize: 10, color: INKFAINT, bold: true, align: "left", fill: { color: PAPER } } }]
  .concat(colsC.map((c, i) => ({ text: c, options: { fontFace: SANS, fontSize: 11.5, bold: true, color: i === 0 ? COBALT : INK, align: "center", fill: { color: i === 0 ? COBALTSOFT : PANEL } } })));
const rows = [header];
caps.forEach((cap, ci) => {
  const row = [{ text: cap, options: { fontFace: SANS, fontSize: 12, color: INKMUT, align: "left", fill: { color: PANEL } } }];
  colsC.forEach((_, coli) => {
    const code = grid[ci][coli];
    const [g, col] = glyph[code];
    row.push({ text: g, options: { fontFace: SANS, fontSize: 16, color: col, align: "center", fill: { color: coli === 0 ? COBALTSOFT : PANEL } } });
  });
  rows.push(row);
});
s.addTable(rows, { x: M, y: 2.15, w: 11.83, colW: [3.43, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4], rowH: 0.55, border: { type: "solid", pt: 1, color: HAIR }, valign: "middle" });
s.addText([
  { text: "●", options: { color: OK } }, { text: " full     ", options: { color: INKMUT } },
  { text: "◐", options: { color: WARN } }, { text: " partial     ", options: { color: INKMUT } },
  { text: "○", options: { color: INKFAINT } }, { text: " none", options: { color: INKMUT } },
], { x: M, y: 6.5, w: 8, h: 0.3, fontFace: MONO, fontSize: 11, margin: 0 });
s.addText("Sourced from vendor docs & changelogs, June 2026.", { x: 8, y: 6.5, w: 4.8, h: 0.3, fontFace: MONO, fontSize: 10, color: INKFAINT, align: "right", margin: 0 });
s.addNotes("Only the Revive column is full on both the trigger (detect dead token) and the splice (resume same run). Everyone else has a gap on one side or the other.");

// ============================================================ SLIDE 8 — MOAT
s = p.addSlide();
s.background = { color: PAPER };
eyebrow(s, "Why it lasts", M, 0.6, COBALT);
s.addText("It gets harder to copy over time.", { x: M, y: 1.0, w: 12, h: 0.8, fontFace: SERIF, fontSize: 34, bold: true, color: INK, margin: 0 });
// big stat left
card(s, M, 2.2, 4.3, 4.0, PANEL);
s.addText("0 / 3", { x: M, y: 2.7, w: 4.3, h: 1.3, fontFace: SERIF, fontSize: 72, bold: true, color: COBALT, align: "center", margin: 0 });
s.addText("outside analysts could find another product that does the full recovery.", { x: M + 0.4, y: 4.1, w: 3.5, h: 1.8, fontFace: SANS, fontSize: 15, color: INKMUT, align: "center", margin: 0 });
// three points right
const moat = [
  ["Recovery data", "How each provider fails, and what fixes it, gets more accurate with every run we see. Nobody else is collecting this."],
  ["Works across the board", "Not tied to one OAuth provider or one agent framework. That spot is hard for either side to take without giving up their own model."],
  ["Becomes the default", "The layer other tools call when a token dies. Each integration makes it harder to replace."],
];
moat.forEach(([t, d], i) => {
  const y = 2.2 + i * 1.38;
  s.addText([{ text: "→  ", options: { color: COBALT, bold: true } }, { text: t, options: { color: INK } }], { x: 5.1, y, w: 7.5, h: 0.4, fontFace: SERIF, fontSize: 19, bold: true, margin: 0 });
  s.addText(d, { x: 5.45, y: y + 0.45, w: 7.3, h: 0.9, fontFace: SANS, fontSize: 13.5, color: INKMUT, margin: 0 });
});
s.addNotes("The moat is the corpus + neutrality. The 0/3 is the strongest objective signal of novelty we have. Incumbents are one feature away but can't reach across without breaking their own abstraction.");

// ============================================================ SLIDE 9 — MARKET & GTM
s = p.addSlide();
s.background = { color: PAPER };
eyebrow(s, "Market", M, 0.6, COBALT);
s.addText("Start where the pain is.", { x: M, y: 1.0, w: 12, h: 0.8, fontFace: SERIF, fontSize: 34, bold: true, color: INK, margin: 0 });
// left: GTM steps
s.addText("THE MOTION", { x: M, y: 2.1, w: 5.5, h: 0.3, fontFace: MONO, fontSize: 11, color: INKFAINT, charSpacing: 2, margin: 0 });
const gtm = [
  ["Start in the bug threads", "The people hitting this are already posting about it. We show up with the fix."],
  ["Open-source the core", "It spreads, and developers trust it. We charge for the hosted routing, dashboards, and SSO."],
  ["Start with Graph, then grow", "Microsoft Graph first, then Workspace, Slack, and any OIDC provider."],
];
gtm.forEach(([t, d], i) => {
  const y = 2.5 + i * 1.25;
  s.addText([{ text: (i + 1) + "   ", options: { color: COBALT, bold: true, fontFace: MONO } }, { text: t, options: { color: INK, fontFace: SERIF } }], { x: M, y, w: 5.6, h: 0.4, fontSize: 16, bold: true, margin: 0 });
  s.addText(d, { x: M + 0.4, y: y + 0.42, w: 5.2, h: 0.75, fontFace: SANS, fontSize: 12.5, color: INKMUT, margin: 0 });
});
// right: funded thesis
card(s, 7.0, 2.1, 5.6, 4.4, PANEL);
s.addText("THIS SPACE IS GETTING FUNDED", { x: 7.35, y: 2.4, w: 5.0, h: 0.5, fontFace: MONO, fontSize: 10.5, color: COBALT, charSpacing: 1, margin: 0 });
const raises = [["Arcade.dev", "$60M Series A"], ["Composio", "$25M Series A"], ["Nango", "$7.5M (YC)"], ["Scalekit", "$5.5M seed"], ["Stytch", "acq. by Twilio"]];
raises.forEach(([c, r], i) => {
  const y = 3.05 + i * 0.62;
  s.addText(c, { x: 7.35, y, w: 3.0, h: 0.4, fontFace: SERIF, fontSize: 16, bold: true, color: INK, margin: 0 });
  s.addText(r, { x: 10.0, y, w: 2.5, h: 0.4, fontFace: MONO, fontSize: 13, color: INKMUT, align: "right", margin: 0 });
  if (i < raises.length - 1) s.addShape(p.shapes.LINE, { x: 7.35, y: y + 0.5, w: 5.0, h: 0, line: { color: HAIR, width: 1 } });
});
s.addText("The money went to the tools around the problem, not to the recovery itself.", { x: 7.35, y: 5.95, w: 5.0, h: 0.5, fontFace: SANS, fontSize: 11.5, italic: true, color: INKMUT, margin: 0 });
s.addNotes("GTM is unusually cheap: warm, pre-qualified leads sit in public issue threads. The adjacent category is hot — comps prove the thesis; we sit in the white space between them.");

// ============================================================ SLIDE 10 — PLATFORM
s = p.addSlide();
s.background = { color: PAPER };
eyebrow(s, "Where it goes", M, 0.6, COBALT);
s.addText("Re-consent is the first use, not the only one.", { x: M, y: 1.0, w: 12.2, h: 0.95, fontFace: SERIF, fontSize: 31, bold: true, color: INK, margin: 0 });
s.addText("The hard part isn't OAuth. It's pausing a run, asking a human something, and picking up where it left off. A dead token is one reason to do that. The same engine covers the rest:", { x: M, y: 2.05, w: 11.8, h: 0.9, fontFace: SANS, fontSize: 15, color: INKMUT, margin: 0 });
const kinds = [
  ["auth", "Re-consent", "A dead token needs re-approval.", true],
  ["approval", "Approvals", "“Approve this $40k wire before sending.”", true],
  ["stepup", "Step-up", "“Re-authenticate with MFA to continue.”", false],
  ["input", "Missing input", "“I need the PO number to proceed.”", false],
];
const kw = (11.83 - 0.9) / 4;
kinds.forEach(([k, t, d, live], i) => {
  const x = M + i * (kw + 0.3);
  card(s, x, 3.3, kw, 2.4, i === 0 ? PANEL : PAPER2);
  s.addText(k, { x: x + 0.3, y: 3.6, w: kw - 1.0, h: 0.3, fontFace: MONO, fontSize: 11, color: COBALT, charSpacing: 1, margin: 0 });
  if (live) s.addText("SHIPPING", { x: x + kw - 1.45, y: 3.6, w: 1.2, h: 0.28, fontFace: MONO, fontSize: 8, color: OK, align: "right", margin: 0 });
  s.addText(t, { x: x + 0.3, y: 4.0, w: kw - 0.6, h: 0.5, fontFace: SERIF, fontSize: 19, bold: true, color: INK, margin: 0 });
  s.addText(d, { x: x + 0.3, y: 4.55, w: kw - 0.6, h: 1.0, fontFace: SANS, fontSize: 12.5, color: INKMUT, margin: 0 });
});
s.addText("One engine: pause, ask a human, resume. Re-consent is just the first kind.", { x: M, y: 6.05, w: 11.8, h: 0.4, fontFace: SANS, fontSize: 13, color: INKMUT, margin: 0 });
s.addNotes("This kills 'feature, not a company.' Dead-token recovery is one use of a general human-in-the-loop rendezvous engine. The auth and approval kinds already ship in code.");

// ============================================================ SLIDE 11 — ASK (dark)
s = p.addSlide();
s.background = { color: INK };
eyebrow(s, "The ask", M, 0.7, ICE);
s.addText("What we're raising.", { x: M, y: 1.15, w: 12, h: 0.9, fontFace: SERIF, fontSize: 36, bold: true, color: PAPER, margin: 0 });
const asks = ["2 infrastructure hires", "Microsoft Graph + Workspace GA", "The Temporal adapter", "10 design partners into paid", "Open-source the core sidecar"];
asks.forEach((a, i) => {
  const y = 2.4 + i * 0.62;
  s.addText([{ text: "→  ", options: { color: ICE, bold: true } }, { text: a, options: { color: PAPER } }], { x: M, y, w: 8, h: 0.45, fontFace: SANS, fontSize: 18, margin: 0 });
});
wordmark(s, M, 6.3, 30, true);
s.addText("founders@revive.dev   ·   github.com/revive-labs/revive", { x: 6.5, y: 6.55, w: 6.0, h: 0.4, fontFace: MONO, fontSize: 12, color: INKFAINT, align: "right", margin: 0 });
s.addNotes("Close on the ask and the 18-month plan. Restate the one-liner: when the refresh token dies, the run shouldn't.");

p.writeFile({ fileName: "/Users/srikanthsamy1/Revive/deck/Revive-Seed-Deck.pptx" }).then(f => console.log("wrote", f));
