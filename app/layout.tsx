import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Archivo,
  Hanken_Grotesk,
  Instrument_Serif,
  JetBrains_Mono,
} from "next/font/google";
import Script from "next/script";
import { AuthProvider } from "@/lib/authContext";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import { getTenant, ROOT_TENANT } from "@/lib/tenantServer";
import { produktnavn } from "@/lib/tenantNames";
import { TenantProvider } from "@/lib/tenantContext";
import GlobalFooter from "@/components/GlobalFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Daylight Studio brand fonts
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["500", "700"],
});

// Per-tenant metadata: root beholder dagens verdier ordrett; andre tenants får navn-basert metadata (ingen OG-bilde i v1)
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  if (tenant.slug === ROOT_TENANT.slug) {
    return {
      title: {
        default: "CenterForge — AI-powered content production",
        template: "%s · CenterForge",
      },
      icons: {
        icon: "/icon.svg",
        shortcut: "/icon.svg",
        apple: "/icon.svg",
      },
      verification: {
        google: "Z6Bt8HoaQ2C05RcapYPZ1NmNt4Hpr-PYOuEWTdY42QU",
      },
      description:
        "Create professional video ads and articles for every social media format in seconds. No design skills required.",
      metadataBase: new URL("https://centerforge.app"),
      openGraph: {
        type: "website",
        url: "https://centerforge.app",
        siteName: "CenterForge",
        title: "CenterForge — AI-powered content production",
        description:
          "Create professional video ads and articles for every social media format in seconds. No design skills required.",
        images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "CenterForge" }],
      },
      twitter: {
        card: "summary_large_image",
        title: "CenterForge — AI-powered content production",
        description:
          "Create professional video ads and articles for every social media format in seconds.",
        images: ["/og-image.png"],
      },
      robots: { index: true, follow: true },
    };
  }
  // Tittel og beskrivelse er det man ser i fanen, i soekeresultater og naar
  // lenken deles. De var HARDKODET paa norsk for alle white-labels — en
  // engelsk tjeneste som Isabel's VideoMaker fikk «AI-drevet
  // innholdsproduksjon» i fanen (Lars 3/8). Foelger naa tenantens spraak.
  const paaEngelsk = (tenant.default_locale || 'no') === 'en'
  // Fanen navngir TJENESTEN, ikke selskapet (IndigoBoom driver PromoMaker).
  // Er de samme navnet, gir produktnavn() selskapsnavnet tilbake.
  const produkt = produktnavn(tenant)
  // Malen under antar at hver white-label driver INNHOLDSPRODUKSJON. Det gjoer
  // de ikke alle — VoiceBank selger rettighetsforvaltning, og fikk «AI-drevet
  // innholdsproduksjon» i fanen og i hver delt lenke. Tenanter kan derfor
  // overstyre begge feltene; staar de tomme, gjelder malen som foer.
  const tittel = tenant.meta_title?.trim() || (paaEngelsk
    ? `${produkt} — AI-powered content production`
    : `${produkt} — AI-drevet innholdsproduksjon`)
  const beskrivelse = tenant.meta_description?.trim() || (paaEngelsk
    ? `Create professional videos and articles in seconds with ${produkt}.`
    : `Lag profesjonelle videoer og artikler på sekunder med ${produkt}.`)
  return {
    title: { default: tittel, template: `%s · ${produkt}` },
    description: beskrivelse,
    icons: { icon: tenant.icon_url || "/icon.svg" },
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const tenant = await getTenant();
  const isRoot = tenant.slug === ROOT_TENANT.slug;

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} ${hankenGrotesk.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
      // Tenant-farger som inline CSS-variabler på <html> — slår :root i globals.css
      style={tenant.colors as React.CSSProperties}
    >
      <head>
        {isRoot && (
          <Script
            defer
            data-domain="centerforge.app"
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        )}
      </head>
      <body className="min-h-full flex flex-col" style={{ background: "var(--paper)", color: "var(--ink)" }}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TenantProvider tenant={{ id: tenant.id, slug: tenant.slug, app_name: tenant.app_name, product_name: tenant.product_name ?? null, logo_url: tenant.logo_url, billing_mode: tenant.billing_mode, price_multiplier: Number(tenant.price_multiplier) || 1, vertical: tenant.vertical ?? null, currency: tenant.currency ?? 'nok', show_language_toggle: tenant.show_language_toggle !== false, show_advanced_admin: tenant.show_advanced_admin !== false, twinledger_enabled: tenant.twinledger_enabled ?? null }}>
            <AuthProvider>{children}</AuthProvider>
            <GlobalFooter />
          </TenantProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
