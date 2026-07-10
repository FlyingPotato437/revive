import { redirect } from "next/navigation";

/** Legacy bookmark. Integration choices now live in the active Quickstart. */
export default function AdaptersPage() {
  redirect("/app/quickstart");
}
