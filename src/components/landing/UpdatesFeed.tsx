import { createClient } from "@/lib/supabase/server";
import { UpdateType } from "@/lib/constants";
import SectionHeader from "@/components/ui/SectionHeader";
import UpdatesFeedClient from "./UpdatesFeedClient";
import type { Update } from "@/lib/supabase/types";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }
interface Props { sectionConfig?: SectionConfig; }

const FALLBACK_UPDATES: Update[] = [
  { id: 1, type: UpdateType.News, title: "Bienvenidos al nuevo sitio de Soul Jiu Jitsu", body: "Horarios, planes, reglas del mat y toda la información de la academia, ahora en un solo lugar.", date: "2026-08-06", published: true, starts_at: null, expires_at: null, display_order: 1 },
  { id: 2, type: UpdateType.Class, title: "Clases kids: lunes y sábados", body: "Los más pequeños entrenan los lunes a las 5:00 p.m. y los sábados a las 9:30 a.m. Disciplina, respeto y confianza.", date: "2026-08-06", published: true, starts_at: null, expires_at: null, display_order: 2 },
  { id: 3, type: UpdateType.Event, title: "Open mats de fin de semana", body: "Viernes 7:00 p.m. open mat de Gi y sábados 12:00 m.d. open mat de No-Gi. Cierra la semana en el tatami.", date: "2026-08-06", published: true, starts_at: null, expires_at: null, display_order: 3 },
];

export default async function UpdatesFeed({ sectionConfig }: Props) {
  let updates = FALLBACK_UPDATES;
  let interval = 15;

  try {
    const supabase = createClient();
    const now = new Date().toISOString();
    const [{ data: uData }, { data: sData }] = await Promise.all([
      supabase
        .from("updates")
        .select("*")
        .eq("published", true)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .order("display_order", { ascending: true })
        .order("date", { ascending: false }),
      supabase
        .from("site_settings")
        .select("key,value")
        .eq("key", "updates_interval"),
    ]);
    if (uData && uData.length > 0) updates = uData as Update[];
    interval = parseInt(sData?.[0]?.value ?? "15", 10);
  } catch {
    // Use fallback
  }

  return (
    <section id="updates" className="py-14 px-5 nav:px-12">
      <div className="mb-10">
        <SectionHeader
          tag={sectionConfig?.display_subtitle ?? "Al día"}
          title={sectionConfig?.display_title ?? "Novedades"}
        />
      </div>

      <UpdatesFeedClient updates={updates} interval={interval} />
    </section>
  );
}
