/* ============================================================
   Kashish Beauty Salon — WEBSITE layer (web.js)
   Loaded only on the website:
   1) "Open in App" — Android visitors with the app installed jump
      straight into it (kashish:// scheme, added in app v6.4); if the
      app is not installed the browser falls back to this page.
   2) Reveal-on-scroll animations for sections and cards, including
      cards the app renders later (MutationObserver).
   Fails completely soft: without this file the site works as-is.
   ============================================================ */
(function(){
  "use strict";

  /* ---------- 1) Open in App ---------- */
  try {
    var ua = navigator.userAgent || "";
    if (/Android/i.test(ua)){
      var b = document.getElementById("openAppBtn");
      var hint = document.getElementById("openAppHint");
      if (b){
        var fb = encodeURIComponent(location.href);
        b.href = "intent://open#Intent;scheme=kashish;package=com.kashish.salon;" +
                 "S.browser_fallback_url=" + fb + ";end";
        b.style.display = "";
        if (hint) hint.style.display = "";
      }
    }
  } catch(e){}

  /* ---------- 2) Reveal-on-scroll ---------- */
  var SEL = ".section, .svc, .deal-card, .beaut-card, .pop-card, .offer-slide," +
            " .offer-full-card, .gal-tile, .review-card, .share-card," +
            " .visit-card, .about-card";
  function showAll(){
    document.querySelectorAll(SEL).forEach(function(el){ el.classList.add("in"); });
  }
  if (!("IntersectionObserver" in window)){ showAll(); return; }

  var obs = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if (en.isIntersecting){
        en.target.classList.add("in");
        obs.unobserve(en.target);
      }
    });
  }, { threshold: 0.06, rootMargin: "0px 0px -4% 0px" });

  function tag(el){
    if (el.nodeType !== 1) return;
    if (el.matches && el.matches(SEL) && !el.classList.contains("reveal")){
      el.classList.add("reveal");
      obs.observe(el);
    }
    if (el.querySelectorAll){
      el.querySelectorAll(SEL).forEach(function(x){
        if (!x.classList.contains("reveal")){
          x.classList.add("reveal");
          obs.observe(x);
        }
      });
    }
  }
  tag(document.body);
  /* safety net: anything still hidden after 2.5s simply appears
     (slow devices / odd browsers must never show a blank site) */
  setTimeout(function(){
    document.querySelectorAll(".reveal:not(.in)").forEach(function(el){
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add("in");
    });
  }, 2500);

  new MutationObserver(function(muts){
    muts.forEach(function(m){
      m.addedNodes.forEach(function(n){ tag(n); });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
