import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import ReduxProvider from "@/components/ReduxProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Team Bucket Dashboard",
  description: "Capacity planning solution integrated with Odoo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ReduxProvider>
          <div className="flex flex-col h-screen">
            <Navbar />
            <div className="flex flex-1 overflow-hidden pb-12">
              <Sidebar />
              <main className="flex-1 overflow-y-auto">
                {children}
              </main>
            </div>
            {/* Fixed Footer */}
            <footer className="fixed bottom-0 left-0 right-0 h-12 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-30">
              <div className="h-full flex items-center justify-center px-6">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                  Powered by{' '}
                  <span className="text-indigo-600 dark:text-indigo-400 font-semibold">CloudSoftWay</span>
                </p>
              </div>
            </footer>
          </div>
        </ReduxProvider>
      </body>
    </html>
  );
}
