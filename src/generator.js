'use strict';
const fs = require('fs');
const path = require('path');
const { escapeHtml: e, slugify, toE164 } = require('./util');

/**
 * Design + copy presets per business type. `match` is tested against the
 * business category (case-insensitive) to pick a preset.
 */
const PRESETS = [
  {
    key: 'restaurant', match: /restaurant|diner|bistro|grill|pizz|taco|sushi|kitchen|eatery|bbq|food/,
    icon: '🍽️', colors: ['#b23a2e', '#fff8f1', '#2b1d17'], font: 'Georgia, "Times New Roman", serif',
    tagline: 'Fresh food, made with love in {city}',
    services: ['Dine-in', 'Takeout', 'Catering', 'Private events'], cta: 'Call to reserve',
    servicesTitle: 'What we offer',
  },
  {
    key: 'cafe', match: /cafe|café|coffee|bakery|bake|donut|tea|dessert|ice cream/,
    icon: '☕', colors: ['#7a4b2a', '#fbf5ee', '#2d2016'], font: 'Georgia, "Times New Roman", serif',
    tagline: "{city}'s favorite neighborhood spot",
    services: ['Espresso drinks', 'Fresh pastries', 'Breakfast & lunch', 'Free Wi-Fi'], cta: 'Call us',
    servicesTitle: 'On the menu',
  },
  {
    key: 'trades', match: /plumb|electric|hvac|heating|cooling|roof|handyman|contractor|construct|paint|locksmith|pest|garage door/,
    icon: '🔧', colors: ['#1f5fa8', '#f3f7fc', '#10233b'], font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    tagline: 'Fast, honest, licensed service in {city}',
    services: ['Emergency repairs', 'Installations', 'Inspections & maintenance', 'Free estimates'], cta: 'Call for a free quote',
    servicesTitle: 'Our services', trust: ['Licensed & insured', 'Upfront pricing', 'Same-day service'],
  },
  {
    key: 'auto', match: /auto|car|mechanic|tire|body shop|detail|towing|oil/,
    icon: '🚗', colors: ['#c0392b', '#f6f6f6', '#1a1a1a'], font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    tagline: 'Trusted auto care in {city}',
    services: ['Diagnostics', 'Brakes & suspension', 'Oil changes', 'Tires & alignment'], cta: 'Book a service',
    servicesTitle: 'Our services', trust: ['Certified technicians', 'Honest estimates', 'Warranty on work'],
  },
  {
    key: 'beauty', match: /salon|hair|barber|nail|spa|beauty|lash|brow|massage|wax|tattoo/,
    icon: '✂️', colors: ['#9b4d73', '#fdf6f9', '#2e1a25'], font: '"Palatino Linotype", Palatino, Georgia, serif',
    tagline: 'Look good. Feel great. Right here in {city}.',
    services: ['Cuts & styling', 'Color', 'Treatments', 'Special occasions'], cta: 'Book an appointment',
    servicesTitle: 'Services',
  },
  {
    key: 'health', match: /dent|doctor|clinic|chiro|physio|therapy|medical|optom|vet|pharmacy|health/,
    icon: '🩺', colors: ['#14866d', '#f2faf8', '#0f2b25'], font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    tagline: 'Caring for {city}, one patient at a time',
    services: ['New patient visits', 'Routine care', 'Same-week appointments', 'Most insurance accepted'], cta: 'Schedule a visit',
    servicesTitle: 'How we can help', trust: ['Friendly staff', 'Modern equipment', 'Accepting new patients'],
  },
  {
    key: 'outdoor', match: /landscap|lawn|garden|tree|pool|snow|fenc|yard/,
    icon: '🌿', colors: ['#3d7a33', '#f5faf2', '#1b2e17'], font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    tagline: 'Beautiful outdoor spaces across {city}',
    services: ['Lawn care', 'Landscape design', 'Seasonal cleanup', 'Hardscaping'], cta: 'Get a free estimate',
    servicesTitle: 'Our services', trust: ['Locally owned', 'Free estimates', 'Satisfaction guaranteed'],
  },
  {
    key: 'cleaning', match: /clean|maid|janitor|laundry|dry clean|carpet|pressure wash/,
    icon: '✨', colors: ['#2a8fbd', '#f2f9fc', '#10293a'], font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    tagline: 'Spotless results in {city}, every time',
    services: ['Home cleaning', 'Office cleaning', 'Deep cleans', 'Move-in / move-out'], cta: 'Get a quote',
    servicesTitle: 'Our services', trust: ['Bonded & insured', 'Eco-friendly products', 'Flexible scheduling'],
  },
  {
    key: 'fitness', match: /gym|fitness|yoga|pilates|crossfit|martial|dance|boxing|train/,
    icon: '💪', colors: ['#e2621b', '#fff7f2', '#1f140d'], font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    tagline: 'Get stronger with the best community in {city}',
    services: ['Group classes', 'Personal training', 'Open gym', 'Free first class'], cta: 'Try a free class',
    servicesTitle: 'Programs',
  },
  {
    key: 'retail', match: /shop|store|boutique|florist|flower|gift|book|pet|jewel|hardware|market/,
    icon: '🛍️', colors: ['#6b4fbb', '#f8f6fd', '#1e1733'], font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    tagline: 'Your local shop in {city}',
    services: ['Curated selection', 'Gift wrapping', 'Special orders', 'Local delivery'], cta: 'Call the shop',
    servicesTitle: 'What you’ll find',
  },
];

