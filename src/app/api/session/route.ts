import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { isAdminEmail } from "@/lib/adminConfig";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.email_verified && isAdminEmail(decoded.email)) {
      return NextResponse.json({ active: true, admin: true });
    }

    const { sessionId } = await req.json();
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    await getAdminDb()
      .doc(`users/${decoded.uid}`)
      .set(
        {
          email: decoded.email || "",
          activeSessionId: sessionId,
          lastActiveAt: new Date().toISOString(),
        },
        { merge: true }
      );

    return NextResponse.json({ active: true });
  } catch (err) {
    console.error("session POST error:", err);
    return NextResponse.json({ error: "Session register failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ active: false }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.email_verified && isAdminEmail(decoded.email)) {
      return NextResponse.json({ active: true, admin: true });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ active: false }, { status: 400 });
    }

    const userSnap = await getAdminDb().doc(`users/${decoded.uid}`).get();
    const activeSessionId = userSnap.data()?.activeSessionId;

    if (!activeSessionId || activeSessionId === sessionId) {
      return NextResponse.json({ active: true });
    }

    return NextResponse.json({ active: false, reason: "another_device" });
  } catch (err) {
    console.error("session GET error:", err);
    return NextResponse.json({ active: true });
  }
}
