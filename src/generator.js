'use strict';
const fs = require('fs');
const path = require('path');
const { escapeHtml: e, slugify, toE164 } = require('./util');

/*
 * Design system
 * -------------
 * Every preset sets a font pairing (Google Fonts, with system fallbacks), a
 * small, muted palette and default copy. Layout and spacing are shared, so all
 * sites look consistent and professional, and each industry still has its own
 * character. Colors are checked for WCAG AA contrast in test/generator.test.js.
 */

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const inCity = (b, prep = 'in') => (b.city ? ` ${prep} ${b.city}` : '');

const PRESETS = [
  {
    key: 'restaurant', match: /restaurant|diner|bistro|grill|pizz|taco|sushi|kitchen|eatery|bbq|food|trattoria|steak/,
    fonts: { head: 'Fraunces', headWeight: 500, body: 'Inter', headFallback: SERIF },
    colors: { accent: '#9a2f22', bg: '#faf7f2', ink: '#1f1a17' }, radius: 4,
    tagline: (b) => `Good food and a warm table${inCity(b)}.`,
    lead: 'Seasonal dishes, friendly service and a room that feels like home. Walk in, call ahead for a table, or order to take away.',
    servicesTitle: 'What we offer', viewLabel: 'See what we offer',  servicesHeading: 'Eat in, take out, or let us cater.',
    services: [
      ['Dine-in', 'A relaxed dining room with full table service.'],
      ['Takeout', 'Call ahead and your order will be ready when you arrive.'],
      ['Catering', 'Trays and set menus for offices, parties and family events.'],
      ['Private events', 'Book the room for birthdays, rehearsal dinners and work functions.'],
    ],
    cta: 'Reserve a table', ctaHeadline: 'Save yourself a seat.',
  },
  {
    key: 'cafe', match: /cafe|café|coffee|bakery|\bbake|donut|\btea\b|tea ?room|dessert|ice cream|juice/,
    fonts: { head: 'DM Serif Display', headWeight: 400, body: 'DM Sans', headFallback: SERIF },
    colors: { accent: '#7a4a28', bg: '#f7f3ec', ink: '#231a13' }, radius: 4,
    tagline: (b) => `Coffee, pastries and a good seat${inCity(b)}.`,
    lead: 'Carefully made coffee, fresh baking every morning and a comfortable place to stay a while.',
    servicesTitle: 'On the menu', viewLabel: 'See the menu',  servicesHeading: 'Made fresh, every day.',
    services: [
      ['Coffee & espresso', 'Espresso drinks and filter coffee, made to order.'],
      ['Fresh baking', 'Pastries, breads and treats baked each morning.'],
      ['Breakfast & lunch', 'Sandwiches, bowls and light plates served all day.'],
    ],
    cta: 'Call us', ctaHeadline: 'Stop by and say hello.',
  },
  {
    key: 'trades', match: /plumb|electric|hvac|heating|cooling|air condition|roof|handyman|contractor|construct|paint|locksmith|pest|garage door|remodel|flooring|window|solar/,
    fonts: { head: 'Archivo', headWeight: 700, body: 'Inter', headFallback: SANS },
    colors: { accent: '#1d4e89', bg: '#f6f8fb', ink: '#0f1b2d' }, radius: 6,
    tagline: (b) => `Repairs and installations done right${inCity(b, 'across')}.`,
    lead: 'Experienced technicians, clear written quotes and work that is finished properly the first time.',
    servicesTitle: 'Services', servicesHeading: 'From quick fixes to full installations.',
    services: [
      ['Repairs', 'Fast diagnosis and lasting fixes for leaks, breakdowns and faults.'],
      ['Installations', 'New equipment installed to code, with a clean finish.'],
      ['Maintenance', 'Scheduled servicing that prevents expensive surprises.'],
      ['Emergency service', 'Urgent problem? Call and we will get someone to you quickly.'],
      ['Inspections', 'Thorough checks for home sales, insurance and peace of mind.'],
      ['Free estimates', 'A clear written quote before any work begins.'],
    ],
    trust: [['Licensed & insured', 'Fully covered on every job'], ['Upfront pricing', 'You approve the price first'], ['Local team', 'Owned and run locally']],
    cta: 'Get a free quote', ctaHeadline: 'Need it fixed? Talk to us today.',
  },
  {
    key: 'auto', match: /auto|car |cars|mechanic|tire|tyre|body shop|detail|towing|oil change|transmission|collision/,
    fonts: { head: 'Barlow Condensed', headWeight: 600, body: 'Barlow', headFallback: SANS, upper: true },
    colors: { accent: '#b3261e', bg: '#f7f7f7', ink: '#14171a' }, radius: 2, darkHero: true,
    tagline: (b) => `Straightforward auto repair${inCity(b)}.`,
    lead: 'Honest diagnostics, fair prices and repairs explained in plain English. Most makes and models.',
    servicesTitle: 'Services', servicesHeading: 'Everything your car needs, under one roof.',
    services: [
      ['Diagnostics', 'Computer diagnostics and a clear explanation of what we find.'],
      ['Brakes & suspension', 'Pads, rotors, shocks and steering, inspected and repaired.'],
      ['Oil & fluid service', 'Quick, by-the-book servicing to keep your warranty intact.'],
      ['Tires & alignment', 'New tires, rotation, balancing and wheel alignment.'],
    ],
    trust: [['Certified technicians', 'Trained on modern vehicles'], ['Written estimates', 'No work without your OK'], ['Warranty on repairs', 'Parts and labor covered']],
    cta: 'Book a service', ctaHeadline: 'Car trouble? Bring it in.',
  },
  {
    key: 'barber', match: /barber/,
    fonts: { head: 'Libre Baskerville', headWeight: 700, body: 'Inter', headFallback: SERIF },
    colors: { accent: '#8a5a2b', bg: '#f7f5f1', ink: '#16130f' }, radius: 2, darkHero: true,
    tagline: (b) => `Sharp cuts and proper shaves${inCity(b)}.`,
    lead: 'Experienced barbers, a relaxed chair and a cut that still looks right weeks later. Book ahead or drop in.',
    servicesTitle: 'Services', viewLabel: 'See services', servicesHeading: 'Cuts, fades and shaves.',
    services: [
      ['Haircuts', 'Classic and modern cuts, finished with a hot lather neck shave.'],
      ['Fades', 'Clean skin, low, mid and high fades.'],
      ['Beard trims', 'Shaping, lining and conditioning.'],
      ['Hot towel shave', 'A traditional straight-razor shave.'],
    ],
    cta: 'Book a cut', ctaHeadline: 'Due for a fresh cut?',
  },
  {
    key: 'beauty', match: /salon|hair|barber|nail|spa|beauty|lash|brow|massage|wax|tattoo|esthetic|skin/,
    fonts: { head: 'Cormorant Garamond', headWeight: 600, body: 'Jost', headFallback: SERIF },
    colors: { accent: '#7d4558', bg: '#faf6f4', ink: '#2a1f22' }, radius: 0,
    tagline: (b) => `Look your best${inCity(b)}.`,
    lead: 'Skilled professionals, an unhurried appointment and results you will love.',
    servicesTitle: 'Services', servicesHeading: 'Book the treatment you need.',
    services: [
      ['Cuts & styling', 'Precision cuts and finishing, tailored to you.'],
      ['Color', 'From subtle refreshes to complete transformations.'],
      ['Treatments', 'Restorative care for healthier hair and skin.'],
    ],
    cta: 'Book an appointment', ctaHeadline: 'Ready for your next appointment?',
  },
  {
    key: 'health', match: /\bdent|doctor|clinic|chiro|physio|therap|medical|optom|\bvet\b|veterin|pharmacy|health|orthodon|pediatric|family practice/,
    fonts: { head: 'Plus Jakarta Sans', headWeight: 700, body: 'Plus Jakarta Sans', headFallback: SANS },
    colors: { accent: '#0f6b5c', bg: '#f6faf9', ink: '#10231f' }, radius: 8,
    tagline: (b) => `Thoughtful care for${b.city ? ` ${b.city}` : ''} families.`,
    lead: 'A friendly team, modern equipment and appointments that run on time. New patients are always welcome.',
    servicesTitle: 'Services', servicesHeading: 'Care for every stage of life.',
    services: [
      ['New patient visits', 'A thorough first appointment and a clear plan.'],
      ['Routine care', 'Regular check-ups that catch problems early.'],
      ['Same-week appointments', 'Prompt visits when something cannot wait.'],
    ],
    trust: [['Accepting new patients', 'Call to book your first visit'], ['Most insurance accepted', 'We handle the paperwork'], ['Friendly team', 'Unhurried, respectful care']],
    cta: 'Schedule a visit', ctaHeadline: 'Book your next appointment.',
  },
  {
    key: 'outdoor', match: /landscap|lawn|garden|\btree|\bpool|snow|fenc|\byard|irrigation|nursery/,
    fonts: { head: 'Bitter', headWeight: 600, body: 'Work Sans', headFallback: SERIF },
    colors: { accent: '#2f5d34', bg: '#f6f7f2', ink: '#1a2419' }, radius: 4,
    tagline: (b) => `Landscaping and lawn care${inCity(b, 'across')}.`,
    lead: 'Reliable crews, tidy work and outdoor spaces that look good all year round.',
    servicesTitle: 'Services', servicesHeading: 'Outdoor work, done properly.',
    services: [
      ['Lawn care', 'Mowing, edging and feeding on a schedule that suits you.'],
      ['Landscape design', 'Planting plans and layouts built around how you use the space.'],
      ['Seasonal cleanup', 'Spring and fall cleanups, leaf removal and pruning.'],
      ['Hardscaping', 'Patios, paths, walls and edging built to last.'],
    ],
    trust: [['Free estimates', 'On-site quotes at no cost'], ['Fully insured', 'Peace of mind on every job'], ['Locally owned', 'Neighbors, not a franchise']],
    cta: 'Get a free estimate', ctaHeadline: 'Let’s get your yard looking its best.',
  },
  {
    key: 'cleaning', match: /clean|maid|janitor|laundry|dry clean|carpet|pressure wash|power wash/,
    fonts: { head: 'Manrope', headWeight: 700, body: 'Manrope', headFallback: SANS },
    colors: { accent: '#1b6a8f', bg: '#f5f9fb', ink: '#0f2230' }, radius: 8,
    tagline: (b) => `Professional cleaning for homes and offices${inCity(b)}.`,
    lead: 'Vetted, consistent cleaners who show up on time and leave every room spotless.',
    servicesTitle: 'Services', servicesHeading: 'Cleaning plans for every space.',
    services: [
      ['Home cleaning', 'Weekly, biweekly or one-off visits.'],
      ['Office cleaning', 'After-hours cleaning that works around your team.'],
      ['Deep cleaning', 'Top-to-bottom detail for kitchens, bathrooms and more.'],
      ['Move-in / move-out', 'Get your deposit back or start fresh in a new place.'],
    ],
    trust: [['Bonded & insured', 'Fully protected service'], ['Vetted cleaners', 'Background-checked staff'], ['Satisfaction promise', 'We come back if it is not right']],
    cta: 'Get a quote', ctaHeadline: 'Come home to a clean space.',
  },
  {
    key: 'fitness', match: /\bgym|fitness|yoga|pilates|crossfit|martial|dance|boxing|personal train|bootcamp/,
    fonts: { head: 'Oswald', headWeight: 600, body: 'Inter', headFallback: SANS, upper: true },
    colors: { accent: '#c2410c', bg: '#f7f7f5', ink: '#121212' }, radius: 2, darkHero: true,
    tagline: () => 'Train hard. Feel better. Join us.',
    lead: 'Coached classes, open gym time and a community that keeps you showing up.',
    servicesTitle: 'Programs', viewLabel: 'View programs',  servicesHeading: 'Find the program that fits you.',
    services: [
      ['Group classes', 'Coached sessions for every fitness level.'],
      ['Personal training', 'One-on-one programs built around your goals.'],
      ['Open gym', 'Full access to equipment on your schedule.'],
    ],
    cta: 'Book a free class', ctaHeadline: 'Your first class is on us.',
  },
  {
    key: 'retail', match: /shop|store|boutique|florist|flower|gift|book|\bpets?\b|pet supply|jewel|hardware|market|grocer|\bdeli\b|wine|liquor/,
    fonts: { head: 'Instrument Serif', headWeight: 400, body: 'Inter', headFallback: SERIF },
    colors: { accent: '#4a3f8c', bg: '#f8f7f4', ink: '#1c1a24' }, radius: 2,
    tagline: (b) => `An independent shop${inCity(b)}.`,
    lead: 'A carefully chosen selection, helpful advice and the kind of service you only get from a local store.',
    servicesTitle: 'In store', viewLabel: 'See what’s in store',  servicesHeading: 'Come in and have a look around.',
    services: [
      ['Curated selection', 'Products we know and are happy to recommend.'],
      ['Special orders', 'Can’t see what you need? We will order it in.'],
      ['Gift wrapping', 'Ready to give, free with every purchase.'],
    ],
    cta: 'Call the shop', ctaHeadline: 'We’d love to see you in store.',
  },
];

