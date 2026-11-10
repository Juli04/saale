import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/providers/theme-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { getBrandingIcon } from "@/lib/branding/icon-server";
import { getWorkspaceName } from "@/lib/branding/workspace";
import brand from "@/lib/pwa/brand.json";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

/**
 * The name and the icon come from the database, so the document title, the
 * apple-touch icon and the favicon are rendered per request rather than baked
 * into the build.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [name, icon] = await Promise.all([getWorkspaceName(), getBrandingIcon()]);
  const version = icon ? `?v=${icon}` : "";

  /*
   * Without an upload the file conventions in `src/app` (icon.png,
   * apple-icon.png) stay in charge. With one, every place a browser looks for a
   * picture points at the rendered sizes.
   */
  const icons: Metadata["icons"] = icon
    ? {
        icon: [
          { url: `/api/branding/icon/32${version}`, sizes: "32x32", type: "image/png" },
          { url: `/api/branding/icon/16${version}`, sizes: "16x16", type: "image/png" },
        ],
        apple: [{ url: `/api/branding/icon/180${version}`, sizes: "180x180", type: "image/png" }],
      }
    : undefined;

  return {
    title: name,
    description: brand.description,
    applicationName: name,
    icons,
    // iOS ignores the manifest's display mode. these tags are how a home-screen
    // install gets its own window and title.
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: "default",
    },
    // Next emits the standards-track `mobile-web-app-capable`. iOS 16.4+ reads the
    // manifest's `display` as well, but older versions only honour Apple's legacy
    // tag, so both are sent.
    other: {
      "apple-mobile-web-app-capable": "yes",
    },
  };
}

/**
 * `viewportFit: "cover"` lets an installed app paint under the status bar and
 * home indicator; the shell compensates with `env(safe-area-inset-*)` padding
 * (see `.shell-frame` in globals.css).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: brand.themeColor.light },
    { media: "(prefers-color-scheme: dark)", color: brand.themeColor.dark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Admin accent overrides, rendered before the first paint so a custom
            accent never flashes the default orange. */}
        {/* eslint-disable-next-line @next/next/no-css-tags -- served from the database, not a file */}
        <link rel="stylesheet" href="/api/branding/theme" data-branding-theme="" />
      </head>
      <body className={`${inter.variable} ${geistMono.variable} font-sans`}>
        <ThemeProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
          <Toaster />
        </ThemeProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
