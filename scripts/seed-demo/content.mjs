// The fictional community the demo seed fabricates (docs/business.md →
// Showcase & demo strategy; docs/tenancy-design.md → tenant 2 rehearsal).
// Everything here is invented: no real person, camp, or place. Edit freely —
// scripts/seed-demo-community.mjs turns this into rows.

export const COMMUNITY = {
  slug: 'lantern-hollow',
  name: 'Lantern Hollow',
  description: 'Lantern Hollow — a theme camp at the Solstice Gathering.',
  eventName: 'Solstice Gathering 2027',
  timezone: 'America/Vancouver',
  // Local two-tenant testing: the same dev server answers both hosts —
  // localhost:<port> resolves to Glåüm (default), these to the demo.
  hosts: ['127.0.0.1:3001', 'lantern.localhost:3001', '127.0.0.1:3000', 'lantern.localhost:3000'],
  theme: {
    colors: { ink: '#0F1A1C', plum: '#1F4A4A', 'plum-dark': '#163537', gold: '#E0B45A', purple: '#4FB3A9', cream: '#F2EFE6' },
    fonts: { display: "'Cormorant Garamond', 'TokyoDreams', serif" },
  },
  // Event window (YYYY-MM-DD); the runway pages count down to the start.
  eventStart: '2027-06-18',
  eventEnd: '2027-06-22',
}

export const PAGE_COPY = {
  home_tagline: 'Where the lanterns are lit by everyone who carries one.',
  home_quote: 'Nobody arrives finished. We build the hollow together, one lantern at a time.',
  home_about_heading: 'A camp that runs on many hands',
  home_about_body:
    'Lantern Hollow is a forty-odd-person theme camp that turns a patch of dust into a glowing courtyard for five nights a year. We host a tea house, a lantern workshop, and the quietest sunrise on the playa.\n\nEveryone who camps with us takes a role and a few shifts, and everyone gets to sit in the courtyard when their lantern is hung.',
  home_participate_heading: 'How to carry a lantern',
  home_participate_body:
    'Pick a department and a role, sign up for shifts that fit your days, join a group or two, and bring something from the shared list. That is the whole system — the rest is showing up.',
}

export const DEPARTMENTS = [
  { name: 'Tea House', icon: '🫖', description: 'The courtyard kitchen: tea, soup, and the sunrise porridge.' },
  { name: 'Build', icon: '🔨', description: 'Shade, the courtyard frame, and everything with a bolt.' },
  { name: 'Lanterns', icon: '🏮', description: 'The workshop, the hanging, and the nightly lighting.' },
  { name: 'Sound & Light', icon: '🎚️', description: 'Small rigs, big care. Evenings only.' },
  { name: 'Wellness', icon: '🌿', description: 'Water, shade, and someone who noticed you sat down.' },
  { name: 'Gate & Greeting', icon: '👋', description: 'First faces at the hollow.' },
]

// roles per department: name, capacity, requires_approval, blurb
export const ROLES = {
  'Tea House': [
    { name: 'Tea Keeper', capacity: 4, description: 'Runs one tea service a day.' },
    { name: 'Porridge Lead', capacity: 1, requires_approval: true, description: 'Owns the sunrise porridge — the camp\'s signature.' },
    { name: 'Kitchen Hand', capacity: 6, description: 'Prep, dishes, restock.' },
  ],
  Build: [
    { name: 'Build Lead', capacity: 1, requires_approval: true, description: 'Plans the courtyard frame and calls the build days.' },
    { name: 'Rigger', capacity: 4, description: 'Shade cloth, guy lines, and heavy things.' },
    { name: 'Tool Steward', capacity: 1, description: 'Knows where every tool is. Every time.' },
  ],
  Lanterns: [
    { name: 'Workshop Host', capacity: 2, description: 'Hosts the open lantern-making sessions.' },
    { name: 'Lamplighter', capacity: 5, description: 'Lights the hollow at dusk, douses it at dawn.' },
  ],
  'Sound & Light': [
    { name: 'Evening Tech', capacity: 3, description: 'Runs the small rig for the evening sets.' },
  ],
  Wellness: [
    { name: 'Shade Tender', capacity: 3, description: 'Keeps water cold and people in the shade.' },
    { name: 'Quiet Hour Host', capacity: 2, description: 'Holds the afternoon quiet hour.' },
  ],
  'Gate & Greeting': [
    { name: 'Greeter', capacity: 6, description: 'Welcomes arrivals and points them to their spot.' },
  ],
}

