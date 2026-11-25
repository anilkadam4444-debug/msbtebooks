import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const authResult = await authenticateAdminRequest(request);
        if (!authResult.user) {
          throw new Error(authResult.error || "Admin access required");
        }

        return {
          allowedContentTypes: [
            "text/html",
            "application/xhtml+xml",
            "text/plain",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB
        };
      },
      onUploadCompleted: async () => {
        // Metadata is saved by /api/admin/books right after client upload resolves
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Blob upload failed" },
      { status: 400 }
    );
  }
}
