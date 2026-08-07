import Link from "next/link";
import { type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "yellow" | "ghost" | "ghost-dark";
type Size = "sm" | "md";

interface BaseProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

type ButtonProps = BaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type LinkProps = BaseProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type Props = ButtonProps | LinkProps;

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-black text-white hover:bg-near-black active:scale-95",
  yellow:
    "bg-yellow text-black hover:bg-yellow-mid active:scale-95",
  ghost:
    "bg-transparent text-ink border border-line-dark hover:border-black hover:bg-off-white",
  "ghost-dark":
    "bg-transparent text-white/85 border border-white/25 hover:border-white hover:text-white hover:bg-white/5",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-4 py-2 text-xs",
  md: "px-8 py-3.5 text-xs",
};

const BASE =
  "inline-flex items-center justify-center rounded font-body font-bold tracking-wider uppercase transition-all duration-150 cursor-pointer select-none";

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  href,
  children,
  ...rest
}: Props) {
  const classes = `${BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
