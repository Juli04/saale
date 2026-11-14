import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isBrandingIconSize, readBrandingIcon } from "@/lib/branding/icon";
import { readAdminSettings } from "@/lib/settings/update";

/**
 * GET /api/branding/icon/<size>. One rendered size of the uploaded site icon.
 *
 * Public like the stylesheet and the agent avatar: the favicon and the installed
 * app's icon are fetched by browsers that never signed in, and shared chats show
 * the same mark. The stored directory name is part of the `ETag`, and a new
 * upload writes a new directory, so a browser holding the old bytes revalidates
 * into the new ones.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (!isBrandingIconSize(size)) {
    return new NextResponse(null, { status: 404 });
  }

  const settings = await readAdminSettings();
  const dirName = settings?.brandingIcon ?? "";

  const headers = {
    "Cache-Control": "public, max-age=0, must-revalidate",
    ETag: `"icon-${dirName || "none"}-${size}"`,
  };

  if (!dirName) return new NextResponse(null, { status: 404, headers });

  if (request.headers.get("if-none-match") === headers.ETag) {
    return new NextResponse(null, { status: 304, headers });
  }

  const image = await readBrandingIcon(dirName, size);
  if (!image) return new NextResponse(null, { status: 404, headers });

  return new NextResponse(new Uint8Array(image), {
    headers: { ...headers, "Content-Type": "image/png" },
  });
}