const DEFAULT_PRESET = {
  key: 'general', match: /$^/,
  fonts: { head: 'Inter', headWeight: 700, body: 'Inter', headFallback: SANS },
  colors: { accent: '#23426e', bg: '#f7f8fa', ink: '#121a26' }, radius: 6,
  tagline: (b) => `Local service you can count on${inCity(b)}.`,
  lead: 'Experienced, responsive and easy to work with. Get in touch and we will take care of the rest.',
  servicesTitle: 'Services', servicesHeading: 'How we can help.',
  services: [
    ['Consultations', 'Talk through what you need, with no obligation.'],
    ['Quality work', 'Done carefully, on time and to a high standard.'],
    ['Ongoing support', 'We are here when you need us again.'],
  ],
  cta: 'Contact us', ctaHeadline: 'Let’s talk about what you need.',
};

function pickPreset(category = '') {
  const c = ` ${String(category).toLowerCase()} `;
  return PRESETS.find((p) => p.match.test(c)) || DEFAULT_PRESET;
}

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------

function prettyPhone(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 || '');
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Indefinite article, including acronyms ("an HVAC company"). */
function article(phrase) {
  const w = String(phrase).split(/\s+/)[0] || '';
  if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) return /^[AEFHILMNORSX]/.test(w) ? 'an' : 'a';
  return /^[aeiou]/i.test(w) ? 'an' : 'a';
}

