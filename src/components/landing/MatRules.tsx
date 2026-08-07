import {
  Sunrise,
  Clock,
  AlarmClock,
  Scissors,
  ShowerHead,
  Shirt,
  Handshake,
  Footprints,
  Hand,
  Brain,
  Smile,
  type LucideIcon,
} from "lucide-react";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }
interface Props { sectionConfig?: SectionConfig; }

interface Rule {
  icon: LucideIcon;
  title: string;
  body: string;
}

const RULES: Rule[] = [
  { icon: Sunrise,    title: "¡Show up!",            body: "Muestra tu interés al presentarte a entrenar." },
  { icon: Clock,      title: "Puntualidad",          body: "Llega a la clase con anticipación." },
  { icon: AlarmClock, title: "Si llegas tarde",      body: "Avisa al profesor el motivo con anticipación." },
  { icon: Handshake,  title: "Respeto",              body: "Sé respetuoso y saluda a todos al entrar." },
  { icon: Scissors,   title: "Uñas cortas",          body: "Limpia y corta las uñas de manos y pies." },
  { icon: ShowerHead, title: "Higiene personal",     body: "Usa desodorante, lava manos y dientes." },
  { icon: Shirt,      title: "Aseo del uniforme",    body: "Kimono, rashguard y short siempre limpios." },
  { icon: Footprints, title: "Zapatos fuera del mat", body: "Utiliza zapatos al salir del mat y evita ensuciarte los pies." },
  { icon: Hand,       title: "Pide permiso",         body: "Para ir al baño, tomar agua o usar el celular." },
  { icon: Brain,      title: "Autocontrol",          body: "Controla las sumisiones — no las apliques de golpe, para evitar lesiones." },
];

export default function MatRules({ sectionConfig }: Props) {
  const tag   = sectionConfig?.display_subtitle ?? "Cultura de respeto";
  const title = sectionConfig?.display_title    ?? "Reglas en el mat";

  return (
    <section id="rules" className="bg-soul-dark py-16 nav:py-20 px-5 nav:px-12">
      <div className="inline-flex items-center gap-2 font-mono text-[13px] tracking-ultra uppercase text-yellow border-l-[3px] border-[#e6b323]/60 pl-2.5 mb-4">
        {tag}
      </div>
      <h2 className="text-[clamp(42px,5.5vw,72px)] text-soul-gold font-soul leading-none mb-3">
        {title}
      </h2>
      <p className="text-[15px] text-white/50 max-w-[560px] leading-relaxed mb-10">
        El tatami es de todos. Estas reglas cuidan tu entrenamiento, a tus
        compañeros y el espacio que compartimos.
      </p>

      {/* Rule pills — cream cards like the brand posters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-3 xl:grid-cols-5 gap-4">
        {RULES.map(({ icon: Icon, title: ruleTitle, body }) => (
          <div
            key={ruleTitle}
            className="bg-paper rounded-[26px] p-6 flex flex-col gap-3 hover:-translate-y-0.5 transition-transform duration-200"
          >
            <span className="w-11 h-11 rounded-full bg-[#14110a] flex items-center justify-center">
              <Icon className="w-5 h-5 text-yellow" aria-hidden />
            </span>
            <div>
              <div className="text-[15px] font-bold text-ink leading-snug mb-1">{ruleTitle}</div>
              <p className="text-[13px] text-muted leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Golden rule */}
      <div className="mt-6 bg-yellow rounded-[26px] px-8 py-7 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <span className="w-12 h-12 rounded-full bg-[#14110a] flex items-center justify-center flex-shrink-0">
          <Smile className="w-6 h-6 text-yellow" aria-hidden />
        </span>
        <div>
          <div className="font-soul text-[26px] nav:text-[30px] text-[#14110a] leading-none">
            Nada es personal.
          </div>
          <p className="text-[13.5px] text-[#14110a]/75 mt-1.5 leading-relaxed">
            Entrenamos duro, nos cuidamos entre todos y dejamos el ego fuera del mat.
          </p>
        </div>
      </div>
    </section>
  );
}