export const SHIFT_TYPES = [
  { name: 'Setup', icon: '🔧' },
  { name: 'Tea Service', icon: '🫖' },
  { name: 'Lighting', icon: '🏮' },
  { name: 'Teardown', icon: '🧹' },
]

// Schedule: date offset from eventStart (negative = build days), time, type,
// title, capacity, needs_lead. Recurring nightly shifts use `nightly: true`.
export const SCHEDULE = [
  { day: -2, start: '10:00', end: '16:00', type: 'Setup', title: 'Courtyard frame goes up', capacity: 8, needs_lead: true },
  { day: -1, start: '10:00', end: '15:00', type: 'Setup', title: 'Shade cloth + kitchen build', capacity: 8 },
  { day: 0, start: '16:00', end: '18:00', type: 'Setup', title: 'Hang the first lanterns', capacity: 6 },
  { day: 0, start: '07:00', end: '09:30', type: 'Tea Service', title: 'Sunrise porridge', capacity: 3, nightly: true },
  { day: 0, start: '15:00', end: '17:00', type: 'Tea Service', title: 'Afternoon tea', capacity: 3, nightly: true },
  { day: 0, start: '20:30', end: '21:30', type: 'Lighting', title: 'Dusk lighting', capacity: 2, nightly: true, needs_lead: true },
  { day: 0, start: '05:30', end: '06:15', type: 'Lighting', title: 'Dawn dousing', capacity: 2, nightly: true },
  { day: 4, start: '09:00', end: '14:00', type: 'Teardown', title: 'Take it all down', capacity: 12, needs_lead: true },
  { day: 5, start: '08:00', end: '11:00', type: 'Teardown', title: 'Leave no trace sweep', capacity: 10 },
]

export const GATHERINGS = [
  // offsets from eventStart (negative = weeks before)
  { day: -60, time: '19:00', title: 'Season kickoff at the boathouse', location: 'The Boathouse, Pier 4', link: null },
  { day: -30, time: '11:00', title: 'Lantern-making Saturday', location: "Mara's garage", link: null },
  { day: -9, time: '18:30', title: 'Final planning call', location: 'Online', link: 'https://example.com/planning-call' },
]

export const GROUP_COLLECTIONS = [
  { name: 'Contributions', selection: 'multi', self_join: true, groups: [
    { name: 'Courtyard Decor', icon: '✨', description: 'Fabric, string lights, the good rugs.' },
    { name: 'Workshop Materials', icon: '📦', description: 'Paper, bamboo, wire, LED tea lights.' },
    { name: 'Tea Pantry', icon: '🍵', description: 'Loose leaf, honey, oat milk, the big kettle.' },
  ] },
  { name: 'Logistics', selection: 'multi', self_join: true, groups: [
    { name: 'Early Crew', icon: '🌄', description: 'On site two days early for the build.' },
    { name: 'Late Crew', icon: '🌙', description: 'Stays for teardown and the sweep.' },
    { name: 'Truck Team', icon: '🚚', description: 'Loads, drives, and unloads the box truck.' },
  ] },
]

export const RESOURCE_LISTS = [
  { title: 'Tea Pantry', group: 'Tea Pantry', items: [
    { name: 'Loose-leaf black tea (500g)', quantity: 3 }, { name: 'Honey (1kg)', quantity: 2 }, { name: 'Oat milk (1L)', quantity: 12 },
    { name: 'Camp kettle (10L)', quantity: 1 }, { name: 'Enamel mugs (box of 24)', quantity: 2 },
  ] },
  { title: 'Workshop Materials', group: 'Workshop Materials', items: [
    { name: 'Rice paper sheets (pack of 50)', quantity: 4 }, { name: 'Bamboo skewers (bundle)', quantity: 6 }, { name: 'LED tea lights (pack of 24)', quantity: 5 }, { name: 'Wire spool', quantity: 2 },
  ] },
  { title: 'Courtyard Decor', group: 'Courtyard Decor', items: [
    { name: 'String lights (10m)', quantity: 8 }, { name: 'Outdoor rug', quantity: 4 }, { name: 'Floor cushions', quantity: 20 },
  ] },
]