/** Lowercase a category for use mid-sentence, keeping acronyms like HVAC. */
const lowerCategory = (c) => String(c).split(/\s+/).map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase())).join(' ');

// Categories that name a person or place read naturally as "X is a <category>".
// Activities ("landscaping", "auto repair") need a noun: "a local landscaping business".
const NOUN_CATEGORY = /(er|or|ist|ian|ant|ent|shop|store|salon|studio|gym|cafe|café|restaurant|clinic|bakery|pizzeria|bar|spa|parlou?r|diner|bistro|boutique|market|office|practice|cent(er|re)|agency|company|firm|garage|service|house|hall|lounge|kitchen|grill|co\.?)$/i;

function describeCategory(category) {
  if (!category) return 'a locally owned business';
  const c = lowerCategory(category);
  return NOUN_CATEGORY.test(c) ? `${article(c)} ${c}` : `a local ${c} business`;
}

function defaultAbout(b) {
  const where = b.city ? ` in ${b.city}` : '';
  return [
    `${b.name} is ${describeCategory(b.category)}${where}. We keep things simple: do good work, be straight with people and make it easy to get hold of us.`,
    'Most of our customers find us through friends and neighbors, and we work hard to keep it that way. Give us a call and let us know how we can help.',
  ];
}

/** "Leak repair: Fast fixes" / "Leak repair - Fast fixes" -> [name, desc] */
function splitService(s) {
  if (Array.isArray(s)) return s;
  const m = /^(.+?)\s*(?::|\s[-–—]\s)\s*(.+)$/.exec(String(s));
  return m ? [m[1], m[2]] : [String(s), ''];
}

