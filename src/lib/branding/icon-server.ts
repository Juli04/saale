import { cache } from "react";
import { readAdminSettings } from "@/lib/settings/update";

/**
 * The site icon this instance uses, read once per request.
 *
 * A layout and the manifest both ask for it, so the read is memoized rather than
 * repeated. The value is the directory name the store wrote, or `""` when the
 * admin never uploaded one and the shipped icons should stay.
 */
export const getBrandingIcon = cache(async (): Promise<string> => {
  const settings = await readAdminSettings();
  return settings?.brandingIcon ?? "";
});

/**
 * A URL for one rendered size, carrying the icon's version.
 *
 * The version is the directory name, so a new upload changes every URL that
 * points at it and the browser cannot keep drawing the old picture. Without an
 * icon the built-in file is named instead, which keeps callers free of a branch.
 */
export function brandingIconUrl(size: string, iconName: string, fallback: string): string {
  return iconName ? `/api/branding/icon/${size}?v=${iconName}` : fallback;
}
