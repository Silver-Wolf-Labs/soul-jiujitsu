import { createClient } from "@/lib/supabase/server";
import { NAV_LINKS } from "@/lib/constants";
import NavbarClient from "./NavbarClient";

export default async function Navbar() {
  let links: { label: string; href: string }[] = NAV_LINKS.map(({ label, href }) => ({ label, href }));
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("nav_items")
      .select("label,href")
      .eq("active", true)
      .order("display_order");
    if (data && data.length > 0) links = data as { label: string; href: string }[];
  } catch { /* use fallback */ }
  return <NavbarClient navLinks={links} />;
}
