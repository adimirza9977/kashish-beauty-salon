/* Kashish Beauty Salon — main app */
(function(){
  "use strict";

  /* ---------- helpers (global) ---------- */
  window.toast = function(msg){
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(function(){ t.classList.remove("show"); }, 2600);
  };

  window.gotoPage = function(name){
    document.querySelectorAll(".page").forEach(function(p){ p.classList.remove("active"); });
    var pg = document.getElementById("page-" + name);
    if (pg) pg.classList.add("active");
    document.querySelectorAll("#tabbar .tab").forEach(function(t){
      t.classList.toggle("active", t.getAttribute("data-goto") === name);
    });
    window.scrollTo(0, 0);
    /* v6.0 fix (adeel's report): offer/discount banners must show on EVERY
       visit to Home while they are active — re-render them fresh each time,
       never only once at boot when data may not have loaded yet */
    if (name === "home" && typeof renderTopOffer === "function"){
      try {
        renderTopOffer();
        renderSvcOffers();
        renderOffers();
        renderDeals();
        renderTopBeauticians();
      } catch(e){}
    }
    if (name === "services" && typeof refreshOffersBtn === "function"){
      try { refreshOffersBtn(); refreshDealsBtn(); } catch(e){}
    }
    if (name === "offers" && typeof renderOffersPage === "function"){
      try { renderOffersPage(); } catch(e){}
    }
    if (name === "deals" && typeof renderDealsPage === "function"){
      try { renderDealsPage(); } catch(e){}
    }
  };

  function waLink(text){
    return "whatsapp://send?phone=" + CFG.SALON.whatsapp + "&text=" +
      encodeURIComponent(text || "Assalam-o-Alaikum! I want to book an appointment at Kashish Beauty Salon.");
  }

  function esc(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }

  /* ---------- modal helper (v4) ---------- */
  function openModal(html){
    var m = document.getElementById("modal");
    document.getElementById("modalBox").innerHTML = html;
    m.classList.add("show");
    m.onclick = function(e){ if (e.target === m) closeModal(); };
  }
  function closeModal(){
    document.getElementById("modal").classList.remove("show");
  }

  /* ---------- favorites (v4) ---------- */
  var FAVS = []; // service ids as strings
  function loadFavs(){
    var s = Auth.current();
    if (!s){ FAVS = []; return Promise.resolve([]); }
    var cr = Auth.creds();
    if (!cr || !cr.hash){ FAVS = []; return Promise.resolve([]); }
    return DB.getFavorites(cr.phone, cr.hash).then(function(rows){
      FAVS = (rows || []).map(function(r){ return String(r.service_id); });
      return FAVS;
    }).catch(function(){ FAVS = []; return []; });
  }
  function isFav(id){ return FAVS.indexOf(String(id)) >= 0; }
  function toggleFav(id, btn){
    var s = Auth.current();
    if (!s){ toast("Please login to save favorites"); gotoPage("profile"); return; }
    var sid = String(id);
    var cr = Auth.creds();
    if (!cr || !cr.hash){ toast("Please login again"); return; }
    if (isFav(sid)){
      DB.removeFavorite(cr.phone, cr.hash, sid).then(function(){
        FAVS = FAVS.filter(function(x){ return x !== sid; });
        if (btn) btn.innerHTML = "&#9825;";
        toast("Removed from favorites");
        renderFavSection();
      }).catch(function(){ toast("Failed — check internet"); });
    } else {
      DB.addFavorite(cr.phone, cr.hash, sid).then(function(){
        if (!isFav(sid)) FAVS.push(sid);
        if (btn) btn.innerHTML = "&#10084;";
        toast("Added to favorites");
        renderFavSection();
      }).catch(function(){ toast("Failed — check internet"); });
    }
  }

  /* ---------- service lookup / stars ---------- */
  function findSvcById(id){
    return svcList().filter(function(s){ return String(s.id) === String(id); })[0] || null;
  }
  function findSvcByName(name){
    var n = String(name || "").toLowerCase();
    return svcList().filter(function(s){ return String(s.name).toLowerCase() === n; })[0] || null;
  }
  function starRow(n){
    var s = "";
    for (var i = 1; i <= 5; i++) s += i <= n ? "&#9733;" : "&#9734;";
    return s;
  }
  function firstName(n){
    return String(n || "Guest").trim().split(" ")[0] || "Guest";
  }

  /* ---------- splash ---------- */
  function hideSplash(){
    var s = document.getElementById("splash");
    if (s) s.classList.add("hide");
  }
  window.addEventListener("load", function(){
    setTimeout(hideSplash, 1200);
  });
  // fallback: hide even if window load is delayed
  setTimeout(hideSplash, 4000);

  /* ---------- contact wiring (tel: bug fixed — real number) ---------- */
  document.getElementById("waBookHero") && (document.getElementById("waBookHero").href = waLink());
  document.getElementById("waBtn").href = waLink();
  document.getElementById("callBtn").href = "tel:" + CFG.SALON.phone;
  document.getElementById("callBtn2").href = "tel:" + CFG.SALON.phone;
  document.getElementById("instaBtn").href = CFG.SALON.instagram;
  document.getElementById("homeWaBtn").href = waLink();
  document.getElementById("addrText").textContent = CFG.SALON.address;
  document.getElementById("phoneText").textContent = "+92 312 7830765";

  /* ---------- navigation ---------- */
  document.querySelectorAll("[data-goto]").forEach(function(elm){
    elm.addEventListener("click", function(e){
      e.preventDefault();
      var name = elm.getAttribute("data-goto");
      if (name === "owner"){ Owner.open(); return; }
      if (name === "booking" && !Auth.isLoggedIn()){
        toast("Please login or sign up to book");
        gotoPage("profile");
        return;
      }
      if (name === "profile") renderProfile();
      gotoPage(name);
    });
  });
  document.getElementById("ownerBtn").addEventListener("click", function(){ Owner.open(); });
  document.getElementById("ownerLink").addEventListener("click", function(e){
    e.preventDefault(); Owner.open();
  });

  /* ---------- gallery (v6.0: folders + videos + captions, local fallback) ---------- */
  var GAL_ROWS = null, GAL_CATS = [], activeGalCat = "all";
  function localGalRows(){
    return GALLERY.map(function(src){
      return { image_url: src, caption: "", media_type: "image", category_id: null };
    });
  }
  function galRows(){ return GAL_ROWS && GAL_ROWS.length ? GAL_ROWS : localGalRows(); }
  function galTile(g){
    var node;
    if (g.media_type === "video"){
      node = document.createElement("div");
      node.className = "gal-tile";
      node.innerHTML = '<video src="' + esc(g.image_url) + '" muted preload="metadata" playsinline></video>' +
        '<span class="gal-vid-badge">&#9654;</span>';
    } else {
      node = document.createElement("img");
      node.src = g.image_url; node.alt = g.caption || "";
      node.onerror = function(){ this.style.display = "none"; };
    }
    node.style.cursor = "pointer";
    node.onclick = function(){ openLightbox(g); };
    return node;
  }
  function renderGalleryInto(elm, list, limit){
    if (!elm) return;
    elm.innerHTML = "";
    (limit ? list.slice(0, limit) : list).forEach(function(g){ elm.appendChild(galTile(g)); });
  }
  /* ---------- lightbox: tap a picture/video to see it big ---------- */
  function closeLightbox(){
    var lb = document.getElementById("lightbox");
    if (!lb) return;
    var vid = document.getElementById("lbVid");
    if (vid){ try { vid.pause(); } catch(e){} vid.removeAttribute("src"); if (vid.load) vid.load(); }
    lb.classList.remove("show");
  }
  function openLightbox(item){
    var g = (typeof item === "string") ? { image_url: item, media_type: "image", caption: "" } : item;
    var lb = document.getElementById("lightbox");
    if (!lb){
      lb = document.createElement("div");
      lb.id = "lightbox";
      lb.innerHTML = '<span id="lbClose">&times;</span><img id="lbImg" src="" alt="">' +
        '<video id="lbVid" controls playsinline style="display:none"></video><div id="lbCap"></div>';
      document.body.appendChild(lb);
      document.getElementById("lbClose").onclick = closeLightbox;
      lb.onclick = function(e){ if (e.target === lb) closeLightbox(); };
    }
    var img = document.getElementById("lbImg"), vid = document.getElementById("lbVid");
    if (g.media_type === "video"){
      img.style.display = "none";
      vid.style.display = "";
      vid.src = g.image_url;
      var p = vid.play && vid.play();
      if (p && p.catch) p.catch(function(){});
    } else {
      try { vid.pause(); } catch(e){}
      vid.removeAttribute("src");
      vid.style.display = "none";
      img.style.display = "";
      /* slow internet par khali safed screen ki jagah "Loading..." nazar
         aaye, taake customer ko pata ho picture aa rahi hai */
      img.style.opacity = "0";
      img.onload = function(){ img.style.opacity = ""; };
      img.onerror = function(){ img.style.opacity = ""; };
      img.src = g.image_url;
      if (img.complete && img.naturalWidth) img.style.opacity = "";
    }
    document.getElementById("lbCap").textContent =
      (g.media_type === "video" ? "" : "Loading... ") + (g.caption || "");
    if (g.media_type !== "video"){
      img.addEventListener("load", function(){
        document.getElementById("lbCap").textContent = g.caption || "";
      }, { once: true });
    }
    lb.classList.add("show");
  }
  function renderGalTabs(){
    var tabs = document.getElementById("galTabs");
    if (!tabs) return;
    tabs.innerHTML = "";
    function tab(id, label){
      var b = document.createElement("button");
      b.className = "cat-tab" + (activeGalCat === id ? " active" : "");
      b.textContent = label;
      b.onclick = function(){ activeGalCat = id; renderGalTabs(); renderGalGrid(); };
      tabs.appendChild(b);
    }
    tab("all", "All");
    GAL_CATS.forEach(function(c){ tab(String(c.id), c.name); });
    if (galRows().some(function(g){ return !g.category_id; })) tab("none", "General");
  }
  function renderGalGrid(){
    var rows = galRows(), list = rows;
    if (activeGalCat === "none") list = rows.filter(function(g){ return !g.category_id; });
    else if (activeGalCat !== "all") list = rows.filter(function(g){ return String(g.category_id || "") === activeGalCat; });
    renderGalleryInto(document.getElementById("galGrid"), list);
  }
  function loadGallery(){
    Promise.all([DB.getGallery(), DB.getGalleryCategories()]).then(function(r){
      if (r[0] && r[0].length) GAL_ROWS = r[0];
      GAL_CATS = r[1] || [];
      renderGalleryInto(document.getElementById("galPreview"), galRows(), 6);
      renderGalTabs();
      renderGalGrid();
    }).catch(function(){
      renderGalleryInto(document.getElementById("galPreview"), galRows(), 6);
      renderGalleryInto(document.getElementById("galGrid"), galRows());
    });
  }

  /* ---------- share (v6.0): service / deal ki detail + picture WhatsApp par ---------- */
  function shareTextFor(kind, item){
    var lines = [];
    if (kind === "deal"){
      lines.push("\uD83C\uDF81 Kashish Beauty Salon — Package Deal");
      lines.push(item.name + " — " + rs(item.price));
      if (item.description) lines.push("Is deal mein shamil hai:\n" + item.description);
    } else {
      lines.push("\u2728 Kashish Beauty Salon");
      lines.push(item.name + " — " + rs(item.price) + " (" + (item.duration_min || 30) + " min)");
      if (item.description) lines.push(item.description);
    }
    if (item.image_url) lines.push("Picture: " + item.image_url);
    lines.push("Booking ke liye WhatsApp karein: +92 312 7830765 (Kashish Beauty Salon, Sahiwal)");
    return lines.join("\n");
  }
  function shareItem(kind, item){
    var text = shareTextFor(kind, item);
    if (navigator.share){
      navigator.share({ title: item.name, text: text }).catch(function(){
        window.location.href = "whatsapp://send?text=" + encodeURIComponent(text);
      });
    } else {
      window.location.href = "whatsapp://send?text=" + encodeURIComponent(text);
    }
  }
  window.shareItem = shareItem;

  /* ---------- deals (v6.0) ---------- */
  var DEALS = [];
  function dealCard(dl){
    var d = document.createElement("div");
    d.className = "deal-card";
    d.innerHTML =
      (dl.image_url ? '<img src="' + esc(dl.image_url) + '" alt="" onerror="this.style.display=\'none\'">' : "") +
      '<div class="deal-body"><strong>' + esc(dl.name) + "</strong>" +
      '<span class="deal-price">' + rs(dl.price) + " \u2022 " + (dl.duration_min || 120) + " min</span>" +
      (dl.description ? "<p>" + esc(dl.description) + "</p>" : "") + "</div>";
    d.addEventListener("click", function(){ showDeal(dl); });
    return d;
  }
  /* v6.3: Top Beauticians on Home — ranking by booking count (adeel's
     order): sab se zyada book hone wali beautician #1 par show hoti hai.
     Card par tap = usi beautician ke saath booking shuru. */
  function renderTopBeauticians(){
    var sec = document.getElementById("topBeautSection");
    var row = document.getElementById("topBeautRow");
    if (!sec || !row) return;
    Promise.all([DB.getBeauticians(), DB.getBeauticianStats()]).then(function(res){
      var ranked = DB.rankBeauticians(res[0] || [], res[1] || []);
      if (!ranked.length){ sec.style.display = "none"; return; }
      row.innerHTML = "";
      ranked.forEach(function(b){
        var d = document.createElement("div");
        d.className = "beaut-card";
        d.innerHTML =
          '<span class="beaut-rank' + (b.rank === 1 ? " gold" : "") + '">#' + b.rank + "</span>" +
          '<div class="beaut-ava">' + esc((b.name || "B").trim().charAt(0).toUpperCase()) + "</div>" +
          "<strong>" + esc(b.name) + "</strong>" +
          "<small>" + esc(b.specialty || "Beautician") + "</small>" +
          (b.bk_total > 0
            ? '<span class="beaut-count">\u2B50 ' + b.bk_total + (b.bk_total === 1 ? " booking" : " bookings") + "</span>"
            : '<span class="beaut-count new">New</span>');
        d.addEventListener("click", function(){ Booking.startWithBeautician(b.id, b.name); });
        row.appendChild(d);
      });
      sec.style.display = "";
    }).catch(function(){ sec.style.display = "none"; });
  }

  function renderDeals(){
    DB.getDeals().then(function(rows){
      DEALS = rows || [];
      var box = document.getElementById("dealsBox"), list = document.getElementById("dealsList");
      if (box && list){
        list.innerHTML = "";
        DEALS.forEach(function(dl){ list.appendChild(dealCard(dl)); });
        box.style.display = DEALS.length ? "" : "none";
      }
      var hs = document.getElementById("homeDealsSection"), hd = document.getElementById("homeDeals");
      if (hs && hd){
        hd.innerHTML = "";
        DEALS.forEach(function(dl){ hd.appendChild(dealCard(dl)); });
        hs.style.display = DEALS.length ? "" : "none";
      }
    }).catch(function(){});
  }
  function showDeal(dl){
    openModal(
      '<h3 class="sec-title">&#127873; ' + esc(dl.name) + "</h3>" +
      (dl.image_url ? '<img src="' + esc(dl.image_url) + '" style="width:100%;border-radius:12px;margin-bottom:10px" alt="">' : "") +
      '<p class="sdet-price">' + rs(dl.price) + " <span>\u2022 " + (dl.duration_min || 120) + " min</span></p>" +
      (dl.description ? '<h3 class="sec-title" style="margin-top:10px">Is deal mein shamil hai:</h3><p style="white-space:pre-wrap">' + esc(dl.description) + "</p>" : "") +
      '<button class="btn btn-gold btn-block" id="dealBook">Book This Deal</button>' +
      '<button class="btn btn-wa btn-block" id="dealShare">Share on WhatsApp</button>' +
      '<button class="btn btn-outline btn-block" id="dealClose">Close</button>'
    );
    document.getElementById("dealClose").onclick = closeModal;
    document.getElementById("dealBook").onclick = function(){ closeModal(); Booking.startForDeal(dl); };
    document.getElementById("dealShare").onclick = function(){ shareItem("deal", dl); };
  }

  /* ---------- home ---------- */
  function catName(id){
    var c = CATEGORIES.filter(function(x){ return x.id === id; })[0];
    return c ? c.icon + " " + c.name : id;
  }

  /* ---------- v4 home: popular / recommended / offers / upcoming ---------- */
  /* effective service price after the service's own percent-off */
  function svcPrice(s){
    var d = (s && s.discount_percent > 0) ? Math.min(90, s.discount_percent) : 0;
    return d ? Math.round(s.price * (100 - d) / 100) : s.price;
  }

  function svcCardEl(s){
    var d = document.createElement("div");
    d.className = "pop-card";
    var offBadge = (s.discount_percent > 0)
      ? '<span class="off-badge">' + s.discount_percent + '% OFF</span>' : "";
    var img = s.image_url
      ? '<img src="' + s.image_url + '" alt="" onerror="this.style.display=\'none\'">'
      : '<div class="pop-noimg">' + esc(String(s.name || "?").charAt(0)) + "</div>";
    d.innerHTML = offBadge + img +
      '<button class="fav-btn" title="Favorite">' + (isFav(s.id) ? "&#10084;" : "&#9825;") + "</button>" +
      '<div class="pop-info"><strong>' + esc(s.name) + "</strong>" +
      "<span>" + rs(svcPrice(s)) + (s.discount_percent > 0 ? ' <s class="old-price">' + rs(s.price) + "</s>" : "") +
      " • " + (s.duration_min || 30) + " min</span></div>";
    d.querySelector(".fav-btn").addEventListener("click", function(e){
      e.stopPropagation();
      toggleFav(s.id, this);
    });
    d.addEventListener("click", function(){ showServiceDetail(s.id); });
    return d;
  }

  function renderPopular(){
    var row = document.getElementById("popularRow");
    if (!row) return;
    row.innerHTML = "";
    var list = svcList().filter(function(s){ return s.is_featured; }).slice(0, 10);
    if (!list.length) list = svcList().slice(0, 10);
    list.forEach(function(s){ row.appendChild(svcCardEl(s)); });
  }

  function renderRecommended(){
    var sec = document.getElementById("recoSection");
    var row = document.getElementById("recoRow");
    if (!sec || !row) return;
    sec.style.display = "none";
    var s = Auth.current();
    if (!s) return;
    var cr0 = Auth.creds();
    if (!cr0 || !cr0.hash) return;
    Promise.all([DB.getFavorites(cr0.phone, cr0.hash), DB.getBookingsByPhone(cr0.phone, cr0.hash)]).then(function(r){
      var favIds = (r[0] || []).map(function(x){ return String(x.service_id); });
      var bookings = r[1] || [];
      var bookedIds = {}, bookedCats = {};
      bookings.forEach(function(b){
        if (b.service_id){
          bookedIds[String(b.service_id)] = true;
          var sv1 = findSvcById(b.service_id);
          if (sv1) bookedCats[sv1.category] = true;
        }
        var sv2 = findSvcByName(b.service_name);
        if (sv2){ bookedIds[String(sv2.id)] = true; bookedCats[sv2.category] = true; }
      });
      var all = svcList();
      var picks = [];
      favIds.forEach(function(fid){
        if (picks.length >= 6) return;
        var svc = all.filter(function(x){ return String(x.id) === fid; })[0];
        if (svc) picks.push(svc);
      });
      all.forEach(function(svc){
        if (picks.length >= 6) return;
        if (bookedIds[String(svc.id)]) return;
        if (picks.indexOf(svc) >= 0) return;
        if (bookedCats[svc.category]) picks.push(svc);
      });
      if (!picks.length) return;
      row.innerHTML = "";
      picks.forEach(function(svc){ row.appendChild(svcCardEl(svc)); });
      sec.style.display = "";
    }).catch(function(){ /* stay hidden */ });
  }

  var offersRetried = false;
  function renderOffers(){
    var sec = document.getElementById("offersSection");
    var list = document.getElementById("offersList");
    if (!sec || !list) return;
    sec.style.display = "none";
    DB.getOffers().then(function(rows){
      if (!rows || !rows.length){
        /* cold-start / slow-net race (banner wali hi fix): ek dafa dobara
           koshish, taake active offer section se kabhi miss na ho */
        if (!offersRetried){
          offersRetried = true;
          setTimeout(renderOffers, 3000);
        }
        return;
      }
      offersRetried = false;
      list.innerHTML = "";
      rows.forEach(function(o){
        var d = document.createElement("div");
        /* v6.2 fix: bina picture wali offer ka card pehle zero-height ho kar
           ghayab ho jata tha (body absolute thi, height sirf img se aati
           thi) — ab noimg class ke saath poora card banta hai */
        d.className = "offer-slide" + (o.image_url ? "" : " noimg");
        d.innerHTML =
          (o.image_url ? '<img src="' + o.image_url + '" alt="" onerror="this.style.display=\'none\'">' : "") +
          '<div class="offer-slide-body"><strong>' + esc(o.title) + "</strong>" +
          (o.discount_text ? '<span class="offer-code">' + esc(o.discount_text) + "</span>" : "") +
          (o.valid_till ? "<small>Valid till " + fmtDate(o.valid_till) + "</small>" : "") +
          "</div>";
        d.addEventListener("click", function(){ showOffer(o); });
        list.appendChild(d);
      });
      sec.style.display = "";
    }).catch(function(){ /* stay hidden */ });
  }

  function showOffer(o){
    openModal(
      '<h3 class="sec-title">' + esc(o.title) + "</h3>" +
      (o.image_url ? '<img src="' + o.image_url + '" style="width:100%;border-radius:12px;margin-bottom:10px" alt="">' : "") +
      (o.discount_text ? '<p style="margin-bottom:8px"><span class="offer-code">' + esc(o.discount_text) + "</span></p>" : "") +
      "<p>" + esc(o.description || "") + "</p>" +
      (o.terms ? '<p class="muted" style="margin-top:8px"><strong>Terms:</strong> ' + esc(o.terms) + "</p>" : "") +
      (o.valid_till ? '<p class="muted">Valid till ' + fmtDate(o.valid_till) + "</p>" : "") +
      '<button class="btn btn-gold btn-block" id="offerClose">Close</button>'
    );
    document.getElementById("offerClose").onclick = closeModal;
  }

  /* ---------- v6.0: Offers button in Services + full Offers page ----------
     adeel's order: Services mein ek Offers button ho — customer wahan se
     SAARI active offers (ek ya zyada) dekh sake. */
  function refreshOffersBtn(){
    var btn = document.getElementById("svcOffersBtn");
    if (!btn) return;
    DB.getOffers().then(function(rows){
      var n = (rows || []).length;
      btn.style.display = n ? "" : "none";
      var c = document.getElementById("svcOffersCount");
      if (c) c.textContent = n ? "(" + n + ")" : "";
    }).catch(function(){ /* keep as-is */ });
  }

  function renderOffersPage(){
    var list = document.getElementById("offersPageList");
    if (!list) return;
    list.innerHTML = "<p>Loading...</p>";
    DB.getOffers().then(function(rows){
      list.innerHTML = "";
      if (!rows || !rows.length){
        list.innerHTML = '<div class="empty">No offers right now — please check again soon.</div>';
        return;
      }
      rows.forEach(function(o){
        var d = document.createElement("div");
        d.className = "offer-full-card";
        d.innerHTML =
          (o.image_url ? '<img src="' + o.image_url + '" alt="" onerror="this.style.display=\'none\'">' : "") +
          '<div class="ofc-body">' +
          (o.discount_text ? '<span class="offer-code">' + esc(o.discount_text) + "</span>" : "") +
          "<strong>" + esc(o.title) + "</strong>" +
          (o.description ? "<p>" + esc(o.description) + "</p>" : "") +
          (o.valid_till ? '<p class="muted">Valid till ' + fmtDate(o.valid_till) + "</p>" : "") +
          '<button class="btn btn-gold btn-block ofc-book">Book Appointment</button>' +
          "</div>";
        d.querySelector(".ofc-book").addEventListener("click", function(ev){
          ev.stopPropagation();
          gotoPage("booking");
        });
        d.addEventListener("click", function(){ showOffer(o); });
        list.appendChild(d);
      });
    }).catch(function(){
      list.innerHTML = '<div class="empty">Could not load offers — check your internet.</div>';
    });
  }
  window.openOffersPage = function(){
    renderOffersPage();
    gotoPage("offers");
  };

  /* ---------- v6.0: Deals button in Services + full Deals page ----------
     Offers se ALAG button/page (adeel's order): Deals button par sirf
     package deals show hongi. */
  function refreshDealsBtn(){
    var btn = document.getElementById("svcDealsBtn");
    if (!btn) return;
    DB.getDeals().then(function(rows){
      var n = (rows || []).length;
      btn.style.display = n ? "" : "none";
      var c = document.getElementById("svcDealsCount");
      if (c) c.textContent = n ? "(" + n + ")" : "";
    }).catch(function(){ /* keep as-is */ });
  }

  function renderDealsPage(){
    var list = document.getElementById("dealsPageList");
    if (!list) return;
    list.innerHTML = "<p>Loading...</p>";
    DB.getDeals().then(function(rows){
      DEALS = rows || [];
      list.innerHTML = "";
      if (!DEALS.length){
        list.innerHTML = '<div class="empty">No package deals right now — please check again soon.</div>';
        return;
      }
      DEALS.forEach(function(dl){ list.appendChild(dealCard(dl)); });
    }).catch(function(){
      list.innerHTML = '<div class="empty">Could not load deals — check your internet.</div>';
    });
  }
  window.openDealsPage = function(){
    renderDealsPage();
    gotoPage("deals");
  };

  function renderUpcomingCard(){
    var card = document.getElementById("upcomingCard");
    if (!card) return;
    card.style.display = "none";
    var s = Auth.current();
    if (!s) return;
    var crU = Auth.creds();
    if (!crU || !crU.hash) return;
    DB.getBookingsByPhone(s.phone, crU.hash).then(function(rows){
      var today = new Date().toISOString().slice(0, 10);
      var next = (rows || []).filter(function(b){
        return (b.status === "pending" || b.status === "confirmed") && b.booking_date >= today;
      }).sort(function(a, b){
        var ka = a.booking_date + a.time_slot, kb = b.booking_date + b.time_slot;
        return ka < kb ? -1 : (ka > kb ? 1 : 0);
      })[0];
      if (!next) return;
      card.innerHTML =
        '<div class="up-head"><span class="up-label">Upcoming Appointment</span>' +
        (next.ref_code ? '<span class="ref-chip">' + esc(next.ref_code) + "</span>" : "") + "</div>" +
        "<strong>" + esc(next.service_name) + "</strong>" +
        "<p>" + fmtDate(next.booking_date) + " • " + fmtSlot(next.time_slot) + "</p>" +
        '<button class="btn btn-outline btn-block" id="upViewBtn">View</button>';
      card.style.display = "";
      document.getElementById("upViewBtn").addEventListener("click", function(){
        renderProfile();
        gotoPage("profile");
      });
    }).catch(function(){ /* stay hidden */ });
  }

  function applyInstagram(url){
    var els = [document.getElementById("instaBtn")].filter(Boolean);
    document.querySelectorAll('a[href*="instagram.com"]').forEach(function(a){ els.push(a); });
    els.forEach(function(a){ a.href = url; });
  }

  function loadInstagram(){
    DB.getSetting("instagram_url").then(function(v){
      applyInstagram(v || CFG.DEFAULT_INSTAGRAM || CFG.SALON.instagram);
    }).catch(function(){ applyInstagram(CFG.DEFAULT_INSTAGRAM || CFG.SALON.instagram); });
  }

  /* luxury animated banner: newest active offer pinned at the very top */
  var topOfferRetried = false;
  function renderTopOffer(){
    var bar = document.getElementById("topOffer");
    if (!bar) return;
    bar.style.display = "none";
    bar.classList.remove("to-show");
    DB.getOffers().then(function(rows){
      var o = (rows || [])[0];
      if (!o){
        /* cold-start race: the offers fetch can fail/return empty before the
           network is warm — retry ONCE shortly after so an active offer is
           never silently missing for the whole session */
        if (!topOfferRetried){
          topOfferRetried = true;
          setTimeout(renderTopOffer, 3000);
        }
        return;
      }
      topOfferRetried = false;
      document.getElementById("toPercent").textContent = o.discount_text || "SPECIAL OFFER";
      document.getElementById("toTitle").textContent = o.title || "";
      document.getElementById("toValid").textContent = o.valid_till ? ("Valid till " + fmtDate(o.valid_till)) : "";
      var sp = document.getElementById("toSparkles");
      sp.innerHTML = "";
      var chars = ["\u2726", "\u2727", "\u2605", "\u2726", "\u2727"];
      for (var i = 0; i < 12; i++){
        var s = document.createElement("span");
        s.textContent = chars[i % chars.length];
        s.style.left = (4 + Math.random() * 92) + "%";
        s.style.top = (6 + Math.random() * 78) + "%";
        s.style.fontSize = (10 + Math.random() * 12) + "px";
        s.style.animationDelay = (Math.random() * 2.2).toFixed(2) + "s";
        sp.appendChild(s);
      }
      bar.style.display = "";
      void bar.offsetWidth; /* restart entrance animation */
      bar.classList.add("to-show");
      bar.onclick = function(){ showOffer(o); };
    }).catch(function(){ /* stay hidden */ });
  }

  /* one luxury banner for ALL services on percent-off (never separate banners) */
  function renderSvcOffers(){
    var bar = document.getElementById("topSvcOffer");
    if (!bar) return;
    bar.style.display = "none";
    bar.classList.remove("to-show");
    var list = svcList().filter(function(s){
      return s && s.active !== false && ((s.discount_percent | 0) > 0);
    }).sort(function(a, b){ return (b.discount_percent | 0) - (a.discount_percent | 0); });
    if (!list.length) return;
    var eb = document.getElementById("toSvcEyebrow");
    var pc = document.getElementById("toSvcPercent");
    var tt = document.getElementById("toSvcTitle");
    var ls = document.getElementById("toSvcList");
    ls.innerHTML = "";
    if (list.length === 1){
      var s0 = list[0];
      eb.textContent = "Special Discount";
      pc.textContent = s0.discount_percent + "% OFF";
      tt.textContent = s0.name;
      tt.style.display = "";
      ls.style.display = "none";
    } else {
      eb.textContent = list.length + " Services on Sale";
      pc.textContent = "UP TO " + (list[0].discount_percent | 0) + "% OFF";
      tt.style.display = "none";
      ls.style.display = "";
      list.slice(0, 4).forEach(function(s){
        var r = document.createElement("div");
        r.className = "to-svcrow";
        r.innerHTML = "<span>" + esc(s.name) + "</span><strong>" + s.discount_percent + "% OFF</strong>";
        ls.appendChild(r);
      });
      if (list.length > 4){
        var m = document.createElement("div");
        m.className = "to-svcmore";
        m.textContent = "+" + (list.length - 4) + " more — tap to see all";
        ls.appendChild(m);
      }
    }
    var sp = document.getElementById("toSvcSparkles");
    sp.innerHTML = "";
    var chars = ["\u2726", "\u2727", "\u2605", "\u2726", "\u2727"];
    for (var i = 0; i < 12; i++){
      var spn = document.createElement("span");
      spn.textContent = chars[i % chars.length];
      spn.style.left = (4 + Math.random() * 92) + "%";
      spn.style.top = (6 + Math.random() * 78) + "%";
      spn.style.fontSize = (10 + Math.random() * 12) + "px";
      spn.style.animationDelay = (Math.random() * 2.2).toFixed(2) + "s";
      sp.appendChild(spn);
    }
    bar.style.display = "";
    void bar.offsetWidth;
    bar.classList.add("to-show");
    bar.onclick = function(){ showSvcOffers(list); };
  }

  function closeLuxModal(){
    var ov = document.getElementById("luxOv");
    if (ov) ov.remove();
  }

  /* animated luxury list of every discounted service */
  function showSvcOffers(list){
    closeLuxModal();
    var rows = list.map(function(s, i){
      var d = Math.min(90, s.discount_percent | 0);
      var ep = Math.round(s.price * (100 - d) / 100);
      return '<div class="lux-row" style="animation-delay:' + (0.07 * i).toFixed(2) + 's">' +
        '<div class="lux-row-main"><strong>' + esc(s.name) + "</strong>" +
        "<span>" + rs(ep) + ' <s>' + rs(s.price) + "</s></span></div>" +
        '<div class="lux-pct">' + d + "%<small>OFF</small></div></div>";
    }).join("");
    var ov = document.createElement("div");
    ov.className = "lux-ov";
    ov.id = "luxOv";
    ov.innerHTML =
      '<div class="lux-card">' +
      '<div class="to-sparkles" id="luxSparkles"></div>' +
      '<div class="to-shine"></div>' +
      '<div class="lux-eyebrow">Limited Time</div>' +
      '<h3 class="lux-title">Services on Sale</h3>' +
      '<div class="lux-list">' + rows + "</div>" +
      '<button class="btn btn-gold btn-block" id="luxClose">Close</button></div>';
    document.body.appendChild(ov);
    var lsp = document.getElementById("luxSparkles");
    var chars = ["\u2726", "\u2727", "\u2605"];
    for (var j = 0; j < 10; j++){
      var spn = document.createElement("span");
      spn.textContent = chars[j % chars.length];
      spn.style.left = (5 + Math.random() * 90) + "%";
      spn.style.top = (5 + Math.random() * 85) + "%";
      spn.style.fontSize = (10 + Math.random() * 10) + "px";
      spn.style.animationDelay = (Math.random() * 2).toFixed(2) + "s";
      lsp.appendChild(spn);
    }
    document.getElementById("luxClose").onclick = closeLuxModal;
    ov.addEventListener("click", function(e){ if (e.target === ov) closeLuxModal(); });
  }

  /* ---------- Download App: QR code + link (always the latest published APK) ---------- */
  var FALLBACK_APK_URL = "https://cdn.jsdelivr.net/gh/adimirza9977/kashish-beauty-salon@f46f2f06cc88d1be08145f774788fefe4d56f83b/KashishBeautySalon.apk";
  function renderShareApp(){
    var box = document.getElementById("qrCode");
    if (!box) return;
    DB.getSetting("latest_apk_url").catch(function(){ return ""; }).then(function(url){
      var link = url || FALLBACK_APK_URL;
      box.innerHTML = "";
      try {
        if (typeof QRCode !== "undefined"){
          new QRCode(box, { text: link, width: 200, height: 200,
            colorDark: "#3a1b2d", colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M });
        } else {
          box.innerHTML = '<p class="muted">QR unavailable</p>';
        }
      } catch(e){
        box.innerHTML = '<p class="muted">QR unavailable</p>';
      }
      var lt = document.getElementById("qrLinkText");
      if (lt) lt.textContent = link;
      var wb = document.getElementById("qrWaBtn");
      if (wb) wb.href = "whatsapp://send?text=" +
        encodeURIComponent("Download the Kashish Beauty Salon app: " + link);
    });
    var cb = document.getElementById("qrCopyBtn");
    if (cb && !cb.dataset.bound){
      cb.dataset.bound = "1";
      cb.addEventListener("click", function(){
        var t = (document.getElementById("qrLinkText") || {}).textContent || "";
        if (!t){ toast("Link not ready yet"); return; }
        var ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); toast("Link copied"); }
        catch(e){ toast("Copy failed — long-press the link"); }
        document.body.removeChild(ta);
      });
    }
  }

  function renderHome(){
    var hc = document.getElementById("homeCats");
    hc.innerHTML = "";
    CATEGORIES.forEach(function(c){
      var d = document.createElement("button");
      d.className = "chip";
      d.innerHTML = c.icon + " " + c.name;
      d.addEventListener("click", function(){ gotoPage("services"); });
      hc.appendChild(d);
    });
    renderPopular();
    renderRecommended();
    renderOffers();
    renderDeals();
    renderTopBeauticians();
    renderTopOffer();
    renderSvcOffers();
    renderShareApp();
    renderUpcomingCard();
    renderGalleryInto(document.getElementById("galPreview"), galRows(), 6);
    renderGalTabs();
    renderGalGrid();
  }

  /* ---------- services ---------- */
  var activeCat = "all";
  function svcList(){
    return DB_SERVICES.length ? DB_SERVICES : SERVICES.map(function(s, i){
      return { id: "local-" + i, name: s.name, price: s.price,
               duration_min: s.dur || 30, category: s.cat,
               description: s.desc || "" };
    });
  }

  function renderServices(){
    var tabs = document.getElementById("catTabs");
    tabs.innerHTML = "";
    var all = document.createElement("button");
    all.className = "cat-tab" + (activeCat === "all" ? " active" : "");
    all.textContent = "All";
    all.onclick = function(){ activeCat = "all"; renderServices(); };
    tabs.appendChild(all);
    CATEGORIES.forEach(function(c){
      var b = document.createElement("button");
      b.className = "cat-tab" + (activeCat === c.id ? " active" : "");
      b.textContent = c.icon + " " + c.name;
      b.onclick = function(){ activeCat = c.id; renderServices(); };
      tabs.appendChild(b);
    });

    var q = document.getElementById("svcSearch").value.trim().toLowerCase();
    var list = document.getElementById("svcList");
    list.innerHTML = "";
    var any = false;
    var cats = activeCat === "all" ? CATEGORIES.map(function(c){ return c.id; }) : [activeCat];
    cats.forEach(function(cid){
      var items = svcList().filter(function(s){
        if (s.category !== cid) return false;
        if (q && (s.name + " " + (s.description || "")).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      if (!items.length) return;
      any = true;
      var h = document.createElement("div");
      h.className = "svc-cat"; h.textContent = catName(cid);
      list.appendChild(h);
      items.forEach(function(s){
        var d = document.createElement("div");
        d.className = "svc";
        var info = document.createElement("div");
        info.className = "svc-info";
        info.innerHTML = "<strong>" + s.name + "</strong>" +
          (s.description ? "<span>" + s.description + "</span>" : "");
        info.style.cursor = "pointer";
        info.onclick = function(){ showServiceDetail(s.id); };
        var pr = document.createElement("div");
        pr.className = "svc-price";
        pr.innerHTML = rs(s.price) + " <small>• " + (s.duration_min || 30) + " min</small>";
        var fav = document.createElement("button");
        fav.className = "fav-btn";
        fav.title = "Favorite";
        fav.innerHTML = isFav(s.id) ? "&#10084;" : "&#9825;";
        fav.onclick = function(e){ e.stopPropagation(); toggleFav(s.id, fav); };
        var btn = document.createElement("button");
        btn.className = "book-btn"; btn.textContent = "Book";
        btn.onclick = function(){ Booking.startForService(s.id); };
        d.appendChild(info); d.appendChild(pr); d.appendChild(fav); d.appendChild(btn);
        list.appendChild(d);
      });
    });
    if (!any) list.innerHTML = '<div class="empty">No services found. Try another search.</div>';
  }

  /* ---------- v4: service details screen ---------- */
  function showServiceDetail(id){
    var s = findSvcById(id);
    if (!s) return;
    var body = document.getElementById("sdetBody");
    body.innerHTML = "<p style='padding:16px'>Loading...</p>";
    gotoPage("sdetail");
    window.scrollTo(0, 0);
    var revP = (String(s.id).indexOf("local-") === 0)
      ? Promise.resolve([])
      : DB.getServiceReviews(s.id);
    var imgP = (String(s.id).indexOf("local-") === 0)
      ? Promise.resolve([])
      : DB.getServiceImages(s.id);
    Promise.all([revP, imgP]).then(function(rr){
      var revs = rr[0];
      var simgs = rr[1] || [];
      var count = revs.length;
      var avg = count ? revs.reduce(function(a, r){ return a + (r.rating || 0); }, 0) / count : 0;
      var starsHtml = count
        ? '<span class="stars">' + starRow(Math.round(avg)) + '</span> <span class="muted">' +
          avg.toFixed(1) + " (" + count + " review" + (count > 1 ? "s" : "") + ")</span>"
        : '<span class="muted">No reviews yet — be the first!</span>';
      var h = "";
      h += '<div class="sdet-hero">' +
             (s.image_url ? '<img src="' + s.image_url + '" alt="" onerror="this.style.display=\'none\'">' : "") +
             '<button class="fav-btn sdet-fav" id="sdetFav" title="Favorite">' +
               (isFav(s.id) ? "&#10084;" : "&#9825;") + "</button></div>";
      h += '<div class="sdet-body">';
      h += "<h2>" + esc(s.name) + "</h2>";
      h += '<div class="sdet-stars">' + starsHtml + "</div>";
      h += '<p class="sdet-price">' + rs(s.price) + " <span>• " + (s.duration_min || 30) + " min</span></p>";
      if (s.description) h += '<p class="sdet-desc">' + esc(s.description) + "</p>";
      var pics = [];
      if (s.image_url) pics.push(s.image_url);
      simgs.forEach(function(im){ if (im.image_url && pics.indexOf(im.image_url) < 0) pics.push(im.image_url); });
      if (pics.length){
        h += '<h3 class="sec-title">Pictures</h3><div class="sdet-pics">' +
          pics.map(function(u){ return '<img src="' + esc(u) + '" alt="" data-pic="' + esc(u) + '">'; }).join("") + "</div>";
      }
      h += '<h3 class="sec-title">Good to know</h3><ul class="sdet-tips">' +
           "<li>Please arrive 10 minutes before your appointment</li>" +
           "<li>Free cancellation up to 24 hours before</li>" +
           "<li>Patch test available on request for color &amp; skin treatments</li></ul>";
      h += '<button class="btn btn-gold btn-block" id="sdetBook">Book Now</button>';
      h += '<button class="btn btn-wa btn-block" id="sdetShare">Share on WhatsApp</button>';
      if (count) h += '<h3 class="sec-title" style="margin-top:18px">Customer Reviews</h3><div id="sdetRevs"></div>';
      h += "</div>";
      body.innerHTML = h;
      document.getElementById("sdetFav").addEventListener("click", function(){
        toggleFav(s.id, this);
      });
      document.getElementById("sdetBook").addEventListener("click", function(){
        Booking.startForService(s.id);
      });
      document.getElementById("sdetShare").addEventListener("click", function(){
        shareItem("service", s);
      });
      body.querySelectorAll("[data-pic]").forEach(function(im){
        im.addEventListener("click", function(){
          openLightbox({ image_url: im.getAttribute("data-pic"), media_type: "image", caption: s.name });
        });
      });
      if (count){
        var rw = document.getElementById("sdetRevs");
        revs.slice(0, 10).forEach(function(r){
          var d = document.createElement("div");
          d.className = "review-card";
          d.innerHTML = '<div class="rev-head"><strong>' + esc(firstName(r.customer_name)) + "</strong>" +
                        '<span class="stars">' + starRow(r.rating || 0) + "</span></div>" +
                        (r.review ? "<p>" + esc(r.review) + "</p>" : "");
          rw.appendChild(d);
        });
      }
    }).catch(function(){
      body.innerHTML = "<p style='padding:16px'>Could not load details.</p>";
    });
  }

  /* ---------- loyalty page ---------- */
  function initLoyalty(){
    DB.getLoyaltyConfig().then(function(c){
      var ul = document.getElementById("loyalRules");
      ul.innerHTML =
        "<li>Earn <strong>" + c.points_per_100rs + " point(s)</strong> for every Rs.100 you spend</li>" +
        "<li><strong>" + c.redeem_points + " points = " + rs(c.redeem_value_rs) + " off</strong> your next booking</li>" +
        "<li>You need at least <strong>" + c.min_redeem_points + " points</strong> to redeem</li>" +
        "<li>Just give your mobile number when booking — points add automatically</li>";
    }).catch(function(){});
    document.getElementById("loyalCheck").addEventListener("click", function(){
      var crL = Auth.creds();
      var phone = crL ? crL.phone : normPhone(document.getElementById("loyalPhone").value);
      if (!phone || !crL || !crL.hash){ toast("Please login to check points"); return; }
      DB.getCustomerAuth(phone, crL.hash).then(function(c){
        var box = document.getElementById("loyalResult");
        box.style.display = "";
        document.getElementById("loyalPts").textContent = c ? (c.loyalty_points || 0) : 0;
        if (!c) toast("No record found for this number yet");
      }).catch(function(){ toast("Could not check — check internet"); });
    });
  }

  /* ---------- database init + seed ---------- */
  function initDB(){
    DB.ping().then(function(st){
      if (st === "no-tables"){
        toast("Database tables not ready yet");
        return;
      }
      return DB.getServices().then(function(rows){
        if (rows && rows.length){
          DB_SERVICES = rows;
        } else if (CFG.SEED_ON_EMPTY){
          // first launch: seed default services, then reload
          return DB.seedServices(SERVICES).then(function(){
            return DB.getServices().then(function(r2){ DB_SERVICES = r2 || []; });
          });
        }
      });
    }).then(function(){
      renderServices();
      Booking.refreshServices();
      // home cards (Popular / Recommended) may have rendered from the local
      // fallback before the network fetch finished — re-render with DB data
      // so service pictures appear (or fall back to letters if none set)
      renderPopular();
      renderRecommended();
      // v6.0 fix: banners rendered at boot used the local fallback (no
      // discount data, offers not yet fetched) — re-render them now that
      // the real data is here, so an active offer / % discount ALWAYS shows
      renderTopOffer();
      renderSvcOffers();
      renderOffers();
      refreshOffersBtn();
      refreshDealsBtn();
    }).catch(function(){
      // offline or tables missing — use local list
      renderServices();
      Booking.refreshServices();
    });
  }

  /* ---------- profile / auth (v3) ---------- */
  function statusPillUser(s){
    var map = { pending: "status-pending", confirmed: "status-confirmed",
                completed: "status-completed", cancelled: "status-cancelled" };
    return '<span class="bk-status ' + (map[s] || "status-pending") + '">' + s + '</span>';
  }

  /* ---------- v4 profile: tabs, ratings, favorites, notifications ---------- */
  var profTab = "upcoming";

  function renderProfile(){
    var s = Auth.current();
    document.getElementById("profileLoggedOut").style.display = s ? "none" : "";
    document.getElementById("profileLoggedIn").style.display = s ? "" : "none";
    if (!s) return;
    document.getElementById("profName").textContent = "Welcome, " + s.name;
    document.getElementById("profPhone").textContent = s.phone;
    var pe = document.getElementById("profEmail");
    if (s.email){ pe.textContent = s.email; pe.style.display = ""; }
    else { pe.style.display = "none"; }
    renderMyBookings(s);
    renderFavSection();
    initNotifToggles();
    var crP = Auth.creds();
    if (crP && crP.hash){
      DB.getCustomerAuth(s.phone, crP.hash).then(function(c){
        document.getElementById("profPoints").textContent = c ? (c.loyalty_points || 0) : 0;
      }).catch(function(){});
    }
  }

  function renderMyBookings(s){
    var wrap = document.getElementById("myBookings");
    wrap.innerHTML = "<p>Loading...</p>";
    var crM = Auth.creds();
    if (!crM || !crM.hash){ wrap.innerHTML = "<p>Please login again.</p>"; return; }
    DB.getBookingsByPhone(s.phone, crM.hash).then(function(rows){
      document.getElementById("profBookings").textContent = (rows || []).length;
      var today = new Date().toISOString().slice(0, 10);
      var list = (rows || []).filter(function(b){
        if (profTab === "upcoming") return (b.status === "pending" || b.status === "confirmed") && b.booking_date >= today;
        if (profTab === "completed") return b.status === "completed";
        return b.status === "cancelled";
      });
      wrap.innerHTML = "";
      if (!list.length){
        wrap.innerHTML = '<div class="empty">No ' + profTab + " bookings.</div>";
        return;
      }
      list.forEach(function(b){
        var d = document.createElement("div");
        d.className = "bk-item";
        d.innerHTML =
          '<div class="bk-head"><strong>' + esc(b.service_name) + "</strong>" + statusPillUser(b.status) + "</div>" +
          '<div class="bk-meta">' + fmtDate(b.booking_date) + " • " + fmtSlot(b.time_slot) +
          " • " + rs(b.price) +
          (b.ref_code ? '<br><span class="ref-chip">' + esc(b.ref_code) + "</span>" : "") + "</div>" +
          '<div class="bk-actions"></div>';
        var acts = d.querySelector(".bk-actions");
        function ab(label, fn){
          var x = document.createElement("button");
          x.className = "mini-btn"; x.textContent = label;
          x.onclick = fn;
          acts.appendChild(x);
        }
        if (profTab === "upcoming"){
          ab("Reschedule", function(){ Booking.reschedule(b.ref_code, b.booking_date, b.time_slot); });
          ab("Cancel Booking", function(){
            if (!confirm("Cancel this booking?")) return;
            var cr2 = Auth.creds();
            DB.cancelBooking(b.ref_code, s.phone, cr2 && cr2.hash).then(function(ok){
              if (!ok){ toast("Could not cancel"); return; }
              toast("Booking cancelled");
              renderMyBookings(s);
              renderUpcomingCard();
            }).catch(function(){ toast("Failed — check internet"); });
          });
        }
        if (profTab === "completed"){
          ab(b.rating ? "Update Rating" : "Rate", function(){ openRateModal(b, s); });
          ab("Rebook", function(){
            if (b.service_id){ Booking.startForService(b.service_id); return; }
            var dl = DEALS.filter(function(x){ return x.name === b.service_name; })[0];
            if (dl){ Booking.startForDeal(dl); return; }
            var sv = findSvcByName(b.service_name);
            if (sv){ Booking.startForService(sv.id); return; }
            toast("Yeh ab available nahi hai");
          });
        }
        wrap.appendChild(d);
      });
    }).catch(function(){ wrap.innerHTML = "<p>Could not load. Check internet.</p>"; });
  }

  function openRateModal(b, s){
    var cur = b.rating || 0;
    openModal(
      '<h3 class="sec-title">Rate your visit</h3>' +
      '<p class="muted" style="margin-bottom:8px">' + esc(b.service_name) + "</p>" +
      '<div class="stars" id="rateStars"></div>' +
      '<div class="form-group" style="margin-top:10px"><label>Review (optional)</label>' +
      '<textarea id="rateText" rows="3" placeholder="How was your experience?"></textarea></div>' +
      '<button class="btn btn-gold btn-block" id="rateSave">Save Rating</button>' +
      '<button class="btn btn-outline btn-block" id="rateCancel">Cancel</button>'
    );
    var box = document.getElementById("rateStars");
    function paint(){
      box.innerHTML = "";
      for (var i = 1; i <= 5; i++){
        (function(i){
          var st = document.createElement("button");
          st.type = "button";
          st.className = "star-btn" + (i <= cur ? " on" : "");
          st.innerHTML = "&#9733;";
          st.onclick = function(){ cur = i; paint(); };
          box.appendChild(st);
        })(i);
      }
    }
    paint();
    document.getElementById("rateText").value = b.review || "";
    document.getElementById("rateCancel").onclick = closeModal;
    document.getElementById("rateSave").onclick = function(){
      if (!cur){ toast("Please tap the stars to rate"); return; }
      var txt = document.getElementById("rateText").value.trim();
      toast("Saving...");
      var crR = Auth.creds();
      DB.rateBooking(b.ref_code, s.phone, crR && crR.hash, cur, txt).then(function(ok){
        if (!ok){ toast("Could not save rating"); return; }
        closeModal();
        toast("Thanks for your feedback!");
        renderMyBookings(s);
      }).catch(function(){ toast("Failed — check internet"); });
    };
  }

  function renderFavSection(){
    var sec = document.getElementById("favSection");
    var list = document.getElementById("favList");
    if (!sec || !list) return;
    sec.style.display = "none";
    var s = Auth.current();
    if (!s || !FAVS.length) return;
    var items = svcList().filter(function(x){ return FAVS.indexOf(String(x.id)) >= 0; });
    if (!items.length) return;
    list.innerHTML = "";
    items.forEach(function(svc){
      var d = document.createElement("div");
      d.className = "svc";
      d.innerHTML = '<div class="svc-info"><strong>' + esc(svc.name) + "</strong></div>" +
        '<div class="svc-price">' + rs(svc.price) + "</div>" +
        '<button class="fav-btn" title="Remove">&#10084;</button>';
      d.querySelector(".svc-info").style.cursor = "pointer";
      d.querySelector(".svc-info").onclick = function(){ showServiceDetail(svc.id); };
      d.querySelector(".fav-btn").onclick = function(){ toggleFav(svc.id, null); };
      list.appendChild(d);
    });
    sec.style.display = "";
  }

  function initNotifToggles(){
    function get(k, def){
      try { var v = localStorage.getItem("kashish_notif_" + k); return v === null ? def : v === "1"; }
      catch(e){ return def; }
    }
    function set(k, v){
      try { localStorage.setItem("kashish_notif_" + k, v ? "1" : "0"); } catch(e){}
    }
    var r = document.getElementById("ntfRemind"), o = document.getElementById("ntfOffers");
    if (!r || !o) return;
    r.checked = get("remind", true);
    o.checked = get("offers", true);
    r.onchange = function(){ set("remind", r.checked); toast(r.checked ? "Reminders ON" : "Reminders OFF"); };
    o.onchange = function(){ set("offers", o.checked); toast(o.checked ? "Offers updates ON" : "Offers updates OFF"); };
  }

  function initProfileExtras(){
    document.querySelectorAll("#profBkTabs .cat-tab").forEach(function(t){
      t.onclick = function(){
        document.querySelectorAll("#profBkTabs .cat-tab").forEach(function(x){ x.classList.remove("active"); });
        t.classList.add("active");
        profTab = t.getAttribute("data-pt");
        var s = Auth.current();
        if (s) renderMyBookings(s);
      };
    });
    document.getElementById("privacyLink").addEventListener("click", function(e){
      e.preventDefault(); gotoPage("privacy");
    });
    document.getElementById("delAccountLink").addEventListener("click", function(){
      var s = Auth.current();
      if (!s) return;
      if (!confirm("Delete your account permanently? This cannot be undone.")) return;
      if (!confirm("Last chance — delete " + s.name + "'s account and all data?")) return;
      toast("Deleting...");
      DB.deleteCustomer(s.id).then(function(){
        Auth.logout();
        FAVS = [];
        toast("Account deleted");
        renderProfile();
        renderHome();
        gotoPage("home");
      }).catch(function(){ toast("Failed — check internet"); });
    });
  }

  function initAuth(){
    document.getElementById("loginBtn").addEventListener("click", function(){
      var phone = normPhone(document.getElementById("loginPhone").value);
      var pass = document.getElementById("loginPass").value;
      if (!phone){ toast("Enter a valid mobile number"); return; }
      if (!pass){ toast("Enter your password"); return; }
      toast("Logging in...");
      Auth.login(phone, pass).then(function(s){
        toast("Welcome, " + s.name + "!");
        document.getElementById("loginPass").value = "";
        renderProfile();
        loadFavs().then(function(){ renderHome(); });
        gotoPage("booking");
      }).catch(function(e){
        toast(e && e.message === "blocked"
          ? "This account has been blocked. Please contact the salon."
          : e && e.message === "invalid" ? "Wrong phone or password" : "Login failed — check internet");
      });
    });
    document.getElementById("gotoSignup").addEventListener("click", function(e){
      e.preventDefault(); gotoPage("signup");
    });
    document.getElementById("gotoLogin").addEventListener("click", function(e){
      e.preventDefault(); gotoPage("profile");
    });
    document.getElementById("signupBtn").addEventListener("click", function(){
      var name = document.getElementById("suName").value.trim();
      var phone = normPhone(document.getElementById("suPhone").value);
      var email = document.getElementById("suEmail").value.trim();
      var wa = normPhone(document.getElementById("suWa").value) || phone;
      var p1 = document.getElementById("suPass").value;
      var p2 = document.getElementById("suPass2").value;
      if (name.length < 2){ toast("Enter your name"); return; }
      if (!phone){ toast("Enter a valid mobile number"); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast("Enter a valid email or leave it empty"); return; }
      if (p1.length < 4){ toast("Password must be at least 4 characters"); return; }
      if (p1 !== p2){ toast("Passwords do not match"); return; }
      toast("Creating account...");
      Auth.signup(name, phone, wa, p1, email).then(function(s){
        toast("Welcome, " + s.name + "!");
        renderProfile();
        loadFavs().then(function(){ renderHome(); });
        gotoPage("booking");
      }).catch(function(e){
        toast(e && e.message === "phone-exists" ? "This number is already registered — please login" : "Signup failed — check internet");
      });
    });
    document.getElementById("logoutBtn").addEventListener("click", function(){
      Auth.logout();
      FAVS = [];
      toast("Logged out");
      renderProfile();
      renderHome();
    });
    /* ---------- edit profile ---------- */
    document.getElementById("editProfileBtn").addEventListener("click", function(){
      var s = Auth.current();
      if (!s) return;
      document.getElementById("epName").value = s.name || "";
      document.getElementById("epEmail").value = s.email || "";
      document.getElementById("epPhone").value = s.phone || "";
      document.getElementById("editProfileModal").classList.add("show");
    });
    document.getElementById("cancelProfileBtn").addEventListener("click", function(){
      document.getElementById("editProfileModal").classList.remove("show");
    });
    document.getElementById("saveProfileBtn").addEventListener("click", function(){
      var name = document.getElementById("epName").value.trim();
      var email = document.getElementById("epEmail").value.trim();
      if (name.length < 2){ toast("Enter your name"); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast("Enter a valid email or leave it empty"); return; }
      toast("Saving...");
      Auth.updateProfile(name, email).then(function(s){
        document.getElementById("editProfileModal").classList.remove("show");
        toast("Profile updated");
        renderProfile();
      }).catch(function(e){
        toast(e && e.message === "bad-name" ? "Enter a valid name" : "Failed — check internet");
      });
    });
  }

  /* ---------- forgot password (v3.1) ---------- */
  function initForgot(){
    document.getElementById("gotoForgot").addEventListener("click", function(e){
      e.preventDefault(); gotoPage("forgot");
    });
    document.getElementById("fgBackLogin").addEventListener("click", function(e){
      e.preventDefault(); gotoPage("profile");
    });
    document.getElementById("rsBackLogin").addEventListener("click", function(e){
      e.preventDefault(); gotoPage("profile");
    });
    document.getElementById("fgSendBtn").addEventListener("click", function(){
      var phone = normPhone(document.getElementById("fgPhone").value);
      if (!phone){ toast("Enter a valid mobile number"); return; }
      toast("Generating code...");
      DB.createResetOTP(phone).then(function(){
        document.getElementById("fgDone").style.display = "";
        document.getElementById("fgWaBtn").href =
          "whatsapp://send?phone=" + CFG.SALON.whatsapp +
          "&text=" + encodeURIComponent("Assalam-o-Alaikum! I forgot my Kashish Beauty Salon app password. My number is " + phone + ". Please send my reset code.");
        toast("Code generated");
      }).catch(function(e){
        toast(e && e.message === "no-account" ? "No account found for this number" : "Failed — check internet");
      });
    });
    document.getElementById("fgHasCodeBtn").addEventListener("click", function(){
      gotoPage("reset");
    });
    document.getElementById("rsBtn").addEventListener("click", function(){
      var phone = normPhone(document.getElementById("fgPhone").value);
      var otp = document.getElementById("rsOtp").value.trim();
      var p1 = document.getElementById("rsPass").value;
      var p2 = document.getElementById("rsPass2").value;
      if (!phone){ toast("Go back and enter your phone number first"); return; }
      if (otp.length !== 6){ toast("Enter the 6-digit code"); return; }
      if (p1.length < 4){ toast("Password must be at least 4 characters"); return; }
      if (p1 !== p2){ toast("Passwords do not match"); return; }
      toast("Resetting...");
      DB.sha256("kashish:" + p1).then(function(hash){
        return DB.resetPassword(phone, otp, hash);
      }).then(function(){
        toast("Password reset! Please login.");
        document.getElementById("rsOtp").value = "";
        document.getElementById("rsPass").value = "";
        document.getElementById("rsPass2").value = "";
        document.getElementById("fgDone").style.display = "none";
        gotoPage("profile");
      }).catch(function(e){
        toast(e && e.message === "invalid-otp" ? "Wrong or expired code" : "Reset failed — check internet");
      });
    });
  }

  /* ---------- in-app update notice (v3.2) ---------- */
  function checkForUpdate(){
    var banner = document.getElementById("updateBanner");
    if (!banner) return;
    Promise.all([
      DB.getSetting("latest_version_code"),
      DB.getSetting("latest_version"),
      DB.getSetting("latest_apk_url")
    ]).then(function(r){
      var remoteCode = parseInt(r[0] || "0", 10);
      var remoteVer = r[1] || "";
      var apkUrl = r[2] || "";
      if (!(remoteCode > (CFG.APP_VERSION_CODE || 0))) return;
      var dismissed = null;
      try{ dismissed = localStorage.getItem("kashish_update_dismissed"); }catch(e){}
      if (dismissed === String(remoteCode)) return;
      document.getElementById("updateText").textContent =
        "A new version (v" + remoteVer + ") of the app is available!";
      var btn = document.getElementById("updateBtn");
      if (apkUrl){ btn.href = apkUrl; btn.style.display = ""; }
      else { btn.style.display = "none"; }
      banner.style.display = "";
      document.getElementById("updateDismiss").onclick = function(){
        banner.style.display = "none";
        try{ localStorage.setItem("kashish_update_dismissed", String(remoteCode)); }catch(e){}
      };
    }).catch(function(){ /* offline — no notice */ });
  }

  /* ---------- public API for Owner panel ---------- */
  window.App = {
    applyInstagram: applyInstagram,
    renderProfile: renderProfile,
    renderHome: renderHome,
    openModal: openModal,
    closeModal: closeModal,
    detail: showServiceDetail,
    refreshOffers: function(){ renderOffers(); renderTopOffer(); refreshOffersBtn(); renderOffersPage(); },
    refreshDeals: function(){ renderDeals(); refreshDealsBtn(); renderDealsPage(); },
    refreshServices: function(){
      DB.getServices().then(function(rows){
        if (rows && rows.length) DB_SERVICES = rows;
        renderServices();
        renderPopular();
        renderRecommended();
        renderSvcOffers();
        if (typeof Booking !== "undefined") Booking.refreshServices();
      }).catch(function(){});
    },
    refreshGallery: function(){ loadGallery(); }
  };

  /* ---------- boot ---------- */
  loadFavs().then(function(){ renderHome(); });
  loadGallery();
  renderDeals();
  loadInstagram();
  checkForUpdate();
  document.getElementById("svcSearch").addEventListener("input", renderServices);
  document.getElementById("sdetBack").addEventListener("click", function(e){
    e.preventDefault(); gotoPage("services");
  });
  var sob = document.getElementById("svcOffersBtn");
  if (sob) sob.addEventListener("click", function(){ window.openOffersPage(); });
  var ofb = document.getElementById("offersBack");
  if (ofb) ofb.addEventListener("click", function(e){
    e.preventDefault(); gotoPage("services");
  });
  var sdb = document.getElementById("svcDealsBtn");
  if (sdb) sdb.addEventListener("click", function(){ window.openDealsPage(); });
  var dbb = document.getElementById("dealsBack");
  if (dbb) dbb.addEventListener("click", function(e){
    e.preventDefault(); gotoPage("services");
  });
  refreshOffersBtn();
  refreshDealsBtn();
  Booking.init();
  Owner.init();
  initLoyalty();
  initAuth();
  initForgot();
  initProfileExtras();
  initDB();
})();
