-- ─────────────────────────────────────────────────────────────────
-- Soul Jiu-Jitsu Seed Data
-- Run AFTER schema.sql in the Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────

-- ── site_settings ────────────────────────────────────────────────
INSERT INTO site_settings (key, value) VALUES
  ('alert_enabled', 'true'),
  ('alert_text', 'Thursday 6PM Gi class cancelled — broken pipe. All other classes on as normal. See you on the mats!')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── updates ──────────────────────────────────────────────────────
INSERT INTO updates (type, title, body, date, published) VALUES
  ('alert',  '6PM Gi Class Cancelled — Broken Pipe',       'Thursday evening Gi class is cancelled due to a broken pipe. Academy reopens Friday 6am. All other classes unaffected.', '2026-03-26', true),
  ('event',  'Guest Black Belt Seminar — Save the Date',    'A visiting black belt is running a 2-hour technique seminar. Open to all members. Sign up at the front desk — space is limited.', '2026-04-12', true),
  ('class',  'Ladies-Only Gi Class Added Wednesdays',       'By popular request: dedicated ladies Gi every Wednesday at 6pm on Mat 2. Led by Black Belt Instructor Sara. All levels welcome.', '2026-04-07', true),
  ('news',   '3 Soul JJ Competitors Medal at Local Open',        'Congrats to Brian, Ceci, and Junior! Full results and photos posted inside the gym. We are proud of you.', '2026-03-18', true);

-- ── schedule ─────────────────────────────────────────────────────
INSERT INTO schedule (day, time, name, type, level, active) VALUES
  -- Monday
  ('Monday',    '6:00 AM',  'Gi',               'gi',      'All Levels',      true),
  ('Monday',    '11:30 AM', 'Open Mat',          'openmat', 'Members',         true),
  ('Monday',    '12:00 PM', 'Gi',               'gi',      'All Levels',      true),
  ('Monday',    '5:00 PM',  'Youth Gi 7–10',    'youth',   'Youth',           true),
  ('Monday',    '5:00 PM',  'Youth Gi 11–16',   'youth',   'Youth',           true),
  ('Monday',    '6:00 PM',  'Gi',               'gi',      '16+',             true),
  ('Monday',    '7:00 PM',  'No-Gi Comp',       'nogi',    'Invite Only',     true),
  -- Tuesday
  ('Tuesday',   '6:00 AM',  'No-Gi',            'nogi',    'All Levels',      true),
  ('Tuesday',   '11:30 AM', 'Open Mat',          'openmat', 'Members',         true),
  ('Tuesday',   '12:00 PM', 'No-Gi',            'nogi',    'All Levels',      true),
  ('Tuesday',   '5:00 PM',  'Youth No-Gi 7–10', 'youth',   'Youth',           true),
  ('Tuesday',   '5:00 PM',  'Youth No-Gi 11–16','youth',   'Youth',           true),
  ('Tuesday',   '6:00 PM',  'No-Gi Intermediate','nogi',   'Intermediate+',   true),
  ('Tuesday',   '6:00 PM',  'No-Gi Basic',      'nogi',    'Beginners 16+',   true),
  ('Tuesday',   '7:00 PM',  'Leg Attacks',      'nogi',    'All Levels',      true),
  -- Wednesday
  ('Wednesday', '6:00 AM',  'Gi',               'gi',      'All Levels',      true),
  ('Wednesday', '11:30 AM', 'Open Mat',          'openmat', 'Members',         true),
  ('Wednesday', '12:00 PM', 'Gi',               'gi',      'All Levels',      true),
  ('Wednesday', '5:00 PM',  'Youth Gi 7–10',    'youth',   'Youth',           true),
  ('Wednesday', '5:00 PM',  'Youth Gi 11–16',   'youth',   'Youth',           true),
  ('Wednesday', '6:00 PM',  'Gi',               'gi',      '16+',             true),
  ('Wednesday', '6:00 PM',  'Ladies Only Gi',   'gi',      'All Women',       true),
  ('Wednesday', '7:00 PM',  'No-Gi',            'nogi',    'All Levels',      true),
  -- Thursday
  ('Thursday',  '6:00 AM',  'No-Gi',            'nogi',    'All Levels',      true),
  ('Thursday',  '11:30 AM', 'Open Mat',          'openmat', 'Members',         true),
  ('Thursday',  '12:00 PM', 'No-Gi',            'nogi',    'All Levels',      true),
  ('Thursday',  '5:00 PM',  'Youth No-Gi 7–10', 'youth',   'Youth',           true),
  ('Thursday',  '5:00 PM',  'Youth No-Gi 11–16','youth',   'Youth',           true),
  ('Thursday',  '6:00 PM',  'No-Gi Intermediate','nogi',   'Intermediate+',   true),
  ('Thursday',  '6:00 PM',  'No-Gi Basic',      'nogi',    'Beginners 16+',   true),
  ('Thursday',  '7:00 PM',  'Takedowns',        'nogi',    'All Levels',      true),
  -- Friday
  ('Friday',    '6:00 AM',  'Open Mat',          'openmat', 'Members Only',    true),
  ('Friday',    '11:30 AM', 'Open Mat',          'openmat', 'Members',         true),
  ('Friday',    '12:00 PM', 'Gi',               'gi',      'All Levels',      true),
  ('Friday',    '6:00 PM',  'Gi Basic',          'gi',      'Beginners 16+',   true),
  -- Saturday
  ('Saturday',  '10:00 AM', 'Youth Comp',        'youth',   'Invite Only',     true),
  ('Saturday',  '11:00 AM', 'No-Gi Basic',      'nogi',    'Beginners 16+',   true),
  ('Saturday',  '11:00 AM', 'Ladies Only',       'gi',      'All Women',       true),
  ('Saturday',  '12:00 PM', 'No-Gi',            'nogi',    'All Levels',      true),
  ('Saturday',  '1:00 PM',  'Open Mat',          'openmat', 'Members Only',    true),
  ('Saturday',  '2:00 PM',  'Soul JJ Seminar',   'special', 'All Members',     true),
  -- Sunday
  ('Sunday',    '6:00 AM',  'Open Mat',          'openmat', 'Members Only',    true),
  ('Sunday',    '12:00 PM', 'Open Mat',          'openmat', 'Members Only',    true);

