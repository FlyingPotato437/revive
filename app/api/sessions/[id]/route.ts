import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/store";
import { sessionFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sessionFromCookies(req.cookies)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ session });
}
