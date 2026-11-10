-- The uploaded site icon: a directory of rendered sizes under <uploads>/branding.
-- Empty keeps the shipped favicon, PWA icons and the built-in sidebar mark.
ALTER TABLE "admin_settings" ADD COLUMN "brandingIcon" TEXT NOT NULL DEFAULT '';
