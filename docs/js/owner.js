/* Kashish Beauty Salon — owner (private) panel v3 */
var Owner = (function(){
  "use strict";

  var pin = "", unlocked = false;
  var bkFilter = "upcoming";
  var editingSvcId = null, svcImgFile = null;

  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

  function initPad(){
    el("pinDisplay").innerHTML = "&bull;&bull;&bull;&bull;";
    pin = "";
    var keys = document.querySelectorAll("#pinPad .pin-key");
    keys.forEach(function(k){
      k.onclick = function(){
        var v = k.getAttribute("data-k") || k.textContent.trim();
        if (v === "clear"){ pin = ""; }
        else if (v === "ok"){ tryUnlock(); return; }
        else if (pin.length < 4){ pin += v; }
        el("pinDisplay").textContent = "\u2022".repeat(pin.length) + "\u25CB".repeat(4 - pin.length);
        if (pin.length === 4) setTimeout(tryUnlock, 250);
      };
    });
  }

  function tryUnlock(){
    if (pin.length !== 4) return;
    toast("Checking...");
    DB.ownerLogin(pin).then(function(){
      unlocked = true;
      el("ownerLogin").style.display = "none";
      el("ownerPanel").style.display = "";
      loadAll();
    }).catch(function(e){
      toast(e && e.code === "wrong-pin" ? "Wrong PIN" : "Could not verify — check internet");
      pin = "";
      el("pinDisplay").innerHTML = "&bull;&bull;&bull;&bull;";
    });
  }

  function lock(){
    unlocked = false; pin = "";
    DB.ownerLogout();
    el("ownerPanel").style.display = "none";
    el("ownerLogin").style.display = "";
    initPad();
  }

  /* If the server rejects the owner token (expired), drop back to the PIN pad */
  function guardOwner(promise){
    return promise.catch(function(e){
      if (e && e.code === "bad-token"){
        toast("Session expired — enter PIN again");
        lock();
      }
      throw e;
    });
  }

  /* ---------- tabs ---------- */
  function switchOwnerTab(k){
    var t = document.querySelector('#ownerTabs .otab[data-ot="' + k + '"]');
    if (t) t.click();
  }

  function initTabs(){
    var tabs = document.querySelectorAll("#ownerTabs .otab");
    tabs.forEach(function(t){
      t.onclick = function(){
        tabs.forEach(function(x){ x.classList.remove("active"); });
        t.classList.add("active");
        var k = t.getAttribute("data-ot");
        ["dashboard","bookings","customers","services","offers","deals","beauticians","gallery","resets","payments","settings"].forEach(function(p){
          var pane = el("otPane-" + p);
          if (pane) pane.style.display = (p === k) ? "" : "none";
        });
        if (k === "dashboard") loadDashboard();
        if (k === "bookings") loadBookings();
        if (k === "customers") loadCustomers();
        if (k === "services") loadOwnerServices();
        if (k === "offers") loadOffersMgr();
        if (k === "deals") loadOwnerDeals();
        if (k === "beauticians") loadBeauts();
        if (k === "gallery") loadOwnerGallery();
        if (k === "resets") loadResets();
        if (k === "payments") loadPayments();
        if (k === "settings") loadSettings();
      };
    });
    var fb = document.querySelectorAll(".fbtn");
    fb.forEach(function(b){
      b.onclick = function(){
        fb.forEach(function(x){ x.classList.remove("active"); });
        b.classList.add("active");
        bkFilter = b.getAttribute("data-bf");
        el("ownerDate").value = "";
        loadBookings();
      };
    });
  }

  /* ---------- bookings ---------- */
  function statusPill(s){
    var map = { pending: "status-pending", confirmed: "status-confirmed",
                completed: "status-completed", cancelled: "status-cancelled" };
    return '<span class="bk-status ' + (map[s] || "status-pending") + '">' + esc(s) + '</span>';
  }

  function bookingCard(b, showDate){
    var d = document.createElement("div");
    d.className = "bk-item";
    var payLine = esc(b.payment_method || "cash") + " / " + esc(b.payment_status || "unpaid");
    if (b.payment_tid) payLine += " \u2022 TID " + esc(b.payment_tid);
    d.innerHTML =
      '<div class="bk-head"><strong>' + esc(b.service_name) + '</strong>' + statusPill(b.status) + '</div>' +
      '<div class="bk-meta">' + (showDate ? esc(fmtDate(b.booking_date)) + " \u2022 " : "") +
        esc(fmtSlot(b.time_slot)) + " \u2022 " + rs(b.price) + '<br>' +
        esc(b.customer_name) + ' \u2022 <a href="tel:+' + esc(String(b.customer_phone).replace(/\D/g,"")) + '">' +
        esc(b.customer_phone) + '</a><br>' + payLine + '</div>' +
      '<div class="bk-actions"></div>';
    var acts = d.querySelector(".bk-actions");
    function btn(label, fn){
      var x = document.createElement("button");
      x.className = "mini-btn"; x.textContent = label;
      x.onclick = function(){ fn(b); };
      acts.appendChild(x);
    }
    if (b.status === "pending") btn("Confirm", function(x){ setStatus(x, "confirmed"); });
    if (b.status === "pending" || b.status === "confirmed"){
      btn("Complete", function(x){ setStatus(x, "completed"); });
      btn("Cancel", function(x){ setStatus(x, "cancelled"); });
    }
    var wa = document.createElement("a");
    wa.className = "mini-btn"; wa.target = "_blank";
    wa.textContent = "WhatsApp";
    wa.href = "whatsapp://send?phone=" + String(b.customer_phone).replace(/\D/g,"") +
      "&text=" + encodeURIComponent("Assalam-o-Alaikum " + b.customer_name +
        "! Kashish Beauty Salon: your booking for " + b.service_name +
        " on " + fmtDate(b.booking_date) + " at " + fmtSlot(b.time_slot) +
        " is " + b.status + ".");
    acts.appendChild(wa);
    return d;
  }

  function setStatus(b, st){
    var done = function(){
      toast("Booking " + st);
      loadBookings();
    };
    // v5: loyalty points are awarded once, atomically, when the booking is
    // placed (place_booking) — no separate award here (that double-counted).
    DB.setBookingStatus(b.id, st).then(done).catch(function(){ toast("Failed — check internet"); });
  }

  function loadBookings(){
    var wrap = el("ownerBookings");
    var date = el("ownerDate").value;
    wrap.innerHTML = "<p>Loading...</p>";
    var p, showDate = true;
    if (date){ p = DB.getBookingsByDate(date); showDate = false; }
    else if (bkFilter === "upcoming"){ p = DB.getUpcomingBookings(); }
    else { p = DB.getAllBookings(200); }
    p.then(function(rows){
      wrap.innerHTML = "";
      if (!rows.length){ wrap.innerHTML = '<div class="empty">No bookings.</div>'; return; }
      rows.forEach(function(b){ wrap.appendChild(bookingCard(b, showDate)); });
    }).catch(function(){ wrap.innerHTML = "<p>Could not load. Check internet.</p>"; });
  }

  /* ---------- customers (v4) ---------- */
  var custCache = [];

  function loadCustomers(){
    var wrap = el("ownerCustomers");
    if (!wrap) return;
    wrap.innerHTML = "<p>Loading...</p>";
    DB.getCustomers().then(function(rows){
      custCache = rows || [];
      paintCustomers("");
    }).catch(function(){ wrap.innerHTML = "<p>Could not load. Check internet.</p>"; });
  }

  function paintCustomers(q){
    var wrap = el("ownerCustomers");
    wrap.innerHTML = "";
    q = (q || "").toLowerCase();
    var rows = custCache.filter(function(c){
      return !q || ((c.name || "") + " " + (c.phone || "")).toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length){ wrap.innerHTML = '<div class="empty">No customers found.</div>'; return; }
    rows.forEach(function(c){
      var d = document.createElement("div");
      d.className = "svc";
      d.style.cursor = "pointer";
      d.innerHTML = '<div class="svc-info"><strong>' + esc(c.name || "Guest") +
        (c.is_blocked ? ' <span class="bk-status status-cancelled">BLOCKED</span>' : "") + "</strong>" +
        "<span>" + esc(c.phone || "") + " • " + (c.total_visits || 0) + " visits • " +
        (c.loyalty_points || 0) + " pts</span></div>";
      d.onclick = function(){ showCustomer(c); };
      wrap.appendChild(d);
    });
  }

  function showCustomer(c){
    var blocked = !!c.is_blocked;
    App.openModal(
      '<h3 class="sec-title">' + esc(c.name || "Guest") + "</h3>" +
      '<p class="muted">' + esc(c.phone || "") + (c.whatsapp ? " • WA " + esc(c.whatsapp) : "") + "</p>" +
      '<p class="muted">' + (c.total_visits || 0) + " visits • " + (c.loyalty_points || 0) + " loyalty points" +
      (blocked ? ' • <span class="bk-status status-cancelled">BLOCKED</span>' : "") + "</p>" +
      '<h3 class="sec-title" style="margin-top:12px">Booking History</h3>' +
      '<div id="custHist"><p>Loading...</p></div>' +
      '<button class="btn ' + (blocked ? "btn-gold" : "btn-outline") + ' btn-block" id="custBlock">' +
        (blocked ? "Unblock Customer" : "Block Customer") + "</button>" +
      '<button class="btn btn-outline btn-block" id="custDelete" style="border-color:#c0392b;color:#c0392b">Delete Customer</button>' +
      '<button class="btn btn-outline btn-block" id="custClose">Close</button>'
    );
    document.getElementById("custClose").onclick = App.closeModal;
    document.getElementById("custBlock").onclick = function(){
      var action = blocked ? "unblock" : "block";
      if (!confirm((blocked ? "Unblock " : "Block ") + (c.name || c.phone) +
          (blocked ? "?" : "? They will not be able to login or book."))) return;
      toast((blocked ? "Unblocking..." : "Blocking..."));
      guardOwner(DB.setCustomerBlocked(c.id, !blocked)).then(function(ok){
        if (!ok){ toast("Failed — check internet"); return; }
        c.is_blocked = !blocked;
        toast(blocked ? "Customer unblocked" : "Customer blocked");
        App.closeModal();
        loadCustomers();
      }).catch(function(){ toast("Failed — check internet"); });
    };
    document.getElementById("custDelete").onclick = function(){
      if (!confirm("Permanently DELETE " + (c.name || c.phone) +
          " and their account? Their bookings stay in history.")) return;
      if (!confirm("Are you sure? This cannot be undone.")) return;
      toast("Deleting...");
      guardOwner(DB.deleteCustomer(c.id)).then(function(){
        toast("Customer deleted");
        App.closeModal();
        loadCustomers();
      }).catch(function(){ toast("Failed — check internet"); });
    };
    DB.getCustomerBookings(c.phone || "").then(function(rows){
      var w = document.getElementById("custHist");
      if (!w) return;
      if (!rows || !rows.length){ w.innerHTML = '<div class="empty">No bookings yet.</div>'; return; }
      w.innerHTML = "";
      rows.forEach(function(b){
        var d = document.createElement("div");
        d.className = "bk-item";
        d.innerHTML = '<div class="bk-head"><strong>' + esc(b.service_name) + "</strong>" + statusPill(b.status) + "</div>" +
          '<div class="bk-meta">' + esc(fmtDate(b.booking_date)) + " • " + esc(fmtSlot(b.time_slot)) +
          " • " + rs(b.price) + "</div>";
        w.appendChild(d);
      });
    }).catch(function(){
      var w2 = document.getElementById("custHist");
      if (w2) w2.innerHTML = "<p>Could not load.</p>";
    });
  }

  /* ---------- offers & coupons manager (v4) ---------- */
  var editingOfferId = null, offerImgFile = null;
  var editingCouponId = null;

  function initOfferSubtabs(){
    document.querySelectorAll("[data-osub]").forEach(function(t){
      t.onclick = function(){
        document.querySelectorAll("[data-osub]").forEach(function(x){ x.classList.remove("active"); });
        t.classList.add("active");
        var k = t.getAttribute("data-osub");
        el("osub-offers").style.display = k === "offers" ? "" : "none";
        el("osub-coupons").style.display = k === "coupons" ? "" : "none";
      };
    });
  }

  function loadOffersMgr(){ loadOwnerOffers(); loadOwnerCoupons(); }

  function loadOwnerOffers(){
    var wrap = el("ownerOffers");
    if (!wrap) return;
    wrap.innerHTML = "<p>Loading...</p>";
    DB.getAllOffers().then(function(rows){
      wrap.innerHTML = "";
      if (!rows.length){ wrap.innerHTML = '<div class="empty">No offers yet.</div>'; return; }
      rows.forEach(function(o){
        var d = document.createElement("div");
        d.className = "svc mgr-svc";
        d.innerHTML = '<div class="svc-info"><strong>' + esc(o.title) + "</strong>" +
          "<span>" + esc(o.discount_text || "") +
          (o.valid_till ? " • till " + esc(fmtDate(o.valid_till)) : "") +
          (o.is_active ? "" : ' • <span class="bk-status status-cancelled">off</span>') + "</span></div>" +
          '<div class="bk-actions" style="margin:0"></div>';
        var acts = d.querySelector(".bk-actions");
        mkMini(acts, "Edit", function(){ openOfferForm(o); });
        mkMini(acts, o.is_active ? "Deactivate" : "Activate", function(){
          DB.updateOffer(o.id, { is_active: !o.is_active }).then(function(){
            toast("Offer updated"); loadOwnerOffers();
            if (window.App && App.refreshOffers) App.refreshOffers();
          }).catch(function(){ toast("Failed — check internet"); });
        });
        wrap.appendChild(d);
      });
    }).catch(function(){ wrap.innerHTML = "<p>Could not load. Check internet.</p>"; });
  }

  function openOfferForm(o){
    editingOfferId = o ? o.id : null;
    el("offerFormTitle").textContent = o ? "Edit Offer" : "Add Offer";
    el("offerFTitle").value = o ? o.title : "";
    el("offerFDesc").value = o ? (o.description || "") : "";
    el("offerFDisc").value = o ? (o.discount_text || "") : "";
    el("offerFValid").value = o ? (o.valid_till || "") : "";
    el("offerFTerms").value = o ? (o.terms || "") : "";
    el("offerFImgPrev").src = (o && o.image_url) ? o.image_url : "";
    el("offerFImgPrev").style.display = (o && o.image_url) ? "" : "none";
    el("offerFImg").value = "";
    offerImgFile = null;
    el("offerForm").style.display = "";
    el("offerForm").scrollIntoView();
  }

  function saveOffer(){
    var title = el("offerFTitle").value.trim();
    if (!title){ toast("Enter offer title"); return; }
    toast("Saving...");
    var finish = function(imageUrl){
      var row = {
        title: title,
        description: el("offerFDesc").value.trim(),
        discount_text: el("offerFDisc").value.trim(),
        valid_till: el("offerFValid").value || null,
        terms: el("offerFTerms").value.trim(),
        is_active: true
      };
      if (imageUrl !== undefined) row.image_url = imageUrl;
      var p = editingOfferId ? DB.updateOffer(editingOfferId, row) : DB.addOffer(row);
      p.then(function(){
        toast("Offer saved");
        el("offerForm").style.display = "none";
        loadOwnerOffers();
        if (window.App && App.refreshOffers) App.refreshOffers();
      }).catch(function(){ toast("Failed — check internet"); });
    };
    if (offerImgFile){
      DB.uploadImage(offerImgFile).then(finish).catch(function(){ toast("Image upload failed"); });
    } else {
      finish(editingOfferId ? undefined : "");
    }
  }

  function loadOwnerCoupons(){
    var wrap = el("ownerCoupons");
    if (!wrap) return;
    wrap.innerHTML = "<p>Loading...</p>";
    DB.getAllCoupons().then(function(rows){
      wrap.innerHTML = "";
      if (!rows.length){ wrap.innerHTML = '<div class="empty">No coupons yet.</div>'; return; }
      rows.forEach(function(c){
        var disc = c.discount_percent ? c.discount_percent + "%" : rs(c.discount_rs || 0);
        var d = document.createElement("div");
        d.className = "svc mgr-svc";
        d.innerHTML = '<div class="svc-info"><strong>' + esc(c.code) + "</strong>" +
          "<span>" + esc(String(disc)) + " off" +
          (c.min_amount ? " • min " + rs(c.min_amount) : "") +
          (c.valid_till ? " • till " + esc(fmtDate(c.valid_till)) : "") +
          (c.is_active ? "" : ' • <span class="bk-status status-cancelled">off</span>') + "</span></div>" +
          '<div class="bk-actions" style="margin:0"></div>';
        var acts = d.querySelector(".bk-actions");
        mkMini(acts, "Edit", function(){ openCouponForm(c); });
        mkMini(acts, "Share", function(){
          var discTxt = c.discount_percent ? c.discount_percent + "% off" : rs(c.discount_rs || 0) + " off";
          var msg = "Kashish Beauty Salon ki taraf se khaas discount! Coupon code: " + c.code +
            " — " + discTxt +
            (c.min_amount ? " (minimum order " + rs(c.min_amount) + ")" : "") +
            (c.valid_till ? ", valid till " + fmtDate(c.valid_till) : "") +
            ". App mein booking karte waqt yeh code lagayen!";
          window.location.href = "whatsapp://send?text=" + encodeURIComponent(msg);
        });
        mkMini(acts, c.is_active ? "Deactivate" : "Activate", function(){
          DB.updateCoupon(c.id, { is_active: !c.is_active }).then(function(){
            toast("Coupon updated"); loadOwnerCoupons();
          }).catch(function(){ toast("Failed — check internet"); });
        });
        wrap.appendChild(d);
      });
    }).catch(function(){ wrap.innerHTML = "<p>Could not load. Check internet.</p>"; });
  }

  function openCouponForm(c){
    editingCouponId = c ? c.id : null;
    el("couponFormTitle").textContent = c ? "Edit Coupon" : "Add Coupon";
    el("couponFCode").value = c ? c.code : "";
    el("couponFPct").value = c ? (c.discount_percent || "") : "";
    el("couponFRs").value = c ? (c.discount_rs || "") : "";
    el("couponFMin").value = c ? (c.min_amount || 0) : 0;
    el("couponFValid").value = c ? (c.valid_till || "") : "";
    el("couponForm").style.display = "";
    el("couponForm").scrollIntoView();
  }

  function saveCoupon(){
    var code = el("couponFCode").value.trim().toUpperCase();
    var pct = parseFloat(el("couponFPct").value) || 0;
    var drs = parseInt(el("couponFRs").value, 10) || 0;
    if (!code){ toast("Enter coupon code"); return; }
    if (!(pct > 0) && !(drs > 0)){ toast("Enter discount percent or Rs"); return; }
    toast("Saving...");
    var row = {
      code: code,
      discount_percent: pct > 0 ? pct : null,
      discount_rs: pct > 0 ? null : drs,
      min_amount: parseInt(el("couponFMin").value, 10) || 0,
      valid_till: el("couponFValid").value || null,
      is_active: true
    };
    var p = editingCouponId ? DB.updateCoupon(editingCouponId, row) : DB.addCoupon(row);
    p.then(function(){
      toast("Coupon saved");
      el("couponForm").style.display = "none";
      loadOwnerCoupons();
    }).catch(function(e){
      toast(e && e.status === 409 ? "This code already exists" : "Failed — check internet");
    });
  }

  /* ---------- deals manager (v6.0) ---------- */
  var editingDealId = null, dealImgFile = null;

  function loadOwnerDeals(){
    var wrap = el("ownerDeals");
    if (!wrap) return;
    wrap.innerHTML = "<p>Loading...</p>";
    DB.getAllDeals().then(function(rows){
      wrap.innerHTML = "";
      if (!rows.length){ wrap.innerHTML = '<div class="empty">No deals yet. Add one above.</div>'; return; }
      rows.forEach(function(dl){
        var d = document.createElement("div");
        d.className = "svc mgr-svc";
        d.innerHTML = '<div class="svc-info"><strong>' + esc(dl.name) + "</strong>" +
          "<span>" + rs(dl.price) + " \u2022 " + (dl.duration_min || 120) + " min" +
          (dl.active ? "" : ' \u2022 <span class="bk-status status-cancelled">off</span>') + "</span></div>" +
          '<div class="bk-actions" style="margin:0"></div>';
        var acts = d.querySelector(".bk-actions");
        mkMini(acts, "Edit", function(){ openDealForm(dl); });
        mkMini(acts, "Share", function(){ if (window.shareItem) window.shareItem("deal", dl); });
        mkMini(acts, dl.active ? "Deactivate" : "Activate", function(){
          DB.updateDeal(dl.id, { active: !dl.active }).then(function(){
            toast("Deal updated"); loadOwnerDeals();
            if (window.App && App.refreshDeals) App.refreshDeals();
          }).catch(function(){ toast("Failed — check internet"); });
        });
        wrap.appendChild(d);
      });
    }).catch(function(){ wrap.innerHTML = "<p>Could not load. Check internet.</p>"; });
  }

  function openDealForm(dl){
    editingDealId = dl ? dl.id : null;
    el("dealFormTitle").textContent = dl ? "Edit Deal" : "Add Deal";
    el("dealFName").value = dl ? dl.name : "";
    el("dealFPrice").value = dl ? dl.price : "";
    el("dealFDur").value = dl ? (dl.duration_min || 120) : 120;
    el("dealFDesc").value = dl ? (dl.description || "") : "";
    el("dealFImgPrev").src = (dl && dl.image_url) ? dl.image_url : "";
    el("dealFImgPrev").style.display = (dl && dl.image_url) ? "" : "none";
    el("dealFImg").value = "";
    dealImgFile = null;
    el("dealForm").style.display = "";
    el("dealForm").scrollIntoView();
  }

  function saveDeal(){
    var name = el("dealFName").value.trim();
    var price = parseInt(el("dealFPrice").value, 10);
    if (!name){ toast("Deal ka naam likhein"); return; }
    if (!(price >= 0)){ toast("Price likhein"); return; }
    toast("Saving...");
    var finish = function(imageUrl){
      var row = {
        name: name,
        description: el("dealFDesc").value.trim(),
        price: price,
        duration_min: parseInt(el("dealFDur").value, 10) || 120,
        active: true
      };
      if (imageUrl !== undefined) row.image_url = imageUrl;
      var p = editingDealId ? DB.updateDeal(editingDealId, row) : DB.addDeal(row);
      p.then(function(){
        toast("Deal saved");
        el("dealForm").style.display = "none";
        loadOwnerDeals();
        if (window.App && App.refreshDeals) App.refreshDeals();
      }).catch(function(){ toast("Failed — check internet"); });
    };
    if (dealImgFile){
      DB.uploadImage(dealImgFile).then(finish).catch(function(){ toast("Image upload failed"); });
    } else {
      finish(editingDealId ? undefined : "");
    }
  }

  /* ---------- beauticians manager (v4) ---------- */
  var editingBeautId = null;

  function loadBeauts(){
    var wrap = el("ownerBeauts");
    if (!wrap) return;
    wrap.innerHTML = "<p>Loading...</p>";
    Promise.all([DB.getAllBeauticians(), DB.getBeauticianStats()]).then(function(res){
      /* v6.3: owner list bhi rank ki tartib mein — #1 sab se upar,
         har beautician ke saath uski total bookings */
      var rows = DB.rankBeauticians(res[0] || [], res[1] || []);
      /* v6.3: Weekly Ranking board — pichhle 7 din ki bookings par tartib.
         Is week 0 booking wali bhi dikhe gi (owner ko pata chale kis ne
         is week kaam nahi kiya) */
      var wb = el("weekBoard");
      if (wb){
        var wk = rows.slice().sort(function(a, b){
          if (b.bk_week !== a.bk_week) return b.bk_week - a.bk_week;
          if (b.bk_week_done !== a.bk_week_done) return b.bk_week_done - a.bk_week_done;
          return a.rank - b.rank;
        });
        if (!wk.length) wb.innerHTML = "<p>No beauticians yet.</p>";
        else {
          wb.innerHTML = "";
          wk.forEach(function(b, i){
            var r = document.createElement("div");
            r.className = "week-row" + (i === 0 && b.bk_week > 0 ? " top1" : "");
            r.innerHTML =
              '<span class="wk-rank">#' + (i + 1) + (i === 0 && b.bk_week > 0 ? " \uD83E\uDD47" : "") + "</span>" +
              '<span class="wk-name">' + esc(b.name) +
              "<small>" + esc(b.specialty || "") + " \u00B7 all-time rank #" + b.rank + "</small></span>" +
              '<span class="wk-count">' + b.bk_week +
              (b.bk_week === 1 ? " booking" : " bookings") +
              "<small>" + b.bk_week_done + " completed</small></span>";
            wb.appendChild(r);
          });
        }
      }
      wrap.innerHTML = "";
      if (!rows.length){ wrap.innerHTML = '<div class="empty">No beauticians yet. Add one above.</div>'; return; }
      rows.forEach(function(b){
        var d = document.createElement("div");
        d.className = "svc mgr-svc";
        d.innerHTML = '<div class="svc-info"><strong>' +
          (b.rank === 1 ? "\uD83C\uDFC6 " : "") + esc(b.name) + "</strong>" +
          "<span>" + esc(b.specialty || "") + (b.phone ? " • " + esc(b.phone) : "") +
          " • Rank #" + b.rank + " • " + b.bk_total +
          (b.bk_total === 1 ? " booking" : " bookings") +
          (b.bk_done ? " (" + b.bk_done + " completed)" : "") +
          (b.is_active ? "" : ' • <span class="bk-status status-cancelled">off</span>') + "</span></div>" +
          '<div class="bk-actions" style="margin:0"></div>';
        var acts = d.querySelector(".bk-actions");
        mkMini(acts, "Edit", function(){ openBeautForm(b); });
        mkMini(acts, b.is_active ? "Deactivate" : "Activate", function(){
          DB.updateBeautician(b.id, { is_active: !b.is_active }).then(function(){
            toast("Updated"); loadBeauts();
          }).catch(function(){ toast("Failed — check internet"); });
        });
        wrap.appendChild(d);
      });
    }).catch(function(){ wrap.innerHTML = "<p>Could not load. Check internet.</p>"; });
  }

  function openBeautForm(b){
    editingBeautId = b ? b.id : null;
    el("beautFormTitle").textContent = b ? "Edit Beautician" : "Add Beautician";
    el("beautFName").value = b ? b.name : "";
    el("beautFSpec").value = b ? (b.specialty || "") : "";
    el("beautFPhone").value = b ? (b.phone || "") : "";
    el("beautForm").style.display = "";
    el("beautForm").scrollIntoView();
  }

  function saveBeaut(){
    var name = el("beautFName").value.trim();
    if (!name){ toast("Enter name"); return; }
    var row = {
      name: name,
      specialty: el("beautFSpec").value.trim(),
      phone: normPhone(el("beautFPhone").value) || el("beautFPhone").value.trim(),
      is_active: true
    };
    toast("Saving...");
    var p = editingBeautId ? DB.updateBeautician(editingBeautId, row) : DB.addBeautician(row);
    p.then(function(){
      toast("Saved");
      el("beautForm").style.display = "none";
      loadBeauts();
    }).catch(function(){ toast("Failed — check internet"); });
  }

  /* ---------- services manager ---------- */
  function loadOwnerServices(){
    var wrap = el("ownerServices");
    wrap.innerHTML = "<p>Loading...</p>";
    DB.getServices().then(function(rows){
      wrap.innerHTML = "";
      if (!rows.length){ wrap.innerHTML = '<div class="empty">No services yet. Add one above.</div>'; return; }
      var byCat = {};
      rows.forEach(function(s){
        (byCat[s.category || "general"] = byCat[s.category || "general"] || []).push(s);
      });
      Object.keys(byCat).forEach(function(cat){
        var h = document.createElement("h3");
        h.className = "svc-cat"; h.textContent = catName(cat);
        wrap.appendChild(h);
        byCat[cat].forEach(function(s){
          var d = document.createElement("div");
          d.className = "svc mgr-svc";
          d.innerHTML =
            '<div class="svc-info"><strong>' + esc(s.name) + '</strong>' +
            '<span>' + rs(s.price) + ' \u2022 ' + (s.duration_min || 30) + ' min</span></div>' +
            '<div class="bk-actions" style="margin:0"></div>';
          var acts = d.querySelector(".bk-actions");
          var eb = document.createElement("button");
          eb.className = "mini-btn"; eb.textContent = "Edit";
          eb.onclick = function(){ openSvcForm(s); };
          var fb2 = document.createElement("button");
          fb2.className = "mini-btn"; fb2.textContent = s.is_featured ? "Unfeature" : "Feature";
          fb2.onclick = (function(svc){
            return function(){
              DB.updateService(svc.id, { is_featured: !svc.is_featured }).then(function(){
                toast(svc.is_featured ? "Removed from Featured" : "Added to Featured");
                loadOwnerServices(); App.refreshServices();
              }).catch(function(){ toast("Failed"); });
            };
          })(s);
          var db = document.createElement("button");
          db.className = "mini-btn"; db.textContent = "Delete";
          db.onclick = function(){
            if (confirm("Delete '" + s.name + "'?")) {
              DB.deleteService(s.id).then(function(){ toast("Deleted"); loadOwnerServices(); App.refreshServices(); })
                .catch(function(){ toast("Failed"); });
            }
          };
          var shb = document.createElement("button");
          shb.className = "mini-btn"; shb.textContent = "Share";
          shb.onclick = function(){ if (window.shareItem) window.shareItem("service", s); };
          acts.appendChild(eb); acts.appendChild(fb2); acts.appendChild(shb); acts.appendChild(db);
          wrap.appendChild(d);
        });
      });
    }).catch(function(){ wrap.innerHTML = "<p>Could not load. Check internet.</p>"; });
  }

  function catName(id){
    var c = (typeof CATEGORIES !== "undefined" ? CATEGORIES : []).filter(function(x){ return x.id === id; })[0];
    return c ? c.name : id;
  }

  function openSvcForm(s){
    editingSvcId = s ? s.id : null;
    el("svcFormTitle").textContent = s ? "Edit Service" : "Add Service";
    el("svcFName").value = s ? s.name : "";
    el("svcFPrice").value = s ? s.price : "";
    el("svcFDisc").value = s ? (s.discount_percent || 0) : 0;
    el("svcFDur").value = s ? (s.duration_min || 30) : 30;
    el("svcFDesc").value = s ? (s.description || "") : "";
    el("svcFImgPrev").src = (s && s.image_url) ? s.image_url : "";
    el("svcFImgPrev").style.display = (s && s.image_url) ? "" : "none";
    el("svcFImg").value = "";
    svcImgFile = null;
    var sel = el("svcFCat");
    sel.innerHTML = "";
    (typeof CATEGORIES !== "undefined" ? CATEGORIES : [{id:"general",name:"General"}]).forEach(function(c){
      var o = document.createElement("option");
      o.value = c.id; o.textContent = c.name;
      if (s && s.category === c.id) o.selected = true;
      sel.appendChild(o);
    });
    var sib = el("svcImgsBox");
    if (sib){
      if (s && s.id){ sib.style.display = ""; loadSvcImgs(s.id); }
      else { sib.style.display = "none"; }
    }
    el("svcForm").style.display = "";
    el("svcForm").scrollIntoView();
  }

  /* ---------- service extra pictures (v6.0) ---------- */
  function loadSvcImgs(serviceId){
    var grid = el("svcImgsGrid");
    if (!grid) return;
    grid.innerHTML = "<p>Loading...</p>";
    DB.getServiceImages(serviceId).then(function(rows){
      grid.innerHTML = "";
      if (!rows.length){ grid.innerHTML = '<div class="empty">Abhi koi extra picture nahi.</div>'; return; }
      rows.forEach(function(im){
        var d = document.createElement("div");
        d.className = "gal-item";
        d.innerHTML = '<img src="' + esc(im.image_url) + '" alt="">' +
          '<button class="gal-del" title="Delete">\u00D7</button>';
        d.querySelector(".gal-del").onclick = function(){
          if (confirm("Delete this picture?")){
            DB.deleteServiceImage(im.id).then(function(){ toast("Deleted"); loadSvcImgs(serviceId); })
              .catch(function(){ toast("Failed"); });
          }
        };
        grid.appendChild(d);
      });
    }).catch(function(){ grid.innerHTML = "<p>Could not load.</p>"; });
  }
  function uploadSvcImgs(){
    if (!editingSvcId){ toast("Pehle service save karein"); return; }
    var files = Array.prototype.slice.call(el("svcImgsFile").files || []);
    if (!files.length){ toast("Pehle pictures select karein"); return; }
    var btn = el("svcImgsAddBtn");
    var i = 0, okCount = 0;
    btn.disabled = true;
    function next(){
      if (i >= files.length){
        btn.disabled = false;
        btn.textContent = "Add Selected Pictures";
        el("svcImgsFile").value = "";
        toast(okCount + " pictures added");
        loadSvcImgs(editingSvcId);
        return;
      }
      var f = files[i]; i++;
      btn.textContent = "Adding " + i + " / " + files.length + "...";
      DB.uploadImage(f).then(function(url){
        return DB.addServiceImage(editingSvcId, url);
      }).then(function(){ okCount++; next(); })
      .catch(function(){ next(); });
    }
    next();
  }

  function saveService(){
    var name = el("svcFName").value.trim();
    var price = parseInt(el("svcFPrice").value, 10);
    if (!name){ toast("Enter service name"); return; }
    if (!(price >= 0)){ toast("Enter price"); return; }
    toast("Saving...");
    var finish = function(imageUrl){
      var row = {
        name: name,
        description: el("svcFDesc").value.trim(),
        price: price,
        discount_percent: Math.min(90, Math.max(0, parseInt(el("svcFDisc").value, 10) || 0)),
        duration_min: parseInt(el("svcFDur").value, 10) || 30,
        category: el("svcFCat").value,
        active: true
      };
      if (imageUrl !== undefined) row.image_url = imageUrl;
      var p = editingSvcId ? DB.updateService(editingSvcId, row) : DB.addService(row);
      p.then(function(){
        toast("Service saved");
        el("svcForm").style.display = "none";
        loadOwnerServices();
        App.refreshServices();
      }).catch(function(){ toast("Failed — check internet"); });
    };
    if (svcImgFile){
      DB.uploadImage(svcImgFile).then(finish).catch(function(){ toast("Image upload failed"); });
    } else {
      finish(editingSvcId ? undefined : "");
    }
  }

  /* ---------- gallery manager (v6.0: folders + multi upload + videos) ---------- */
  var galCats = [];
  function galCatName(id){
    var c = galCats.filter(function(x){ return String(x.id) === String(id); })[0];
    return c ? c.name : "No folder";
  }
  function paintGalCatSel(){
    /* v6.1: Pictures aur Videos dono sections ke folder selects ek saath
       bhare jate hain (folders dono mein shared hain) */
    ["galCatSelImg", "galCatSelVid"].forEach(function(sid){
      var sel = el(sid);
      if (!sel) return;
      var cur = sel.value;
      sel.innerHTML = "";
      var o0 = document.createElement("option");
      o0.value = ""; o0.textContent = "No folder (sab ke saath)";
      sel.appendChild(o0);
      galCats.forEach(function(c){
        var o = document.createElement("option");
        o.value = c.id; o.textContent = c.name;
        sel.appendChild(o);
      });
      if (cur) sel.value = cur;
    });
  }
  function loadGalCats(){
    return DB.getGalleryCategories().then(function(rows){
      galCats = rows || [];
      paintGalCatSel();
      return galCats;
    });
  }
  function loadOwnerGallery(){
    var wrap = el("ownerGallery");
    wrap.innerHTML = "<p>Loading...</p>";
    loadGalCats().then(function(){ return DB.getGallery(); }).then(function(rows){
      wrap.innerHTML = "";
      if (!rows.length){ wrap.innerHTML = '<div class="empty">No pictures yet. Upload above.</div>'; return; }
      var groups = {}, order = [];
      rows.forEach(function(g){
        var k = g.category_id || "";
        if (!groups[k]){ groups[k] = []; order.push(k); }
        groups[k].push(g);
      });
      order.forEach(function(k){
        var h = document.createElement("h3");
        h.className = "svc-cat"; h.textContent = k ? galCatName(k) : "No folder";
        wrap.appendChild(h);
        var grid = document.createElement("div");
        grid.className = "gal-grid";
        groups[k].forEach(function(g){ grid.appendChild(ownerGalItem(g)); });
        wrap.appendChild(grid);
      });
    }).catch(function(){ wrap.innerHTML = "<p>Could not load. Check internet.</p>"; });
  }
  function ownerGalItem(g){
    var d = document.createElement("div");
    d.className = "gal-item";
    var media = g.media_type === "video"
      ? '<video src="' + esc(g.image_url) + '" muted preload="metadata" playsinline></video><span class="gal-vid-badge">&#9654;</span>'
      : '<img src="' + esc(g.image_url) + '" alt="">';
    d.innerHTML = media + '<button class="gal-del" title="Delete">\u00D7</button>';
    d.querySelector(".gal-del").onclick = function(){
      if (confirm("Delete this " + (g.media_type === "video" ? "video" : "picture") + "?")){
        DB.deleteGalleryItem(g.id).then(function(){ toast("Deleted"); loadOwnerGallery(); App.refreshGallery(); })
          .catch(function(){ toast("Failed"); });
      }
    };
    var sel = document.createElement("select");
    sel.className = "gal-cat-sel";
    sel.title = "Folder";
    var o0 = document.createElement("option");
    o0.value = ""; o0.textContent = "No folder";
    sel.appendChild(o0);
    galCats.forEach(function(c){
      var o = document.createElement("option");
      o.value = c.id; o.textContent = c.name;
      if (String(g.category_id || "") === String(c.id)) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function(){
      DB.setGalleryItemCategory(g.id, sel.value).then(function(){
        toast("Folder updated"); loadOwnerGallery(); App.refreshGallery();
      }).catch(function(){ toast("Failed"); });
    };
    d.appendChild(sel);
    return d;
  }
  function addGalleryCategory(suffix){
    var inp = el("galNewCat" + suffix);
    var name = inp.value.trim();
    if (name.length < 2){ toast("Folder ka naam likhein"); return; }
    toast("Creating folder...");
    guardOwner(DB.addGalleryCategory(name)).then(function(){
      inp.value = "";
      toast("Folder ban gaya");
      loadGalCats();
    }).catch(function(){ toast("Failed — check internet"); });
  }
  function deleteGalleryCategory(suffix){
    var id = el("galCatSel" + suffix).value;
    if (!id){ toast("Pehle Folder list se folder select karein"); return; }
    if (!confirm("Folder '" + galCatName(id) + "' delete karein? Uski pictures/videos delete NAHI hongi — woh 'No folder' mein chali jayengi.")) return;
    toast("Deleting...");
    guardOwner(DB.deleteGalleryCategory(id)).then(function(){
      toast("Folder deleted");
      loadOwnerGallery();
      App.refreshGallery();
    }).catch(function(){ toast("Failed — check internet"); });
  }
  /* v6.1: Pictures aur Videos ke ALAG upload sections (suffix Img / Vid).
     Save (gallery row) fail ho jaye to ek dafa khud dobara koshish hoti hai,
     taake slow internet par uploaded file zaya na ho. */
  function uploadGallery(kind){
    var suffix = kind === "video" ? "Vid" : "Img";
    var fileEl = el("galFile" + suffix);
    var files = Array.prototype.slice.call(fileEl.files || []);
    if (!files.length){ toast(kind === "video" ? "Pehle videos select karein" : "Pehle pictures select karein"); return; }
    var catId = el("galCatSel" + suffix).value || "";
    var cap = el("galCap" + suffix).value.trim();
    var btn = el("galUploadBtn" + suffix);
    var btnText = btn.textContent;
    var i = 0, okCount = 0, failCount = 0;
    btn.disabled = true;
    function addWithRetry(url, isVid){
      return DB.addGalleryItem(url, cap, catId, isVid ? "video" : "image")
        .catch(function(){
          return new Promise(function(res){ setTimeout(res, 1800); }).then(function(){
            return DB.addGalleryItem(url, cap, catId, isVid ? "video" : "image");
          });
        });
    }
    function next(){
      if (i >= files.length){
        btn.disabled = false;
        btn.textContent = btnText;
        fileEl.value = ""; el("galCap" + suffix).value = "";
        toast(okCount + " uploaded" + (failCount ? ", " + failCount + " failed — dobara try karein" : ""));
        loadOwnerGallery();
        App.refreshGallery();
        return;
      }
      var f = files[i]; i++;
      btn.textContent = "Uploading " + i + " / " + files.length + "...";
      var isVid = kind === "video";
      var up = isVid ? DB.uploadVideo(f) : DB.uploadImage(f);
      up.then(function(url){
        return addWithRetry(url, isVid);
      }).then(function(){ okCount++; next(); })
      .catch(function(e){
        failCount++;
        if (e && e.code === "too-big") toast("Ek video 50MB se bari thi — woh skip ho gayi");
        if (e && e.code === "blank-frame") toast("Ek picture parhi nahi ja saki — dusri picture try karein");
        next();
      });
    }
    next();
  }

  /* ---------- password reset requests (v3.1) ---------- */
  function loadResets(){
    var wrap = el("ownerResets");
    wrap.innerHTML = "<p>Loading...</p>";
    DB.getPendingResets().then(function(rows){
      wrap.innerHTML = "";
      if (!rows.length){ wrap.innerHTML = '<div class="empty">No reset requests.</div>'; return; }
      // attach customer names
      var phones = {};
      rows.forEach(function(r){ phones[r.phone] = true; });
      var nameP = Promise.all(Object.keys(phones).map(function(ph){
        return DB.lookupCustomer(ph).then(function(c){ return { phone: ph, name: c ? c.name : ph }; });
      }));
      nameP.then(function(pairs){
        var names = {};
        pairs.forEach(function(p){ names[p.phone] = p.name; });
        rows.forEach(function(r){
          var d = document.createElement("div");
          d.className = "bk-item";
          d.innerHTML =
            '<div class="bk-head"><strong>' + esc(names[r.phone] || r.phone) + '</strong>' +
            '<span class="bk-status status-pending">reset</span></div>' +
            '<div class="bk-meta">' + esc(r.phone) + '<br>Code: <strong style="font-size:1.2rem;letter-spacing:4px">' +
            esc(r.otp) + '</strong><br><span class="muted">Expires: ' +
            new Date(r.expires_at).toLocaleString() + '</span></div>' +
            '<div class="bk-actions"></div>';
          var acts = d.querySelector(".bk-actions");
          var send = document.createElement("a");
          send.className = "mini-btn"; send.target = "_blank"; send.textContent = "Send Code via WhatsApp";
          send.href = "whatsapp://send?phone=" + String(r.phone).replace(/\D/g,"") +
            "&text=" + encodeURIComponent("Assalam-o-Alaikum! Your Kashish Beauty Salon password reset code is: " +
              r.otp + " (valid 15 minutes).");
          var done = document.createElement("button");
          done.className = "mini-btn"; done.textContent = "Dismiss";
          done.onclick = (function(id){
            return function(){
              DB.markResetSent(id).then(function(){ loadResets(); });
            };
          })(r.id);
          acts.appendChild(send); acts.appendChild(done);
          wrap.appendChild(d);
        });
      });
    }).catch(function(){ wrap.innerHTML = "<p>Could not load. Check internet.</p>"; });
  }

  /* ---------- payments ---------- */
  function loadPayments(){
    var wrap = el("ownerPayments");
    wrap.innerHTML = "<p>Loading...</p>";
    DB.getPendingPayments().then(function(rows){
      wrap.innerHTML = "";
      if (!rows.length){
        wrap.innerHTML = '<div class="empty">No payment proofs waiting.</div>';
        return;
      }
      rows.forEach(function(b){
        var card = bookingCard(b, true);
        var acts = card.querySelector(".bk-actions");
        var ok = document.createElement("button");
        ok.className = "mini-btn"; ok.textContent = "Verify payment";
        ok.onclick = function(){
          DB.setPaymentStatus(b.id, "verified").then(function(){
            toast("Payment verified"); loadPayments();
          }).catch(function(){ toast("Failed"); });
        };
        var no = document.createElement("button");
        no.className = "mini-btn"; no.textContent = "Reject";
        no.onclick = function(){
          DB.setPaymentStatus(b.id, "rejected").then(function(){
            toast("Payment rejected"); loadPayments();
          }).catch(function(){ toast("Failed"); });
        };
        acts.appendChild(ok); acts.appendChild(no);
        wrap.appendChild(card);
      });
    }).catch(function(){ wrap.innerHTML = "<p>Could not load. Check internet.</p>"; });
  }

  /* ---------- settings ---------- */
  function loadSettings(){
    DB.getLoyaltyConfig().then(function(c){
      el("setPp100").value = c.points_per_100rs;
      el("setRedeemPts").value = c.redeem_points;
      el("setRedeemRs").value = c.redeem_value_rs;
      el("setMinPts").value = c.min_redeem_points;
    }).catch(function(){});
    var acc = {};
    try { acc = JSON.parse(localStorage.getItem(CFG.PAY_ACCOUNTS_KEY) || "{}"); } catch(e){}
    var d = CFG.DEFAULT_PAY_ACCOUNTS || {};
    function one(k, tId, nId){
      var dd = d[k] || {}, sv = acc[k] || {};
      if (typeof sv === "string") sv = { number: sv };
      el(tId).value = sv.title || dd.title || "";
      el(nId).value = sv.number || dd.number || "";
    }
    one("easypaisa", "setEpT", "setEp");
    one("jazzcash", "setJcT", "setJc");
    one("bank", "setBankT", "setBank");
    DB.getSetting("instagram_url").then(function(v){
      el("setInsta").value = v || CFG.DEFAULT_INSTAGRAM || "";
    }).catch(function(){ el("setInsta").value = CFG.DEFAULT_INSTAGRAM || ""; });
    DB.getSetting("latest_version").then(function(v){ if (v) el("setVerName").value = v; }).catch(function(){});
    DB.getSetting("latest_version_code").then(function(v){ if (v) el("setVerCode").value = v; }).catch(function(){});
    DB.getSetting("latest_apk_url").then(function(v){ if (v) el("setApkUrl").value = v; }).catch(function(){});
    refreshRecoveryBox();
  }

  function saveUpdateNotice(){
    var ver = el("setVerName").value.trim();
    var code = parseInt(el("setVerCode").value, 10);
    var url = el("setApkUrl").value.trim();
    if (!ver || !(code > 0) || !url){ toast("Fill version name, code and APK link"); return; }
    toast("Publishing...");
    Promise.all([
      DB.setSetting("latest_version", ver),
      DB.setSetting("latest_version_code", String(code)),
      DB.setSetting("latest_apk_url", url)
    ]).then(function(){
      toast("Update notice published — all users will see it");
    }).catch(function(){ toast("Failed — check internet"); });
  }

  /* Send a test push notification to all app users (via Edge Function) */
  function sendTestPush(){
    if (!confirm("Send a TEST notification to ALL app users now?")) return;
    toast("Sending test notification...");
    fetch(CFG.SUPABASE_URL + "/functions/v1/send-push?secret=" + encodeURIComponent(CFG.PUSH_SECRET || ""), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "test" })
    }).then(function(r){ return r.json(); }).then(function(j){
      if (j && j.ok) toast("Test sent to " + (j.sent || 0) + " device(s)");
      else toast("Send failed — try again");
    }).catch(function(){ toast("Send failed — check internet"); });
  }

  function saveLoyalty(){    var cfg = {
      points_per_100rs: parseInt(el("setPp100").value, 10) || 1,
      redeem_points: parseInt(el("setRedeemPts").value, 10) || 100,
      redeem_value_rs: parseInt(el("setRedeemRs").value, 10) || 100,
      min_redeem_points: parseInt(el("setMinPts").value, 10) || 100
    };
    DB.saveLoyaltyConfig(cfg).then(function(){
      toast("Loyalty settings saved");
    }).catch(function(){ toast("Failed — check internet"); });
  }

  function savePayAccounts(){
    var acc = {
      easypaisa: { title: el("setEpT").value.trim(), number: el("setEp").value.trim() },
      jazzcash: { title: el("setJcT").value.trim(), number: el("setJc").value.trim() },
      bank: { title: el("setBankT").value.trim(), number: el("setBank").value.trim() }
    };
    try{ localStorage.setItem(CFG.PAY_ACCOUNTS_KEY, JSON.stringify(acc)); }catch(e){}
    DB.setSetting("pay_accounts", JSON.stringify(acc)).then(function(){
      toast("Payment accounts saved");
    });
  }

  function saveInstagram(){
    var v = el("setInsta").value.trim();
    if (!v){ toast("Enter the Instagram link"); return; }
    DB.setSetting("instagram_url", v).then(function(){
      toast("Instagram link saved");
      if (window.App && App.applyInstagram) App.applyInstagram(v);
    }).catch(function(){ toast("Failed — check internet"); });
  }

  function changePin(){
    var v = el("setPin").value.trim();
    if (!/^\d{4}$/.test(v)){ toast("PIN must be 4 digits"); return; }
    var cur = prompt("Enter your CURRENT PIN to confirm:");
    if (cur === null) return;
    if (!/^\d{4}$/.test(cur)){ toast("Current PIN must be 4 digits"); return; }
    toast("Saving PIN...");
    DB.changePin(cur, v).then(function(){
      el("setPin").value = "";
      toast("PIN changed — other devices logged out");
    }).catch(function(e){
      toast(e && e.code === "wrong-pin" ? "Current PIN is wrong" : "Failed — check internet");
    });
  }

  /* ---------- PIN recovery via one-time recovery code ---------- */
  function openRecovery(){
    var html =
      '<h3 class="sec-title">Forgot Owner PIN?</h3>' +
      '<p class="muted" style="margin-bottom:10px">Enter your 8-character recovery code ' +
      '(the one you saved from Owner → Settings). It will set a new PIN and issue a fresh code.</p>' +
      '<div class="form-group"><label>Recovery code</label>' +
      '<input type="text" id="rcCode" placeholder="e.g. X7K2M9PQ" style="text-transform:uppercase;letter-spacing:2px" maxlength="8"></div>' +
      '<div class="form-group"><label>New 4-digit PIN</label>' +
      '<input type="password" id="rcPin" maxlength="4" inputmode="numeric" placeholder="••••"></div>' +
      '<button class="btn btn-gold btn-block" id="rcGo">Reset PIN</button>' +
      '<button class="btn btn-outline btn-block" id="rcCancel">Cancel</button>';
    App.openModal(html);
    document.getElementById("rcCancel").onclick = function(){ App.closeModal(); };
    document.getElementById("rcGo").onclick = function(){
      var code = document.getElementById("rcCode").value.trim().toUpperCase();
      var np = document.getElementById("rcPin").value.trim();
      if (code.length !== 8){ toast("Enter the 8-character code"); return; }
      if (!/^\d{4}$/.test(np)){ toast("New PIN must be 4 digits"); return; }
      toast("Resetting PIN...");
      DB.recoveryReset(code, np).then(function(newCode){
        App.openModal(
          '<h3 class="sec-title">PIN Reset Done!</h3>' +
          '<p class="muted" style="margin-bottom:10px">Your new PIN is set. ' +
          '<strong>Write down your NEW recovery code now</strong> — the old one will not work again:</p>' +
          '<p style="font-size:1.6rem;letter-spacing:6px;text-align:center;font-weight:700;color:var(--primary)">' +
          esc(newCode) + '</p>' +
          '<button class="btn btn-gold btn-block" id="rcOk" style="margin-top:14px">I Saved It</button>');
        document.getElementById("rcOk").onclick = function(){ App.closeModal(); };
      }).catch(function(){
        toast("Wrong code — check and try again");
      });
    };
  }

  function refreshRecoveryBox(){
    var box = el("recoveryBox");
    if (!box) return;
    box.innerHTML = '<p class="muted">Checking...</p>';
    DB.recoveryStatus().then(function(has){
      box.innerHTML = has
        ? '<p><span class="bk-status status-confirmed">Active</span> <span class="muted">A recovery code is saved. Keep it somewhere safe.</span></p>'
        : '<p><span class="bk-status status-cancelled">Not set</span> <span class="muted">Generate one now — you will need it if you forget your PIN.</span></p>';
    }).catch(function(){
      box.innerHTML = '<p class="muted">Could not check — try again.</p>';
    });
  }

  function generateRecoveryCode(showFirstTime){
    toast("Generating...");
    DB.recoveryIssue().then(function(code){
      refreshRecoveryBox();
      App.openModal(
        '<h3 class="sec-title">Your Recovery Code</h3>' +
        '<p class="muted" style="margin-bottom:10px">' +
        (showFirstTime
          ? 'Save this code <strong>right now</strong> — with it you can reset your owner PIN any time, even if you forget it:'
          : 'Write this down <strong>right now</strong> — it is shown only once. The previous code no longer works:') +
        '</p>' +
        '<p style="font-size:1.8rem;letter-spacing:6px;text-align:center;font-weight:700;color:var(--primary)">' +
        esc(code) + '</p>' +
        '<button class="btn btn-gold btn-block" id="rcSavedOk" style="margin-top:14px">I Saved It</button>');
      document.getElementById("rcSavedOk").onclick = function(){ App.closeModal(); };
    }).catch(function(){ toast("Failed — check internet"); });
  }

  /* after a fresh unlock: make sure a recovery code exists */
  function ensureRecoveryCode(){
    DB.recoveryStatus().then(function(has){
      if (!has) generateRecoveryCode(true);
    }).catch(function(){});
  }

  function loadAll(){
    el("ownerDate").value = "";
    bkFilter = "upcoming";
    var fb = document.querySelectorAll(".fbtn");
    fb.forEach(function(x){ x.classList.toggle("active", x.getAttribute("data-bf") === "upcoming"); });
    switchOwnerTab("dashboard");
  }

  /* ---------- dashboard (v4): stats, alerts, quick actions ---------- */
  function loadDashboard(){
    var today = new Date().toISOString().slice(0, 10);
    Promise.all([DB.getBookingsByDate(today), DB.getUpcomingBookings()]).then(function(r){
      var todays = r[0] || [], upcoming = r[1] || [];
      var live = todays.filter(function(b){ return b.status !== "cancelled"; });
      el("dashToday").textContent = live.length;
      var rev = live.reduce(function(a, b){ return a + (Number(b.price) || 0); }, 0);
      el("dashRevenue").textContent = rs(rev);
      el("dashPending").textContent = todays.filter(function(b){ return b.status === "pending"; }).length;
      el("dashUpcoming").textContent = upcoming.length;
      // overlap alert: same beautician + date + slot booked twice today
      var seen = {}, dups = 0;
      live.forEach(function(b){
        var key = (b.beautician_id || "any") + "|" + b.time_slot;
        if (seen[key]) dups++;
        else seen[key] = true;
      });
      var al = el("dashAlerts");
      if (dups){
        al.style.display = "";
        al.textContent = "Warning: " + dups + " overlapping booking(s) detected today — check the Bookings tab.";
      } else {
        al.style.display = "none";
      }
    }).catch(function(){ /* stats stay at 0 */ });
  }

  function mkMini(parent, label, fn){
    var b = document.createElement("button");
    b.className = "mini-btn"; b.textContent = label;
    b.onclick = fn;
    parent.appendChild(b);
    return b;
  }

  /* preview the CONVERTED image (a raw HEIC preview shows as a broken icon) */
  function previewInto(imgEl, file){
    if (!imgEl) return;
    if (!file){ imgEl.style.display = "none"; return; }
    DB.imagePreviewUrl(file).then(function(u){
      imgEl.src = u; imgEl.style.display = "";
    }).catch(function(){
      var r = new FileReader();
      r.onload = function(){ imgEl.src = r.result; imgEl.style.display = ""; };
      r.readAsDataURL(file);
    });
  }

  /* ---------- walk-in booking (v5.9: custom service name + manual price) ---------- */
  function initWalkin(){
    // Service is now a free-text input (owner types custom name) — no dropdown to populate.
    // Price is a manual number input (owner sets price for bargaining).
    var bs = el("wiBeaut"); bs.innerHTML = "";
    var any = document.createElement("option");
    any.value = ""; any.textContent = "Any Available";
    bs.appendChild(any);
    Promise.all([DB.getBeauticians(), DB.getBeauticianStats()]).then(function(res){
      /* v6.3: walk-in dropdown bhi rank ki tartib mein (#1 pehle) */
      DB.rankBeauticians(res[0] || [], res[1] || []).forEach(function(b){
        var o = document.createElement("option");
        o.value = b.id;
        o.textContent = "#" + b.rank + " " + b.name + (b.specialty ? " (" + b.specialty + ")" : "");
        bs.appendChild(o);
      });
    }).catch(function(){});
    var d = el("wiDate");
    var today = new Date(), max = new Date();
    max.setDate(max.getDate() + 14);
    d.min = today.toISOString().slice(0, 10);
    d.max = max.toISOString().slice(0, 10);
    d.value = d.min;
    var sl = el("wiSlot"); sl.innerHTML = "";
    for (var h = CFG.SALON.openHour; h <= CFG.SALON.closeHour - 1; h++){
      var t = (h < 10 ? "0" : "") + h + ":00";
      var o2 = document.createElement("option");
      o2.value = t; o2.textContent = fmtSlot(t);
      sl.appendChild(o2);
    }
  }

  function saveWalkin(){
    var svcName = el("wiService").value.trim();
    var price = parseInt(el("wiPrice").value, 10);
    var name = el("wiName").value.trim();
    var phone = normPhone(el("wiPhone").value);
    var date = el("wiDate").value, slot = el("wiSlot").value;
    var beautId = el("wiBeaut").value || null;
    if (svcName.length < 2){ toast("Enter service name"); return; }
    if (!(price >= 0)){ toast("Enter a valid price"); return; }
    if (name.length < 2){ toast("Enter customer name"); return; }
    if (!phone){ toast("Enter a valid phone number"); return; }
    toast("Creating...");
    DB.walkinBooking({
      customer_name: name, customer_phone: phone,
      service_name: svcName, price: price,
      booking_date: date, time_slot: slot,
      beautician_id: beautId
    }).then(function(res){
      if (res && res.error) throw new Error(res.error);
    }).then(function(){
      toast("Walk-in booking created");
      el("walkinForm").style.display = "none";
      el("wiService").value = ""; el("wiPrice").value = "";
      el("wiName").value = ""; el("wiPhone").value = "";
      loadDashboard();
    }).catch(function(e){
      var msg = "Failed — check internet";
      if (e && e.message === "slot-taken") msg = "That slot is already booked";
      else if (e && e.message === "bad-service-name") msg = "Enter service name";
      else if (e && e.message === "bad-price") msg = "Enter a valid price";
      toast(msg);
    });
  }

  return {
    init: function(){
      initPad();
      initTabs();
      initOfferSubtabs();
      el("ownerDate").addEventListener("change", loadBookings);
      el("setLoyalSave").addEventListener("click", saveLoyalty);
      el("setPaySave").addEventListener("click", savePayAccounts);
      el("setInstaSave").addEventListener("click", saveInstagram);
      el("setVerSave").addEventListener("click", saveUpdateNotice);
      el("setPinSave").addEventListener("click", changePin);
      var ptb = el("pushTestBtn");
      if (ptb) ptb.addEventListener("click", sendTestPush);
      var fg = el("forgotPinLink");
      if (fg) fg.addEventListener("click", function(e){ e.preventDefault(); openRecovery(); });
      var rgb = el("recoveryGenBtn");
      if (rgb) rgb.addEventListener("click", function(){
        if (!confirm("Generate a NEW recovery code? The old one will stop working.")) return;
        generateRecoveryCode(false);
      });
      el("ownerLockTop").addEventListener("click", lock);
      /* dashboard quick actions */
      el("dashWalkin").addEventListener("click", function(){
        var f = el("walkinForm");
        var show = f.style.display === "none";
        f.style.display = show ? "" : "none";
        if (show) initWalkin();
      });
      el("wiCancel").addEventListener("click", function(){ el("walkinForm").style.display = "none"; });
      el("wiSave").addEventListener("click", saveWalkin);
      el("dashAddSvc").addEventListener("click", function(){
        switchOwnerTab("services");
        setTimeout(function(){ openSvcForm(null); }, 200);
      });
      el("dashAddOffer").addEventListener("click", function(){
        switchOwnerTab("offers");
        setTimeout(function(){ openOfferForm(null); }, 200);
      });
      /* customers */
      el("custSearch").addEventListener("input", function(){ paintCustomers(el("custSearch").value); });
      /* offers */
      el("offerAddBtn").addEventListener("click", function(){ openOfferForm(null); });
      el("offerFSave").addEventListener("click", saveOffer);
      el("offerFCancel").addEventListener("click", function(){ el("offerForm").style.display = "none"; });
      el("offerFImg").addEventListener("change", function(){
        offerImgFile = el("offerFImg").files[0] || null;
        previewInto(el("offerFImgPrev"), offerImgFile);
      });
      /* coupons */
      el("couponAddBtn").addEventListener("click", function(){ openCouponForm(null); });
      el("couponFSave").addEventListener("click", saveCoupon);
      el("couponFCancel").addEventListener("click", function(){ el("couponForm").style.display = "none"; });
      /* beauticians */
      el("beautAddBtn").addEventListener("click", function(){ openBeautForm(null); });
      el("beautFSave").addEventListener("click", saveBeaut);
      el("beautFCancel").addEventListener("click", function(){ el("beautForm").style.display = "none"; });
      /* existing */
      el("svcAddBtn").addEventListener("click", function(){ openSvcForm(null); });
      el("svcFSave").addEventListener("click", saveService);
      el("svcFCancel").addEventListener("click", function(){ el("svcForm").style.display = "none"; });
      el("svcFImg").addEventListener("change", function(){
        svcImgFile = el("svcFImg").files[0] || null;
        previewInto(el("svcFImgPrev"), svcImgFile);
      });
      el("svcImgsAddBtn").addEventListener("click", uploadSvcImgs);
      el("galUploadBtnImg").addEventListener("click", function(){ uploadGallery("image"); });
      el("galUploadBtnVid").addEventListener("click", function(){ uploadGallery("video"); });
      el("galCatAddBtnImg").addEventListener("click", function(){ addGalleryCategory("Img"); });
      el("galCatAddBtnVid").addEventListener("click", function(){ addGalleryCategory("Vid"); });
      el("galCatDelBtnImg").addEventListener("click", function(){ deleteGalleryCategory("Img"); });
      el("galCatDelBtnVid").addEventListener("click", function(){ deleteGalleryCategory("Vid"); });
      /* deals */
      el("dealAddBtn").addEventListener("click", function(){ openDealForm(null); });
      el("dealFSave").addEventListener("click", saveDeal);
      el("dealFCancel").addEventListener("click", function(){ el("dealForm").style.display = "none"; });
      el("dealFImg").addEventListener("change", function(){
        dealImgFile = el("dealFImg").files[0] || null;
        previewInto(el("dealFImgPrev"), dealImgFile);
      });
    },
    open: function(){
      gotoPage("owner");
      if (!unlocked){ el("ownerLogin").style.display = ""; el("ownerPanel").style.display = "none"; initPad(); }
    }
  };
})();
