"use client";

import { useState } from "react";
import Link from "next/link";
import { useGymProfile } from "@/lib/gym-profile-context";

export default function NavbarClient({ navLinks }: { navLinks: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const profile = useGymProfile();

  return (
    <nav className="bg-white border-b border-line sticky top-0 z-[900] h-16 flex items-center justify-between px-5 nav:px-12">
      {/* Logo */}
      <Link
        href="/#home"
        className="font-display text-xl tracking-[0.1em] text-black flex items-center gap-2 no-underline"
        onClick={() => setOpen(false)}
      >
        <span className="w-5 h-[5px] bg-black rounded-[1px] inline-block" />
        {profile.logoText}{" "}
        <span className="text-yellow">{profile.logoDot}</span>{" "}
        {profile.cityName}
      </Link>

      {/* Desktop links */}
      <div className="hidden nav:flex items-center">
        {navLinks.map(({ label, href }) => (
          <a
            key={label}
            href={href}
            className="text-muted text-[13px] font-medium px-4 h-16 flex items-center border-b-2 border-transparent hover:text-ink hover:border-yellow transition-colors duration-150"
          >
            {label}
          </a>
        ))}
        <Link
          href="/portal"
          className="ml-4 text-[12px] font-bold tracking-wider uppercase px-5 h-9 flex items-center rounded border border-black text-black hover:bg-black hover:text-white transition-colors duration-150"
        >
          Log In
        </Link>
        <Link
          href="/#contact"
          className="ml-2 bg-black text-white text-[12px] font-bold tracking-wider uppercase px-5 h-9 flex items-center rounded hover:bg-near-black transition-colors duration-150"
        >
          Get Started
        </Link>
      </div>

      {/* Hamburger */}
      <button
        className="nav:hidden flex flex-col gap-[5px] cursor-pointer bg-transparent border-none p-2"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle menu"
      >
        <span className="w-[22px] h-[1.5px] bg-ink block" />
        <span className="w-[22px] h-[1.5px] bg-ink block" />
        <span className="w-[22px] h-[1.5px] bg-ink block" />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-white z-[800] flex flex-col pt-20 px-8 nav:hidden">
          {navLinks.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="text-ink text-xl font-medium py-[18px] border-b border-line"
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
          <Link
            href="/portal"
            className="mt-6 border border-black text-black text-sm font-bold tracking-wider uppercase px-5 py-4 rounded text-center hover:bg-black hover:text-white transition-colors duration-150"
            onClick={() => setOpen(false)}
          >
            Log In
          </Link>
          <Link
            href="/#contact"
            className="mt-3 bg-black text-white text-sm font-bold tracking-wider uppercase px-5 py-4 rounded text-center"
            onClick={() => setOpen(false)}
          >
            Get Started
          </Link>
        </div>
      )}
    </nav>
  );
}
