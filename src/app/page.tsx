"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  auth,
  db,
  googleProvider,
  isFirebaseConfigured,
} from "@/lib/firebase";
import { MSBTE_BRANCHES } from "@/lib/branches";
import { isAdminEmail } from "@/lib/adminConfig";
import Hero3DVisual from "@/components/Hero3DVisual";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";

interface Book {
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

const FEATURES = [
  {
    icon: "🎯",
    title: "Diploma-Level Simplification",
    desc: "Tough engineering concepts explained in crisp, everyday language without compromising technical accuracy.",
    accent: "from-indigo-500/15 to-blue-500/5 border-indigo-200/70",
  },
  {
    icon: "🧪",
    title: "Interactive Animations & Virtual Labs",
    desc: "Move sliders, test mechanisms, and explore live visual simulations right inside every chapter.",
    accent: "from-cyan-500/15 to-sky-500/5 border-cyan-200/70",
  },
  {
    icon: "📐",
    title: "Rich Diagrams & Visuals",
    desc: "Clean, well-labelled engineering diagrams and visual breakdowns that make exam revision effortless.",
    accent: "from-violet-500/15 to-purple-500/5 border-violet-200/70",
  },
  {
    icon: "📝",
    title: "Repeated PYQs Fully Solved",
    desc: "Complete, exam-ready descriptive answers to frequently asked MSBTE previous year question papers.",
    accent: "from-emerald-500/15 to-teal-500/5 border-emerald-200/70",
  },
  {
    icon: "📚",
    title: "100% MSBTE Syllabus & Textbook Depth",
    desc: "Strictly aligned to your official MSBTE syllabus and enriched with standard diploma reference textbooks.",
    accent: "from-amber-500/15 to-orange-500/5 border-amber-200/70",
  },
  {
    icon: "⚡",
    title: "Playful Learning · ₹20–₹35 Lifetime",
    desc: "One nominal UPI payment unlocks the entire interactive book permanently on your Gmail account.",
    accent: "from-rose-500/15 to-pink-500/5 border-rose-200/70",
  },
];

const QUICK_BRANCH_PILLS = [
  "ALL",
  "Mechanical Engineering",
  "Computer Engineering",
  "Civil Engineering",
  "Electrical Engineering",
  "Electronics & Telecommunication (E&TC)",
  "Common (All Branches)",
];

export default function LibraryHome() {
  const [user, setUser] = useState<User | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [selectedYear, setSelectedYear] = useState<number | "ALL">("ALL");
  const [selectedSem, setSelectedSem] = useState<number | "ALL">("ALL");
  const [onlyUnlocked, setOnlyUnlocked] = useState(false);

  const isAdmin = isAdminEmail(user?.email);

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && db) {
        try {
          const snap = await getDocs(
            collection(db, `users/${currentUser.uid}/purchases`)
          );
          setUnlockedIds(new Set(snap.docs.map((d) => d.id)));
        } catch {
          setUnlockedIds(new Set());
        }
      } else {
        setUnlockedIds(new Set());
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    async function loadCatalog() {
      if (!db) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDocs(collection(db, "books"));
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Book)
        );
        list.sort(
          (a, b) =>
            (a.branch || "").localeCompare(b.branch || "") ||
            a.semester - b.semester ||
            a.title.localeCompare(b.title)
        );
        setBooks(list);
      } catch (err) {
        console.error(err);
        setError(
          "Could not load books. Check your Firestore rules and Firebase keys."
        );
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, []);

  const branchOptions = useMemo(() => {
    const set = new Set<string>(MSBTE_BRANCHES);
    books.forEach((b) => {
      if (b.branch) set.add(b.branch);
    });
    return Array.from(set);
  }, [books]);

  async function handleLogin() {
    if (!auth) return;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      setError(
        "Gmail sign-in failed. Make sure this domain is added to Firebase Authorized Domains."
      );
    }
  }

  const filteredBooks = books.filter((b) => {
    const q = search.trim().toLowerCase();
    const bookBranch = b.branch || "Common (All Branches)";
    const matchesSearch =
      !q ||
      b.title.toLowerCase().includes(q) ||
      b.subjectCode.toLowerCase().includes(q) ||
      bookBranch.toLowerCase().includes(q);
    const matchesBranch =
      selectedBranch === "ALL" ||
      bookBranch === selectedBranch ||
      bookBranch === "Common (All Branches)";
    const matchesYear = selectedYear === "ALL" || b.year === selectedYear;
    const matchesSem = selectedSem === "ALL" || b.semester === selectedSem;
    const matchesUnlocked = !onlyUnlocked || isAdmin || unlockedIds.has(b.id);
    return matchesSearch && matchesBranch && matchesYear && matchesSem && matchesUnlocked;
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition">
              M
            </div>
            <div>
              <span className="text-base sm:text-lg font-extrabold tracking-tight text-white block leading-none">
                MSBTE <span className="text-cyan-300">SmartBooks</span>
              </span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide hidden sm:block">
                Interactive Diploma Library
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-white transition">
              What&apos;s Inside
            </a>
            <a href="#library" className="hover:text-white transition">
              Browse Books
            </a>
            <a href="#how-it-works" className="hover:text-white transition">
              How It Works
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            {isFirebaseConfigured ? (
              user ? (
                <>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 hover:brightness-105 transition shadow-sm"
                    >
                      Admin Console
                    </Link>
                  )}
                  <span className="hidden lg:inline text-xs font-medium text-slate-300 max-w-[170px] truncate">
                    {user.email}
                  </span>
                  <button
                    onClick={() => auth && signOut(auth)}
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-white/15 text-slate-200 hover:bg-white/10 transition cursor-pointer"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={handleLogin}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-white text-slate-950 hover:bg-indigo-50 transition shadow-md cursor-pointer flex items-center gap-2"
                >
                  <span>Sign in with Gmail</span>
                </button>
              )
            ) : null}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-slate-950 text-white pt-12 pb-20 sm:pt-16 sm:pb-24">
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.35) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="absolute -top-24 left-1/4 w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[420px] h-[420px] rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          <div className="lg:col-span-7 animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-cyan-200 mb-6 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              All MSBTE Diploma Branches · Playful Interactive Notes
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-extrabold tracking-tight leading-[1.1]">
              Don&apos;t Just Mug Up.{" "}
              <span className="bg-gradient-to-r from-indigo-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                Visualise &amp; Play
              </span>{" "}
              With Every MSBTE Subject.
            </h1>

            <p className="mt-5 text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
              Specially crafted diploma ebooks packed with{" "}
              <strong className="text-white">
                interactive animations, virtual labs, rich diagrams
              </strong>
              , and{" "}
              <strong className="text-white">
                complete descriptive answers to repeated PYQs
              </strong>{" "}
              — strictly aligned to the MSBTE syllabus.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <a
                href="#library"
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-indigo-500/35 hover:brightness-110 hover:-translate-y-0.5 transition"
              >
                Explore Ebook Library ↓
              </a>
              {!user && isFirebaseConfigured && (
                <button
                  onClick={handleLogin}
                  className="px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-sm sm:text-base backdrop-blur-sm transition cursor-pointer"
                >
                  Sign in with Gmail
                </button>
              )}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="px-6 py-3.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-sm sm:text-base hover:bg-amber-300 transition"
                >
                  Open Admin Console →
                </Link>
              )}
            </div>

            <div className="mt-10 pt-6 border-t border-white/10 grid grid-cols-3 gap-4 max-w-lg">
              <div>
                <p className="text-xl sm:text-2xl font-extrabold text-white">
                  ₹20–₹35
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  One-time UPI unlock
                </p>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-extrabold text-cyan-300">
                  100%
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  MSBTE Syllabus-aligned
                </p>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-extrabold text-emerald-300">
                  All Branches
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mech, Comp, Civil &amp; more
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 animate-fade-up-delay">
            <Hero3DVisual />
          </div>
        </div>
      </section>

      {!isFirebaseConfigured && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-8">
          <div className="p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 shadow-sm">
            <h2 className="font-bold text-base mb-1">
              Almost ready — add your environment variables in Vercel
            </h2>
            <p className="text-sm">
              Your library is deployed, but Firebase and Razorpay keys are not
              set yet. Open your project in{" "}
              <strong>
                Vercel Dashboard → Settings → Environment Variables
              </strong>
              , add the keys listed in <code>.env.example</code>, and redeploy.
            </p>
          </div>
        </div>
      )}

      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
            Built Exclusively for Diploma Students
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-3 tracking-tight">
            Everything You Need to Score High — Without Boring PDFs
          </h2>
          <p className="text-slate-600 mt-3 text-sm sm:text-base">
            Every ebook is specially engineered to turn difficult MSBTE subjects
            into an intuitive, exam-ready experience.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`p-6 rounded-2xl bg-gradient-to-br ${f.accent} border bg-white hover:-translate-y-1 hover:shadow-lg transition duration-300`}
            >
              <div className="w-11 h-11 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-xl mb-4">
                {f.icon}
              </div>
              <h3 className="text-lg font-bold text-slate-900">{f.title}</h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="library"
        className="max-w-7xl mx-auto w-full px-4 sm:px-6 pb-20 scroll-mt-20"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">
              Single-Link Public Library
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
              Browse Interactive Ebooks
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Showing{" "}
            <strong className="text-slate-800">{filteredBooks.length}</strong>{" "}
            {filteredBooks.length === 1 ? "book" : "books"}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          {user && !isAdmin && unlockedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setOnlyUnlocked((v) => !v)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                onlyUnlocked
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
              }`}
            >
              ✓ My Unlocked Books ({unlockedIds.size})
            </button>
          )}
          {QUICK_BRANCH_PILLS.map((pill) => {
            const active = selectedBranch === pill;
            return (
              <button
                key={pill}
                type="button"
                onClick={() => setSelectedBranch(pill)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                    : "bg-white text-slate-700 border border-slate-200 hover:border-indigo-300 hover:text-indigo-700"
                }`}
              >
                {pill === "ALL" ? "All Branches" : pill}
              </button>
            );
          })}
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <input
            type="text"
            placeholder="Search subject, code (e.g. 314313), or branch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Branches</option>
            {branchOptions.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) =>
              setSelectedYear(
                e.target.value === "ALL" ? "ALL" : Number(e.target.value)
              )
            }
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Years</option>
            <option value={1}>1st Year</option>
            <option value={2}>2nd Year</option>
            <option value={3}>3rd Year</option>
          </select>

          <select
            value={selectedSem}
            onChange={(e) =>
              setSelectedSem(
                e.target.value === "ALL" ? "ALL" : Number(e.target.value)
              )
            }
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Semesters</option>
            {[1, 2, 3, 4, 5, 6].map((sem) => (
              <option key={sem} value={sem}>
                Semester {sem}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-56 rounded-2xl bg-white border border-slate-200 animate-pulse p-6"
              />
            ))}
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-2xl border border-slate-200 shadow-sm px-4">
            <p className="text-slate-700 font-semibold text-base">
              No matching books found.
            </p>
            {isAdmin ? (
              <Link
                href="/admin"
                className="inline-block mt-4 px-5 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition"
              >
                + Upload a Book in Admin Console
              </Link>
            ) : (
              <p className="text-xs text-slate-500 mt-1.5">
                Try clearing your filters — new interactive branch ebooks are
                added regularly.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBooks.map((book) => {
              const hasFreeAccess = isAdmin || unlockedIds.has(book.id);
              return (
                <Link
                  key={book.id}
                  href={`/book/${book.slug}`}
                  className="group relative flex flex-col justify-between p-6 bg-white rounded-2xl border border-slate-200 hover:border-indigo-400 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-900/5 transition duration-300 overflow-hidden"
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 opacity-75 group-hover:opacity-100 transition" />

                  <div>
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                        Year {book.year} · Sem {book.semester}
                      </span>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                          hasFreeAccess
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {isAdmin
                          ? `Admin Free (₹${book.priceInRupees})`
                          : hasFreeAccess
                          ? "Unlocked ✓"
                          : `₹${book.priceInRupees}`}
                      </span>
                    </div>

                    {book.branch && (
                      <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                        {book.branch}
                      </p>
                    )}

                    <h3 className="text-xl font-extrabold mt-1 text-slate-900 group-hover:text-indigo-700 transition">
                      {book.title}
                    </h3>

                    <p className="text-xs font-mono text-slate-500 mt-1 mb-3">
                      MSBTE Code: {book.subjectCode}
                    </p>

                    <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                      {book.description}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-500">
                      Labs · Diagrams · PYQs
                    </span>
                    <span className="text-indigo-600 group-hover:translate-x-1 transition">
                      {hasFreeAccess ? "Read Now →" : "Preview & Unlock →"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section
        id="how-it-works"
        className="bg-slate-900 text-white py-16 border-t border-white/10"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold">
              Start Learning in 30 Seconds
            </h2>
            <p className="text-slate-400 text-sm mt-2">
              Simple, instant access linked directly to your Gmail account.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Sign in with Gmail",
                text: "One-tap Google sign-in keeps all your unlocked MSBTE ebooks synced across mobile and laptop.",
              },
              {
                step: "02",
                title: "Pick Your Branch & Sem",
                text: "Filter by Mechanical, Computer, Civil, Electrical, E&TC, or 1st-Year Common subjects.",
              },
              {
                step: "03",
                title: "Unlock via UPI (₹20–₹35)",
                text: "Pay once using GPay, PhonePe, or Paytm and enjoy lifetime access to labs, diagrams, and PYQs.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="p-6 rounded-2xl bg-white/5 border border-white/10"
              >
                <span className="text-xs font-black tracking-widest text-cyan-300">
                  STEP {item.step}
                </span>
                <h3 className="text-lg font-bold mt-2">{item.title}</h3>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 text-slate-400 py-8 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-xs">
          <p className="font-medium text-slate-300">
            MSBTE SmartBooks — Interactive Engineering Diploma Ebook Library
          </p>
          <p>
            Simplified Notes · Virtual Labs · Diagrams · Repeated PYQ Answers
          </p>
        </div>
      </footer>
    </div>
  );
}
