/* Kashish Beauty Salon — Supabase REST wrapper (v5: security hardened)
   - Public catalog reads stay direct (services, gallery, offers, coupons, beauticians, settings)
   - EVERYTHING sensitive goes through SECURITY DEFINER functions (rpc):
     customer auth, bookings, loyalty, coupons, owner actions (token-gated)
   - The owner PIN hash can no longer be read by anyone. */
var DB = (function(){
  "use strict";
  var base = CFG.SUPABASE_URL + "/rest/v1";

  function hdrs(){
    return {
      "apikey": CFG.SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + CFG.SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    };
  }

  function handle(res){
    if (!res.ok) {
      return res.text().then(function(t){
        var err = new Error("DB error " + res.status);
        err.status = res.status; err.body = t;
        throw err;
      });
    }
    return res.json().catch(function(){ return null; });
  }

  function get(table, params){
    var qs = params ? "?" + params : "";
    return fetch(base + "/" + table + qs, { headers: hdrs() }).then(handle);
  }

  /* Call a SECURITY DEFINER function. Server-side {error: code} becomes a thrown Error with .code */
  function rpc(name, args){
    return fetch(base + "/rpc/" + name, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify(args || {})
    }).then(handle).then(function(r){
      if (r && typeof r === "object" && !Array.isArray(r) && r.error){
        var e = new Error(r.error);
        e.code = r.error;
        throw e;
      }
      return r;
    });
  }

  function enc(v){ return encodeURIComponent(v); }

  function sha256(str){
    var buf = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", buf).then(function(hash){
      return Array.prototype.map.call(new Uint8Array(hash), function(b){
        return ("0" + b.toString(16)).slice(-2);
      }).join("");
    });
  }

  /* ---------- owner session token (12h, validated server-side) ---------- */
  var OWNER_KEY = "kashish_owner_token";
  function ownerToken(){
    try { return localStorage.getItem(OWNER_KEY); } catch(e){ return null; }
  }
  function forgetToken(){
    try { localStorage.removeItem(OWNER_KEY); } catch(e){}
  }
  /* v6.0 actions live in owner_action_v6 (patch8 adds it WITHOUT touching
     the battle-tested owner_action); everything else stays on owner_action */
  var V6_ACTIONS = { gal_add: 1, gal_cat_add: 1, gal_cat_delete: 1, gal_set_cat: 1,
                     deal_upsert: 1, deal_delete: 1, svc_img_add: 1, svc_img_delete: 1 };
  /* Owner-gated call: every owner write goes through owner_action */
  function ocall(action, data){
    var t = ownerToken();
    if (!t) return Promise.reject(Object.assign(new Error("no-token"), { code: "no-token" }));
    return rpc(V6_ACTIONS[action] ? "owner_action_v6" : "owner_action",
               { p_token: t, p_action: action, p_data: data || {} })
      .then(function(r){
        if (r && r.error === "bad-token"){
          forgetToken();
          throw Object.assign(new Error("bad-token"), { code: "bad-token" });
        }
        return r;
      });
  }
  /* Owner-gated call to a standalone owner_* function (token injected) */
  function ocallFn(fn, args){
    var t = ownerToken();
    if (!t) return Promise.reject(Object.assign(new Error("no-token"), { code: "no-token" }));
    args = args || {};
    args.p_token = t;
    return rpc(fn, args).then(function(r){
      if (r && r.error === "bad-token"){
        forgetToken();
        throw Object.assign(new Error("bad-token"), { code: "bad-token" });
      }
      return r;
    });
  }

  /* ---------- v6.0 media normalization ----------
     Phone photos arrive as HEIC / PNG / WebP / extension-less, but the
     storage bucket only accepts jpg/png/webp/gif NAMES and browsers cannot
     display HEIC at all — that mismatch was the "broken picture" bug.
     Fix: EVERY image is decoded and re-encoded to a true JPEG before
     upload, so the saved file is always a real .jpg that shows everywhere.
     Videos are never re-labelled either: the real format is sniffed from
     the file bytes and the upload uses that exact extension + MIME. */
  function fileHead(file, n){
    return file.slice(0, n).arrayBuffer().then(function(b){ return new Uint8Array(b); });
  }
  function isFtyp(b){
    return b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
  }
  function ftypBrand(b){
    return String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
  }
  function isHeicFile(file){
    var t = (file.type || "").toLowerCase();
    if (t.indexOf("heic") >= 0 || t.indexOf("heif") >= 0) return Promise.resolve(true);
    return fileHead(file, 12).then(function(b){
      if (!isFtyp(b)) return false;
      var brand = ftypBrand(b);
      return ["heic", "heix", "hevc", "hevx", "mif1", "mif2", "msf1"].indexOf(brand) >= 0;
    }).catch(function(){ return false; });
  }
  function blankError(){
    return Object.assign(new Error("blank-frame"), { code: "blank-frame" });
  }
  /* true when every sampled pixel is (nearly) identical — a real photo is
     never perfectly uniform; a failed draw is. Uploading such a frame is
     how a white "picture" reached the gallery in v6.0 — never again. */
  function canvasLooksBlank(cv){
    try {
      var t = document.createElement("canvas");
      t.width = 8; t.height = 8;
      var tx = t.getContext("2d");
      tx.drawImage(cv, 0, 0, 8, 8);
      var d = tx.getImageData(0, 0, 8, 8).data;
      var r = d[0], g = d[1], b = d[2];
      for (var i = 4; i < d.length; i += 4){
        if (Math.abs(d[i] - r) > 6 || Math.abs(d[i + 1] - g) > 6 || Math.abs(d[i + 2] - b) > 6)
          return false;
      }
      return true;
    } catch(e){ return false; /* cannot check -> do not block the upload */ }
  }
  /* Decode a blob into something drawImage can paint RELIABLY.
     v6.0 bug: drawImage right after <img> onload could paint an empty
     (white) frame on some WebViews because the picture was not fully
     decoded yet. img.decode() waits for a full decode; createImageBitmap
     is the fallback. */
  function decodeDrawable(blob){
    var url = URL.createObjectURL(blob);
    var img = new Image();
    var loaded = new Promise(function(resolve, reject){
      img.onload = function(){ resolve(); };
      img.onerror = function(){ reject(new Error("decode-failed")); };
      img.src = url;
    });
    var decoded = loaded.then(function(){
      if (!img.decode) return;
      var dec = img.decode().catch(function(){});
      var timeout = new Promise(function(res){ setTimeout(res, 12000); });
      return Promise.race([dec, timeout]);
    });
    return decoded.then(function(){
      if (!img.naturalWidth) throw new Error("decode-failed");
      return { src: img, w: img.naturalWidth, h: img.naturalHeight,
               close: function(){ URL.revokeObjectURL(url); } };
    }).catch(function(err){
      URL.revokeObjectURL(url);
      if (window.createImageBitmap){
        return createImageBitmap(blob).then(function(bmp){
          return { src: bmp, w: bmp.width, h: bmp.height,
                   close: function(){ if (bmp.close) bmp.close(); } };
        });
      }
      throw err;
    });
  }
  function drawToJpeg(blob){
    return decodeDrawable(blob).then(function(dr){
      var w = dr.w || 1, h = dr.h || 1;
      var sc = Math.min(1, 1600 / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
      var cv = document.createElement("canvas");
      cv.width = cw; cv.height = ch;
      var cx = cv.getContext("2d");
      cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, cw, ch);
      cx.drawImage(dr.src, 0, 0, cw, ch);
      if (dr.close) dr.close();
      if (canvasLooksBlank(cv)) throw blankError();
      return new Promise(function(resolve, reject){
        if (cv.toBlob){
          cv.toBlob(function(b){ b ? resolve(b) : reject(new Error("encode-failed")); }, "image/jpeg", 0.85);
        } else { reject(new Error("encode-failed")); }
      });
    });
  }
  var heic2anyP = null;
  function loadHeic2any(){
    if (window.heic2any) return Promise.resolve();
    if (!heic2anyP){
      heic2anyP = new Promise(function(resolve, reject){
        var s = document.createElement("script");
        s.src = "js/lib/heic2any.min.js";
        s.onload = function(){ resolve(); };
        s.onerror = function(){ reject(new Error("heic-lib-failed")); };
        document.head.appendChild(s);
      });
    }
    return heic2anyP;
  }
  function normalizeImage(file){
    /* ANY format -> true JPEG. Pehle direct decode; fail ya blank aaye to
       bundled converter (heic2any) se dobara; phir bhi na ho to saaf error —
       blank/galat file kabhi chup chaap upload nahi hogi. */
    return drawToJpeg(file).catch(function(firstErr){
      return loadHeic2any().then(function(){
        return window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
      }).then(function(out){
        return drawToJpeg(Array.isArray(out) ? out[0] : out);
      }).catch(function(){ throw firstErr; });
    });
  }
  function sniffVideo(file){
    var t = (file.type || "").toLowerCase();
    return fileHead(file, 12).then(function(b){
      if (b.length >= 4 && b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3)
        return { ext: "webm", mime: "video/webm" };
      if (isFtyp(b)){
        var brand = ftypBrand(b);
        if (brand.indexOf("qt") === 0) return { ext: "mov", mime: "video/quicktime" };
        if (brand.indexOf("3g") === 0) return { ext: "3gp", mime: "video/3gpp" };
        return { ext: "mp4", mime: "video/mp4" };
      }
      if (t.indexOf("webm") >= 0) return { ext: "webm", mime: "video/webm" };
      if (t.indexOf("quicktime") >= 0) return { ext: "mov", mime: "video/quicktime" };
      if (t.indexOf("3gpp") >= 0) return { ext: "3gp", mime: "video/3gpp" };
      return { ext: "mp4", mime: "video/mp4" };
    }).catch(function(){ return { ext: "mp4", mime: "video/mp4" }; });
  }
  function isVideoFile(file){
    var t = (file.type || "").toLowerCase();
    if (t.indexOf("video/") === 0) return true;
    if (t.indexOf("image/") === 0) return false;
    return /\.(mp4|mov|webm|3gp|m4v)$/i.test(file.name || "");
  }
  function storageUpload(blob, prefix, ext, mime){
    var filename = prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "." + ext;
    var url = CFG.SUPABASE_URL + "/storage/v1/object/salon-media/" + filename;
    return fetch(url, {
      method: "POST",
      headers: {
        "apikey": CFG.SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + CFG.SUPABASE_ANON_KEY,
        "Content-Type": mime
      },
      body: blob
    }).then(function(res){
      if (!res.ok) throw new Error("upload failed " + res.status);
      return CFG.SUPABASE_URL + "/storage/v1/object/public/salon-media/" + filename;
    });
  }

  return {
    sha256: sha256,
    rpc: rpc,

    /* ---- owner session ---- */
    ownerLogin: function(pin){
      return rpc("owner_login", { p_pin: pin }).then(function(tok){
        if (!tok) throw Object.assign(new Error("wrong-pin"), { code: "wrong-pin" });
        try { localStorage.setItem(OWNER_KEY, tok); } catch(e){}
        return tok;
      });
    },
    ownerLogout: function(){ forgetToken(); },
    ownerToken: ownerToken,
    ownerAuthed: function(){ return !!ownerToken(); },
    changePin: function(oldPin, newPin){
      return ocall("pin_change", { old_pin: oldPin, new_pin: newPin });
    },
    /* PIN recovery via one-time recovery code */
    recoveryStatus: function(){
      var t = ownerToken();
      if (!t) return Promise.resolve(false);
      return rpc("owner_recovery_status", { p_token: t }).catch(function(){ return false; });
    },
    recoveryIssue: function(){
      var t = ownerToken();
      if (!t) return Promise.reject(new Error("no-token"));
      return rpc("owner_recovery_issue", { p_token: t });
    },
    recoveryReset: function(code, newPin){
      return rpc("owner_recovery_reset", { p_code: code, p_new_pin: newPin })
        .then(function(newCode){
          if (!newCode) throw Object.assign(new Error("bad-code"), { code: "bad-code" });
          return newCode;
        });
    },

    /* ---- services (public catalog read) ---- */
    getServices: function(){
      return get("services", "select=*&active=eq.true&order=category,name");
    },
    seedServices: function(list){
      // post-v5: anon cannot insert services; kept best-effort for legacy DBs
      var chain = Promise.resolve();
      list.forEach(function(s){
        chain = chain.then(function(){
          return ocall("svc_upsert", {
            name: s.name, description: s.desc || "",
            price: s.price, duration_min: s.dur || 30,
            category: s.cat, active: true
          }).catch(function(){ /* ignore */ });
        });
      });
      return chain;
    },

    /* ---- bookings ---- */
    /* minimal slot info (no PII): [{id, time_slot, status, beautician_id}] */
    getBookingsByDate: function(dateIso){
      return rpc("slots_taken", { p_date: dateIso });
    },
    getAllBookings: function(limit){
      return ocall("booking_list", { limit: limit || 200 });
    },
    getUpcomingBookings: function(){
      var today = new Date().toISOString().slice(0, 10);
      return ocall("booking_list", { limit: 200 }).then(function(rows){
        return (rows || []).filter(function(b){
          return b.booking_date >= today &&
            (b.status === "pending" || b.status === "confirmed");
        }).sort(function(a, b){
          return (a.booking_date + a.time_slot) < (b.booking_date + b.time_slot) ? -1 : 1;
        });
      });
    },
    getPendingPayments: function(){
      return ocall("pending_payments", {});
    },
    /* secure booking: price/coupon/loyalty all validated server-side */
    placeBooking: function(data){
      return rpc("place_booking", { p_data: data });
    },
    rescheduleBooking: function(ref, phone, hash, date, slot){
      return rpc("reschedule_booking", {
        p_ref: ref, p_phone: phone, p_hash: hash, p_date: date, p_slot: slot
      });
    },
    setBookingStatus: function(id, status){
      return ocall("booking_status", { id: id, status: status });
    },
    setPaymentStatus: function(id, payment_status){
      return ocall("booking_payment", { id: id, payment_status: payment_status });
    },
    walkinBooking: function(data){
      return ocall("booking_walkin", data);
    },

    /* ---- customers / auth (all server-side) ---- */
    signupCustomer: function(name, phone, whatsapp, passwordHash, email){
      return rpc("customer_signup", {
        p_name: name, p_phone: phone, p_whatsapp: whatsapp || "", p_hash: passwordHash,
        p_email: email || null
      });
    },
    loginCustomer: function(phone, passwordHash){
      return rpc("customer_login", { p_phone: phone, p_hash: passwordHash });
    },
    getCustomerAuth: function(phone, passwordHash){
      return rpc("customer_get", { p_phone: phone, p_hash: passwordHash });
    },
    setCustomerWhatsapp: function(phone, passwordHash, whatsapp){
      return rpc("customer_set_whatsapp", {
        p_phone: phone, p_hash: passwordHash, p_wa: whatsapp
      });
    },
    updateCustomerProfile: function(phone, passwordHash, name, email){
      return rpc("customer_update_profile", {
        p_phone: phone, p_hash: passwordHash, p_name: name, p_email: email || null
      });
    },
    getBookingsByPhone: function(phone, passwordHash){
      return rpc("my_bookings", { p_phone: phone, p_hash: passwordHash });
    },
    cancelBooking: function(refCode, phone, passwordHash){
      return rpc("cancel_booking", {
        p_ref: refCode, p_phone: phone, p_hash: passwordHash
      });
    },
    rateBooking: function(refCode, phone, passwordHash, rating, review){
      return rpc("rate_service", {
        p_ref: refCode, p_phone: phone, p_hash: passwordHash,
        p_rating: rating, p_review: review || ""
      });
    },

    /* ---- loyalty config (public read; owner writes) ---- */
    getLoyaltyConfig: function(){
      return get("loyalty_config", "select=*&id=eq.1").then(function(r){
        return (r && r[0]) || { points_per_100rs: 1, redeem_points: 100, redeem_value_rs: 100, min_redeem_points: 100 };
      });
    },
    saveLoyaltyConfig: function(cfg){
      return ocall("loyalty_config_save", cfg);
    },
    awardLoyalty: function(customerId, points, reason){
      return ocall("loyalty_award", { id: customerId, points: points, reason: reason || "" });
    },

    /* ---- connectivity probe ---- */
    ping: function(){
      return get("services", "select=id&limit=1").then(function(){ return true; })
        .catch(function(e){ if (e && e.status === 404) return "no-tables"; throw e; });
    },

    /* ---- services manager (owner) ---- */
    addService: function(row){ return ocall("svc_upsert", row); },
    updateService: function(id, patch){
      var d = {}; for (var k in patch) d[k] = patch[k];
      d.id = id;
      return ocall("svc_upsert", d);
    },
    deleteService: function(id){ return ocall("svc_delete", { id: id }); },

    /* ---- gallery (public read; owner writes) ---- */
    getGallery: function(){
      return get("gallery", "select=*&order=sort_order,created_at");
    },
    addGalleryItem: function(imageUrl, caption, categoryId, mediaType){
      return ocall("gal_add", {
        image_url: imageUrl, caption: caption || "",
        category_id: categoryId || "", media_type: mediaType || "image"
      });
    },
    deleteGalleryItem: function(id){ return ocall("gal_delete", { id: id }); },
    setGalleryItemCategory: function(id, categoryId){
      return ocall("gal_set_cat", { id: id, category_id: categoryId || "" });
    },

    /* ---- gallery categories / folders (v6.0) ---- */
    getGalleryCategories: function(){
      return get("gallery_categories", "select=*&order=sort_order,created_at")
        .catch(function(){ return []; });
    },
    addGalleryCategory: function(name){ return ocall("gal_cat_add", { name: name }); },
    deleteGalleryCategory: function(id){ return ocall("gal_cat_delete", { id: id }); },

    /* ---- deals / packages (v6.0, public read; owner writes) ---- */
    getDeals: function(){
      return get("deals", "select=*&active=eq.true&order=sort_order,created_at")
        .catch(function(){ return []; });
    },
    getAllDeals: function(){
      return get("deals", "select=*&order=created_at.desc").catch(function(){ return []; });
    },
    addDeal: function(row){ return ocall("deal_upsert", row); },
    updateDeal: function(id, patch){
      var d = {}; for (var k in patch) d[k] = patch[k];
      d.id = id;
      return ocall("deal_upsert", d);
    },
    deleteDeal: function(id){ return ocall("deal_delete", { id: id }); },

    /* ---- extra pictures per service (v6.0) ---- */
    getServiceImages: function(serviceId){
      return get("service_images",
        "select=*&service_id=eq." + enc(serviceId) + "&order=sort_order,created_at")
        .catch(function(){ return []; });
    },
    addServiceImage: function(serviceId, imageUrl){
      return ocall("svc_img_add", { service_id: serviceId, image_url: imageUrl });
    },
    deleteServiceImage: function(id){ return ocall("svc_img_delete", { id: id }); },

    /* ---- salon settings (PIN hash blocked server-side) ---- */
    getSetting: function(key){
      return get("salon_settings", "select=value&key=eq." + enc(key))
        .then(function(r){ return (r && r.length) ? r[0].value : null; })
        .catch(function(){ return null; });
    },
    setSetting: function(key, value){
      return ocall("setting_set", { key: key, value: value });
    },

    /* ---- forgot password / OTP reset (server-side, rate-limited) ---- */
    createResetOTP: function(phone){
      return rpc("otp_request", { p_phone: phone });
    },
    resetPassword: function(phone, otp, newHash){
      return rpc("otp_reset", { p_phone: phone, p_otp: otp, p_new_hash: newHash })
        .then(function(ok){
          if (!ok) throw Object.assign(new Error("invalid-otp"), { code: "invalid-otp" });
          return true;
        });
    },
    getPendingResets: function(){ return ocall("reset_list", {}); },
    markResetSent: function(id){ return ocall("reset_dismiss", { id: id }); },

    /* ---- media upload to Supabase Storage (v6.0: always the TRUE format) ---- */
    isVideoFile: isVideoFile,
    uploadImage: function(file){
      return normalizeImage(file).then(function(jpeg){
        return storageUpload(jpeg, "img", "jpg", "image/jpeg");
      });
    },
    uploadVideo: function(file){
      if (file.size > 50 * 1024 * 1024){
        return Promise.reject(Object.assign(new Error("too-big"), { code: "too-big" }));
      }
      return sniffVideo(file).then(function(v){
        return storageUpload(file, "vid", v.ext, v.mime);
      });
    },
    /* object URL of the normalized JPEG — for instant, always-visible previews */
    imagePreviewUrl: function(file){
      return normalizeImage(file).then(function(jpeg){ return URL.createObjectURL(jpeg); });
    },

    /* ---- beauticians (public read; owner writes) ---- */
    getBeauticians: function(){
      return get("beauticians", "select=*&is_active=eq.true&order=name").catch(function(){ return []; });
    },
    getAllBeauticians: function(){
      return get("beauticians", "select=*&order=name").catch(function(){ return []; });
    },
    addBeautician: function(row){ return ocall("beaut_upsert", row); },
    updateBeautician: function(id, patch){
      var d = {}; for (var k in patch) d[k] = patch[k];
      d.id = id;
      return ocall("beaut_upsert", d);
    },
    /* v6.3 ranking: per-beautician booking counts from the server
       (beautician_stats RPC — aggregate only, no customer data).
       Fails soft to [] so ranking simply falls back to name order. */
    getBeauticianStats: function(){
      return rpc("beautician_stats", {}).then(function(r){ return r || []; })
        .catch(function(){ return []; });
    },
    /* Annotate + sort a beautician list by rank: most bookings first
       (cancelled excluded server-side), completed count breaks ties,
       then name. Adds bk_total / bk_done / rank (1-based) to copies. */
    rankBeauticians: function(list, stats){
      var map = {};
      (stats || []).forEach(function(s){ map[String(s.beautician_id)] = s; });
      var out = (list || []).map(function(b){
        var s = map[String(b.id)] || {};
        var c = {}; for (var k in b) c[k] = b[k];
        c.bk_total = Number(s.total_bookings || 0);
        c.bk_done = Number(s.completed_bookings || 0);
        c.bk_week = Number(s.week_bookings || 0);
        c.bk_week_done = Number(s.week_completed || 0);
        return c;
      });
      out.sort(function(a, b){
        if (b.bk_total !== a.bk_total) return b.bk_total - a.bk_total;
        if (b.bk_done !== a.bk_done) return b.bk_done - a.bk_done;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
      out.forEach(function(b, i){ b.rank = i + 1; });
      return out;
    },

    /* ---- offers (public read; owner writes) ---- */
    getOffers: function(){
      /* LOCAL calendar day (device time), not UTC — an offer "valid till
         today" must stay visible for the customer's whole day */
      var nd = new Date();
      var today = nd.getFullYear() + "-" +
        String(nd.getMonth() + 1).padStart(2, "0") + "-" +
        String(nd.getDate()).padStart(2, "0");
      return get("offers",
        "select=*&is_active=eq.true&or=(valid_till.is.null,valid_till.gte." + today + ")&order=created_at.desc"
      ).catch(function(){ return []; });
    },
    getAllOffers: function(){
      return get("offers", "select=*&order=created_at.desc").catch(function(){ return []; });
    },
    addOffer: function(row){ return ocall("offer_upsert", row); },
    updateOffer: function(id, patch){
      var d = {}; for (var k in patch) d[k] = patch[k];
      d.id = id;
      return ocall("offer_upsert", d);
    },

    /* ---- coupons ---- */
    /* server-side preview (validity + exact discount) */
    validateCoupon: function(code, amount){
      return rpc("validate_coupon", { p_code: code, p_amount: amount });
    },
    getAllCoupons: function(){
      return get("coupons", "select=*&order=created_at.desc").catch(function(){ return []; });
    },
    addCoupon: function(row){ return ocall("coupon_upsert", row); },
    updateCoupon: function(id, patch){
      var d = {}; for (var k in patch) d[k] = patch[k];
      d.id = id;
      return ocall("coupon_upsert", d);
    },

    /* ---- favorites (authed) ---- */
    getFavorites: function(phone, passwordHash){
      return rpc("fav_list", { p_phone: phone, p_hash: passwordHash })
        .then(function(r){
          if (!r || r.error) return [];
          return r.map(function(sid){ return { service_id: sid }; });
        });
    },
    addFavorite: function(phone, passwordHash, serviceId){
      return rpc("fav_add", {
        p_phone: phone, p_hash: passwordHash, p_service_id: String(serviceId)
      }).catch(function(){ return null; });
    },
    removeFavorite: function(phone, passwordHash, serviceId){
      return rpc("fav_remove", {
        p_phone: phone, p_hash: passwordHash, p_service_id: String(serviceId)
      }).catch(function(){ return null; });
    },

    /* ---- reviews (public, no PII beyond first name) ---- */
    getServiceReviews: function(serviceId){
      return rpc("service_reviews", { p_service_id: serviceId }).catch(function(){ return []; });
    },

    /* ---- customers list / delete (owner) ---- */
    getCustomers: function(){ return ocallFn("owner_customers_list", {}); },
    deleteCustomer: function(id){ return ocall("customer_delete", { id: id }); },
    setCustomerBlocked: function(id, blocked){
      return ocallFn("owner_customer_set_blocked", { p_customer_id: id, p_blocked: !!blocked });
    },
    getCustomerBookings: function(phone){
      return ocallFn("owner_customer_bookings", { p_phone: phone });
    },
    lookupCustomer: function(phone){ return ocall("customer_lookup", { phone: phone }); }
  };
})();
