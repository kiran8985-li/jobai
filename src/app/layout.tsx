import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { themeInitScript } from "@/components/theme-toggle";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "JobPilot AI",
  description: "Finds UK jobs that match your CV, tailors your CV for each one, and applies within your limits.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${jakarta.variable} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
