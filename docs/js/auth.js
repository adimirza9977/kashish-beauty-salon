/* Kashish Beauty Salon — customer auth session (v5: server-side auth) */
var Auth = (function(){
  "use strict";
  var KEY = "kashish_session";

  function save(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }
  function clear(){ try{ localStorage.removeItem(KEY); }catch(e){} }

  return {
    current: function(){
      try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
      catch(e){ return null; }
    },
    isLoggedIn: function(){ return !!this.current(); },
    /* password hash kept in session so authed calls can re-verify server-side */
    creds: function(){
      var s = this.current();
      return s ? { phone: s.phone, hash: s.hash } : null;
    },

    signup: function(name, phone, whatsapp, password, email){
      return DB.sha256("kashish:" + password).then(function(hash){
        return DB.signupCustomer(name, phone, whatsapp, hash, email).then(function(c){
          if (!c || c.error) throw new Error((c && c.error) || "signup failed");
          var s = { id: c.id, name: c.name, phone: c.phone, email: c.email || "", hash: hash };
          save(s);
          return s;
        });
      }).catch(function(e){
        if (e && (e.code === "phone-exists" || e.message === "phone-exists"))
          throw new Error("phone-exists");
        throw e;
      });
    },

    login: function(phone, password){
      return DB.sha256("kashish:" + password).then(function(hash){
        return DB.loginCustomer(phone, hash).then(function(c){
          if (!c) throw new Error("invalid");
          if (c.error === "blocked") throw new Error("blocked");
          var s = { id: c.id, name: c.name, phone: c.phone, email: c.email || "", hash: hash };
          save(s);
          return s;
        });
      });
    },

    logout: function(){ clear(); },

    updateProfile: function(name, email){
      var s = this.current();
      if (!s || !s.hash) return Promise.reject(new Error("not-logged-in"));
      return DB.updateCustomerProfile(s.phone, s.hash, name, email).then(function(c){
        if (!c || c.error) throw new Error((c && c.error) || "update failed");
        var ns = { id: c.id, name: c.name, phone: c.phone, email: c.email || "", hash: s.hash };
        save(ns);
        return ns;
      });
    },

    refresh: function(){
      var s = this.current();
      if (!s || !s.hash) return Promise.resolve(s || null);
      return DB.getCustomerAuth(s.phone, s.hash).then(function(c){
        if (!c || c.is_blocked){ clear(); return null; }
        var ns = { id: c.id, name: c.name, phone: c.phone, email: c.email || "", hash: s.hash };
        save(ns);
        return ns;
      }).catch(function(){ return s; });
    }
  };
})();
