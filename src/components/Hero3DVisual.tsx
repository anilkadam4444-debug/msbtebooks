"use client";

import { useState } from "react";

export default function Hero3DVisual() {
  const [tilt, setTilt] = useState({ rx: 8, ry: -14 });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      rx: Math.round(-y * 22),
      ry: Math.round(x * 26 - 8),
    });
  }

  function handleMouseLeave() {
    setTilt({ rx: 8, ry: -14 });
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full max-w-lg mx-auto h-[410px] sm:h-[440px] flex items-center justify-center select-none scene-3d"
      aria-label="Interactive 3D MSBTE Engineering Ebook Preview"
    >
      <div className="absolute w-72 h-72 rounded-full bg-indigo-500/30 blur-3xl glow-orb -top-4 -left-4 pointer-events-none" />
      <div
        className="absolute w-64 h-64 rounded-full bg-cyan-400/25 blur-3xl glow-orb bottom-0 right-0 pointer-events-none"
        style={{ animationDelay: "2.5s" }}
      />

      <div className="absolute w-[330px] h-[330px] sm:w-[370px] sm:h-[370px] rounded-full border border-indigo-300/20 rotate-12 pointer-events-none" />
      <div className="absolute w-[280px] h-[280px] sm:w-[310px] sm:h-[310px] rounded-full border border-dashed border-cyan-300/20 -rotate-12 pointer-events-none" />

      <div
        className="relative w-[240px] sm:w-[270px] h-[320px] sm:h-[345px] transition-transform duration-300 ease-out"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        }}
      >
        <div className="relative w-full h-full book-3d">
          <div
            className="absolute inset-0 rounded-2xl bg-indigo-950/90 border border-indigo-400/20 shadow-2xl"
            style={{ transform: "translateZ(-26px)" }}
          />

          <div
            className="absolute top-2 bottom-2 right-0 w-[26px] rounded-r-sm"
            style={{
              background:
                "repeating-linear-gradient(90deg, #e2e8f0 0px, #f8fafc 2px, #cbd5e1 4px)",
              transform: "rotateY(90deg) translateZ(13px) translateX(13px)",
              transformOrigin: "right center",
            }}
          />

          <div
            className="absolute top-0 bottom-0 left-0 w-[28px] rounded-l-xl bg-gradient-to-b from-indigo-500 via-violet-600 to-indigo-800 border-l border-white/20 flex items-center justify-center"
            style={{
              transform: "rotateY(-90deg) translateZ(14px) translateX(-14px)",
              transformOrigin: "left center",
            }}
          >
            <span className="-rotate-90 text-[10px] font-bold tracking-[0.22em] text-indigo-100/90 whitespace-nowrap">
              MSBTE INTERACTIVE
            </span>
          </div>

          <div
            className="absolute inset-0 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-white/20 shadow-[0_25px_70px_-15px_rgba(79,70,229,0.65)] p-5 flex flex-col justify-between"
            style={{ transform: "translateZ(0px)" }}
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="w-1/2 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent shimmer-bar" />
            </div>

            <div className="relative z-10 flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full bg-cyan-400/15 text-cyan-300 border border-cyan-300/30">
                MSBTE K &amp; I Scheme
              </span>
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
              </span>
            </div>

            <div className="relative z-10 my-2 p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="flex items-center justify-center gap-1 h-24 relative">
                <svg
                  viewBox="0 0 100 100"
                  className="w-20 h-20 text-indigo-400 spin-slow drop-shadow-[0_0_12px_rgba(129,140,248,0.6)]"
                  fill="none"
                >
                  <path
                    d="M50 18 L55 8 L63 10 L64 21 C68 23 71 25 74 28 L85 24 L89 31 L81 40 C82 43 83 47 83 50 C83 53 82 57 81 60 L89 69 L85 76 L74 72 C71 75 68 77 64 79 L63 90 L55 92 L50 82 C47 82 43 82 40 81 L35 91 L27 89 L26 78 C23 76 20 73 17 70 L6 74 L2 67 L10 58 C9 55 8 52 8 48 C8 45 9 41 10 38 L2 29 L6 22 L17 26 C20 23 23 20 26 18 L27 7 L35 5 L40 15 C43 16 47 17 50 18 Z"
                    stroke="currentColor"
                    strokeWidth="3.2"
                    fill="rgba(99,102,241,0.18)"
                  />
                  <circle
                    cx="46"
                    cy="49"
                    r="15"
                    stroke="#38bdf8"
                    strokeWidth="3"
                    fill="rgba(15,23,42,0.85)"
                  />
                  <circle cx="46" cy="49" r="5" fill="#38bdf8" />
                </svg>

                <svg
                  viewBox="0 0 100 100"
                  className="w-12 h-12 -ml-3 mt-8 text-cyan-300 spin-reverse drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]"
                  fill="none"
                >
                  <path
                    d="M50 16 L56 6 L65 9 L66 20 C70 22 74 25 77 29 L88 26 L92 34 L83 43 C84 46 84 54 83 57 L92 66 L88 74 L77 71 C74 75 70 78 66 80 L65 91 L56 94 L50 84 C46 84 42 84 38 82 L31 91 L22 87 L23 76 C19 73 16 69 14 65 L3 67 L0 58 L10 51 C10 47 10 43 11 39 L2 31 L7 23 L18 26 C21 22 25 19 29 17 L30 6 L39 4 L45 15 C47 15 48 16 50 16 Z"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="rgba(34,211,238,0.18)"
                  />
                  <circle
                    cx="47"
                    cy="50"
                    r="14"
                    stroke="#a5b4fc"
                    strokeWidth="3.5"
                    fill="rgba(15,23,42,0.9)"
                  />
                </svg>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-300 font-mono">
                <span>LIVE VIRTUAL LAB</span>
                <span className="text-emerald-300">60 FPS · 3D</span>
              </div>
            </div>

            <div className="relative z-10">
              <p className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider">
                All Diploma Branches
              </p>
              <h3 className="text-xl font-extrabold text-white leading-tight mt-0.5">
                Interactive Smart Ebooks
              </h3>
              <p className="text-[11px] text-slate-300/90 mt-1">
                Animations · Diagrams · Solved PYQs
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2.5 absolute -right-14 top-7 px-3.5 py-2.5 rounded-xl bg-slate-900/85 border border-cyan-400/35 backdrop-blur-md shadow-xl card-3d-a">
            <div className="w-8 h-8 rounded-lg bg-cyan-400/20 border border-cyan-300/30 flex items-center justify-center text-cyan-300 text-sm font-bold">
              ⚡
            </div>
            <div>
              <p className="text-[11px] font-bold text-white leading-none">
                Virtual Labs
              </p>
              <p className="text-[10px] text-cyan-200/80 mt-1">
                Play &amp; Visualise
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2.5 absolute -left-16 bottom-12 px-3.5 py-2.5 rounded-xl bg-slate-900/85 border border-emerald-400/35 backdrop-blur-md shadow-xl card-3d-b">
            <div className="w-8 h-8 rounded-lg bg-emerald-400/20 border border-emerald-300/30 flex items-center justify-center text-emerald-300 text-sm font-bold">
              ✓
            </div>
            <div>
              <p className="text-[11px] font-bold text-white leading-none">
                Repeated PYQs
              </p>
              <p className="text-[10px] text-emerald-200/80 mt-1">
                Full Exam Answers
              </p>
            </div>
          </div>

          <div
            className="absolute -right-6 -bottom-4 px-3.5 py-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-extrabold text-xs shadow-[0_10px_30px_rgba(251,191,36,0.45)]"
            style={{ transform: "translateZ(65px)" }}
          >
            Unlock ₹20 – ₹35
          </div>
        </div>
      </div>
    </div>
  );
}
