-- ═════════════════════════════════════════════════════════════════════════
-- Soul Jiu Jitsu — rediseño completo del sitio público.
--
-- Resiembra el contenido del CMS con la identidad real de la academia
-- (San Diego, Cartago, Costa Rica): tema visual "soul" (negro + dorado),
-- textos en español, horario real (Gi / No-Gi / Kids / open mats), reglas
-- del mat, misión/visión y planes en colones.
--
-- Precios de adultos (3 clases/semana, ilimitado, visitante/drop-in) son los
-- reales confirmados por el gym. Kids sigue siendo PROVISIONAL — edítalo
-- desde /admin/membership-plans con el precio real.
-- ═════════════════════════════════════════════════════════════════════════

-- ── 1. Identidad + tema + hero (site_settings) ─────────────────────────────

INSERT INTO site_settings (key, value) VALUES
  ('active_theme',          'soul'),

  ('gym_name',              'Soul Jiu Jitsu'),
  ('gym_short_name',        'Soul JJ'),
  ('gym_logo_text',         'SOUL'),
  ('gym_city_name',         'San Diego'),
  ('gym_tagline',           'Jiu jitsu para el alma. Formamos personas fuertes dentro y fuera del tatami.'),
  ('gym_timezone',          'America/Costa_Rica'),
  ('gym_affiliate_text',    'Jiu jitsu integral en San Diego de Cartago. Un espacio 100% seguro, inclusivo y respetuoso. Afiliados a Sektor Jiu-Jitsu.'),
  ('gym_footer_tags',       'Gi,No-Gi,Kids,Open Mat'),
  ('gym_join_button_text',  'Únete a Soul'),
  ('gym_meta_title',        'Soul Jiu Jitsu | Jiu Jitsu en San Diego, Cartago, Costa Rica'),
  ('gym_meta_description',  'Entrena jiu jitsu en Soul Jiu Jitsu, San Diego de Cartago. Clases de Gi, No-Gi, kids y open mats en un espacio seguro, inclusivo y respetuoso.'),

  ('hero_eyebrow',          'San Diego · Cartago · Costa Rica'),
  ('hero_sub_tagline',      'Enseñamos jiu jitsu de manera integral, promoviendo el bienestar físico y mental de cada alumno — en un espacio 100% seguro, inclusivo y respetuoso.'),
  ('hero_stat_left_num',    '12+'),
  ('hero_stat_left_label',  'Clases por semana'),
  ('hero_stat_right_num',   '6'),
  ('hero_stat_right_label', 'Días a la semana'),
  ('hero_stat_wide_num',    'Gi · No-Gi · Kids · Open Mat'),
  ('hero_stat_wide_label',  'Modalidades'),

  -- El gym entrena dentro de Cola de Gallo (restaurante/bar) en San Diego de
  -- Cartago — no tiene un local propio con dirección postal formal, así que
  -- el enlace de Waze es la forma confiable de llegar.
  ('contact_address',       'Cola de Gallo Comida Mexicana & Mixology Cocktails'),
  ('contact_city',          'San Diego'),
  ('contact_state',         'Cartago'),
  ('contact_zip',           ''),
  ('contact_waze_url',      'https://waze.com/ul/hd1u227fcp'),
  -- Sin teléfono público por ahora: cadena vacía = la UI oculta la fila.
  ('contact_phone',         ''),
  ('contact_hours',         '[{"days":"Lunes a jueves","hours":"6:00 a. m. y 7:00 p. m."},{"days":"Lunes (kids)","hours":"5:00 p. m."},{"days":"Viernes","hours":"7:00 p. m. — open mat Gi"},{"days":"Sábado","hours":"9:30 a. m. kids · 12:00 m. d. open mat No-Gi"}]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── 2. Secciones de la landing ──────────────────────────────────────────────
-- Nuevas secciones "mission" y "rules"; blog e instagram quedan ocultas
-- hasta que haya contenido real (se activan desde /admin/sections).

DELETE FROM site_sections;

INSERT INTO site_sections (key, label, display_order, visible, display_title, display_subtitle) VALUES
  ('updates',   'Novedades',            1,  TRUE,  'Novedades',            'Al día'),
  ('mission',   'Misión y visión',      2,  TRUE,  'Nuestra alma',         'Misión y visión'),
  ('schedule',  'Horarios',             3,  TRUE,  'Horarios',             'Entrena con nosotros'),
  ('rules',     'Reglas en el mat',     4,  TRUE,  'Reglas en el mat',     'Cultura de respeto'),
  ('pricing',   'Planes',               5,  TRUE,  'Planes',               'Membresías'),
  ('team',      'El equipo',            6,  TRUE,  'El equipo',            'Profesores'),
  ('faq',       'Preguntas frecuentes', 7,  TRUE,  'Preguntas frecuentes', 'Dudas comunes'),
  ('subscribe', 'Suscripción',          8,  TRUE,  'Mantente al tanto',    NULL),
  ('contact',   'Ubicación y contacto', 9,  TRUE,  'Ubicación y contacto', 'Visítanos'),
  ('blog',      'Blog',                 10, FALSE, 'Blog',                 'Desde el tatami'),
  ('instagram', 'Instagram',            11, FALSE, 'Instagram',            'Síguenos');

-- ── 3. Navegación y footer ──────────────────────────────────────────────────

DELETE FROM nav_items;
INSERT INTO nav_items (label, href, display_order, active) VALUES
  ('Nosotros',  '/#mission',  1, TRUE),
  ('Horarios',  '/#schedule', 2, TRUE),
  ('Reglas',    '/#rules',    3, TRUE),
  ('Planes',    '/#pricing',  4, TRUE),
  ('Equipo',    '/#team',     5, TRUE),
  ('Contacto',  '/#contact',  6, TRUE);

DELETE FROM footer_items;
INSERT INTO footer_items (label, href, group_name, display_order, active) VALUES
  ('Nosotros',             '/#mission',   'Site', 1, TRUE),
  ('Horarios',             '/#schedule',  'Site', 2, TRUE),
  ('Reglas',               '/#rules',     'Site', 3, TRUE),
  ('Planes',               '/#pricing',   'Site', 4, TRUE),
  ('Equipo',               '/#team',      'Site', 5, TRUE),
  ('Preguntas frecuentes', '/#faq',       'Info', 6, TRUE),
  ('Suscribirse',          '/#subscribe', 'Info', 7, TRUE),
  ('Únete',                '/join',       'Info', 8, TRUE);

-- ── 4. Preguntas frecuentes ─────────────────────────────────────────────────

DELETE FROM faq_items;
INSERT INTO faq_items (question, answer, display_order, active) VALUES
  ('¿Qué es el jiu jitsu brasileño?',
   'Un arte marcial de agarre basado en el control, la palanca y las sumisiones — estrangulaciones y luxaciones articulares. No hay golpes: se trata de técnica sobre fuerza, por eso cualquier persona puede practicarlo sin importar tamaño o edad.',
   1, TRUE),
  ('¿Necesito estar en forma para empezar?',
   'No. El jiu jitsu te pone en forma como efecto secundario de entrenar. Solo tienes que presentarte — el resto llega solo.',
   2, TRUE),
  ('¿Cómo es mi primera clase?',
   'Llega con anticipación, preséntate con el profesor y entrena a tu ritmo. Trae ropa deportiva cómoda y una botella de agua. Nadie te va a exigir más de lo que puedes dar el primer día.',
   3, TRUE),
  ('¿Qué debo llevar?',
   'Para No-Gi: rashguard o camiseta ajustada y short sin bolsillos ni cierres. Para Gi: kimono (si aún no tienes, te ayudamos a conseguir el tuyo). Sandalias para fuera del mat y uñas cortas — es parte de las reglas.',
   4, TRUE),
  ('¿Es un espacio seguro para mujeres?',
   'Sí, y es parte central de nuestra misión: un ambiente 100% seguro, inclusivo y respetuoso, donde las mujeres se sientan protegidas, valoradas y empoderadas.',
   5, TRUE),
  ('¿Tienen clases para niños?',
   'Sí. Las clases kids son los lunes a las 5:00 p. m. y los sábados a las 9:30 a. m. Formamos disciplina, respeto y confianza desde pequeños.',
   6, TRUE),
  ('¿Dan clases privadas?',
   'Sí. Consulta los horarios disponibles directamente con el profesor o escríbenos por el formulario de contacto.',
   7, TRUE);

-- ── 5. Novedades y banner ───────────────────────────────────────────────────

DELETE FROM updates;
INSERT INTO updates (type, title, body, date, published, display_order) VALUES
  ('news',  'Bienvenidos al nuevo sitio de Soul Jiu Jitsu',
   'Horarios, planes, reglas del mat y toda la información de la academia, ahora en un solo lugar.',
   CURRENT_DATE, TRUE, 1),
  ('class', 'Clases kids: lunes y sábados',
   'Los más pequeños entrenan los lunes a las 5:00 p. m. y los sábados a las 9:30 a. m. Disciplina, respeto y confianza.',
   CURRENT_DATE, TRUE, 2),
  ('event', 'Open mats de fin de semana',
   'Viernes 7:00 p. m. open mat de Gi y sábados 12:00 m. d. open mat de No-Gi. Cierra la semana en el tatami.',
   CURRENT_DATE, TRUE, 3);

DELETE FROM banners;
INSERT INTO banners (text, color, section, display_order, active) VALUES
  ('🥋 Clases privadas disponibles — consulta horarios con el profesor.', 'yellow', 'top', 1, TRUE);

-- ── 6. Taxonomía de clases en español ───────────────────────────────────────

-- Nueva modalidad Kids (los peques filtran con su propio chip)
INSERT INTO class_modalities (name, slug, color, sort_order) VALUES
  ('Kids', 'kids', '#a96b37', 25)
ON CONFLICT (slug) DO NOTHING;

-- Colores alineados al tema soul (verde selva / terracota / marrón)
UPDATE class_modalities SET color = '#2e7d4f' WHERE slug = 'gi';
UPDATE class_modalities SET color = '#b3402e' WHERE slug = 'no-gi';
UPDATE class_modalities SET color = '#6b6b6b' WHERE slug = 'open-mat';

-- Modalidades que Soul no ofrece hoy — se reactivan desde /admin/classes
UPDATE class_modalities SET active = FALSE WHERE slug IN ('competition-prep', 'conditioning');

UPDATE class_levels SET name = 'Todos los niveles' WHERE slug = 'all-levels';
UPDATE class_levels SET name = 'Fundamentos'       WHERE slug = 'fundamentals';
UPDATE class_levels SET name = 'Principiantes'     WHERE slug = 'beginners';
UPDATE class_levels SET name = 'Intermedio'        WHERE slug = 'intermediate';
UPDATE class_levels SET name = 'Avanzado'          WHERE slug = 'advanced';

UPDATE class_audiences SET name = '7 a 10 años'            WHERE slug = 'age-7-10';
UPDATE class_audiences SET name = '11 a 16 años'           WHERE slug = 'age-11-16';
UPDATE class_audiences SET name = '16 años o más'          WHERE slug = 'age-16-plus';
UPDATE class_audiences SET name = '40 años o más'          WHERE slug = 'age-40-plus';
UPDATE class_audiences SET name = 'Solo mujeres'           WHERE slug = 'women-only';
UPDATE class_audiences SET name = 'Solo hombres'           WHERE slug = 'men-only';
UPDATE class_audiences SET name = 'Solo cinturones negros' WHERE slug = 'black-belts-only';
UPDATE class_audiences SET name = 'Marrón en adelante'     WHERE slug = 'brown-plus';
UPDATE class_audiences SET name = 'Azul en adelante'       WHERE slug = 'blue-plus';
UPDATE class_audiences SET name = 'Solo con invitación'    WHERE slug = 'invite-only';
UPDATE class_audiences SET name = 'Solo miembros'          WHERE slug = 'members-only';

-- ── 7. Horario real de Soul ─────────────────────────────────────────────────
--   Lun   6 a. m. Gi   · 5 p. m. Kids · 7 p. m. Gi
--   Mar   6 a. m. No-Gi              · 7 p. m. No-Gi
--   Mié   6 a. m. Gi                 · 7 p. m. Gi
--   Jue   6 a. m. No-Gi              · 7 p. m. No-Gi
--   Vie                              · 7 p. m. Open Mat (Gi)
--   Sáb   9:30 a. m. Kids · 12 m. d. Open Mat (No-Gi)

DELETE FROM schedule_slots;

INSERT INTO schedule_slots
  (day_of_week, start_time, end_time, title, sort_order, active, modality_id, level_id)
VALUES
  -- Lunes
  (1, '06:00', '07:00', 'Gi',             10, TRUE, (SELECT id FROM class_modalities WHERE slug = 'gi'),       (SELECT id FROM class_levels WHERE slug = 'all-levels')),
  (1, '17:00', '18:00', 'Kids',           20, TRUE, (SELECT id FROM class_modalities WHERE slug = 'kids'),     NULL),
  (1, '19:00', '20:00', 'Gi',             30, TRUE, (SELECT id FROM class_modalities WHERE slug = 'gi'),       (SELECT id FROM class_levels WHERE slug = 'all-levels')),
  -- Martes
  (2, '06:00', '07:00', 'No-Gi',          10, TRUE, (SELECT id FROM class_modalities WHERE slug = 'no-gi'),    (SELECT id FROM class_levels WHERE slug = 'all-levels')),
  (2, '19:00', '20:00', 'No-Gi',          20, TRUE, (SELECT id FROM class_modalities WHERE slug = 'no-gi'),    (SELECT id FROM class_levels WHERE slug = 'all-levels')),
  -- Miércoles
  (3, '06:00', '07:00', 'Gi',             10, TRUE, (SELECT id FROM class_modalities WHERE slug = 'gi'),       (SELECT id FROM class_levels WHERE slug = 'all-levels')),
  (3, '19:00', '20:00', 'Gi',             20, TRUE, (SELECT id FROM class_modalities WHERE slug = 'gi'),       (SELECT id FROM class_levels WHERE slug = 'all-levels')),
  -- Jueves
  (4, '06:00', '07:00', 'No-Gi',          10, TRUE, (SELECT id FROM class_modalities WHERE slug = 'no-gi'),    (SELECT id FROM class_levels WHERE slug = 'all-levels')),
  (4, '19:00', '20:00', 'No-Gi',          20, TRUE, (SELECT id FROM class_modalities WHERE slug = 'no-gi'),    (SELECT id FROM class_levels WHERE slug = 'all-levels')),
  -- Viernes
  (5, '19:00', '20:30', 'Open Mat · Gi',  10, TRUE, (SELECT id FROM class_modalities WHERE slug = 'open-mat'), NULL),
  -- Sábado
  (6, '09:30', '10:30', 'Kids',           10, TRUE, (SELECT id FROM class_modalities WHERE slug = 'kids'),     NULL),
  (6, '12:00', '13:30', 'Open Mat · No-Gi', 20, TRUE, (SELECT id FROM class_modalities WHERE slug = 'open-mat'), NULL);

-- ── 8. Planes en colones (MONTOS PROVISIONALES) ─────────────────────────────

DELETE FROM membership_plans;

INSERT INTO membership_plans
  (name, description, price_cents, billing_interval, trial_days, status, features,
   highlight, highlight_label, highlight_color, cta_label, cta_href,
   display_order, visible, period_display)
VALUES
  ('3 clases/semana',
   'Membresía mensual — hasta 3 clases por semana, Gi y No-Gi',
   2500000, 'month', 0, 'active',
   '["Hasta 3 clases por semana","Gi y No-Gi","Open mats incluidos","Sin contrato"]'::jsonb,
   FALSE, NULL, NULL, 'Quiero empezar', '/join',
   1, TRUE, '/mes'),

  ('Ilimitado',
   'Membresía mensual ilimitada — Gi y No-Gi',
   3500000, 'month', 0, 'active',
   '["Gi y No-Gi ilimitado","Open mats incluidos","Horarios de 6:00 a. m. y 7:00 p. m.","Sin contrato"]'::jsonb,
   TRUE, 'Más popular', 'yellow', 'Quiero empezar', '/join',
   2, TRUE, '/mes'),

  ('Kids',
   'Programa infantil — lunes y sábados',
   3000000, 'month', 0, 'active',
   '["Lunes 5:00 p. m. y sábados 9:30 a. m.","Disciplina, respeto y confianza","Ambiente seguro y divertido"]'::jsonb,
   FALSE, NULL, NULL, 'Inscribir a mi peque', '/join',
   3, TRUE, '/mes'),

  ('Visitante',
   'Drop-in — entrena con nosotros de paso por Costa Rica',
   500000, 'month', 0, 'active',
   '["Válido para cualquier clase del día","Gi o No-Gi","Practicantes visitantes bienvenidos"]'::jsonb,
   FALSE, NULL, NULL, 'Escríbenos', '/#contact',
   4, TRUE, 'por clase');

-- ── 9. Equipo ────────────────────────────────────────────────────────────

DELETE FROM team;

INSERT INTO team (name, role, belt, bio, slug, "order", type, active, visible_on_public_team) VALUES
  ('Luis Tristán', 'Profesor principal', 'black',
   'Cinta negra y profesor principal de Soul Jiu Jitsu. Lidera cada clase con técnica, paciencia y respeto por el arte.',
   'luis-tristan', 0, 'head_coach', TRUE, TRUE);