/** "Mon–Fri 7am–7pm" -> ["Mon–Fri", "7am–7pm"]; "Sun: Closed" -> ["Sun", "Closed"] */
function splitHours(line) {
  const s = String(line).trim();
  let m = /^([^:]+?):\s*(.+)$/.exec(s);
  if (m && !/^\d/.test(m[1].slice(-1))) return [m[1], m[2]];
  m = /^(.+?)\s+((?:\d|closed|open|by appointment|24).*)$/i.exec(s);
  return m ? [m[1], m[2]] : [s, ''];
}

function initials(name) {
  const words = String(name).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w && !/^(the|and|of|a)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join('') || '•').toUpperCase();
}

const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');

// Feather icons (MIT), stroke-based so they inherit text color.
const ICONS = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
};
const icon = (name) =>
  `<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

function fontsLink(f) {
  const fam = (name, weights) => `family=${name.replace(/ /g, '+')}:wght@${weights}`;
  const families = f.head === f.body
    ? [fam(f.head, [...new Set([400, 500, 600, 700, f.headWeight])].sort((x, y) => x - y).join(';'))]
    : [fam(f.head, f.headWeight), fam(f.body, '400;500;600;700')];
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Build the full, self-contained HTML for one business site. */
function renderSite(business, opts = {}) {
  const b = business;
  const p = pickPreset(b.category);
  const { accent, bg, ink } = p.colors;
  const f = p.fonts;

  const phone = toE164(b.phone, opts.defaultCountryCode || '1');
  const phoneDisplay = b.phone ? (phone ? prettyPhone(phone) : b.phone) : '';
  const telHref = phone ? `tel:${phone}` : '';
  const photo = safeUrl(b.photo);
  const tagline = b.tagline || p.tagline(b);
  const aboutParas = b.description ? String(b.description).split(/\n\s*\n|\r?\n/).filter((x) => x.trim()) : defaultAbout(b);
  const services = (b.services && b.services.length ? b.services : p.services).map(splitService);
  const hours = (b.hours || []).map(splitHours);
  const cityState = [b.city, b.state].filter(Boolean).join(', ');
  const fullAddress = [b.address, b.city, [b.state, b.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const mapQuery = encodeURIComponent([b.name, fullAddress].filter(Boolean).join(', '));
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const year = new Date().getFullYear();
  const mono = initials(b.name);
  const eyebrow = [b.category, cityState].filter(Boolean).join(' · ');
  const titleSuffix = [b.category, cityState].filter(Boolean).join(' in ');

  const primaryHref = telHref || (b.email ? `mailto:${b.email}` : '#contact');
  const primaryLabel = telHref ? p.cta : b.email ? 'Email us' : 'Get in touch';

  const hasStreet = Boolean(b.address); // map + directions only for a real street address
  const showHeroCard = !photo && Boolean(phoneDisplay || fullAddress || hours.length || b.email);
  const hoursInContact = !showHeroCard && hours.length > 0;
  const servicesCols = services.length === 1 ? 1 : services.length % 3 === 0 || services.length >= 5 ? 3 : 2;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: b.name,
    description: aboutParas[0],
    ...(phone && { telephone: phone }),
    ...(b.email && { email: b.email }),
    ...(photo && { image: photo }),
    ...(fullAddress && {
      address: {
        '@type': 'PostalAddress',
        ...(b.address && { streetAddress: b.address }),
        ...(b.city && { addressLocality: b.city }),
        ...(b.state && { addressRegion: b.state }),
        ...(b.zip && { postalCode: b.zip }),
      },
    }),
    ...(b.hours && b.hours.length && { openingHours: b.hours }),
  };

  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${Math.min(p.radius * 2, 14)}" fill="${accent}"/><text x="32" y="42" font-family="Arial,sans-serif" font-size="${mono.length > 1 ? 26 : 32}" font-weight="700" text-anchor="middle" fill="#fff">${e(mono)}</text></svg>`;

  const hoursTable = (cls = '') => `<table class="hours ${cls}">${hours
    .map(([d, t]) => `<tr><th scope="row">${e(d)}</th><td>${e(t)}</td></tr>`).join('')}</table>`;

  const contactLines = [
    phoneDisplay && `<li>${icon('phone')}<div><span class="label">Phone</span>${telHref ? `<a href="${telHref}">${e(phoneDisplay)}</a>` : e(phoneDisplay)}</div></li>`,
    b.email && `<li>${icon('mail')}<div><span class="label">Email</span><a href="mailto:${e(b.email)}">${e(b.email)}</a></div></li>`,
    fullAddress && `<li>${icon('pin')}<div><span class="label">${hasStreet ? 'Address' : 'Location'}</span>${e(fullAddress)}</div></li>`,
  ].filter(Boolean).join('');

  const heroAside = photo
    ? `<figure class="hero-photo"><img src="${e(photo)}" alt="${e(b.name)}" loading="eager"></figure>`
    : showHeroCard
      ? `<aside class="hero-card" aria-label="Contact details">
          ${contactLines ? `<ul class="details">${contactLines}</ul>` : ''}
          ${hours.length ? `<div class="card-hours"><span class="label">${icon('clock')} Opening hours</span>${hoursTable()}</div>` : ''}
        </aside>`
      : '';

  const trust = p.trust
    ? `<section class="trust" aria-label="Why choose us"><div class="wrap trust-grid">${p.trust
      .map(([t, s]) => `<div><strong>${e(t)}</strong><span>${e(s)}</span></div>`).join('')}</div></section>`
    : '';

  const servicesHtml = services.map(([name, desc], i) => `
          <li>
            <span class="num">${String(i + 1).padStart(2, '0')}</span>
            <h3>${e(name)}</h3>
            ${desc ? `<p>${e(desc)}</p>` : ''}
          </li>`).join('');

  const headCase = f.upper ? 'uppercase' : 'none';
  const headTracking = f.upper ? '0.01em' : /serif|Fraunces|Cormorant|Instrument|Bitter|DM Serif/i.test(f.head) ? '-0.01em' : '-0.025em';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(b.name)}${titleSuffix ? ` | ${e(titleSuffix)}` : ''}</title>
  <meta name="description" content="${e(`${tagline} ${aboutParas[0]}`.slice(0, 158))}">
  <meta name="theme-color" content="${accent}">
  <meta property="og:title" content="${e(b.name)}">
  <meta property="og:description" content="${e(tagline)}">
  <meta property="og:type" content="website">
  ${photo ? `<meta property="og:image" content="${e(photo)}">` : ''}
  <link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${e(fontsLink(f))}">
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
  <style>
    :root {
      --accent: ${accent}; --bg: ${bg}; --ink: ${ink}; --surface: #fff;
      --accent-dark: color-mix(in srgb, var(--accent) 82%, #000);
      --muted: color-mix(in srgb, var(--ink) 68%, var(--bg));
      --line: color-mix(in srgb, var(--ink) 12%, transparent);
      --radius: ${p.radius}px; --radius-lg: ${Math.min(p.radius * 2, 14)}px;
      --head: "${f.head}", ${f.headFallback}; --body: "${f.body}", ${SANS};
    }
    *, *::before, *::after { box-sizing: border-box; }
    html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } * { transition: none !important; } }
    body { margin: 0; font-family: var(--body); font-size: 17px; line-height: 1.65; color: var(--ink); background: var(--bg); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
    h1, h2, h3 { font-family: var(--head); font-weight: ${f.headWeight}; line-height: 1.1; letter-spacing: ${headTracking}; text-transform: ${headCase}; margin: 0; text-wrap: balance; }
    p { margin: 0; text-wrap: pretty; }
    a { color: inherit; }
    img { max-width: 100%; display: block; }
    .wrap { width: 100%; max-width: 1160px; margin: 0 auto; padding: 0 24px; }
    .skip { position: absolute; left: -9999px; top: 8px; background: var(--ink); color: #fff; padding: 8px 14px; z-index: 100; }
    .skip:focus { left: 8px; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .ic { flex: none; }
    .eyebrow { display: block; font-family: var(--body); font-size: 13px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin-bottom: 18px; }
    .label { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }

    /* Buttons */
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 50px; padding: 0 24px; border-radius: var(--radius); font: 600 16px/1 var(--body); text-decoration: none; white-space: nowrap; border: 1px solid transparent; transition: background-color .15s, border-color .15s, color .15s; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-dark); }
    .btn-ghost { border-color: color-mix(in srgb, var(--ink) 28%, transparent); color: var(--ink); }
    .btn-ghost:hover { border-color: var(--ink); }
    .btn-sm { min-height: 42px; padding: 0 18px; font-size: 15px; }

    /* Header */
    .site-header { position: sticky; top: 0; z-index: 50; background: color-mix(in srgb, var(--bg) 94%, transparent); -webkit-backdrop-filter: saturate(180%) blur(10px); backdrop-filter: saturate(180%) blur(10px); border-bottom: 1px solid var(--line); }
    .site-header .wrap { display: flex; align-items: center; justify-content: space-between; gap: 24px; height: 72px; }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; text-decoration: none; }
    .mark { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: var(--radius); background: var(--accent); color: #fff; font: 700 15px/1 var(--body); letter-spacing: .02em; }
    .brand-name { font-family: var(--head); font-weight: ${f.headWeight}; font-size: 20px; letter-spacing: ${headTracking}; text-transform: ${headCase}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nav { display: flex; align-items: center; gap: 32px; }
    .nav a:not(.btn) { font-size: 15px; font-weight: 500; text-decoration: none; color: var(--muted); }
    .nav a:not(.btn):hover { color: var(--ink); }

    /* Hero */
    .hero { padding: 96px 0 104px; }
    .hero-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, .8fr); gap: 72px; align-items: center; }
    .hero-grid.single { grid-template-columns: minmax(0, 1fr); max-width: 820px; }
    .hero h1 { font-size: clamp(40px, 5.4vw, 68px); }
    .hero .lead { margin-top: 24px; font-size: 19px; line-height: 1.6; color: var(--muted); max-width: 34em; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 36px; }
    .hero-card { background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 32px; box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 12px 32px -12px rgba(0,0,0,.12); }
    .details { list-style: none; margin: 0; padding: 0; display: grid; gap: 22px; }
    .details li { display: flex; gap: 14px; align-items: flex-start; font-size: 16px; line-height: 1.5; }
    .details li > .ic { margin-top: 3px; color: var(--accent); }
    .details a { text-decoration: none; font-weight: 500; }
    .details a:hover { text-decoration: underline; }
    .details .label { margin-bottom: 2px; }
    .card-hours { margin-top: 26px; padding-top: 24px; border-top: 1px solid var(--line); }
    .card-hours .label { margin-bottom: 10px; }
    .hours { width: 100%; border-collapse: collapse; font-size: 15px; font-variant-numeric: tabular-nums; }
    .hours th { text-align: left; font-weight: 500; padding: 6px 16px 6px 0; vertical-align: top; }
    .hours td { text-align: right; padding: 6px 0; color: var(--muted); }
    .hours tr + tr th, .hours tr + tr td { border-top: 1px solid var(--line); }
    .hero-photo { margin: 0; }
    .hero-photo img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: var(--radius-lg); background: var(--line); }

    .hero.dark { background: var(--ink); color: #fff; }
    .hero.dark .eyebrow { color: color-mix(in srgb, var(--accent) 45%, #fff); }
    .hero.dark .lead { color: rgba(255,255,255,.72); }
    .hero.dark .btn-ghost { color: #fff; border-color: rgba(255,255,255,.35); }
    .hero.dark .btn-ghost:hover { border-color: #fff; }
    .hero.dark .hero-card { border-color: transparent; }

    /* Trust strip */
    .trust { background: var(--surface); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .trust-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .trust-grid > div { padding: 28px 28px 28px 0; display: grid; gap: 2px; }
    .trust-grid > div + div { padding-left: 28px; border-left: 1px solid var(--line); }
    .trust strong { font-weight: 600; font-size: 16px; }
    .trust span { font-size: 15px; color: var(--muted); }

    /* Sections */
    section.block { padding: 112px 0; }
    section.alt { background: var(--surface); }
    .section-head { display: grid; grid-template-columns: minmax(0, 1fr); max-width: 680px; margin-bottom: 56px; }
    .section-head h2 { font-size: clamp(32px, 3.6vw, 46px); }

    .services { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(${servicesCols}, minmax(0, 1fr)); gap: 48px 40px; }
    .services li { border-top: 1px solid var(--ink); padding-top: 22px; }
    .services .num { display: block; font: 600 13px/1 var(--body); letter-spacing: .08em; color: var(--accent); margin-bottom: 18px; font-variant-numeric: tabular-nums; }
    .services h3 { font-size: 24px; }
    .services p { margin-top: 10px; color: var(--muted); font-size: 16px; }

    .about-grid { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 72px; }
    .about-grid h2 { font-size: clamp(32px, 3.6vw, 46px); }
    .about-body { display: grid; gap: 20px; font-size: 18px; line-height: 1.75; }
    .about-body p:first-child { font-size: 21px; line-height: 1.6; }
    .signoff { margin-top: 12px; padding-top: 20px; border-top: 1px solid var(--line); font-size: 15px; color: var(--muted); }
    .signoff strong { display: block; font-family: var(--head); font-weight: ${f.headWeight}; font-size: 22px; color: var(--ink); text-transform: ${headCase}; letter-spacing: ${headTracking}; }

    .contact-grid { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 56px; align-items: start; }
    .contact-grid.single { grid-template-columns: minmax(0, 1fr); max-width: 560px; }
    .contact-grid .details { margin-bottom: 32px; }
    .contact-hours { margin: 8px 0 32px; }
    .contact-hours .label { margin-bottom: 10px; }
    .map { width: 100%; height: 420px; border: 1px solid var(--line); border-radius: var(--radius-lg); display: block; background: var(--line); }

    /* CTA band */
    .cta { background: var(--accent); color: #fff; padding: 88px 0; }
    .cta .wrap { display: flex; align-items: center; justify-content: space-between; gap: 32px; flex-wrap: wrap; }
    .cta h2 { font-size: clamp(30px, 3.4vw, 44px); max-width: 18em; }
    .cta .btn { background: #fff; color: var(--accent); }
    .cta .btn:hover { background: color-mix(in srgb, #fff 88%, var(--accent)); }

    /* Footer */
    .site-footer { background: var(--ink); color: rgba(255,255,255,.7); font-size: 15px; padding: 64px 0 32px; }
    .footer-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 40px; padding-bottom: 40px; border-bottom: 1px solid rgba(255,255,255,.14); }
    .site-footer .brand-name { color: #fff; font-size: 22px; display: block; margin-bottom: 10px; white-space: normal; }
    .site-footer h4 { margin: 0 0 12px; font: 600 12px/1 var(--body); letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.5); }
    .site-footer a { text-decoration: none; }
    .site-footer a:hover { color: #fff; }
    .site-footer ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .legal { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-top: 24px; font-size: 13px; color: rgba(255,255,255,.5); }

    .callbar { display: none; }

    @media (max-width: 960px) {
      .hero-grid, .about-grid, .contact-grid { grid-template-columns: minmax(0, 1fr); gap: 48px; }
      .services { grid-template-columns: repeat(${Math.min(servicesCols, 2)}, minmax(0, 1fr)); }
      .footer-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .footer-grid > :first-child { grid-column: 1 / -1; }
      .hero-photo img { aspect-ratio: 16 / 10; }
    }
    @media (max-width: 720px) {
      body { font-size: 16px; }
      .wrap { padding: 0 20px; }
      .site-header .wrap { height: 64px; }
      .nav { display: none; }
      .hero { padding: 56px 0 64px; }
      .hero .lead { font-size: 17px; }
      .actions .btn { flex: 1 1 100%; }
      .hero-card { padding: 24px; }
      .trust-grid { grid-template-columns: minmax(0, 1fr); }
      .trust-grid > div, .trust-grid > div + div { padding: 18px 0; border-left: 0; }
      .trust-grid > div + div { border-top: 1px solid var(--line); }
      section.block { padding: 72px 0; }
      .section-head { margin-bottom: 36px; }
      .services { grid-template-columns: minmax(0, 1fr); gap: 32px; }
      .about-body p:first-child { font-size: 19px; }
      .map { height: 300px; }
      .cta { padding: 64px 0; }
      .cta .btn { width: 100%; }
      .footer-grid { grid-template-columns: minmax(0, 1fr); }
      .site-footer { padding-bottom: ${telHref ? 104 : 32}px; }
      .callbar { display: block; position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: color-mix(in srgb, var(--bg) 94%, transparent); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); border-top: 1px solid var(--line); }
      .callbar .btn { width: 100%; }
    }
  </style>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="#top" aria-label="${e(b.name)}, back to top">
        <span class="mark" aria-hidden="true">${e(mono)}</span>
        <span class="brand-name">${e(b.name)}</span>
      </a>
      <nav class="nav" aria-label="Main">
        <a href="#services">${e(p.servicesTitle)}</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
        ${telHref ? `<a class="btn btn-primary btn-sm" href="${telHref}">${icon('phone')}${e(phoneDisplay)}</a>` : ''}
      </nav>
    </div>
  </header>

  <main id="main">
    <section class="hero${p.darkHero ? ' dark' : ''}" id="top">
      <div class="wrap hero-grid${heroAside ? '' : ' single'}">
        <div>
          ${eyebrow ? `<span class="eyebrow">${e(eyebrow)}</span>` : ''}
          <h1>${e(tagline)}</h1>
          <p class="lead">${e(p.lead)}</p>
          <div class="actions">
            <a class="btn btn-primary" href="${e(primaryHref)}">${telHref ? icon('phone') : ''}${e(primaryLabel)}</a>
            <a class="btn btn-ghost" href="#services">${e(p.viewLabel || 'View services')}${icon('arrow')}</a>
          </div>
        </div>
        ${heroAside}
      </div>
    </section>
    ${trust}

    <section class="block alt" id="services">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">${e(p.servicesTitle)}</span>
          <h2>${e(p.servicesHeading)}</h2>
        </div>
        <ul class="services">${servicesHtml}
        </ul>
      </div>
    </section>

    <section class="block" id="about">
      <div class="wrap about-grid">
        <div>
          <span class="eyebrow">About us</span>
          <h2>${e(b.name)}</h2>
        </div>
        <div class="about-body">
          ${aboutParas.map((t) => `<p>${e(t)}</p>`).join('\n          ')}
          ${b.ownerName ? `<div class="signoff"><strong>${e(b.ownerName)}</strong>Owner, ${e(b.name)}</div>` : ''}
        </div>
      </div>
    </section>

    <section class="block alt" id="contact">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Contact</span>
          <h2>${hasStreet ? 'Visit or get in touch.' : 'Get in touch.'}</h2>
        </div>
        <div class="contact-grid${hasStreet ? '' : ' single'}">
          <div>
            ${contactLines ? `<ul class="details">${contactLines}</ul>` : ''}
            ${hoursInContact ? `<div class="contact-hours"><span class="label">${icon('clock')} Opening hours</span>${hoursTable()}</div>` : ''}
            <div class="actions" style="margin-top:0">
              <a class="btn btn-primary" href="${e(primaryHref)}">${telHref ? icon('phone') : ''}${e(telHref ? `Call ${phoneDisplay}` : primaryLabel)}</a>
              ${hasStreet ? `<a class="btn btn-ghost" href="${e(directionsUrl)}" target="_blank" rel="noopener">Get directions${icon('arrow')}</a>` : ''}
            </div>
          </div>
          ${hasStreet ? `<iframe class="map" title="Map showing ${e(b.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${mapQuery}&amp;z=15&amp;output=embed"></iframe>` : ''}
        </div>
      </div>
    </section>

    <section class="cta">
      <div class="wrap">
        <h2>${e(p.ctaHeadline)}</h2>
        <a class="btn" href="${e(primaryHref)}">${telHref ? icon('phone') : ''}${e(telHref ? `Call ${phoneDisplay}` : primaryLabel)}</a>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <span class="brand-name">${e(b.name)}</span>
          <p>${e(tagline)}</p>
        </div>
        <div>
          <h4>Contact</h4>
          <ul>
            ${telHref ? `<li><a href="${telHref}">${e(phoneDisplay)}</a></li>` : phoneDisplay ? `<li>${e(phoneDisplay)}</li>` : ''}
            ${b.email ? `<li><a href="mailto:${e(b.email)}">${e(b.email)}</a></li>` : ''}
            ${b.address ? `<li>${e(b.address)}</li>` : ''}
            ${cityState || b.zip ? `<li>${e([cityState, b.zip].filter(Boolean).join(' '))}</li>` : ''}
          </ul>
        </div>
        <div>
          <h4>Explore</h4>
          <ul>
            <li><a href="#services">${e(p.servicesTitle)}</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
        </div>
      </div>
      <div class="legal">
        <span>© ${year} ${e(b.name)}. All rights reserved.</span>
        ${opts.agencyName ? `<span>Website by ${e(opts.agencyName)}</span>` : ''}
      </div>
    </div>
  </footer>

  ${telHref ? `<div class="callbar"><a class="btn btn-primary" href="${telHref}">${icon('phone')}${e(`Call ${phoneDisplay}`)}</a></div>` : ''}
</body>
</html>
`;
}

/** Write a business site to <outputDir>/sites/<slug>/index.html. Returns { slug, file }. */
function generateSite(business, { outputDir, ...opts }) {
  const slug = business.slug || slugify(`${business.name}${business.city ? `-${business.city}` : ''}`);
  const dir = path.join(outputDir, 'sites', slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, renderSite(business, opts));
  return { slug, file };
}

module.exports = { renderSite, generateSite, pickPreset, describeCategory, splitHours, splitService, initials, PRESETS, DEFAULT_PRESET };
