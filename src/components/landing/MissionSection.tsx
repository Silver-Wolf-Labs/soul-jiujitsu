import { HeartHandshake, Compass, Flame, Scale, Venus } from "lucide-react";

interface SectionConfig { display_title: string | null; display_subtitle: string | null; }
interface Props { sectionConfig?: SectionConfig; }

const VALUES = [
  { icon: HeartHandshake, label: "Respeto" },
  { icon: Compass,        label: "Disciplina" },
  { icon: Flame,          label: "Coraje" },
  { icon: Scale,          label: "Templanza" },
];

export default function MissionSection({ sectionConfig }: Props) {
  const tag   = sectionConfig?.display_subtitle ?? "Misión y visión";
  const title = sectionConfig?.display_title    ?? "Nuestra alma";

  return (
    <section id="mission" className="bg-soul-dark py-16 nav:py-20 px-5 nav:px-12">
      {/* Header */}
      <div className="inline-flex items-center gap-2 font-mono text-[13px] tracking-ultra uppercase text-yellow border-l-[3px] border-[#e6b323]/60 pl-2.5 mb-4">
        {tag}
      </div>
      <h2 className="text-[clamp(42px,5.5vw,72px)] text-off-white leading-none mb-3">
        {title}
      </h2>
      <p className="text-[15px] text-white/50 max-w-[560px] leading-relaxed mb-10">
        Más que una academia de jiu jitsu: una comunidad que transforma vidas
        dentro y fuera del tatami.
      </p>

      {/* Misión / Visión */}
      <div className="grid grid-cols-1 nav:grid-cols-2 gap-5 mb-10">
        <div className="bg-white/[0.035] border border-white/10 rounded-lg p-8 nav:p-10">
          <h3 className="font-soul text-[34px] text-soul-gold leading-none mb-5">
            Misión<span className="text-yellow">.</span>
          </h3>
          <p className="text-[15px] text-white/70 leading-relaxed">
            En <strong className="text-off-white">Soul Jiu Jitsu</strong> enseñamos
            jiu jitsu de manera integral, promoviendo el bienestar físico y mental
            de cada alumno. Nos esforzamos por ser un espacio{" "}
            <strong className="text-off-white">100% seguro, inclusivo y respetuoso</strong>.
            Guiados por los valores de respeto, disciplina, coraje y templanza,{" "}
            <strong className="text-off-white">formamos personas fuertes dentro y fuera del tatami</strong>.
          </p>
        </div>

        <div className="bg-white/[0.035] border border-white/10 rounded-lg p-8 nav:p-10">
          <h3 className="font-soul text-[34px] text-soul-gold leading-none mb-5">
            Visión<span className="text-yellow">.</span>
          </h3>
          <p className="text-[15px] text-white/70 leading-relaxed">
            Ser una academia referente por su compromiso con la{" "}
            <strong className="text-off-white">formación humana y técnica</strong>, y por
            brindar un ambiente sano donde todos puedan entrenar con total
            seguridad, confianza y motivación. Aspiramos a seguir creciendo como
            una <strong className="text-off-white">comunidad unida</strong> que transforma
            vidas a través del jiu jitsu, con un enfoque firme en el respeto y la
            igualdad.
          </p>
        </div>
      </div>

      {/* Women-focused highlight */}
      <div className="flex items-start gap-4 border-l-4 border-yellow bg-[#e6b323]/[0.08] rounded-r-lg px-6 py-5 mb-10 max-w-[860px]">
        <Venus className="w-6 h-6 text-yellow flex-shrink-0 mt-0.5" aria-hidden />
        <p className="text-[15px] text-white/80 leading-relaxed">
          Con un enfoque especial en crear un ambiente donde{" "}
          <strong className="text-yellow">
            las mujeres se sientan protegidas, valoradas y empoderadas
          </strong>{" "}
          en cada entrenamiento.
        </p>
      </div>

      {/* Values */}
      <div className="grid grid-cols-2 nav:grid-cols-4 gap-3 max-w-[860px]">
        {VALUES.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-full px-5 py-3.5 hover:border-[#e6b323]/50 transition-colors duration-200"
          >
            <Icon className="w-[18px] h-[18px] text-yellow flex-shrink-0" aria-hidden />
            <span className="text-[13px] font-semibold tracking-[0.08em] uppercase text-off-white">
              {label}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-10 font-mono text-[11px] tracking-[0.14em] uppercase text-white/30">
        Soul Jiu Jitsu · Afiliados a Sektor Jiu-Jitsu
      </p>
    </section>
  );
}
