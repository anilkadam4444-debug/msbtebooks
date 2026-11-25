import { NextResponse } from "next/server";
import { getAdminEnvDiagnostics } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getAdminEnvDiagnostics());
}
