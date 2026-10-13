"use client";

import type { ReactNode } from "react";
import Image from "next/image";

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({
  children,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Top Navbar */}
      <header className="w-full h-16 bg-white border-b border-gray-100 flex items-center px-6 z-20">
        <div className="flex items-center gap-2">
          <Image src="/Logo.png" alt="Khel.ai" width={32} height={32} className="w-8 h-8" />
          <span className="text-black font-semibold text-lg">Khel.ai</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-start md:items-center justify-center relative overflow-hidden bg-white py-6">
        
        {/* 1. The Grid Layer (SVG based for maximum visibility) */}
        <div 
          className="absolute inset-0 z-0 opacity-[0.15]"
          style={{ 
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23000' stroke-width='1'/%3E%3C/svg%3E")`,
            // This mask makes the grid fade out toward the edges like your design
            WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 80%)',
            maskImage: 'radial-gradient(circle, black 30%, transparent 80%)'
          }}
        ></div>

        {/* 2. Your Specific Radial Gradient (The Glow) */}
        <div 
          className="absolute inset-0 z-0"
          style={{ 
            background: "radial-gradient(33.35% 33.35% at 50% 50%, rgba(248, 250, 251, 0.00) 0%, #F8FAFB 100%)" 
          }}
        ></div>

        {/* Content */}
        <div className="relative z-10 w-full flex justify-center px-4 py-6 md:py-0">
          {children}
        </div>
      </main>

      {/* Bottom Bar */}
      <footer className="h-12 flex items-center px-6 text-sm text-gray-400 bg-white border-t border-gray-100">
        © 2026 Khel.ai. All rights reserved.
      </footer>
    </div>
  );
}
