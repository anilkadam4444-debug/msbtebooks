import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expected !== signature) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 400 }
      );
    }

    const event = JSON.parse(rawBody);
    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;
      const { uid, bookId, userEmail, bookTitle, amountInRupees } =
        payment.notes || {};

      if (uid && bookId) {
        await getAdminDb()
          .doc(`users/${uid}/purchases/${bookId}`)
          .set(
            {
              status: "paid",
              userEmail: userEmail || payment.email || "",
              bookTitle: bookTitle || bookId,
              amountInRupees:
                Number(amountInRupees) || Math.round(Number(payment.amount || 0) / 100),
              razorpayPaymentId: payment.id,
              unlockedAt: new Date().toISOString(),
              source: "webhook",
            },
            { merge: true }
          );
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("razorpay-webhook error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
