import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isSupportedOtpType(type: string | null): type is "invite" | "magiclink" {
  return type === "invite" || type === "magiclink";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (tokenHash && isSupportedOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  const errorUrl = new URL("/", request.url);
  errorUrl.searchParams.set("auth_error", "1");
  return NextResponse.redirect(errorUrl);
}
