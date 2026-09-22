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
import { getTenant, getTenantCanonicalOrigin, ROOT_TENANT } from "@/lib/tenantServer";
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
  // 🔑 SPRAAKET ER BESOEKENDES VALG, IKKE TENANTENS STANDARD. Her sto
  // `tenant.default_locale` — altsaa endret spraakvelgeren hele sida, men
  // IKKE fanen, ikke soekeresultatet og ikke det som stod i et delt lenkekort.
  // getLocale() leser cookien foerst og faller tilbake paa default_locale, saa
  // den daekker begge tilfellene.
  const locale = await getLocale()
  const paaEngelsk = locale === 'en'
  // Fanen navngir TJENESTEN, ikke selskapet (IndigoBoom driver PromoMaker).
  // Er de samme navnet, gir produktnavn() selskapsnavnet tilbake.
  const produkt = produktnavn(tenant)
  // Tenantens egen tekst PAA DETTE SPRAAKET (086). De enspraaklige kolonnene
  // blir staaende som fallback for spraak ingen har fylt ut, saa en tenant
  // aldri mister teksten sin i overgangen.
  const egen = tenant.meta_i18n?.[locale]
  // Malen under antar at hver white-label driver INNHOLDSPRODUKSJON. Det gjoer
  // de ikke alle — VoiceBank selger rettighetsforvaltning, og fikk «AI-drevet
  // innholdsproduksjon» i fanen og i hver delt lenke. Tenanter kan derfor
  // overstyre begge feltene; staar de tomme, gjelder malen som foer.
  const tittel = egen?.title?.trim() || tenant.meta_title?.trim() || (paaEngelsk
    ? `${produkt} — AI-powered content production`
    : `${produkt} — AI-drevet innholdsproduksjon`)
  const beskrivelse = egen?.description?.trim() || tenant.meta_description?.trim() || (paaEngelsk
    ? `Create professional videos and articles in seconds with ${produkt}.`
    : `Lag profesjonelle videoer og artikler på sekunder med ${produkt}.`)
  // INDEKSERING (085). Standard AV: en white-label skal ikke konkurrere med
  // forvalteren i sok. Men TwinLedger er ikke en white-label -- det er
  // destinasjonen produsenter skal FINNE, og en katalog ingen finner er ingen
  // katalog. Derfor en bryter per tenant i stedet for et unntak i koden.
  const indekseres = tenant.allow_indexing === true;
  // Kanonisk adresse mot tenantens EGNE domene, ikke verten man kom inn paa:
  // samme TwinLedger kan ligge paa bade twinledger.ai og
  // twinledger.norditech.io, og uten dette ville Google sett duplikater av hver
  // eneste rettighetshaver.
  const kanonisk = await getTenantCanonicalOrigin(tenant);
  return {
    title: { default: tittel, template: `%s · ${produkt}` },
    description: beskrivelse,
    // 🔑 INGEN FILKONVENSJON-IKONER I app/. app/favicon.ico ble injisert for
    // ALLE tenanter med sizes="256x256", og nettlesere foretrekker en ICO med
    // stoerrelse foran en SVG uten — saa TwinLedger viste CenterForges ikon
    // selv med icon_url satt (22.09). ICO-en ligger naa i public/ for gamle
    // nettlesere som ber om /favicon.ico paa egen haand; det eneste <link>
    // er tenantens eget.
    icons: { icon: [{ url: tenant.icon_url || "/icon.svg", type: "image/svg+xml" }] },
    ...(indekseres ? { metadataBase: new URL(kanonisk) } : {}),
    robots: indekseres
      ? { index: true, follow: true }
      : { index: false, follow: false },
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
          <TenantProvider tenant={{ id: tenant.id, slug: tenant.slug, app_name: tenant.app_name, product_name: tenant.product_name ?? null, logo_url: tenant.logo_url, billing_mode: tenant.billing_mode, price_multiplier: Number(tenant.price_multiplier) || 1, vertical: tenant.vertical ?? null, currency: tenant.currency ?? 'nok', show_language_toggle: tenant.show_language_toggle !== false, show_advanced_admin: tenant.show_advanced_admin !== false, twinledger_enabled: tenant.twinledger_enabled ?? null, publishing_enabled: tenant.publishing_enabled ?? null }}>
            <AuthProvider>{children}</AuthProvider>
            <GlobalFooter />
          </TenantProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