export const ANNOUNCEMENTS = [
  { title: 'Build days confirmed', body: 'Courtyard frame goes up on the Wednesday before gates. If you are Early Crew, you are on the frame. Bring gloves.', pinned: true },
  { title: 'Lantern workshop this Saturday', body: "Mara's garage, 11am. All materials provided; bring a design if you have one, or steal one of ours.", pinned: false },
]

export const POLL = {
  question: 'Which evening should the tea house stay open late?',
  options: ['Opening night', 'Solstice night', 'The last night', 'Every night, we are unstoppable'],
}

export const SHOUTOUTS = [
  'Rin rebuilt the kettle stand at midnight with a bent tent stake. Legend.',
  'Whoever labelled every single spice jar: I love you.',
  'Dusk lighting crew was on time five nights running.',
]

// Radio: kind, message, detail, actorIndex (into MEMBERS), daysAgo
export const RADIO = [
  { kind: 'welcome', message: 'Welcome **Oluwaseun** to Lantern Hollow!', detail: 'Say hello if you see them around the hollow.', actor: 22, daysAgo: 18 },
  { kind: 'contribution', message: '**Priya** is bringing 4 outdoor rugs for the courtyard.', detail: null, actor: 5, daysAgo: 14 },
  { kind: 'milestone', message: 'The Tea Pantry list is fully covered.', detail: 'Every item claimed. Thank you, many hands.', actor: null, daysAgo: 12 },
  { kind: 'voice', message: 'Frame is up. Come see it before we hang anything.', detail: null, actor: 2, daysAgo: 6 },
  { kind: 'achievement', message: '**Mara** earned the Lantern Keeper distinction.', detail: 'Three seasons of workshops.', actor: 1, daysAgo: 4 },
  { kind: 'welcome', message: 'Welcome **Teodor** to Lantern Hollow!', detail: 'Say hello if you see them around the hollow.', actor: 27, daysAgo: 2 },
]

// Distinction rules (config_distinctions) — the seed keeps these simple and
// makes sure a few members satisfy them.
export const DISTINCTIONS = [
  { id: 'lantern-keeper', label: 'Lantern Keeper', description: 'Three seasons with the hollow.', glyph: '🏮' },
  { id: 'first-light', label: 'First Light', description: 'Held a shift in your first season.', glyph: '🌅' },
]

