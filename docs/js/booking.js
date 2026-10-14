/* Kashish Beauty Salon — booking wizard */
var Booking = (function(){
  "use strict";

  var S = {
    service: null,   // {id,name,price,dur,...}
    dealId: "",              // v6.0: set when booking a deal instead of a service
    date: "",
    slot: "",
    beautId: "",             // v4: beautician id ("" = Any Available)
    beautName: "Any Available",
    coupon: null,            // v4: coupon row
    couponDiscount: 0,
    pay: "cash",
    redeem: false,
    redeemDiscount: 0,
    customer: null,
    loyalCfg: null
  };

  function genRefCode(){
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var s = "";
    for (var i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return "KBS-" + s;
  }
  window.genRefCode = genRefCode;

  function slots(){
    var out = [], h;
    for (h = CFG.SALON.openHour; h <= CFG.SALON.closeHour - 1; h++){
      out.push((h < 10 ? "0" : "") + h + ":00");
    }
    return out;
  }

  function el(id){ return document.getElementById(id); }

  function gotoStep(n){
    [1,2,3,4].forEach(function(i){
      el("bkPane" + i).style.display = (i === n) ? "" : "none";
    });
    el("bkPaneDone").style.display = "none";
    var steps = document.querySelectorAll("#bkSteps .bk-step");
    steps.forEach(function(st){
      var k = parseInt(st.getAttribute("data-s"), 10);
      st.classList.toggle("active", k === n);
      st.classList.toggle("done", k < n);
    });
    window.scrollTo(0, 0);
  }

  function serviceList(){
    return DB_SERVICES.length ? DB_SERVICES : SERVICES.map(function(s, i){
      return { id: "local-" + i, name: s.name, price: s.price,
               duration_min: s.dur || 30, category: s.cat,
               description: s.desc || "" };
    });
  }

  function findService(id){
    return serviceList().filter(function(s){ return String(s.id) === String(id); })[0] || null;
  }

  /* effective price after the service's own percent-off (owner-set) */
  function effPrice(s){
    var d = (s && s.discount_percent > 0) ? Math.min(90, s.discount_percent) : 0;
    return d ? Math.round(s.price * (100 - d) / 100) : s.price;
  }

  /* ---------- step 1 ---------- */
  function initStep1(){
    var sel = el("bkService");
    sel.innerHTML = "";
    serviceList().forEach(function(s){
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.name + " — " + rs(effPrice(s)) +
        ((s.discount_percent > 0) ? " (" + s.discount_percent + "% off)" : "");
      sel.appendChild(o);
    });
    if (S.service && S.service._deal){
      var od = document.createElement("option");
      od.value = S.service.id;
      od.textContent = S.service.name + " — " + rs(S.service.price) + " (Package Deal)";
      sel.appendChild(od);
    }
    if (S.service) sel.value = S.service.id;
    var d = el("bkDate");
    var today = new Date(), max = new Date();
    max.setDate(max.getDate() + 14);
    d.min = today.toISOString().slice(0, 10);
    d.max = max.toISOString().slice(0, 10);
    if (!d.value) d.value = d.min;
    renderBeautChips();
  }

  /* v4: beautician chips — "Any Available" + active beauticians from DB.
     v6.3: chips ab RANK ki tartib mein aati hain — sab se zyada book hone
     wali beautician sab se pehle, medal + booking count ke saath. */
  function renderBeautChips(){
    var wrap = el("bkBeautChips");
    if (!wrap) return;
    wrap.innerHTML = "";
    function chip(id, name, sub, stateName){
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (S.beautId === id ? " active" : "");
      b.innerHTML = esc(name) + (sub ? ' <small style="opacity:.7">' + esc(sub) + "</small>" : "");
      b.onclick = function(){
        S.beautId = id; S.beautName = stateName || name;
        wrap.querySelectorAll(".chip").forEach(function(x){ x.classList.remove("active"); });
        b.classList.add("active");
      };
      wrap.appendChild(b);
    }
    chip("", "Any Available");
    Promise.all([DB.getBeauticians(), DB.getBeauticianStats()]).then(function(res){
      var ranked = DB.rankBeauticians(res[0] || [], res[1] || []);
      ranked.forEach(function(bt){
        /* har beautician ke naam ke saath uska RANK NUMBER (adeel's order):
           #1 sab se top, phir #2, #3... top 3 ko medal bhi */
        var medal = bt.rank === 1 ? " \uD83E\uDD47" : bt.rank === 2 ? " \uD83E\uDD48" :
                    bt.rank === 3 ? " \uD83E\uDD49" : "";
        var sub = bt.specialty || "";
        if (bt.rank === 1 && bt.bk_total > 0)
          sub = (sub ? sub + " \u00B7 " : "") + "Most Booked";
        if (bt.bk_total > 0)
          sub = (sub ? sub + " \u00B7 " : "") + bt.bk_total +
                (bt.bk_total === 1 ? " booking" : " bookings");
        chip(String(bt.id), "#" + bt.rank + " " + bt.name + medal, sub, bt.name);
      });
    }).catch(function(){ /* table missing — Any Available stays */ });
  }

  /* v6.3: Home ke Top Beauticians card se — beautician pehle se chuni hui,
     service list ki pehli service default (customer badal sakta hai) */
  function startWithBeautician(id, name){
    if (typeof Auth !== "undefined" && !Auth.isLoggedIn()){
      toast("Please login or sign up to book");
      gotoPage("profile");
      return;
    }
    var l = serviceList();
    S.service = l.length ? l[0] : null;
    S.dealId = "";
    S.slot = "";
    S.beautId = String(id); S.beautName = name;
    S.coupon = null; S.couponDiscount = 0;
    if (el("bkCoupon")) el("bkCoupon").value = "";
    if (typeof Auth !== "undefined"){
      var s = Auth.current();
      if (s){
        if (el("bkName") && !el("bkName").value) el("bkName").value = s.name;
        if (el("bkPhone") && !el("bkPhone").value) el("bkPhone").value = s.phone;
      }
    }
    initStep1();
    gotoStep(1);
    gotoPage("booking");
  }

  function startForService(id){
    if (typeof Auth !== "undefined" && !Auth.isLoggedIn()){
      toast("Please login or sign up to book");
      gotoPage("profile");
      return;
    }
    S.service = findService(id);
    S.dealId = "";
    S.slot = "";
    S.beautId = ""; S.beautName = "Any Available";
    S.coupon = null; S.couponDiscount = 0;
    if (el("bkCoupon")) el("bkCoupon").value = "";
    // pre-fill from logged-in profile
    if (typeof Auth !== "undefined"){
      var s = Auth.current();
      if (s){
        if (el("bkName") && !el("bkName").value) el("bkName").value = s.name;
        if (el("bkPhone") && !el("bkPhone").value) el("bkPhone").value = s.phone;
      }
    }
    initStep1();
    gotoStep(1);
    gotoPage("booking");
  }

  /* v6.0: book a package deal (server prices it from the deals table) */
  function startForDeal(dl){
    if (typeof Auth !== "undefined" && !Auth.isLoggedIn()){
      toast("Please login or sign up to book");
      gotoPage("profile");
      return;
    }
    S.service = { id: "deal_" + dl.id, _deal: true, name: dl.name,
      price: dl.price, duration_min: dl.duration_min || 120,
      discount_percent: 0, description: dl.description || "" };
    S.dealId = dl.id;
    S.slot = "";
    S.beautId = ""; S.beautName = "Any Available";
    S.coupon = null; S.couponDiscount = 0;
    if (el("bkCoupon")) el("bkCoupon").value = "";
    if (typeof Auth !== "undefined"){
      var s = Auth.current();
      if (s){
        if (el("bkName") && !el("bkName").value) el("bkName").value = s.name;
        if (el("bkPhone") && !el("bkPhone").value) el("bkPhone").value = s.phone;
      }
    }
    initStep1();
    gotoStep(1);
    gotoPage("booking");
  }

  /* ---------- step 2 ---------- */
  function loadSlots(){
    var v = el("bkService").value;
    if (!(S.service && S.service._deal && String(S.service.id) === String(v))){
      S.service = findService(v);
      S.dealId = "";
    }
    S.date = el("bkDate").value;
    if (!S.service || !S.date){ toast("Please choose a service and date"); return; }
    el("bkSlotSummary").textContent = S.service.name + " • " + fmtDate(S.date);
    var grid = el("slotGrid");
    grid.innerHTML = "<p>Loading slots...</p>";
    gotoStep(2);
    paintSlotGrid(grid, S.date, null, function(t, b){
      S.slot = t;
      var all = grid.querySelectorAll(".slot");
      all.forEach(function(x){ x.classList.remove("selected"); });
      b.classList.add("selected");
      setTimeout(initStep3, 350);
    }).catch(function(){
      grid.innerHTML = "<p>Could not load slots. Check your internet and try again.</p>";
    });
  }

  /* Shared slot grid: paints free slots for a date; excludeId skips one booking
     (used by reschedule so the booking's own slot is not marked taken).
     onPick(t, btn) fires when a free slot is tapped. */
  function paintSlotGrid(grid, dateIso, excludeId, onPick){
    return DB.getBookingsByDate(dateIso).then(function(rows){
      var taken = {};
      rows.forEach(function(r){
        if (String(r.id) === String(excludeId)) return;
        if (r.status === "cancelled") return;
        taken[r.time_slot] = true;
      });
      // past slots today are unavailable
      var nowH = -1;
      var todayIso = new Date().toISOString().slice(0, 10);
      if (dateIso === todayIso) nowH = new Date().getHours();
      grid.innerHTML = "";
      slots().forEach(function(t){
        var b = document.createElement("button");
        b.type = "button";
        b.className = "slot";
        b.textContent = fmtSlot(t);
        var h = parseInt(t.split(":")[0], 10);
        if (taken[t] || h <= nowH){
          b.classList.add("taken");
          b.disabled = true;
        } else {
          b.addEventListener("click", function(){ onPick(t, b); });
        }
        grid.appendChild(b);
      });
      if (!grid.children.length) grid.innerHTML = "<p>No slots configured.</p>";
    });
  }

  /* ---------- step 3 ---------- */
  function payAccounts(){
    var d = CFG.DEFAULT_PAY_ACCOUNTS || {};
    function one(k){
      var dd = d[k] || {};
      var s = {};
      try { s = JSON.parse(localStorage.getItem(CFG.PAY_ACCOUNTS_KEY) || "{}")[k] || {}; }
      catch(e){ s = {}; }
      if (typeof s === "string") s = { number: s };
      return { title: s.title || dd.title || "", number: s.number || dd.number || "", name: s.name || "", label: s.label || "" };
    }
    return { easypaisa: one("easypaisa"), jazzcash: one("jazzcash"), bank: one("bank"), extra: one("extra") };
  }

  function allPayNames(){
    var ex = payAccounts().extra || {};
    return { cash: "Cash at salon", easypaisa: "Easypaisa", jazzcash: "JazzCash", bank: "Bank transfer", extra: ex.label || "Extra account" };
  }
  function payDisplayName(){ return allPayNames()[S.pay] || S.pay; }

  /* the extra account card only shows when the owner has set it up */
  function applyExtraCard(){
    var card = el("payCardExtra");
    if (!card) return;
    var ex = payAccounts().extra || {};
    var show = !!(ex.label && ex.number);
    card.style.display = show ? "" : "none";
    if (show) el("payExtraName").textContent = ex.label;
    if (!show && S.pay === "extra") S.pay = "cash";
  }

  function initStep3(){
    gotoStep(3);
    // logged-in user: hide manual name/phone, show "booking as"
    var sess = (typeof Auth !== "undefined") ? Auth.current() : null;
    var asUser = el("bkAsUser");
    if (sess){
      el("bkNameWrap").style.display = "none";
      el("bkPhoneWrap").style.display = "none";
      asUser.style.display = "";
      asUser.textContent = "Booking as " + sess.name + " (" + sess.phone + ")";
    } else {
      el("bkNameWrap").style.display = "";
      el("bkPhoneWrap").style.display = "";
      asUser.style.display = "none";
    }
    applyExtraCard();
    // payment cards
    var cards = document.querySelectorAll("#payMethods .pay-card");
    cards.forEach(function(c){
      c.classList.toggle("selected", c.getAttribute("data-pay") === S.pay);
      c.onclick = function(){
        S.pay = c.getAttribute("data-pay");
        cards.forEach(function(x){ x.classList.remove("selected"); });
        c.classList.add("selected");
        syncPayExtra();
      };
    });
    syncPayExtra();
    // refresh payment accounts from the server (owner changes reach every
    // phone and survive reinstall/update), then re-render the account box
    if (window.DB && DB.getPaymentAccounts){
      DB.getPaymentAccounts().then(function(){ applyExtraCard(); syncPayExtra(); }).catch(function(){});
    }
    maybeLoyalty();
    initCoupon();
  }

  /* v4: coupon code input + validation */
  function initCoupon(){
    var msg = el("bkCouponMsg");
    if (!msg) return;
    if (S.coupon){
      msg.textContent = "Coupon " + S.coupon.code + " applied (−" + rs(S.couponDiscount) + ")";
      msg.className = "coupon-msg ok";
    } else {
      msg.textContent = "";
      msg.className = "coupon-msg";
    }
  }

  function applyCoupon(){
    var code = el("bkCoupon").value.trim().toUpperCase();
    var msg = el("bkCouponMsg");
    S.coupon = null; S.couponDiscount = 0;
    if (!code){ initCoupon(); return; }
    if (!S.service){ msg.textContent = "Choose a service first"; return; }
    msg.textContent = "Checking...";
    msg.className = "coupon-msg";
    DB.validateCoupon(code, effPrice(S.service)).then(function(r){
      if (!r || !r.valid){
        var reason = (r && r.reason) || "invalid";
        msg.textContent = reason === "expired" ? "This coupon has expired" :
          reason === "min-amount" ? "Needs a higher order value" : "Invalid coupon code";
        S.coupon = null; S.couponDiscount = 0;
        return;
      }
      S.coupon = { code: r.code }; S.couponDiscount = r.discount_rs || 0;
      msg.textContent = "Coupon " + r.code + " applied (−" + rs(S.couponDiscount) + ")";
      msg.className = "coupon-msg ok";
      toast("Coupon applied: −" + rs(S.couponDiscount));
    }).catch(function(){ msg.textContent = "Could not check — try again"; });
  }

  function syncPayExtra(){
    var online = (S.pay !== "cash");
    el("payExtra").style.display = online ? "" : "none";
    if (online){
      var acc = (payAccounts()[S.pay]) || {};
      var bankRow = el("payAccBankRow");
      if (bankRow){
        var bn = (S.pay === "bank" && acc.name) ? String(acc.name).toUpperCase() : "";
        bankRow.style.display = bn ? "" : "none";
        if (bn) el("payAccBankName").textContent = bn;
      }
      var labels = { easypaisa: "Easypaisa", jazzcash: "JazzCash", bank: "Bank", extra: "Extra account" };
      el("payAccLabel").textContent = (S.pay === "extra" && acc.label) ? acc.label : (labels[S.pay] || "Account");
      el("payAccTitle").textContent = acc.title || "-";
      el("payAccTitleRow").style.display = acc.title ? "" : "none";
      el("payAccNum").textContent = acc.number || "Not set — ask salon on WhatsApp";
    }
  }

  function maybeLoyalty(){
    var card = el("redeemCard");
    card.style.display = "none";
    S.redeem = false; S.redeemDiscount = 0; S.customer = null;
    var creds = (typeof Auth !== "undefined") ? Auth.creds() : null;
    if (!creds || !creds.hash) return;
    Promise.all([
      DB.getCustomerAuth(creds.phone, creds.hash),
      S.loyalCfg ? Promise.resolve(S.loyalCfg) : DB.getLoyaltyConfig()
    ]).then(function(r){
      var c = r[0]; S.loyalCfg = r[1];
      if (!c || !(c.loyalty_points > 0)) return;
      S.customer = c;
      var cfg = S.loyalCfg;
      if (c.loyalty_points >= cfg.min_redeem_points){
        el("redeemPts").textContent = c.loyalty_points;
        var units = Math.floor(c.loyalty_points / cfg.redeem_points);
        S.redeemDiscount = units * cfg.redeem_value_rs;
        el("redeemHint").textContent = "Use " + (units * cfg.redeem_points) +
          " points for " + rs(S.redeemDiscount) + " off";
        el("redeemChk").checked = false;
        card.style.display = "";
      }
    }).catch(function(){});
  }

  /* ---------- step 4 : review + confirm ---------- */
  function review(){
    var sess = (typeof Auth !== "undefined") ? Auth.current() : null;
    var name = sess ? sess.name : el("bkName").value.trim();
    var phone = sess ? sess.phone : normPhone(el("bkPhone").value);
    if (!sess){
      name = el("bkName").value.trim();
      if (name.length < 2){ toast("Please enter your name"); return; }
    }
    if (!phone){ toast("Please enter a valid mobile number (03XXXXXXXXX)"); return; }
    if (S.pay !== "cash" && !el("bkTid").value.trim()){
      toast("Please enter the Transaction ID (TID)"); return;
    }
    S.redeem = el("redeemChk").checked && S.redeemDiscount > 0;
    var loyalDisc = S.redeem ? S.redeemDiscount : 0;
    var couponDisc = S.couponDiscount || 0;
    var svcPrice = effPrice(S.service);
    var svcDisc = Math.max(0, S.service.price - svcPrice);
    var svcDiscPct = (S.service.discount_percent > 0) ? Math.min(90, S.service.discount_percent) : 0;
    var total = Math.max(0, svcPrice - couponDisc - loyalDisc);
    var payNames = allPayNames();
    var html = "";
    html += '<div class="bill-row"><span>Service</span><strong>' + esc(S.service.name) + '</strong></div>';
    html += '<div class="bill-row"><span>Beautician</span><strong>' + esc(S.beautName) + '</strong></div>';
    html += '<div class="bill-row"><span>Date</span><strong>' + fmtDate(S.date) + '</strong></div>';
    html += '<div class="bill-row"><span>Time</span><strong>' + fmtSlot(S.slot) + '</strong></div>';
    html += '<div class="bill-row"><span>Name</span><strong>' + esc(name) + '</strong></div>';
    html += '<div class="bill-row"><span>Phone</span><strong>' + esc(phone) + '</strong></div>';
    html += '<div class="bill-row"><span>Payment</span><strong>' + payNames[S.pay] + '</strong></div>';
    html += '<div class="bill-row"><span>Price</span><strong>' + rs(svcPrice) + '</strong></div>';
    if (svcDisc) html += '<div class="bill-row"><span>Service discount (' + svcDiscPct + '% off)</span><strong>− ' + rs(svcDisc) + '</strong></div>';
    if (couponDisc) html += '<div class="bill-row"><span>Coupon ' + esc(S.coupon.code) + '</span><strong>− ' + rs(couponDisc) + '</strong></div>';
    if (loyalDisc) html += '<div class="bill-row"><span>Loyalty discount</span><strong>− ' + rs(loyalDisc) + '</strong></div>';
    html += '<div class="bill-row bill-total"><span>Total</span><strong>' + rs(total) + '</strong></div>';
    el("billCard").innerHTML = html;
    S._review = { name: name, phone: phone, total: total, loyalDisc: loyalDisc, couponDisc: couponDisc };
    gotoStep(4);
  }

  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

  /* ---------- step 4 : review + confirm (v5: server validates everything) ---------- */
  function confirm(){
    var btn = el("bkConfirm");
    btn.disabled = true; btn.textContent = "Booking...";
    var r = S._review;
    var creds = (typeof Auth !== "undefined") ? Auth.creds() : null;
    if (!creds || !creds.hash){
      btn.disabled = false; btn.textContent = "Confirm Booking";
      toast("Please login again"); return;
    }
    if (String(S.service.id).indexOf("local-") === 0){
      btn.disabled = false; btn.textContent = "Confirm Booking";
      toast("Please reopen the app and try again"); return;
    }
    DB.getCustomerAuth(creds.phone, creds.hash).then(function(c){
      var redeemPts = 0;
      if (S.redeem && c && S.loyalCfg){
        redeemPts = Math.floor((c.loyalty_points || 0) / S.loyalCfg.redeem_points) *
                    S.loyalCfg.redeem_points;
      }
      var payload = {
        customer_name: r.name, customer_phone: creds.phone, password_hash: creds.hash,
        service_id: S.service._deal ? null : S.service.id,
        booking_date: S.date, time_slot: S.slot,
        beautician_id: S.beautId ? S.beautId : null,
        coupon_code: S.coupon ? S.coupon.code : "",
        redeem_points: redeemPts,
        payment_method: S.pay === "extra" ? (payAccounts().extra.label || "extra") : S.pay,
        payment_tid: S.pay === "cash" ? "" : el("bkTid").value.trim(),
        notes: el("bkNotes").value.trim()
      };
      if (S.service._deal) payload.deal_id = S.dealId;
      return DB.placeBooking(payload);
    }).then(function(res){
      done({ ref_code: res.ref_code, id: res.booking_id }, r);
    }).catch(function(e){
      btn.disabled = false; btn.textContent = "Confirm Booking";
      var msg = "Booking failed — check internet";
      if (e && e.code === "slot-taken") msg = "That slot was just taken — please pick another";
      else if (e && e.code === "bad-coupon") msg = "Coupon is no longer valid";
      else if (e && e.code === "not-enough-points") msg = "Not enough loyalty points";
      else if (e && e.code === "bad-redeem") msg = "Invalid points selection";
      else if (e && e.code === "auth") msg = "Session expired — please login again";
      toast(msg);
    });
  }

  /* v4: full confirmation screen with reference code */
  function done(b, r){
    ["bkPane1","bkPane2","bkPane3","bkPane4"].forEach(function(id){ el(id).style.display = "none"; });
    el("bkPaneDone").style.display = "";
    var ref = b.ref_code || ("KS-" + String(b.id || "").slice(0, 8).toUpperCase());
    el("doneRef").textContent = ref;
    var payNames = allPayNames();
    var payStatus = S.pay === "cash" ? "Pay at salon" : "Proof submitted — salon will verify";
    var html = "";
    html += '<div class="bill-row"><span>Service</span><strong>' + esc(S.service.name) + '</strong></div>';
    html += '<div class="bill-row"><span>Beautician</span><strong>' + esc(S.beautName) + '</strong></div>';
    html += '<div class="bill-row"><span>Date</span><strong>' + fmtDate(S.date) + '</strong></div>';
    html += '<div class="bill-row"><span>Time</span><strong>' + fmtSlot(S.slot) + '</strong></div>';
    html += '<div class="bill-row"><span>Location</span><strong>Kashish Beauty Salon, Sahiwal</strong></div>';
    html += '<div class="bill-row"><span>Payment</span><strong>' + payNames[S.pay] + '</strong></div>';
    html += '<div class="bill-row"><span>Payment status</span><strong>' + payStatus + '</strong></div>';
    html += '<div class="bill-row bill-total"><span>Total</span><strong>' + rs(r.total) + '</strong></div>';
    el("doneDetails").innerHTML = html;
    var msg = "Assalam-o-Alaikum! New booking at Kashish Beauty Salon\n" +
      "Ref: " + ref + "\n" +
      "Name: " + r.name + "\n" +
      "Phone: " + r.phone + "\n" +
      "Service: " + S.service.name + "\n" +
      "Beautician: " + S.beautName + "\n" +
      "Date: " + fmtDate(S.date) + "\n" +
      "Time: " + fmtSlot(S.slot) + "\n" +
      "Total: " + rs(r.total) + "\n" +
      "Payment: " + payDisplayName() +
      (S.pay !== "cash" ? "\nTID: " + el("bkTid").value.trim() : "");
    el("doneWa").href = "whatsapp://send?phone=" + CFG.SALON.whatsapp + "&text=" + encodeURIComponent(msg);
    /* v6.0: Add to Calendar (Google Calendar template link) */
    var cal = el("doneCal");
    if (cal){
      var p2 = function(n){ return (n < 10 ? "0" : "") + n; };
      var dstr = S.date.replace(/-/g, "");
      var hh = parseInt(S.slot.split(":")[0], 10) || 10;
      var durH = Math.max(1, Math.round((S.service.duration_min || 60) / 60));
      cal.href = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
        "&text=" + encodeURIComponent("Kashish Beauty Salon — " + S.service.name) +
        "&dates=" + dstr + "T" + p2(hh) + "0000/" + dstr + "T" + p2(Math.min(hh + durH, 23)) + "0000" +
        "&details=" + encodeURIComponent("Booking ref: " + ref + " — Kashish Beauty Salon, Sahiwal") +
        "&location=" + encodeURIComponent("Kashish Beauty Salon, Garden Town St 1, House 127/B, Sahiwal");
    }
    window.scrollTo(0, 0);
  }

  function reset(){
    S.slot = ""; S.dealId = ""; S.redeem = false; S.redeemDiscount = 0;
    S.beautId = ""; S.beautName = "Any Available";
    S.coupon = null; S.couponDiscount = 0;
    ["bkName","bkPhone","bkTid","bkNotes","bkCoupon"].forEach(function(id){ if (el(id)) el(id).value = ""; });
    el("redeemChk").checked = false;
    initStep1();
    gotoStep(1);
  }

  /* ---------- v4: reschedule an upcoming booking ---------- */
  var RS = { ref: null, date: "", slot: "" };

  function openReschedule(refCode, curDate, curSlot){
    RS.ref = refCode; RS.date = curDate || ""; RS.slot = "";
    var html =
      '<h3 class="sec-title">Reschedule Booking</h3>' +
      '<div class="form-group"><label>New date</label><input type="date" id="rsDate"></div>' +
      '<div class="slot-grid" id="rsSlots"></div>' +
      '<button class="btn btn-gold btn-block" id="rsGo">Confirm Reschedule</button>' +
      '<button class="btn btn-outline btn-block" id="rsCancel">Cancel</button>';
    App.openModal(html);
    var d = document.getElementById("rsDate");
    var today = new Date(), max = new Date();
    max.setDate(max.getDate() + 14);
    d.min = today.toISOString().slice(0, 10);
    d.max = max.toISOString().slice(0, 10);
    d.value = (RS.date >= d.min && RS.date <= d.max) ? RS.date : d.min;
    RS.date = d.value;
    function loadRs(){
      RS.date = d.value; RS.slot = "";
      var grid = document.getElementById("rsSlots");
      grid.innerHTML = "<p>Loading slots...</p>";
      paintSlotGrid(grid, RS.date, null, function(t, b){
        RS.slot = t;
        grid.querySelectorAll(".slot").forEach(function(x){ x.classList.remove("selected"); });
        b.classList.add("selected");
      }).catch(function(){ grid.innerHTML = "<p>Could not load slots.</p>"; });
    }
    d.addEventListener("change", loadRs);
    document.getElementById("rsCancel").onclick = function(){ App.closeModal(); };
    document.getElementById("rsGo").onclick = function(){
      if (!RS.slot){ toast("Pick a time slot"); return; }
      var creds = (typeof Auth !== "undefined") ? Auth.creds() : null;
      if (!creds || !creds.hash){ toast("Please login again"); return; }
      toast("Rescheduling...");
      DB.rescheduleBooking(RS.ref, creds.phone, creds.hash, RS.date, RS.slot).then(function(ok){
        if (!ok){ toast("Could not reschedule — slot may be taken"); return; }
        App.closeModal();
        toast("Booking rescheduled");
        App.renderProfile();
      }).catch(function(){ toast("Failed — check internet"); });
    };
    loadRs();
  }

  /* ---------- public ---------- */
  return {
    init: function(){
      el("bkToStep2").addEventListener("click", loadSlots);
      el("bkToStep4").addEventListener("click", review);
      el("bkConfirm").addEventListener("click", confirm);
      el("doneNew").addEventListener("click", reset);
      el("payCopyBtn").addEventListener("click", function(){
        var t = el("payAccNum").textContent;
        copyText(t);
      });
      el("bkPhone").addEventListener("change", maybeLoyalty);
      el("bkCouponApply").addEventListener("click", applyCoupon);
      el("doneView").addEventListener("click", function(e){
        e.preventDefault();
        App.renderProfile();
        gotoPage("profile");
      });
      var backs = document.querySelectorAll("[data-bkback]");
      backs.forEach(function(a){
        a.addEventListener("click", function(e){
          e.preventDefault();
          gotoStep(parseInt(a.getAttribute("data-bkback"), 10));
        });
      });
      initStep1();
    },
    startForService: startForService,
    startForDeal: startForDeal,
    startWithBeautician: startWithBeautician,
    reset: reset,
    reschedule: openReschedule,
    refreshServices: initStep1
  };
})();

function copyText(t){
  function ok(){ toast("Copied!"); }
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(ok, function(){ fallback(); });
  } else fallback();
  function fallback(){
    var ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); ok(); } catch(e){ toast("Copy manually: " + t); }
    document.body.removeChild(ta);
  }
}
