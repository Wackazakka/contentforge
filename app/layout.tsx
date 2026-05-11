import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { AuthProvider } from "@/lib/authContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CenterForge — AI-powered content production",
    template: "%s · CenterForge",
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
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "CenterForge",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CenterForge — AI-powered content production",
    description:
      "Create professional video ads and articles for every social media format in seconds.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script
          defer
          data-domain="centerforge.app"
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      </head>
      <body className="min-h-full flex flex-col bg-cf-bg text-cf-dark">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