// 30 invented members. `role` = "Department / Role"; `since` = first year;
// `state` drives realism: approved (default) | pending | suspended.
export const MEMBERS = [
  { first: 'Mara', last: 'Quenneville', preferred: null, pronouns: 'she/her', role: 'Lanterns / Workshop Host', since: 2024, groups: ['Workshop Materials', 'Early Crew'], bio: 'Paper, bamboo, patience.', admin: true },
  { first: 'Rin', last: 'Takahashi-Oyelaran', preferred: null, pronouns: 'they/them', role: 'Build / Build Lead', since: 2024, groups: ['Early Crew', 'Truck Team'], bio: 'Will fix it with a tent stake.' },
  { first: 'Desmond', last: 'Achterberg', preferred: 'Dez', pronouns: 'he/him', role: 'Build / Rigger', since: 2025, groups: ['Early Crew'] },
  { first: 'Ines', last: 'Farrugia', preferred: null, pronouns: 'she/her', role: 'Tea House / Porridge Lead', since: 2024, groups: ['Tea Pantry'], bio: 'The porridge is a family recipe. The family is this camp.' },
  { first: 'Kwame', last: 'Lindqvist', preferred: null, pronouns: 'he/him', role: 'Tea House / Tea Keeper', since: 2026, groups: ['Tea Pantry'] },
  { first: 'Priya', last: 'Castellano', preferred: null, pronouns: 'she/her', role: 'Wellness / Shade Tender', since: 2025, groups: ['Courtyard Decor', 'Late Crew'] },
  { first: 'Björn', last: 'Adeyemi', preferred: null, pronouns: 'he/him', role: 'Sound & Light / Evening Tech', since: 2025, groups: ['Truck Team'] },
  { first: 'Saoirse', last: 'Nakamura', preferred: null, pronouns: 'she/her', role: 'Lanterns / Lamplighter', since: 2026, groups: [] },
  { first: 'Tomasz', last: 'Okonkwo', preferred: 'Tom', pronouns: 'he/him', role: 'Gate & Greeting / Greeter', since: 2024, groups: ['Late Crew'] },
  { first: 'Amara', last: 'Holmström', preferred: null, pronouns: 'she/her', role: 'Wellness / Quiet Hour Host', since: 2025, groups: ['Courtyard Decor'], bio: 'Quiet hour is not optional. It is the point.' },
  { first: 'Luca', last: 'Mbeki-Rossi', preferred: null, pronouns: 'he/him', role: 'Tea House / Kitchen Hand', since: 2026, groups: ['Tea Pantry'] },
  { first: 'Yara', last: 'Thorvaldsen', preferred: null, pronouns: 'she/her', role: 'Build / Rigger', since: 2025, groups: ['Early Crew', 'Truck Team'] },
  { first: 'Hendrik', last: 'Osei', preferred: null, pronouns: 'he/him', role: 'Lanterns / Lamplighter', since: 2024, groups: [] },
  { first: 'Noor', last: 'Bakker-Diallo', preferred: null, pronouns: 'she/her', role: 'Sound & Light / Evening Tech', since: 2026, groups: [] },
  { first: 'Felix', last: 'Anand', preferred: null, pronouns: 'he/him', role: 'Build / Tool Steward', since: 2024, groups: ['Early Crew', 'Late Crew'], bio: 'Label maker owner. Label maker enthusiast.' },
  { first: 'Zainab', last: 'Kristiansen', preferred: 'Z', pronouns: 'she/her', role: 'Lanterns / Lamplighter', since: 2025, groups: ['Workshop Materials'] },
  { first: 'Callum', last: 'Ferreira-Nguyen', preferred: null, pronouns: 'he/him', role: 'Tea House / Kitchen Hand', since: 2026, groups: [], state: 'pending' },
  { first: 'Dagny', last: 'Abubakar', preferred: null, pronouns: 'she/her', role: 'Wellness / Shade Tender', since: 2024, groups: ['Courtyard Decor'] },
  { first: 'Ravi', last: 'Söderberg', preferred: null, pronouns: 'he/him', role: 'Gate & Greeting / Greeter', since: 2025, groups: ['Late Crew'] },
  { first: 'Imogen', last: 'Oyelowo', preferred: null, pronouns: 'she/her', role: 'Tea House / Tea Keeper', since: 2025, groups: ['Tea Pantry'] },
  { first: 'Matteo', last: 'Haugen-Sato', preferred: null, pronouns: 'he/him', role: 'Build / Rigger', since: 2026, groups: ['Truck Team'] },
  { first: 'Aisling', last: 'Duarte', preferred: null, pronouns: 'she/her', role: 'Lanterns / Workshop Host', since: 2025, groups: ['Workshop Materials'] },
  { first: 'Oluwaseun', last: 'Bergström', preferred: 'Seun', pronouns: 'they/them', role: 'Gate & Greeting / Greeter', since: 2027, groups: [] },
  { first: 'Elif', last: 'Marchetti', preferred: null, pronouns: 'she/her', role: 'Tea House / Kitchen Hand', since: 2026, groups: ['Tea Pantry'] },
  { first: 'Jonas', last: 'Okafor-Lind', preferred: null, pronouns: 'he/him', role: 'Sound & Light / Evening Tech', since: 2024, groups: ['Truck Team'], state: 'suspended' },
  { first: 'Sunniva', last: 'Reyes', preferred: null, pronouns: 'she/her', role: 'Wellness / Quiet Hour Host', since: 2026, groups: [] },
  { first: 'Kofi', last: 'Halvorsen', preferred: null, pronouns: 'he/him', role: 'Lanterns / Lamplighter', since: 2025, groups: ['Late Crew'] },
  { first: 'Teodor', last: 'Nwachukwu', preferred: null, pronouns: 'he/him', role: 'Gate & Greeting / Greeter', since: 2027, groups: [], state: 'pending' },
  { first: 'Leila', last: 'Vestergaard', preferred: null, pronouns: 'she/her', role: 'Tea House / Tea Keeper', since: 2024, groups: ['Tea Pantry', 'Courtyard Decor'] },
  { first: 'Anselm', last: 'Oduya', preferred: null, pronouns: 'he/him', role: null, since: 2027, groups: [] },
]
