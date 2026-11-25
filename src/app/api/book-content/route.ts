import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { isAdminEmail } from "@/lib/adminConfig";

export const dynamic = "force-dynamic";

function injectProtectionLayer(html: string): string {
  const protectionCss = `
<style id="msbte-drm-css">
  html, body {
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
    user-select: none !important;
    -webkit-touch-callout: none !important;
  }
  input, textarea, select, option, button {
    -webkit-user-select: auto !important;
    user-select: auto !important;
  }
  img, svg, canvas, video {
    -webkit-user-drag: none !important;
    user-drag: none !important;
  }
  @media print {
    html, body {
      display: none !important;
      visibility: hidden !important;
    }
  }
</style>`;

  const protectionJs = `
<script id="msbte-drm-js">
(function () {
  function notifyCapture() {
    try {
      window.parent.postMessage({ type: "MSBTE_CAPTURE_ATTEMPT" }, "*");
    } catch (e) {}
  }

  // Block right-click, copy, cut, drag
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); }, true);
  document.addEventListener("copy", function (e) { e.preventDefault(); }, true);
  document.addEventListener("cut", function (e) { e.preventDefault(); }, true);
  document.addEventListener("dragstart", function (e) { e.preventDefault(); }, true);

  // Strip any accidental download links inside book HTML
  document.addEventListener("click", function (e) {
    var target = e.target;
    while (target && target.tagName !== "A") {
      target = target.parentElement;
    }
    if (target && target.tagName === "A") {
      if (target.hasAttribute("download") || (target.href && target.href.indexOf("blob:") === 0)) {
        e.preventDefault();
      }
    }
  }, true);

  // Override window.print
  try {
    window.print = function () { notifyCapture(); };
  } catch (e) {}

  // Block Save, Print, Copy, View Source, DevTools & Screenshot shortcuts
  document.addEventListener("keydown", function (e) {
    var key = (e.key || "").toLowerCase();
    var ctrl = e.ctrlKey || e.metaKey;

    if (e.key === "PrintScreen" || e.keyCode === 44) {
      e.preventDefault();
      notifyCapture();
      return;
    }
    // macOS Cmd+Shift+3 / 4 / 5 or Windows Win+Shift+S
    if (e.metaKey && e.shiftKey && (key === "3" || key === "4" || key === "5" || key === "s")) {
      e.preventDefault();
      notifyCapture();
      return;
    }
    // Ctrl/Cmd + S, P, U, C, X, A
    if (ctrl && (key === "s" || key === "p" || key === "u" || key === "c" || key === "x" || key === "a")) {
      e.preventDefault();
      if (key === "p" || key === "s") notifyCapture();
      return;
    }
    // DevTools shortcuts
    if (e.key === "F12" || (ctrl && e.shiftKey && (key === "i" || key === "j" || key === "c"))) {
      e.preventDefault();
      return;
    }
  }, true);

  document.addEventListener("keyup", function (e) {
    if (e.key === "PrintScreen" || e.keyCode === 44) {
      notifyCapture();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText("").catch(function () {});
      }
    }
  }, true);

  // Notify parent when iframe loses focus (e.g., OS screen-capture overlay)
  window.addEventListener("blur", function () {
    try {
      window.parent.postMessage({ type: "MSBTE_IFRAME_BLUR" }, "*");
    } catch (e) {}
  });
})();
</script>`;

  let out = html;
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${protectionCss}\n</head>`);
  } else {
    out = `${protectionCss}\n${out}`;
  }

  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${protectionJs}\n</body>`);
  } else {
    out = `${out}\n${protectionJs}`;
  }

  return out;
}

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return new NextResponse("Unauthorised", { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const { searchParams } = new URL(req.url);
    const bookId = searchParams.get("bookId");

    if (!bookId) {
      return new NextResponse("Missing bookId", { status: 400 });
    }

    const isAdmin = Boolean(decoded.email_verified && isAdminEmail(decoded.email));

    if (!isAdmin) {
      const purchaseSnap = await getAdminDb()
        .doc(`users/${decoded.uid}/purchases/${bookId}`)
        .get();

      if (!purchaseSnap.exists) {
        return new NextResponse("Payment required", { status: 403 });
      }
    }

    const bookSnap = await getAdminDb().doc(`books/${bookId}`).get();
    const storagePath = bookSnap.data()?.storagePath;
    if (!storagePath) {
      return new NextResponse("Book file path missing", { status: 404 });
    }

    const result = await get(storagePath, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return new NextResponse("Book file not found in Vercel Blob", { status: 404 });
    }

    const rawHtml = await new Response(result.stream).text();
    const protectedHtml = injectProtectionLayer(rawHtml);

    return new NextResponse(protectedHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (err) {
    console.error("book-content error:", err);
    return new NextResponse("Failed to load book content", { status: 500 });
  }
}
