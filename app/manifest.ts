import type { MetadataRoute } from "next";
import { getAppSettings, getCompanySettings } from "@/lib/data/settings";

/**
 * The installable app, named and coloured from Settings.
 *
 * A manifest is what lets a till be put on a tablet's home screen and opened full-screen, with no
 * browser chrome for a cashier to wander into. It pairs with `public/sw.js`: the worker is what
 * makes that window still open when the network is down.
 *
 * Built from the company's own settings rather than hard-coded, like every other piece of
 * branding in this app. A deployment that has not filled them in gets the product name, not a
 * blank.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [company, settings] = await Promise.all([getCompanySettings(), getAppSettings()]);
  const name = company.companyName.trim() || "BigHawk";

  return {
    name,
    short_name: name.slice(0, 12),
    description: "Business management and point of sale.",
    // Not the till: BigHawk is more than a till, and the dashboard sends each person where their
    // permissions actually let them go.
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: settings.primaryColor,
    icons: [
      // The company's own logo when there is one. SVG at "any" size rather than a set of
      // generated PNGs: inventing bitmaps from someone's logo is how a brand gets mangled.
      ...(company.logoUrl ? [{ src: company.logoUrl, sizes: "any", type: "image/png" as const, purpose: "any" as const }] : []),
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
