# MSBTE SmartBooks v3.0 — Protected Multi-Branch Interactive Ebook Library

100% Free-Tier Stack: **Next.js 16 (Vercel)** + **Firebase Spark (Auth + Firestore)** + **Private Vercel Blob** + **Razorpay UPI**.

## What's New in v3.0
- **Read-Only In-App Reader (No Downloads):** Private Vercel Blob streaming (`Content-Disposition: inline`, `Cache-Control: no-store`), sandboxed iframe without `allow-downloads`, disabled right-click/copy/Save/Print/DevTools shortcuts, and blank `@media print` protection.
- **Screenshot & Screen-Recording Deterrents:** Moving Gmail watermark overlay across the reader, instant blur/blackout privacy shield on `PrintScreen` / OS capture shortcuts / tab switch / window blur.
- **Single-Device Active Session Lock:** Stops students from sharing one paid Gmail account across multiple devices simultaneously (admin exempt).
- **Fullscreen Reader Mode & "My Unlocked Books" Filter:** Cleaner mobile reading and instant access to purchased books.
- **Clear Admin Diagnostics:** Surfaces exact Firebase Admin setup errors instead of hiding them behind "Admin access required".

## Fresh GitHub + Vercel Setup
1. Extract this `.zip` and push the **contents** (so `package.json` is in the repo root) to your new GitHub repository.
2. Import the repo in **Vercel**, connect a **Private Vercel Blob** store (check *Add read-write token env var*), and add your Firebase + Razorpay Environment Variables from `.env.example`.
3. Paste `firestore.rules` into **Firebase Console -> Firestore Database -> Rules** and click **Publish**.
