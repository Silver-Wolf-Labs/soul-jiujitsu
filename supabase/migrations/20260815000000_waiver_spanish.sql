-- Traduce la exoneración de responsabilidad al español de Costa Rica.
--
-- POR QUÉ UNA MIGRACIÓN NUEVA Y NO UN UPDATE A LAS VIEJAS
-- -------------------------------------------------------
-- 20240115 / 20240117 / 20240126 / 20240131 / 20240141 ya corrieron en
-- producción. Editarlas no cambiaría nada en la base (Supabase no vuelve a
-- aplicar una migración ya registrada) y sí rompería la trazabilidad de qué
-- texto firmó cada persona. Esta migración es el único lugar donde vive el
-- texto en español.
--
-- QUÉ HACE, SEGÚN EL ESTADO DE LA BASE
-- ------------------------------------
--   a) La plantilla activa ya está en español  → no hace nada (idempotente).
--   b) La plantilla activa NO tiene firmas      → la reescribe en su lugar y
--      sube `version`. Nadie firmó ese texto, así que no hay archivo legal
--      que preservar.
--   c) La plantilla activa TIENE firmas         → inserta una plantilla NUEVA
--      en español y la activa; la vieja queda inactiva e intacta. Es la misma
--      regla que aplica `updateWaiverTemplate` en src/lib/actions/waivers.ts:
--      una firma es un archivo legal de lo que la persona leyó, y mutar el
--      body_md haría que `waiver_signatures.snapshot_md` (correcto) y la
--      plantilla (reescrita) contaran historias distintas.
--   d) No hay ninguna plantilla                → inserta la española activa.
--
-- La versión nueva se calcula como MAX(version) + 1 sobre TODAS las
-- plantillas, no sobre la activa. Esto es intencional: las firmas dibujadas se
-- guardan en Storage bajo la ruta determinística `<member_id>/<version>.png`
-- (ver signWaiver en src/lib/actions/waivers.ts). Si dos plantillas distintas
-- compartieran número de versión, la firma de la segunda sobrescribiría la
-- imagen de la primera para cualquier miembro que firmara ambas.
--
-- NO se toca `members.waiver_status`. Traducir el documento no cambia lo que
-- se pactó, y marcar a todo el padrón como 'expired' obligaría a cientos de
-- personas a volver a firmar — eso es una decisión del gimnasio (y de su
-- abogado), no de una migración. Quien ya firmó sigue en 'signed'; la pantalla
-- de admin del miembro mostrará "Signed v1 · Current v2", que es justamente la
-- señal que el gimnasio necesita para decidir.
--
-- Los tokens [GYM NAME], [GYM ADDRESS] y [GYM EMAIL] se conservan literales:
-- src/lib/waiver-substitute.ts los sustituye al renderizar y al archivar el
-- snapshot. Traducirlos o renombrarlos dejaría "[GYM NAME]" impreso en el
-- documento que firma la gente.

DO $$
DECLARE
  v_active_id    int;
  v_sig_count    int;
  v_next_version int;
  v_title        text := 'Membresía y exoneración de responsabilidad';
  v_body         text := $WAIVER$
# Membresía y exoneración de responsabilidad

Por medio del presente documento me matriculo en las clases de entrenamiento de **[GYM NAME]**, ubicado en **[GYM ADDRESS]**.

## Exoneración y renuncia de responsabilidad

Como contraprestación por permitirme participar en los entrenamientos y en todas las actividades relacionadas que realiza [GYM NAME], yo, por mí y en nombre de mi cónyuge, mis representantes legales, mis herederos y mis cesionarios, por este medio **libero, exonero y descargo de toda responsabilidad** a [GYM NAME], a sus administradores, directivos, apoderados, personas voluntarias y personal empleado, a las demás personas participantes (en adelante, las "personas exoneradas") y, cuando corresponda, a las personas propietarias y arrendadoras del inmueble donde se realizan las actividades, de toda responsabilidad (conocida o desconocida) frente a mí, mi cónyuge, mis representantes legales, mis herederos y mis cesionarios, por cualquier pérdida o daño y por cualquier reclamo de indemnización que de ello derive, con motivo de lesiones a mi persona o a mis bienes, incluso lesiones que causen mi muerte, sean estas ocasionadas por la negligencia o la culpa grave de las personas exoneradas o por cualquier otra causa, mientras participo en dichos entrenamientos o actividades relacionadas.

## Compromiso de no demandar

Además, acepto y me comprometo a no interponer ni impulsar, ni permitir que se interponga o se impulse, ni colaborar en modo alguno con la interposición o el trámite de cualquier demanda o reclamo contra [GYM NAME], ubicado en [GYM ADDRESS].

## Asunción de riesgo e indemnidad

Asumo plena responsabilidad por el riesgo de sufrir lesiones corporales, la muerte o daños a mis bienes, sea por negligencia de las personas exoneradas o por cualquier otra causa, mientras me encuentre en las instalaciones de [GYM NAME] o mientras participe en las actividades de entrenamiento.

