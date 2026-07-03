import crypto from "node:crypto";
import { verifyStripeSignature } from "../lib/billing";

const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
const secret = "whsec_test";
const timestamp = Math.floor(Date.now() / 1000);
const valid = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

if (!verifyStripeSignature(payload, `t=${timestamp},v1=bad,v1=${valid}`, secret)) {
  throw new Error("valid rotated signature was rejected");
}
if (verifyStripeSignature(payload, `t=${timestamp},v1=${"0".repeat(64)}`, secret)) {
  throw new Error("invalid signature was accepted");
}
if (verifyStripeSignature(payload, `t=${timestamp - 301},v1=${valid}`, secret)) {
  throw new Error("stale signature was accepted");
}
console.log("billing signature fixtures passed");
