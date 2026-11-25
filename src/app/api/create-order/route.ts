import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json(
        { error: "Razorpay keys are not configured on the server." },
        { status: 500 }
      );
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const { bookId } = await req.json();

    const bookSnap = await getAdminDb().doc(`books/${bookId}`).get();
    if (!bookSnap.exists) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const bookData = bookSnap.data()!;
    const priceInRupees = Number(bookData.priceInRupees || 0);
    if (priceInRupees <= 0) {
      return NextResponse.json({ error: "Invalid book price" }, { status: 400 });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(priceInRupees * 100),
      currency: "INR",
      notes: {
        uid: decoded.uid,
        userEmail: decoded.email || "",
        bookId,
        bookTitle: String(bookData.title || bookId),
        amountInRupees: String(priceInRupees),
      },
    });

    return NextResponse.json({ orderId: order.id, amount: order.amount });
  } catch (err) {
    console.error("create-order error:", err);
    return NextResponse.json(
      { error: "Failed to create payment order" },
      { status: 500 }
    );
  }
}