Entiendo que el jiu-jitsu brasileño es un deporte de contacto que se practica con gi y sin gi (no-gi), que incluye wrestling, sparring (rolar) y competencia, y que conlleva riesgos inherentes de lesión que ninguna medida de seguridad elimina por completo, entre ellos: golpes, torceduras, esguinces, luxaciones, fracturas, lesiones de articulaciones y de columna, cortes, infecciones de la piel, pérdida momentánea del conocimiento y, en casos extremos, lesiones permanentes o la muerte. Acepto participar conociendo estos riesgos.

Acepto indemnizar a las personas exoneradas y mantenerlas libres de toda pérdida, responsabilidad, daño o costo en que puedan incurrir con motivo de mi presencia en las instalaciones de [GYM NAME], sea por negligencia de las personas exoneradas o por cualquier otra causa. Indemnizaré, dejaré a salvo y mantendré en indemnidad a cada una de las personas exoneradas respecto de cualquier gasto judicial, costas procesales, honorarios de abogado, pérdida, responsabilidad, daño o costo en que cualquiera de ellas incurra como consecuencia de dicho reclamo.

## Declaración de salud

Declaro que no causaré ni intentaré causar lesión alguna a mi persona ni a ninguna otra persona participante, instructora o espectadora. Declaro y garantizo que he consultado a un médico debidamente autorizado para ejercer, que me encuentro en buen estado de salud y que no presento condiciones físicas ni mentales que pongan en peligro mi bienestar ni el de las demás personas participantes o instructoras.

## Condiciones de cancelación

Acepto las siguientes condiciones de cancelación: la notificación de cancelación debe enviarse por correo electrónico o entregarse en la academia de forma personal o por correo certificado. La notificación debe indicar que ya no deseo mantener esta membresía ni las obligaciones que de ella derivan, y debe entregarse o enviarse **30 días naturales antes del siguiente cobro**. La notificación debe enviarse al correo **[GYM EMAIL]**.

## Autorización de uso de imagen

Autorizo de forma gratuita, sin promesa, declaración ni expectativa de compensación alguna, el uso de cualquier fotografía, imagen, grabación o material audiovisual en el que aparezca mi imagen o mi semejanza, para publicidad, videos instructivos en cualquier medio o formato, programas de entrenamiento en línea o materiales de mercadeo destinados a promover las artes marciales, el deporte o el acondicionamiento físico.

## Divisibilidad de las cláusulas

Acepto expresamente que esta exoneración, renuncia y acuerdo de indemnidad se pacta con el alcance más amplio e inclusivo que permita la legislación aplicable de la República de Costa Rica y que, si alguna de sus partes fuera declarada inválida, las demás continuarán con plena fuerza y efecto legal.

## Reconocimiento y aceptación

Declaro y garantizo que he leído cuidadosamente la exoneración y la renuncia anteriores, que comprendo su contenido y que firmo este documento por mi propia voluntad; asimismo, acepto que no se me han hecho declaraciones, manifestaciones ni ofrecimientos verbales distintos del acuerdo escrito anterior.
$WAIVER$;
BEGIN
  SELECT id INTO v_active_id
    FROM public.waiver_templates
   WHERE active = true
   ORDER BY id
   LIMIT 1;

  -- (a) Ya está en español — nada que hacer.
  IF v_active_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.waiver_templates
        WHERE id = v_active_id
          AND body_md LIKE '%Exoneración y renuncia de responsabilidad%'
     )
  THEN
    RAISE NOTICE 'La exoneración activa ya está en español — se omite.';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO v_next_version
    FROM public.waiver_templates;

  -- (d) No existe ninguna plantilla.
  IF v_active_id IS NULL THEN
    INSERT INTO public.waiver_templates (title, body_md, version, active, created_at)
    VALUES (v_title, v_body, v_next_version, true, now());
    RAISE NOTICE 'Exoneración en español insertada como versión %.', v_next_version;
    RETURN;
  END IF;

  SELECT count(*) INTO v_sig_count
    FROM public.waiver_signatures
   WHERE template_id = v_active_id;

  IF v_sig_count = 0 THEN
    -- (b) Sin firmas: se reescribe en su lugar.
    UPDATE public.waiver_templates
       SET title   = v_title,
           body_md = v_body,
           version = v_next_version
     WHERE id = v_active_id;
    RAISE NOTICE 'Exoneración % reescrita en español (versión %).', v_active_id, v_next_version;
  ELSE
    -- (c) Con firmas: plantilla nueva + activación atómica.
    -- El UPDATE de desactivación y el INSERT activo van en la misma
    -- transacción del DO block, así que no existe un instante con cero
    -- plantillas activas (que rompería /join y /waiver).
    UPDATE public.waiver_templates SET active = false WHERE active = true;

    INSERT INTO public.waiver_templates (title, body_md, version, active, created_at)
    VALUES (v_title, v_body, v_next_version, true, now());

    RAISE NOTICE
      'La exoneración % tiene % firma(s); se creó la versión % en español y se activó.',
      v_active_id, v_sig_count, v_next_version;
  END IF;
END $$;
