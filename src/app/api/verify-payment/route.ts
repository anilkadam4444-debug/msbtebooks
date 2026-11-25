import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json(
        { error: "Razorpay secret not configured" },
        { status: 500 }
      );
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const {
      bookId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await req.json();

    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return NextResponse.json(
        { error: "Invalid payment signature" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const bookSnap = await db.doc(`books/${bookId}`).get();
    const bookData = bookSnap.data() || {};

    await db
      .doc(`users/${decoded.uid}/purchases/${bookId}`)
      .set(
        {
          status: "paid",
          userEmail: decoded.email || "",
          bookTitle: String(bookData.title || bookId),
          amountInRupees: Number(bookData.priceInRupees || 0),
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          unlockedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("verify-payment error:", err);
    return NextResponse.json(
      { error: "Payment verification failed" },
      { status: 500 }
    );
  }
}
