import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { removeBrandingIcon, storeBrandingIcon, validateIconUpload } from "@/lib/branding/icon";
import { serializeAdminSettings } from "@/lib/settings/admin-view";
import { ensureAdminSettings, setSetting } from "@/lib/settings/update";

/** The stored name, replaced (and the old directory removed) on every upload. */
async function replaceIcon(actorUserId: string, dirName: string) {
  const previous = (await ensureAdminSettings()).brandingIcon;
  const view = await setSetting(actorUserId, "admin.brandingIcon", dirName);
  if (previous && previous !== dirName) {
    try {
      await removeBrandingIcon(previous);
    } catch (err) {
      // The new icon is live; leftover files are only wasted disk.
      console.error("Failed to delete the previous site icon:", err);
    }
  }
  return view;
}

/**
 * POST /api/admin/branding/icon. Upload the site icon.
 *
 * Multipart, one `file`. One upload is rendered into every size the app uses
 * (favicon, apple-touch, the manifest's two, the maskable pair and the sidebar
 * mark), so what is stored is never the bytes that arrived.
 */
export async function POST(request: NextRequest) {
  const authResult = await requirePermission("admin", "settings");
  if (!authResult.ok) return authResult.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    console.error("Failed to parse the site icon upload:", err);
    return NextResponse.json({ error: "Expected a multipart upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image in the request" }, { status: 400 });
  }

  const problem = validateIconUpload(file);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    const stored = await storeBrandingIcon(Buffer.from(await file.arrayBuffer()));
    await replaceIcon(authResult.user.id, stored);
  } catch (err) {
    console.error("Failed to store the site icon:", err);
    return NextResponse.json({ error: "Failed to store the image" }, { status: 500 });
  }

  return NextResponse.json({ settings: serializeAdminSettings(await ensureAdminSettings()) });
}

/** DELETE /api/admin/branding/icon. Go back to the shipped icons. */
export async function DELETE() {
  const authResult = await requirePermission("admin", "settings");
  if (!authResult.ok) return authResult.response;

  try {
    await replaceIcon(authResult.user.id, "");
  } catch (err) {
    console.error("Failed to clear the site icon:", err);
    return NextResponse.json({ error: "Failed to clear the icon" }, { status: 500 });
  }

  return NextResponse.json({ settings: serializeAdminSettings(await ensureAdminSettings()) });
}
