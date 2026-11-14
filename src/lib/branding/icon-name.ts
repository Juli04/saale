/**
 * The only directory name the icon store writes.
 *
 * Kept apart from `icon.ts` so the settings registry can validate a name
 * without pulling `sharp` into every process that reads a setting — the same
 * split `avatar-name.ts` uses.
 */

const ICON_NAME_PATTERN = /^icon-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Whether a stored name is one this app generated. */
export function isBrandingIconName(value: string): boolean {
  return ICON_NAME_PATTERN.test(value);
}
