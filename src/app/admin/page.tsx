"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { auth, googleProvider } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/adminConfig";
import { MSBTE_BRANCHES } from "@/lib/branches";
import { upload } from "@vercel/blob/client";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";

interface AdminBook {
  id: string;
  slug: string;
  title: string;
  subjectCode: string;
  branch: string;
  year: number;
  semester: number;
  priceInRupees: number;
  description: string;
  storagePath: string;
}

interface PurchaseRecord {
  id: string;
  uid: string;
  bookId: string;
  bookTitle: string;
  userEmail: string;
  amountInRupees: number;
  razorpayPaymentId: string;
  unlockedAt: string;
}

interface AdminStats {
  totalBooks: number;
  totalPurchases: number;
  totalRevenueRupees: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function safeParseJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  if (!raw) {
    if (res.status === 413) {
      throw new Error(
        "File is larger than Vercel's 4.5 MB server limit. Make sure BLOB_READ_WRITE_TOKEN is connected on your Private Vercel Blob store so large files upload directly from your browser."
      );
    }
    throw new Error(
      `Server returned an empty response (HTTP ${res.status}). Check Vercel Function Logs and your environment variables.`
    );
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Server returned non-JSON response (HTTP ${res.status}): ${raw.slice(0, 200)}`
    );
  }
}

export default function AdminConsolePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [stats, setStats] = useState<AdminStats>({
    totalBooks: 0,
    totalPurchases: 0,
    totalRevenueRupees: 0,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [branch, setBranch] = useState<string>(MSBTE_BRANCHES[1]);
  const [year, setYear] = useState(2);
  const [semester, setSemester] = useState(4);
  const [priceInRupees, setPriceInRupees] = useState(29);
  const [description, setDescription] = useState("");
  const [storagePath, setStoragePath] = useState("");
  const [htmlFile, setHtmlFile] = useState<File | null>(null);

  const isAdmin = isAdminEmail(user?.email);

  useEffect(() => {
    if (!auth) {
      setAuthChecked(true);
      return;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
  }, []);

  const loadDashboard = useCallback(async (currentUser: User) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const token = await currentUser.getIdToken(true);
      const res = await fetch("/api/admin/books", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(String(data.error || `Failed to load admin data (HTTP ${res.status}).`));
      }
      setBooks((data.books as AdminBook[]) || []);
      setPurchases((data.recentPurchases as PurchaseRecord[]) || []);
      setStats(
        (data.stats as AdminStats) || {
          totalBooks: 0,
          totalPurchases: 0,
          totalRevenueRupees: 0,
        }
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdminEmail(user.email)) {
      loadDashboard(user);
    }
  }, [user, loadDashboard]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setSlug("");
    setSubjectCode("");
    setBranch(MSBTE_BRANCHES[1]);
    setYear(2);
    setSemester(4);
    setPriceInRupees(29);
    setDescription("");
    setStoragePath("");
    setHtmlFile(null);
    setUploadStage("");
  }

  function startEdit(book: AdminBook) {
    setEditingId(book.id);
    setTitle(book.title);
    setSlug(book.slug);
    setSubjectCode(book.subjectCode);
    setBranch(book.branch || MSBTE_BRANCHES[0]);
    setYear(book.year);
    setSemester(book.semester);
    setPriceInRupees(book.priceInRupees);
    setDescription(book.description);
    setStoragePath(book.storagePath || "");
    setHtmlFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setErrorMsg("");
    setStatusMsg("");
    setSaving(true);
    setUploadStage("");

    try {
      const token = await user.getIdToken(true);
      const finalSlug = slug.trim() || slugify(title);
      const branchFolder = slugify(branch) || "general";
      let resolvedStoragePath = storagePath.trim();
      let uploadViaServerFallback = false;

      // Step 1: Upload HTML ebook directly to Private Vercel Blob (supports up to 50 MB)
      if (htmlFile) {
        const targetPath = `books/${branchFolder}/${finalSlug}.html`;
        try {
          setUploadStage("Uploading HTML ebook to Private Vercel Blob...");
          const blob = await upload(targetPath, htmlFile, {
            access: "private",
            handleUploadUrl: "/api/admin/blob-upload",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          resolvedStoragePath = blob.pathname;
        } catch (clientUploadErr) {
          console.warn("Direct Blob client upload failed, trying server fallback:", clientUploadErr);
          if (htmlFile.size <= 4 * 1024 * 1024) {
            uploadViaServerFallback = true;
          } else {
            const detail =
              clientUploadErr instanceof Error ? clientUploadErr.message : "";
            throw new Error(
              `Direct upload to Vercel Blob failed (${detail}). Make sure you created a Private Blob store in Vercel Storage with "Add a read-write token env var" enabled (BLOB_READ_WRITE_TOKEN).`
            );
          }
        }
      }

      // Step 2: Save book metadata in Firestore via /api/admin/books
      setUploadStage("Saving book details to library...");
      let res: Response;

      if (uploadViaServerFallback && htmlFile) {
        const formData = new FormData();
        if (editingId) formData.append("id", editingId);
        formData.append("title", title.trim());
        formData.append("slug", finalSlug);
        formData.append("subjectCode", subjectCode.trim());
        formData.append("branch", branch);
        formData.append("year", String(year));
        formData.append("semester", String(semester));
        formData.append("priceInRupees", String(priceInRupees));
        formData.append("description", description.trim());
        if (resolvedStoragePath) formData.append("storagePath", resolvedStoragePath);
        formData.append("htmlFile", htmlFile);

        res = await fetch("/api/admin/books", {
          method: editingId ? "PATCH" : "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        res = await fetch("/api/admin/books", {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: editingId || undefined,
            title: title.trim(),
            slug: finalSlug,
            subjectCode: subjectCode.trim(),
            branch,
            year,
            semester,
            priceInRupees,
            description: description.trim(),
            storagePath: resolvedStoragePath,
          }),
        });
      }

      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(String(data.error || `Failed to save book (HTTP ${res.status}).`));
      }

      setStatusMsg(editingId ? "Book updated successfully." : "Book uploaded to Vercel Blob & published!");
      resetForm();
      await loadDashboard(user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error saving book.");
    } finally {
      setSaving(false);
      setUploadStage("");
    }
  }

  async function handleQuickPriceUpdate(book: AdminBook, newPrice: number) {
    if (!user || newPrice <= 0) return;
    setErrorMsg("");
    setStatusMsg("");
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/admin/books", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: book.id, priceInRupees: newPrice }),
      });
      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(String(data.error || "Price update failed"));
      }
      setStatusMsg(`Updated price for "${book.title}" to ₹${newPrice}.`);
      await loadDashboard(user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Price update failed.");
    }
  }

  async function handleDelete(book: AdminBook) {
    if (!user) return;
    if (!confirm(`Delete "${book.title}" from the library?`)) return;
    setErrorMsg("");
    setStatusMsg("");
    try {
      const token = await user.getIdToken(true);
      const res = await fetch(`/api/admin/books?id=${encodeURIComponent(book.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(String(data.error || "Delete failed"));
      }
      setStatusMsg(`Deleted "${book.title}".`);
      await loadDashboard(user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  if (!authChecked) {
    return <div className="p-10 text-center text-slate-600">Checking access...</div>;
  }

  if (!user) {
    return (
      <main className="max-w-md mx-auto my-20 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Admin Console</h1>
        <p className="text-sm text-slate-600 mt-2 mb-6">
          Sign in with your administrator Gmail account to manage books, pricing, and platform stats.
        </p>
        <button
          onClick={() => auth && signInWithPopup(auth, googleProvider)}
          className="px-6 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 cursor-pointer"
        >
          Sign in with Gmail
        </button>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="max-w-md mx-auto my-20 p-8 bg-white rounded-2xl border border-red-200 text-center shadow-sm">
        <h1 className="text-xl font-bold text-red-700">Access Denied</h1>
        <p className="text-sm text-slate-600 mt-2 mb-6">
          <strong>{user.email}</strong> does not have admin privileges.
        </p>
        <Link
          href="/"
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium"
        >
          ← Return to Library
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Admin Console — MSBTE SmartBooks
          </h1>
          <p className="text-sm text-slate-600">
            Signed in as <strong>{user.email}</strong> · Storage: <strong>Private Vercel Blob</strong>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-3.5 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
          >
            View Public Library
          </Link>
          <button
            onClick={() => auth && signOut(auth)}
            className="px-3.5 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer"
          >
            Logout
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500 uppercase">Total Books</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{stats.totalBooks}</p>
        </div>
        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500 uppercase">Total Student Unlocks</p>
          <p className="text-3xl font-bold text-indigo-700 mt-1">{stats.totalPurchases}</p>
        </div>
        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500 uppercase">Tracked Revenue</p>
          <p className="text-3xl font-bold text-emerald-700 mt-1">
            ₹{stats.totalRevenueRupees}
          </p>
        </div>
      </section>

      {statusMsg && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorMsg}
        </div>
      )}

      <section className="p-6 bg-white rounded-2xl border border-slate-200 mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            {editingId ? "Edit Book" : "Upload New Interactive Ebook"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-600 underline cursor-pointer"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Book Title *
            </label>
            <input
              required
              type="text"
              placeholder="e.g. Theory of Machines"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!editingId) setSlug(slugify(e.target.value));
              }}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              URL Slug * (becomes /book/slug)
            </label>
            <input
              required
              type="text"
              placeholder="e.g. theory-of-machines"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              MSBTE Subject Code *
            </label>
            <input
              required
              type="text"
              placeholder="e.g. 314313"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Branch *
            </label>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm bg-white"
            >
              {MSBTE_BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Year *
              </label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value={1}>1st</option>
                <option value={2}>2nd</option>
                <option value={3}>3rd</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Semester *
              </label>
              <select
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                {[1, 2, 3, 4, 5, 6].map((s) => (
                  <option key={s} value={s}>
                    Sem {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Price (₹) *
              </label>
              <input
                required
                type="number"
                min={1}
                max={500}
                value={priceInRupees}
                onChange={(e) => setPriceInRupees(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Interactive Ebook HTML File {editingId ? "(optional — replace file)" : "(up to 50 MB)"}
            </label>
            <input
              type="file"
              accept=".html,.htm"
              onChange={(e) => setHtmlFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-slate-50"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Short Description *
            </label>
            <textarea
              required
              rows={2}
              placeholder="Simplified 5-unit interactive ebook with animations, virtual labs, diagrams & PYQ answers."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Or Existing Vercel Blob Pathname (optional if uploading HTML above)
            </label>
            <input
              type="text"
              placeholder="e.g. books/mechanical-engineering/theory-of-machines.html"
              value={storagePath}
              onChange={(e) => setStoragePath(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 cursor-pointer"
            >
              {saving
                ? uploadStage || "Saving..."
                : editingId
                ? "Update Book"
                : "Upload & Publish Book"}
            </button>
          </div>
        </form>
      </section>

      <section className="p-6 bg-white rounded-2xl border border-slate-200 mb-10">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          Published Books ({books.length})
        </h2>

        {loading ? (
          <p className="text-sm text-slate-500">Loading books...</p>
        ) : books.length === 0 ? (
          <p className="text-sm text-slate-500">No books published yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <th className="py-2 pr-4">Book &amp; Code</th>
                  <th className="py-2 pr-4">Branch / Sem</th>
                  <th className="py-2 pr-4">Price (₹)</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {books.map((book) => (
                  <tr key={book.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-slate-900">{book.title}</div>
                      <div className="text-xs text-slate-500">
                        {book.subjectCode} · /book/{book.slug}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      <div>{book.branch}</div>
                      <div className="text-xs text-slate-500">
                        Year {book.year} · Sem {book.semester}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900">₹{book.priceInRupees}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const val = prompt(
                              `New price in ₹ for ${book.title}:`,
                              String(book.priceInRupees)
                            );
                            if (val && !Number.isNaN(Number(val))) {
                              handleQuickPriceUpdate(book, Number(val));
                            }
                          }}
                          className="text-xs text-indigo-600 hover:underline cursor-pointer"
                        >
                          Change
                        </button>
                      </div>
                    </td>
                    <td className="py-3 text-right space-x-2 whitespace-nowrap">
                      <Link
                        href={`/book/${book.slug}`}
                        className="text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => startEdit(book)}
                        className="text-xs font-medium text-indigo-600 hover:underline cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(book)}
                        className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="p-6 bg-white rounded-2xl border border-slate-200">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          Recent Student Unlocks
        </h2>
        {purchases.length === 0 ? (
          <p className="text-sm text-slate-500">No student purchases recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <th className="py-2 pr-4">Student Email</th>
                  <th className="py-2 pr-4">Book</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Payment ID</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p, idx) => (
                  <tr key={`${p.uid}-${p.bookId}-${idx}`} className="border-b border-slate-100">
                    <td className="py-2.5 pr-4 text-slate-800">{p.userEmail || p.uid}</td>
                    <td className="py-2.5 pr-4 font-medium">{p.bookTitle || p.bookId}</td>
                    <td className="py-2.5 pr-4 font-semibold text-emerald-700">
                      {p.amountInRupees ? `₹${p.amountInRupees}` : "Paid"}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-500">
                      {p.razorpayPaymentId || "—"}
                    </td>
                    <td className="py-2.5 text-xs text-slate-500">
                      {p.unlockedAt ? new Date(p.unlockedAt).toLocaleString("en-IN") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
