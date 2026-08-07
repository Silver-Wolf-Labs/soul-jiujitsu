"use client";

import { useState } from "react";
import Link from "next/link";
import { useGymProfile } from "@/lib/gym-profile-context";

export default function NavbarClient({ navLinks }: { navLinks: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const profile = useGymProfile();

  return (
    <nav className="bg-[#14110a]/95 supports-[backdrop-filter]:bg-[#14110a]/85 backdrop-blur-md border-b border-white/10 sticky top-0 z-[900] h-16 flex items-center justify-between px-5 nav:px-12">
      {/* Logo */}
      <Link
        href="/#home"
        className="flex items-baseline gap-2 no-underline select-none"
        onClick={() => setOpen(false)}
      >
        <span className="font-display font-soul text-[22px] leading-none text-soul-gold tracking-tight">
          {profile.logoText}
        </span>
        <span className="font-display italic text-[13px] text-[#f8f7f5]/85 leading-none">
          Jiu Jitsu
        </span>
        <span className="hidden sm:inline font-mono text-[9px] tracking-[0.18em] uppercase text-white/35 leading-none">
          {profile.cityName}
        </span>
      </Link>

      {/* Desktop links */}
      <div className="hidden nav:flex items-center">
        {navLinks.map(({ label, href }) => (
          <a
            key={label}
            href={href}
            className="text-white/55 text-[13px] font-medium px-4 h-16 flex items-center border-b-2 border-transparent hover:text-white hover:border-yellow transition-colors duration-150"
          >
            {label}
          </a>
        ))}
        <Link
          href="/portal"
          className="ml-4 text-[12px] font-bold tracking-wider uppercase px-5 h-9 flex items-center rounded border border-white/25 text-white/80 hover:border-white hover:text-white transition-colors duration-150"
        >
          Ingresar
        </Link>
        <Link
          href="/join"
          className="ml-2 bg-yellow text-black text-[12px] font-bold tracking-wider uppercase px-5 h-9 flex items-center rounded hover:bg-yellow-mid transition-colors duration-150"
        >
          Únete
        </Link>
      </div>

      {/* Hamburger */}
      <button
        className="nav:hidden flex flex-col gap-[5px] cursor-pointer bg-transparent border-none p-2 relative z-[950]"
        onClick={() => setOpen((v) => !v)}
        aria-label="Abrir menú"
      >
        <span className={`w-[22px] h-[1.5px] bg-off-white block transition-transform duration-200 ${open ? "translate-y-[6.5px] rotate-45" : ""}`} />
        <span className={`w-[22px] h-[1.5px] bg-off-white block transition-opacity duration-200 ${open ? "opacity-0" : ""}`} />
        <span className={`w-[22px] h-[1.5px] bg-off-white block transition-transform duration-200 ${open ? "-translate-y-[6.5px] -rotate-45" : ""}`} />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-soul-dark z-[800] flex flex-col pt-24 px-8 nav:hidden">
          {navLinks.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="text-off-white text-xl font-medium py-[18px] border-b border-white/10"
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
          <Link
            href="/portal"
            className="mt-6 border border-white/30 text-white text-sm font-bold tracking-wider uppercase px-5 py-4 rounded text-center hover:border-white transition-colors duration-150"
            onClick={() => setOpen(false)}
          >
            Ingresar
          </Link>
          <Link
            href="/join"
            className="mt-3 bg-yellow text-black text-sm font-bold tracking-wider uppercase px-5 py-4 rounded text-center"
            onClick={() => setOpen(false)}
          >
            {profile.joinButtonText}
          </Link>
        </div>
      )}
    </nav>
  );
}
