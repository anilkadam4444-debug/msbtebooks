import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { getAdminDb, authenticateAdminRequest } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(req: Request) {
  const authResult = await authenticateAdminRequest(req);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error || "Admin access required" }, { status: authResult.status });
  }
  const adminUser = authResult.user;

  try {
    const db = getAdminDb();
    const booksSnap = await db.collection("books").get();
    const books = booksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    let recentPurchases: Array<{
      id: string;
      uid: string;
      bookId: string;
      bookTitle: string;
      userEmail: string;
      amountInRupees: number;
      razorpayPaymentId: string;
      unlockedAt: string;
    }> = [];
    let totalRevenueRupees = 0;

    try {
      const purchasesSnap = await db.collectionGroup("purchases").get();
      recentPurchases = purchasesSnap.docs.map((d) => {
        const data = d.data();
        const uid = d.ref.parent.parent?.id || "";
        const amount = Number(data.amountInRupees || 0);
        totalRevenueRupees += amount;
        return {
          id: d.id,
          uid,
          bookId: d.id,
          bookTitle: String(data.bookTitle || d.id),
          userEmail: String(data.userEmail || ""),
          amountInRupees: amount,
          razorpayPaymentId: String(data.razorpayPaymentId || ""),
          unlockedAt: String(data.unlockedAt || ""),
        };
      });
      recentPurchases.sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));
    } catch (e) {
      console.warn("Could not fetch purchases collectionGroup:", e);
    }

    return NextResponse.json({
      books,
      recentPurchases: recentPurchases.slice(0, 50),
      stats: {
        totalBooks: books.length,
        totalPurchases: recentPurchases.length,
        totalRevenueRupees,
      },
    });
  } catch (err) {
    console.error("admin GET error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load admin data",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const authResult = await authenticateAdminRequest(req);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error || "Admin access required" }, { status: authResult.status });
  }
  const adminUser = authResult.user;

  try {
    const contentType = req.headers.get("content-type") || "";
    let title = "";
    let slug = "";
    let subjectCode = "";
    let branch = "Common (All Branches)";
    let year = 1;
    let semester = 1;
    let priceInRupees = 25;
    let description = "";
    let storagePath = "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      title = String(body.title || "").trim();
      slug = slugify(String(body.slug || title));
      subjectCode = String(body.subjectCode || "").trim();
      branch = String(body.branch || "Common (All Branches)").trim();
      year = Number(body.year || 1);
      semester = Number(body.semester || 1);
      priceInRupees = Number(body.priceInRupees || 25);
      description = String(body.description || "").trim();
      storagePath = String(body.storagePath || "").trim();
    } else {
      const formData = await req.formData();
      title = String(formData.get("title") || "").trim();
      slug = slugify(String(formData.get("slug") || title));
      subjectCode = String(formData.get("subjectCode") || "").trim();
      branch = String(formData.get("branch") || "Common (All Branches)").trim();
      year = Number(formData.get("year") || 1);
      semester = Number(formData.get("semester") || 1);
      priceInRupees = Number(formData.get("priceInRupees") || 25);
      description = String(formData.get("description") || "").trim();
      storagePath = String(formData.get("storagePath") || "").trim();
      const htmlFile = formData.get("htmlFile");

      if (htmlFile instanceof File && htmlFile.size > 0) {
        const branchFolder = slugify(branch) || "general";
        const targetPath = `books/${branchFolder}/${slug}.html`;
        const blob = await put(targetPath, htmlFile, {
          access: "private",
          contentType: "text/html; charset=utf-8",
          addRandomSuffix: true,
        });
        storagePath = blob.pathname;
      }
    }

    if (!title || !slug || !subjectCode) {
      return NextResponse.json(
        { error: "Title, slug, and subject code are required." },
        { status: 400 }
      );
    }

    if (!storagePath) {
      return NextResponse.json(
        { error: "Upload an HTML file or provide an existing Vercel Blob pathname." },
        { status: 400 }
      );
    }

    const docId = `${slug}-${subjectCode.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    await getAdminDb().doc(`books/${docId}`).set({
      slug,
      title,
      subjectCode,
      branch,
      year,
      semester,
      priceInRupees,
      description,
      storagePath,
      updatedAt: new Date().toISOString(),
      updatedBy: adminUser.email,
    });

    return NextResponse.json({ success: true, id: docId });
  } catch (err) {
    console.error("admin POST error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to upload book to Vercel Blob.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const authResult = await authenticateAdminRequest(req);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error || "Admin access required" }, { status: authResult.status });
  }
  const adminUser = authResult.user;

  try {
    const contentType = req.headers.get("content-type") || "";
    let id = "";
    const updates: Record<string, string | number> = {
      updatedAt: new Date().toISOString(),
      updatedBy: adminUser.email || "",
    };

    if (contentType.includes("application/json")) {
      const body = await req.json();
      id = String(body.id || "").trim();
      const stringFields = ["title", "slug", "subjectCode", "branch", "description", "storagePath"];
      for (const field of stringFields) {
        if (body[field] !== undefined && String(body[field]).trim() !== "") {
          updates[field] =
            field === "slug" ? slugify(String(body[field])) : String(body[field]).trim();
        }
      }
      const numberFields = ["year", "semester", "priceInRupees"];
      for (const field of numberFields) {
        if (body[field] !== undefined && String(body[field]).trim() !== "") {
          updates[field] = Number(body[field]);
        }
      }
    } else {
      const formData = await req.formData();
      id = String(formData.get("id") || "").trim();

      const stringFields = ["title", "slug", "subjectCode", "branch", "description", "storagePath"];
      for (const field of stringFields) {
        const val = formData.get(field);
        if (val !== null && String(val).trim() !== "") {
          updates[field] = field === "slug" ? slugify(String(val)) : String(val).trim();
        }
      }

      const numberFields = ["year", "semester", "priceInRupees"];
      for (const field of numberFields) {
        const val = formData.get(field);
        if (val !== null && String(val).trim() !== "") {
          updates[field] = Number(val);
        }
      }

      const htmlFile = formData.get("htmlFile");
      if (htmlFile instanceof File && htmlFile.size > 0 && id) {
        const existingSnap = await getAdminDb().doc(`books/${id}`).get();
        const existingData = existingSnap.data() || {};
        const finalBranch = String(updates.branch || existingData.branch || "general");
        const finalSlug = String(updates.slug || existingData.slug || id);
        const targetPath = `books/${slugify(finalBranch)}/${finalSlug}.html`;
        const blob = await put(targetPath, htmlFile, {
          access: "private",
          contentType: "text/html; charset=utf-8",
          addRandomSuffix: true,
        });
        updates.storagePath = blob.pathname;
      }
    }

    if (!id) {
      return NextResponse.json({ error: "Book id is required" }, { status: 400 });
    }

    await getAdminDb().doc(`books/${id}`).set(updates, { merge: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("admin PATCH error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to update book",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const authResult = await authenticateAdminRequest(req);
  if (!authResult.user) {
    return NextResponse.json({ error: authResult.error || "Admin access required" }, { status: authResult.status });
  }
  const adminUser = authResult.user;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing book id" }, { status: 400 });
    }

    const db = getAdminDb();
    const docRef = db.doc(`books/${id}`);
    const snap = await docRef.get();
    const storagePath = snap.data()?.storagePath;

    await docRef.delete();

    if (storagePath) {
      try {
        await del(storagePath);
      } catch {
        // Ignore if blob was already deleted
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("admin DELETE error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to delete book",
      },
      { status: 500 }
    );
  }
}
