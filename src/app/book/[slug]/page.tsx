"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { auth, db, googleProvider } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/adminConfig";
import {
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";

interface BookDoc {
  id: string;
  slug: string;
  title: string;
  subjectCode: string;
  branch?: string;
  year: number;
  semester: number;
  priceInRupees: number;
  description: string;
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string | undefined;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: {
    email: string | null;
    name: string | null;
  };
  handler: (response: RazorpayResponse) => Promise<void>;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open: () => void };
  }
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.sessionStorage.getItem("msbte_session_id");
  if (existing) return existing;
  const fresh = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  window.sessionStorage.setItem("msbte_session_id", fresh);
  return fresh;
}

export default function BookPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const readerContainerRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [book, setBook] = useState<BookDoc | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [bookHtml, setBookHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  // Content protection states
  const [shieldActive, setShieldActive] = useState(false);
  const [shieldReason, setShieldReason] = useState(
    "Screenshots, downloads & screen recording are restricted."
  );
  const [sessionBlocked, setSessionBlocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [watermarkPos, setWatermarkPos] = useState({ top: 18, left: 12 });

  const isAdmin = isAdminEmail(user?.email);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    async function loadBook() {
      if (!db || !slug) {
        setLoading(false);
        return;
      }
      try {
        const q = query(collection(db, "books"), where("slug", "==", slug));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          setBook({ id: docSnap.id, ...(docSnap.data() as Omit<BookDoc, "id">) });
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load book details.");
      } finally {
        setLoading(false);
      }
    }
    loadBook();
  }, [slug]);

  // Register single-device active session (for students)
  const registerSession = useCallback(async (currentUser: User) => {
    if (isAdminEmail(currentUser.email)) return;
    try {
      const token = await currentUser.getIdToken();
      const sessionId = getOrCreateSessionId();
      await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });
      setSessionBlocked(false);
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    async function checkAccess() {
      if (!user || !book || !db) return;
      try {
        let canAccess = isAdminEmail(user.email);

        if (!canAccess) {
          const purchaseRef = doc(db, `users/${user.uid}/purchases/${book.id}`);
          const purchaseSnap = await getDoc(purchaseRef);
          canAccess = purchaseSnap.exists();
        }

        if (canAccess) {
          setUnlocked(true);
          setContentLoading(true);
          await registerSession(user);
          const token = await user.getIdToken();
          const res = await fetch(`/api/book-content?bookId=${book.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            setBookHtml(await res.text());
          } else {
            const errText = await res.text();
            setError(
              `Could not load book content (HTTP ${res.status}): ${errText || "Check Vercel Blob connection."}`
            );
          }
          setContentLoading(false);
        }
      } catch (err) {
        console.error(err);
        setContentLoading(false);
      }
    }
    checkAccess();
  }, [user, book, registerSession]);

  // Single-device heartbeat check every 25s (students only)
  useEffect(() => {
    if (!unlocked || !user || isAdmin) return;
    const interval = window.setInterval(async () => {
      try {
        const token = await user.getIdToken();
        const sessionId = getOrCreateSessionId();
        const res = await fetch(
          `/api/session?sessionId=${encodeURIComponent(sessionId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.active === false) {
            setSessionBlocked(true);
          }
        }
      } catch {
        // Ignore transient network errors
      }
    }, 25000);

    return () => window.clearInterval(interval);
  }, [unlocked, user, isAdmin]);

  // Move watermark gently every 18s to deter cropping/static masking
  useEffect(() => {
    if (!unlocked) return;
    const timer = window.setInterval(() => {
      setWatermarkPos({
        top: 12 + Math.floor(Math.random() * 68),
        left: 8 + Math.floor(Math.random() * 58),
      });
    }, 18000);
    return () => window.clearInterval(timer);
  }, [unlocked]);

  // Screenshot, screen-record, tab-switch, print & download deterrents
  useEffect(() => {
    if (!unlocked) return;

    let releaseTimer: number | null = null;

    function triggerShield(reason: string, autoReleaseMs?: number) {
      setShieldReason(reason);
      setShieldActive(true);
      if (releaseTimer) window.clearTimeout(releaseTimer);
      if (autoReleaseMs) {
        releaseTimer = window.setTimeout(() => setShieldActive(false), autoReleaseMs);
      }
    }

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    function handleKeyDown(e: KeyboardEvent) {
      const key = (e.key || "").toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      if (e.key === "PrintScreen") {
        e.preventDefault();
        triggerShield("Screenshot shortcut blocked.", 3000);
        return;
      }
      if (e.metaKey && e.shiftKey && ["3", "4", "5", "s"].includes(key)) {
        e.preventDefault();
        triggerShield("Screen capture shortcut detected.", 3000);
        return;
      }
      if (ctrl && ["s", "p", "u", "c", "x"].includes(key)) {
        e.preventDefault();
        if (key === "p" || key === "s") {
          triggerShield("Saving and printing books is disabled.", 2500);
        }
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "PrintScreen") {
        triggerShield("Screenshot shortcut blocked.", 3000);
        navigator.clipboard?.writeText("").catch(() => {});
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        triggerShield("Reader paused while switching apps or recording screen.");
      }
    }

    function handleWindowBlur() {
      // Only shield if focus left the entire document (not when clicking inside our own iframe)
      window.setTimeout(() => {
        if (!document.hasFocus()) {
          triggerShield("Protected reader paused — tap below to resume reading.");
        }
      }, 150);
    }

    function handleWindowFocus() {
      setShieldActive(false);
    }

    function handleIframeMessage(e: MessageEvent) {
      if (e.data?.type === "MSBTE_CAPTURE_ATTEMPT") {
        triggerShield("Screenshots, saving & printing are restricted.", 3200);
      }
    }

    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("message", handleIframeMessage);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      if (releaseTimer) window.clearTimeout(releaseTimer);
      document.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("message", handleIframeMessage);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [unlocked]);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement && readerContainerRef.current) {
        await readerContainerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen unsupported on some mobile browsers
    }
  }

  async function handleUnlock() {
    setError("");
    if (!auth) {
      setError("Firebase is not configured yet.");
      return;
    }

    if (!user) {
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        console.error(err);
        setError("Please sign in with Gmail to continue.");
      }
      return;
    }

    if (!book) return;
    setPaying(true);

    try {
      const token = await user.getIdToken();
      const orderRes = await fetch("/api/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bookId: book.id }),
      });

      const orderText = await orderRes.text();
      const orderData = orderText ? JSON.parse(orderText) : {};
      if (!orderRes.ok) {
        throw new Error(orderData.error || `Could not start payment (HTTP ${orderRes.status}).`);
      }

      if (typeof window.Razorpay === "undefined") {
        throw new Error(
          "Razorpay checkout script did not load. Please refresh and try again."
        );
      }

      const rzp = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: "INR",
        name: "MSBTE SmartBooks",
        description: `Unlock ${book.title}`,
        order_id: orderData.orderId,
        prefill: { email: user.email, name: user.displayName },
        handler: async (response: RazorpayResponse) => {
          const verifyRes = await fetch("/api/verify-payment", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              bookId: book.id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          if (verifyRes.ok) {
            window.location.reload();
          } else {
            setError(
              "Payment received, but verification failed. Refresh in a few seconds."
            );
          }
        },
      });

      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="p-10 text-center text-slate-600">Loading book...</div>
    );
  }

  if (!book) {
    return (
      <div className="p-10 text-center">
        <p className="text-slate-700 font-medium mb-4">Book not found.</p>
        <Link href="/" className="text-indigo-600 underline text-sm">
          ← Back to Library
        </Link>
      </div>
    );
  }

  return (
    <div ref={readerContainerRef} className="min-h-screen flex flex-col bg-slate-50 select-none">
      <nav className="px-4 py-3 bg-slate-950 text-white border-b border-white/10 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="text-sm font-medium text-cyan-300 hover:underline shrink-0"
        >
          ← Back to Library
        </Link>
        <div className="flex items-center gap-2.5 truncate">
          {isAdmin && (
            <span className="hidden sm:inline text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 shrink-0">
              Admin Free
            </span>
          )}
          <span className="font-semibold text-sm text-white truncate">
            {book.title} ({book.subjectCode})
          </span>
          {unlocked && bookHtml && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 text-slate-100 shrink-0 cursor-pointer"
            >
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
          )}
        </div>
      </nav>

      {error && (
        <div className="max-w-2xl mx-auto mt-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {contentLoading ? (
        <div className="p-12 text-center text-slate-600">
          Loading protected interactive ebook...
        </div>
      ) : unlocked && bookHtml ? (
        <div className="relative flex-1 flex flex-col overflow-hidden">
          {/* Read-only sandboxed iframe: NO allow-downloads, NO allow-popups, NO allow-top-navigation */}
          <iframe
            title={book.title}
            srcDoc={bookHtml}
            className={`w-full flex-1 border-0 min-h-[92vh] transition duration-200 ${
              shieldActive || sessionBlocked ? "blur-2xl opacity-10 pointer-events-none" : ""
            }`}
            sandbox="allow-scripts allow-same-origin"
          />

          {/* Dynamic Moving User Watermark (pointer-events-none so virtual labs stay 100% interactive) */}
          {user?.email && !isAdmin && (
            <div
              className="pointer-events-none fixed inset-0 z-20 overflow-hidden select-none"
              aria-hidden="true"
            >
              <div
                className="absolute text-[11px] sm:text-xs font-mono font-semibold text-slate-900/20 -rotate-12 whitespace-nowrap transition-all duration-1000"
                style={{ top: `${watermarkPos.top}%`, left: `${watermarkPos.left}%` }}
              >
                {user.email} · MSBTE SmartBooks (Read-Only)
              </div>
              <div
                className="absolute text-[10px] sm:text-[11px] font-mono font-semibold text-slate-900/15 rotate-12 whitespace-nowrap transition-all duration-1000"
                style={{
                  top: `${(watermarkPos.top + 42) % 85}%`,
                  left: `${(watermarkPos.left + 35) % 68}%`,
                }}
              >
                Licensed to {user.email}
              </div>
            </div>
          )}

          {/* Privacy & Capture-Deterrent Shield */}
          {shieldActive && !sessionBlocked && (
            <div
              onClick={() => setShieldActive(false)}
              className="fixed inset-0 z-40 bg-slate-950/92 backdrop-blur-xl flex flex-col items-center justify-center text-center px-6 text-white cursor-pointer"
            >
              <div className="max-w-md p-6 rounded-2xl bg-white/10 border border-white/15">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-300">
                  Protected In-App Reader
                </p>
                <h2 className="text-xl font-extrabold mt-2">Content Temporarily Hidden</h2>
                <p className="text-sm text-slate-300 mt-2">{shieldReason}</p>
                <button
                  type="button"
                  onClick={() => setShieldActive(false)}
                  className="mt-5 px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold cursor-pointer"
                >
                  Tap to Resume Reading
                </button>
              </div>
            </div>
          )}

          {/* Single-Device Active Session Lock Overlay */}
          {sessionBlocked && user && (
            <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center text-center px-6 text-white">
              <div className="max-w-md p-6 rounded-2xl bg-white/10 border border-white/15">
                <p className="text-xs font-bold uppercase tracking-widest text-rose-300">
                  Single-Device Protection
                </p>
                <h2 className="text-xl font-extrabold mt-2">
                  Account Opened on Another Device
                </h2>
                <p className="text-sm text-slate-300 mt-2">
                  Your Gmail account ({user.email}) is active on another browser or device.
                  Books can only be read on one device at a time.
                </p>
                <button
                  type="button"
                  onClick={() => registerSession(user)}
                  className="mt-5 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold cursor-pointer"
                >
                  Continue Reading on This Device
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-2xl border border-slate-200 shadow-lg text-center">
          <div className="flex flex-wrap justify-center gap-2">
            {book.branch && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
                {book.branch}
              </span>
            )}
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700">
              Year {book.year} · Semester {book.semester}
            </span>
          </div>

          <h1 className="text-3xl font-extrabold mt-4 text-slate-900">
            {book.title}
          </h1>
          <p className="text-slate-600 mt-3">{book.description}</p>

          <div className="my-6 p-5 bg-slate-50 rounded-xl text-left text-sm text-slate-700 border border-slate-100">
            <strong>Included in this interactive ebook:</strong>
            <ul className="list-disc ml-5 mt-2 space-y-1.5">
              <li>Simplified MSBTE syllabus-aligned diploma units</li>
              <li>Interactive animations &amp; virtual labs</li>
              <li>Clear engineering diagrams and visual breakdowns</li>
              <li>Complete descriptive answers for repeated PYQs</li>
              <li>In-app interactive reading linked permanently to your Gmail</li>
            </ul>
          </div>

          <button
            onClick={handleUnlock}
            disabled={paying}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold hover:brightness-110 disabled:opacity-60 cursor-pointer shadow-md"
          >
            {paying
              ? "Opening UPI Checkout..."
              : user
              ? `Unlock Full Book for ₹${book.priceInRupees} (UPI)`
              : "Sign in with Gmail to Unlock"}
          </button>
          <p className="text-xs text-slate-500 mt-3">
            One-time payment. Read-only in-app access permanently linked to your Gmail account.
          </p>
        </div>
      )}
    </div>
  );
}
