/* Kashish Beauty Salon — services & prices in PKR (with durations).
   Also used to seed the Supabase `services` table on first launch. */
var CATEGORIES = [
  { id: "makeup",  name: "Makeup",   icon: "\u2728" },
  { id: "hair",    name: "Hair",     icon: "\u2702" },
  { id: "skin",    name: "Skin",     icon: "\u263A" },
  { id: "nails",   name: "Nails",    icon: "💅" },
  { id: "mehndi",  name: "Mehndi",   icon: "\u2766" },
  { id: "wax",     name: "Waxing",   icon: "\u25CB" },
  { id: "package", name: "Packages", icon: "🎁" }
];

var SERVICES = [
  // ---- MAKEUP ----
  { cat: "makeup", name: "Signature Bridal Makeup", desc: "HD luxury bridal look with lashes & setting", price: 35000, dur: 180 },
  { cat: "makeup", name: "Classic Bridal Makeup", desc: "Traditional bridal glow, full face", price: 25000, dur: 150 },
  { cat: "makeup", name: "Engagement / Nikkah Makeup", desc: "Elegant soft-glam look", price: 15000, dur: 90 },
  { cat: "makeup", name: "Party Makeup", desc: "Glam look for events & dinners", price: 7500, dur: 60 },
  { cat: "makeup", name: "Light / Everyday Makeup", desc: "Natural fresh look", price: 3500, dur: 30 },
  { cat: "makeup", name: "Eye Makeup Only", desc: "Smokey, glitter or cut-crease", price: 2000, dur: 30 },

  // ---- HAIR ----
  { cat: "hair", name: "Ladies Haircut", desc: "Any style — layers, bob, step cut", price: 1200, dur: 40 },
  { cat: "hair", name: "Haircut + Blow Dry", desc: "Cut with professional blowout", price: 2000, dur: 60 },
  { cat: "hair", name: "Blow Dry / Styling", desc: "Straight, curls or waves", price: 1000, dur: 30 },
  { cat: "hair", name: "Full Hair Color", desc: "One shade, all lengths", price: 8000, dur: 120 },
  { cat: "hair", name: "Highlights / Streaks", desc: "Foil highlights, balayage", price: 10000, dur: 150 },
  { cat: "hair", name: "Keratin Treatment", desc: "Smooth, frizz-free shine", price: 15000, dur: 180 },
  { cat: "hair", name: "Hair Rebonding", desc: "Permanent straightening", price: 12000, dur: 180 },
  { cat: "hair", name: "Hair Spa", desc: "Deep nourishment ritual", price: 3500, dur: 60 },
  { cat: "hair", name: "Hair Wash + Setting", desc: "Wash with styled finish", price: 800, dur: 30 },
  { cat: "hair", name: "Bridal Hair Styling", desc: "Elegant bridal updo with accessories", price: 8000, dur: 90 },

  // ---- SKIN ----
  { cat: "skin", name: "Signature Gold Facial", desc: "24k glow facial, 60 min", price: 6000, dur: 60 },
  { cat: "skin", name: "Whitening Facial", desc: "Brightening & even tone", price: 4500, dur: 60 },
  { cat: "skin", name: "Hydra Facial", desc: "Deep hydration & glow", price: 8000, dur: 60 },
  { cat: "skin", name: "Clean Up", desc: "Express glow, 30 min", price: 2000, dur: 30 },
  { cat: "skin", name: "Face Polish", desc: "Instant radiance", price: 2500, dur: 30 },
  { cat: "skin", name: "Face Bleach", desc: "Gentle brightening", price: 1500, dur: 30 },

  // ---- NAILS ----
  { cat: "nails", name: "Manicure", desc: "Classic hand care", price: 2000, dur: 45 },
  { cat: "nails", name: "Pedicure", desc: "Classic foot care", price: 2500, dur: 45 },
  { cat: "nails", name: "Mani + Pedi Combo", desc: "Complete hand & foot care", price: 4000, dur: 90 },
  { cat: "nails", name: "Nail Art (per set)", desc: "Hand-painted designs", price: 1500, dur: 45 },
  { cat: "nails", name: "Gel / Acrylic Nails", desc: "Extensions with polish", price: 5000, dur: 90 },

  // ---- MEHNDI ----
  { cat: "mehndi", name: "Bridal Mehndi (Full)", desc: "Both hands + feet, intricate", price: 8000, dur: 180 },
  { cat: "mehndi", name: "Party Mehndi (per hand)", desc: "Elegant festive design", price: 1500, dur: 60 },
  { cat: "mehndi", name: "Simple Mehndi Design", desc: "Minimal & pretty", price: 800, dur: 30 },

  // ---- WAXING ----
  { cat: "wax", name: "Full Body Wax", desc: "Complete smooth finish", price: 5000, dur: 90 },
  { cat: "wax", name: "Half Legs Wax", desc: "", price: 1500, dur: 30 },
  { cat: "wax", name: "Full Arms Wax", desc: "", price: 1800, dur: 30 },
  { cat: "wax", name: "Underarms Wax", desc: "", price: 800, dur: 15 },
  { cat: "wax", name: "Eyebrow Shaping", desc: "Threading", price: 400, dur: 15 },
  { cat: "wax", name: "Upper Lips Threading", desc: "", price: 300, dur: 10 },
  { cat: "wax", name: "Full Face Threading", desc: "", price: 1200, dur: 30 },

  // ---- PACKAGES ----
  { cat: "package", name: "Complete Bridal Package", desc: "Bridal makeup + hair + nails + mehndi", price: 50000, dur: 480 },
  { cat: "package", name: "Party Glow Package", desc: "Party makeup + hair styling + face polish", price: 12000, dur: 150 },
  { cat: "package", name: "Monthly Care Package", desc: "Facial + mani-pedi + threading", price: 9999, dur: 180 }
];

/* Gallery images (local files in img/) */
var GALLERY = [
  "img/gal1.jpg", "img/gal2.jpg", "img/gal3.jpg",
  "img/gal4.jpg", "img/gal5.jpg", "img/gal6.jpg",
  "img/gal7.jpg", "img/gal8.jpg", "img/gal9.jpg"
];

var FEATURED = [
  { img: "img/gal1.jpg", name: "Bridal Hair Styling", price: 8000 },
  { img: "img/gal2.jpg", name: "Highlights / Streaks", price: 10000 },
  { img: "img/gal4.jpg", name: "Keratin Treatment", price: 15000 },
  { img: "img/gal3.jpg", name: "Signature Bridal Makeup", price: 35000 }
];

/* DB-backed service list (filled at startup; falls back to local list) */
var DB_SERVICES = [];