const DEFAULT_PRESET = {
  key: 'general', icon: '⭐', colors: ['#2f4b7c', '#f5f7fb', '#141c2b'],
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  tagline: 'Proudly serving {city}', services: ['Quality service', 'Friendly team', 'Fair prices', 'Local experts'],
  cta: 'Call us today', servicesTitle: 'What we do',
};

function pickPreset(category = '') {
  const c = String(category).toLowerCase();
  return PRESETS.find((p) => p.match.test(c)) || DEFAULT_PRESET;
}

const fill = (tpl, b) => tpl.replace('{city}', b.city || 'your neighborhood');

function prettyPhone(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 || '');
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function defaultDescription(b, preset) {
  const where = b.city ? ` in ${b.city}` : '';
  const what = b.category ? b.category.toLowerCase() : 'local business';
  return `${b.name} is a locally owned ${what}${where}. We take pride in treating every customer like a neighbor — ` +
    `with honest advice, quality work and service you can count on. ${preset.cta} and see why people around here keep coming back.`;
}

/** Build the full, self-contained HTML for one business site. */
function renderSite(business, opts = {}) {
  const b = business;
  const preset = pickPreset(b.category);
  const [accent, bg, ink] = preset.colors;
  const phone = toE164(b.phone, opts.defaultCountryCode || '1');
  const phoneDisplay = b.phone ? (phone ? prettyPhone(phone) : b.phone) : '';
  const tagline = b.tagline || fill(preset.tagline, b);
  const description = b.description || defaultDescription(b, preset);
  const services = b.services && b.services.length ? b.services : preset.services;
  const fullAddress = [b.address, b.city, [b.state, b.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const year = new Date().getFullYear();
  const callHref = phone ? `tel:${phone}` : (b.email ? `mailto:${b.email}` : '#contact');
  const ctaLabel = phone ? preset.cta : 'Get in touch';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: b.name,
    description,
    ...(phone && { telephone: phone }),
    ...(b.email && { email: b.email }),
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

  const servicesHtml = services.map((s) => `<li class="card"><span class="dot"></span>${e(s)}</li>`).join('\n          ');
  const trustHtml = preset.trust
    ? `<ul class="trust">${preset.trust.map((t) => `<li>✓ ${e(t)}</li>`).join('')}</ul>`
    : '';
  const hoursHtml = b.hours && b.hours.length
    ? `<div class="panel"><h3>Hours</h3><ul class="hours">${b.hours.map((h) => `<li>${e(h)}</li>`).join('')}</ul></div>`
    : '';
  const mapHtml = fullAddress
    ? `<iframe class="map" title="Map to ${e(b.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
        src="https://maps.google.com/maps?q=${encodeURIComponent(`${b.name}, ${fullAddress}`)}&amp;output=embed"></iframe>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(b.name)}${b.city ? ` | ${e(b.category || 'Local business')} in ${e(b.city)}` : ''}</title>
  <meta name="description" content="${e(tagline)} — ${e(description.slice(0, 140))}">
  <meta property="og:title" content="${e(b.name)}">
  <meta property="og:description" content="${e(tagline)}">
  <meta property="og:type" content="website">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${preset.icon}</text></svg>">
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
  <style>
    :root { --accent: ${accent}; --bg: ${bg}; --ink: ${ink}; --muted: color-mix(in srgb, var(--ink) 65%, white); --font: ${preset.font}; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); background: var(--bg); line-height: 1.6; }
    h1, h2, h3 { font-family: var(--font); line-height: 1.2; margin: 0 0 .5em; }
    a { color: var(--accent); }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 0 20px; }
    header.top { position: sticky; top: 0; z-index: 10; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid color-mix(in srgb, var(--ink) 10%, transparent); }
    header.top .wrap { display: flex; align-items: center; justify-content: space-between; height: 64px; gap: 12px; }
    .brand { font-family: var(--font); font-weight: 700; font-size: 1.2rem; text-decoration: none; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    nav a { margin-left: 18px; text-decoration: none; color: var(--ink); font-weight: 500; }
    .btn { display: inline-block; background: var(--accent); color: #fff; padding: 14px 26px; border-radius: 999px; text-decoration: none; font-weight: 600; box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 35%, transparent); transition: transform .15s; }
    .btn:hover { transform: translateY(-2px); }
    .btn.small { padding: 9px 18px; font-size: .95rem; box-shadow: none; }
    .hero { padding: 96px 0 80px; background: radial-gradient(1200px 400px at 80% -10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent), var(--bg); }
    .hero .icon { font-size: 3rem; }
    .hero h1 { font-size: clamp(2.2rem, 5vw, 3.6rem); max-width: 16ch; }
    .hero p.lead { font-size: 1.25rem; color: var(--muted); max-width: 38ch; margin: 0 0 28px; }
    .trust { list-style: none; padding: 0; margin: 28px 0 0; display: flex; flex-wrap: wrap; gap: 10px 24px; color: var(--muted); font-weight: 500; }
    section { padding: 72px 0; }
    section.alt { background: #fff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; list-style: none; padding: 0; margin: 24px 0 0; }
    .card { background: var(--bg); border-radius: 14px; padding: 22px; font-weight: 600; display: flex; align-items: center; gap: 12px; border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); flex: none; }
    .about { display: grid; grid-template-columns: 1fr; gap: 24px; max-width: 760px; font-size: 1.1rem; }
    .contact { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; align-items: start; }
    .panel { background: #fff; border-radius: 14px; padding: 24px; border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); }
    .panel p { margin: .3em 0; }
    .hours { list-style: none; padding: 0; margin: 0; }
    .hours li { padding: 4px 0; border-bottom: 1px dashed color-mix(in srgb, var(--ink) 12%, transparent); }
    .map { width: 100%; height: 320px; border: 0; border-radius: 14px; }
    footer { padding: 32px 0; text-align: center; color: var(--muted); font-size: .9rem; }
    .callbar { display: none; }
    @media (max-width: 640px) {
      nav { display: none; }
      .hero { padding: 64px 0 56px; }
      .callbar { display: block; position: fixed; left: 12px; right: 12px; bottom: 12px; text-align: center; z-index: 20; }
      .callbar .btn { display: block; }
      footer { padding-bottom: 96px; }
    }
  </style>
</head>
<body>
  <header class="top">
    <div class="wrap">
      <a class="brand" href="#">${preset.icon} ${e(b.name)}</a>
      <nav>
        <a href="#services">${e(preset.servicesTitle)}</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
        <a class="btn small" href="${e(callHref)}">${phoneDisplay ? e(phoneDisplay) : 'Contact'}</a>
      </nav>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="wrap">
        <div class="icon" aria-hidden="true">${preset.icon}</div>
        <h1>${e(b.name)}</h1>
        <p class="lead">${e(tagline)}</p>
        <a class="btn" href="${e(callHref)}">${e(ctaLabel)}${phoneDisplay ? ` · ${e(phoneDisplay)}` : ''}</a>
        ${trustHtml}
      </div>
    </section>

    <section id="services" class="alt">
      <div class="wrap">
        <h2>${e(preset.servicesTitle)}</h2>
        <ul class="grid">
          ${servicesHtml}
        </ul>
      </div>
    </section>

    <section id="about">
      <div class="wrap about">
        <h2>About ${e(b.name)}</h2>
        <p>${e(description)}</p>
      </div>
    </section>

    <section id="contact" class="alt">
      <div class="wrap">
        <h2>Visit or contact us</h2>
        <div class="contact">
          <div class="panel">
            <h3>Get in touch</h3>
            ${phoneDisplay ? `<p>📞 <a href="${e(callHref)}">${e(phoneDisplay)}</a></p>` : ''}
            ${b.email ? `<p>✉️ <a href="mailto:${e(b.email)}">${e(b.email)}</a></p>` : ''}
            ${fullAddress ? `<p>📍 ${e(fullAddress)}</p>` : ''}
          </div>
          ${hoursHtml}
          ${mapHtml ? `<div>${mapHtml}</div>` : ''}
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="wrap">© ${year} ${e(b.name)}${b.city ? ` · ${e(b.city)}` : ''}${opts.agencyName ? ` · Website by ${e(opts.agencyName)}` : ''}</div>
  </footer>

  ${phone ? `<div class="callbar"><a class="btn" href="${e(callHref)}">📞 ${e(ctaLabel)}</a></div>` : ''}
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

module.exports = { renderSite, generateSite, pickPreset, PRESETS };