-- ── team ──────────────────────────────────────────────────────────
INSERT INTO team (name, role, belt, bio, photo_url, slug, "order", type) VALUES
  ('Rob Ables',       'Head Instructor · Black Belt',       'black',  'Head instructor and academy founder. Over 20 years of BJJ, wrestling, and MMA experience.', null, 'rob-ables',       0, 'head_coach'),
  ('Guest Instructor', 'Guest Instructor · Black Belt',        'black', 'Visiting black belt who runs technique seminars at the academy several times a year. Replace or remove this placeholder entry.', null, 'guest-instructor', 1, 'guest'),
  ('Sara A.',         'Instructor · Purple Belt',            'purple', 'Leads ladies-only Gi and youth classes. Competitive background in BJJ and wrestling. Patient, technical, encouraging.', null, 'sara-a',          2, 'instructor');

-- ── blog_posts ────────────────────────────────────────────────────
INSERT INTO blog_posts (title, slug, body, tag, author, excerpt, published, created_at) VALUES
  (
    'Why the Guillotine is the Most Underrated Submission in No-Gi',
    'guillotine-submission',
    E'## The High Elbow Guillotine\n\nRob breaks down the high elbow guillotine — how to set it up off a failed double leg, why most people squeeze wrong, and three grip variations to drill this week.\n\n### Setup Off the Failed Double Leg\n\nMost guillotines are caught opportunistically. But the *best* ones are set up deliberately...\n\n### Why Most People Squeeze Wrong\n\nThe common mistake is squeezing with the bicep. The correct mechanic is...\n\n### Three Grip Variations\n\n1. **Standard grip** — for beginners\n2. **High elbow** — for tighter necks\n3. **Arm-in** — the highest percentage finish',
    'Technique',
    'Rob Ables',
    'Rob breaks down the high elbow guillotine — how to set it up off a failed double leg, why most people squeeze wrong, and three grip variations to drill this week.',
    true,
    '2026-03-20'
  ),
  (
    '3 Things We Learned from the Local Open',
    'local-open-recap',
    E'## Competition Day Lessons\n\nThree Soul JJ competitors medaled at the local open last weekend. Here''s what we took away from the experience.\n\n### 1. Conditioning Wins Matches\n\n### 2. Trust Your A-Game\n\n### 3. Competition Exposes Weaknesses Early',
    'Competition',
    'Rob Ables',
    'Three Soul JJ competitors medaled at the local open. Here is what we learned.',
    true,
    '2026-03-18'
  ),
  (
    'How to Survive Your First Week of BJJ Without Dying',
    'first-week-bjj',
    E'## Welcome to the Mats\n\nEvery black belt was once a white belt who survived their first week. Here is how to make yours count.\n\n### Show Up Consistently\n\n### Tap Early, Tap Often\n\n### Ask Questions',
    'Beginner',
    'Rob Ables',
    'Every black belt survived their first week. Here is how to make yours count.',
    true,
    '2026-03-10'
  ),
  (
    'Gi vs No-Gi: Which Should You Train First?',
    'gi-vs-nogi',
    E'## The Classic Debate\n\nNew students always ask: *Gi or No-Gi?* The honest answer depends on your goals.\n\n### Train Gi If...\n\n### Train No-Gi If...\n\n### The Best Answer: Train Both',
    'Beginner',
    'Rob Ables',
    'The classic debate — we break it down for new students.',
    true,
    '2026-02-28'
  );
