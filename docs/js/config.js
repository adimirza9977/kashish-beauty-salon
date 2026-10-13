/* Kashish Beauty Salon — app configuration */
var CFG = {
  SUPABASE_URL: "https://uzqbtsbcquwwejgtobsx.supabase.co",
  // Publishable (public) key — safe to embed in the app; it only allows
  // what the database's row-level-security policies permit.
  SUPABASE_ANON_KEY: "sb_publishable_fAPpEhYcZfeYVjkT8V4cdw_6B3vzp9T",

  SALON: {
    name: "Kashish Beauty Salon",
    phone: "+923127830765",          // for tel: links (with +)
    whatsapp: "923127830765",        // for wa.me links (no +)
    address: "Garden Town, Street No. 1, House No. 127/B, Sahiwal, Punjab, Pakistan",
    instagram: "https://www.instagram.com/kashish_salon_sahiwal",
    openHour: 8,                     // 8 AM
    closeHour: 23,                   // 11 PM (last bookable slot 10 PM)
    slotMinutes: 60
  },

  OWNER_PIN_KEY: "kashish_owner_pin",
  DEFAULT_PIN: "1234",               // adeel can change it in Owner > Settings

  // App version (for in-app update notices) — bump with every release
  APP_VERSION: "6.3",
  APP_VERSION_CODE: 30,

  // Push notification test (Edge Function shared secret)
  PUSH_SECRET: "Nw2njYC5EjElniEh6z4WRKIN6s3qJtCTfxomIK2dU0c",

  PAY_ACCOUNTS_KEY: "kashish_pay_accounts",

  // Default payment accounts (title + number; owner can change them in Owner > Settings)
  DEFAULT_PAY_ACCOUNTS: {
    easypaisa: { title: "Kashish Beauty Salon", number: "03112289977" },
    jazzcash: { title: "Kashish Beauty Salon", number: "03112289977" },
    bank: { title: "Kashish Beauty Salon", number: "012779028703" }
  },

  // Default Instagram (owner can change it in Owner > Settings)
  DEFAULT_INSTAGRAM: "https://www.instagram.com/kashish_salon_sahiwal",

  // Fallback when DB has no services yet (also used to seed Supabase)
  SEED_ON_EMPTY: true
};

/* Salon info (kept for compatibility with older code) */
var SALON = {
  phone: CFG.SALON.phone,
  whatsapp: CFG.SALON.whatsapp,
  address: CFG.SALON.address,
  instagram: CFG.SALON.instagram
};

function rs(n){ return "Rs " + Number(n || 0).toLocaleString("en-PK"); }

/* Normalize a Pakistani mobile number to 03XXXXXXXXX, or "" if invalid */
function normPhone(p){
  var d = String(p || "").replace(/\D/g, "");
  if (d.length === 12 && d.indexOf("92") === 0) d = "0" + d.slice(2);
  if (d.length === 11 && d.charAt(0) === "0" && d.charAt(1) === "3") return d;
  if (d.length === 10 && d.charAt(0) === "3") return "0" + d;
  return "";
}

/* "14:00" -> "2:00 PM" */
function fmtSlot(t){
  var parts = t.split(":");
  var h = parseInt(parts[0], 10), m = parts[1] || "00";
  var ap = h >= 12 ? "PM" : "AM";
  var h12 = h % 12; if (h12 === 0) h12 = 12;
  return h12 + ":" + m + " " + ap;
}

/* "2026-10-12" -> "Mon, 12 Oct 2026" */
function fmtDate(iso){
  try {
    var d = new Date(iso + "T00:00:00");
    var days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    var mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return days[d.getDay()] + ", " + d.getDate() + " " + mon[d.getMonth()] + " " + d.getFullYear();
  } catch(e){ return iso; }
}
