import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Karaoké : paroles synchronisées mot par mot",
  description: "Lecteur karaoké façon KaraFun : paroles synchronisées mot par mot, bibliothèque, écoute partagée et séparation voix / instrumental.",
  applicationName: "Karaoké",
  openGraph: {
    title: "Karaoké",
    description: "Paroles synchronisées mot par mot, écoute partagée multi-appareils.",
    type: "website",
    siteName: "Karaoké",
  },
  twitter: {
    card: "summary_large_image",
    title: "Karaoké",
    description: "Paroles synchronisées mot par mot, écoute partagée multi-appareils.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
