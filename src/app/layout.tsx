import type { Metadata } from "next";
import { Fraunces, Inter, DM_Mono } from "next/font/google";
import "./globals.css";
import { validateEnv } from "@/lib/env";
import { getActiveThemeCssVars } from "@/lib/themes/server";
import { RumInit } from "@/lib/rum";
import { getGymProfile } from "@/lib/gym-profile";
import { GymProfileProvider } from "@/lib/gym-profile-context";

// Fail fast on missing env vars — runs once at cold start
validateEnv();

// Display serif — soft, soulful curves that echo the SOUL logo lettering.
// The SOFT axis rounds the terminals; opsz keeps large sizes elegant.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const profile = await getGymProfile();
  return {
    title: profile.meta.title,
    description: profile.meta.description,
    metadataBase: new URL(profile.meta.url),
    openGraph: {
      title: profile.meta.title,
      description: profile.meta.description,
      type: "website",
    },
  };
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [themeCss, profile] = await Promise.all([
    getActiveThemeCssVars(),
    getGymProfile(),
  ]);
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${inter.variable} ${dmMono.variable}`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body>
        <RumInit />
        <GymProfileProvider profile={profile}>
          {children}
        </GymProfileProvider>
      </body>
    </html>
  );
}
