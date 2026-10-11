const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const Admin = require('./models/Admin');
const HeroSlide = require('./models/HeroSlide');
const Category = require('./models/Category');
const Product = require('./models/Product');
const Event = require('./models/Event');
const Review = require('./models/Review');
const Setting = require('./models/Setting');

/**
 * Load a frontend mock data module (ESM `export default`) as CJS so the seed
 * can reuse the same premium catalog the site falls back to.
 */
function loadMock(rel) {
  const fs = require('fs');
  const file = path.join(__dirname, rel);
  const code = fs
    .readFileSync(file, 'utf8')
    .replace(/\bexport\s+default\s+/, 'module.exports = ')
    .replace(/\bexport\s+const\s+/, 'const ');
  const m = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
}

async function seed() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing. Copy backend/.env.example to backend/.env and set values.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log('Connected to MongoDB.');

  // Clear existing hero slides so seed is idempotent
  await HeroSlide.deleteMany({});
  console.log('Cleared existing hero slides.');

  const unsplash = (id, w, h = 0) =>
    h
      ? `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`
      : `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

  const slides = [
    {
      title: 'POWERFUL SOUND. UNFORGETTABLE EXPERIENCES.',
      subtitle: 'NAVEEN PRODUCTIONS',
      description:
        'Professional sound production for concerts, weddings, corporate events and live experiences.',
      desktopImage: unsplash('photo-1470225620780-dba8ba36b745', 1920),
      mobileImage: unsplash('photo-1470225620780-dba8ba36b745', 1000, 1500),
      primaryButton: { text: 'Explore Rentals', link: '/rentals' },
      secondaryButton: { text: 'Contact Us', link: '/contact' },
      order: 0,
      isActive: true,
      autoplayDuration: 2000,
    },
    {
      title: 'PROFESSIONAL EQUIPMENT. PROFESSIONAL RESULTS.',
      subtitle: 'RENTAL SOLUTIONS',
      description:
        'Premium speakers, mixers, microphones and lighting for any stage, any venue, any audience.',
      desktopImage: unsplash('photo-1598488035139-bdbb2231ce04', 1920),
      mobileImage: unsplash('photo-1598488035139-bdbb2231ce04', 1000, 1500),
      primaryButton: { text: 'View Equipment', link: '/equipment' },
      secondaryButton: { text: '', link: '' },
      order: 1,
      isActive: true,
      autoplayDuration: 2000,
    },
    {
      title: 'SOUND THAT BRINGS EVENTS TO LIFE',
      subtitle: 'EVENT PRODUCTION',
      description:
        'Full-service live production — artists, stages and audiences made legendary together.',
      desktopImage: unsplash('photo-1524368535928-5b5e00ddc76b', 1920),
      mobileImage: unsplash('photo-1524368535928-5b5e00ddc76b', 1000, 1500),
      primaryButton: { text: 'Book Our Services', link: '/contact' },
      secondaryButton: { text: '', link: '' },
      order: 2,
      isActive: true,
      autoplayDuration: 2000,
    },
    {
      title: 'CLEAR SOUND. EVERY WORD MATTERS.',
      subtitle: 'CORPORATE & CONFERENCES',
      description:
        'Crystal-clear audio for keynote stages, boardrooms and hybrid events that demand precision.',
      desktopImage: unsplash('photo-1505373877841-8d25f7d46678', 1920),
      mobileImage: unsplash('photo-1505373877841-8d25f7d46678', 1000, 1500),
      primaryButton: { text: 'Contact Us', link: '/contact' },
      secondaryButton: { text: '', link: '' },
      order: 3,
      isActive: true,
      autoplayDuration: 2000,
    },
    {
      title: 'FROM SETUP TO SHOWTIME',
      subtitle: 'BEHIND THE SCENES',
      description:
        'Our crew runs the show from the first cable to the final bow — flawless from setup to showtime.',
      desktopImage: unsplash('photo-1470229722913-7c0e2dbbafd3', 1920),
      mobileImage: unsplash('photo-1470229722913-7c0e2dbbafd3', 1000, 1500),
      primaryButton: { text: 'Discover Our Work', link: '/events' },
      secondaryButton: { text: '', link: '' },
      order: 4,
      isActive: true,
      autoplayDuration: 2000,
    },
  ];

  await HeroSlide.insertMany(slides);
  console.log(`Seeded ${slides.length} hero slides.`);

  // Seed default admin (skipped if already exists)
  const adminExists = await Admin.findOne({ email: 'admin@naveenproductions.com' });
  if (!adminExists) {
    await Admin.create({
      name: 'NAVEEN PRODUCTIONS Admin',
      email: 'admin@naveenproductions.com',
      password: 'Admin123!',
    });
    console.log('Seeded default admin: admin@naveenproductions.com / Admin123!');
  } else {
    console.log('Admin already exists, skipping.');
  }

  // -------------------------------------------------------------------------
  // Catalog, events, reviews & settings (idempotent: cleared then re-seeded)
  // -------------------------------------------------------------------------
  const slugify = (str) =>
    (str || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-');

  await Promise.all([
    Category.deleteMany({}),
    Product.deleteMany({}),
    Event.deleteMany({}),
    Review.deleteMany({}),
    Setting.deleteMany({}),
  ]);
  console.log('Cleared categories, products, events, reviews, settings.');

  const mockCategories = loadMock('../frontend/src/data/categories.js');
  const mockProducts = loadMock('../frontend/src/data/products.js');
  const mockEvents = loadMock('../frontend/src/data/events.js');
  const mockReviews = loadMock('../frontend/src/data/reviews.js');

  // Categories from the mock catalog (skip the synthetic "All" entry)
  const catDocs = mockCategories
    .filter((c) => c.id !== 'all')
    .map((c) => ({ name: c.label, slug: slugify(c.label) }));

  let catMap = {};
  for (const c of catDocs) {
    const existing = await Category.findOne({ slug: c.slug });
    const doc = existing || (await Category.create(c));
    catMap[c.slug] = String(doc._id);
  }
  console.log(`Seeded ${catDocs.length} categories.`);

  // Products
  for (const p of mockProducts) {
    const catId = catMap[p.categoryId] || catMap[slugify(p.category)];
    await Product.create({
      name: p.name,
      slug: p.slug,
      tagline: p.shortDescription,
      description: p.description,
      category: catId,
      hourlyRate: Math.round(p.pricePerDay / 2),
      dayRate: p.pricePerDay,
      deposit: Math.round(p.pricePerDay * 0.5),
      minBookingHours: 6,
      images: p.images.map((url) => ({ url, alt: p.name })),
      specs: p.specifications.map((s) => ({ label: s.label, value: s.value })),
      inStock: p.available,
      featured: Boolean(p.featured),
    });
  }
  console.log(`Seeded ${mockProducts.length} products.`);

  // Events (map editorial mock structure -> backend Event model)
  const templateMap = { '01': 'editorial', '02': 'showcase', '03': 'behind-the-scenes' };
  for (const ev of mockEvents) {
    const sections = [];
    if (ev.intro) {
      sections.push({ type: 'text', heading: 'Introduction', text: ev.intro });
    }
    for (const block of ev.content || []) {
      sections.push({
        type: 'text',
        heading: block.heading || '',
        text: Array.isArray(block.paragraphs) ? block.paragraphs.join('\n\n') : block.paragraphs,
      });
    }
    if ((ev.images || []).length > 1) {
      sections.push({
        type: 'imageGrid',
        heading: 'Gallery',
        images: ev.images.map((url) => ({ url, alt: ev.title })),
      });
    }
    if ((ev.equipment || []).length) {
      sections.push({ type: 'highlights', heading: 'Equipment Deployed', items: ev.equipment });
    }

    const categoryKey = ev.categoryId || 'other';
    const categoryLabel = {
      weddings: 'Weddings',
      concerts: 'Concerts',
      corporate: 'Corporate',
      cultural: 'Cultural',
      meetings: 'Meetings',
      other: 'Other',
    }[categoryKey] || ev.category || 'Other';

    await Event.create({
      title: ev.title,
      slug: ev.slug,
      shortDescription: ev.shortDescription,
      category: categoryLabel,
      date: ev.date,
      city: ev.city,
      location: ev.location || ev.city,
      coverImage: ev.coverImage,
      template: templateMap[ev.template] || 'editorial',
      published: true,
      sections,
      clientTestimonial: {
        quote: (ev.quote || '').replace(/—.*$/, '').trim(),
        name: '',
        role: '',
      },
    });
  }
  console.log(`Seeded ${mockEvents.length} events.`);

  // Reviews
  for (const r of mockReviews) {
    await Review.create({
      name: r.name,
      quote: r.content,
      role: r.event,
      rating: r.rating,
      featured: true,
    });
  }
  console.log(`Seeded ${mockReviews.length} reviews.`);

  // Settings (single doc)
  await Setting.create({
    siteName: 'NAVEEN PRODUCTIONS',
    tagline: 'Professional Sound. Powerful Experiences.',
    phone: '+91 90000 00000',
    email: 'bookings@naveenproductions.com',
    whatsappNumber: '919000000000',
    address: {
      street: 'NAVEEN PRODUCTIONS HQ',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500001',
    },
    social: {
      instagram: 'naveenproductions',
      youtube: '',
      facebook: '',
      mapQuery: 'Hyderabad, Telangana, India',
    },
  });
  console.log('Seeded settings.');

  await mongoose.disconnect();
  console.log('Seeding complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});