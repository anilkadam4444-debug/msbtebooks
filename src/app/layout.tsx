import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "MSBTE SmartBooks — Interactive Diploma Ebook Library (All Branches)",
  description:
    "Playful, simplified MSBTE Diploma interactive ebooks with animations, virtual labs, rich diagrams, strict syllabus coverage, and solved repeated PYQs across all major branches.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased selection:bg-indigo-600 selection:text-white">
        {children}
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
