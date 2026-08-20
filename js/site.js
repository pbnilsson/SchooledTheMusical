/* schooledthemusical.com — visit notes
   Reports page views, link clicks, how far a page was read, and signups.
   No cookies. No personal data. Nothing leaves for a third party. */
(function () {
  "use strict";

  var EP = "https://schooled-notes.pbnilsson.workers.dev/p";
  var PATH = window.location.pathname;
  var q = new URLSearchParams(window.location.search);
  var CAMPAIGN = q.get("utm_source") || q.get("ref") || "";

  // ---- silencing your own devices -----------------------------------------
  // Load any page with ?notrack=1 to stop this browser from ever reporting;
  // ?track=1 turns it back on. The flag is the only thing this script keeps
  // beyond the per-tab id, and its only job is to prevent collection — which
  // is why it needs no more consent than the visit itself.
  var OFF_KEY = "sn-off";

  function flag(val) {
    try {
      if (val === undefined) return localStorage.getItem(OFF_KEY);
      if (val === null) localStorage.removeItem(OFF_KEY);
      else localStorage.setItem(OFF_KEY, val);
    } catch (e) {}
    return null;
  }

  function toast(msg) {
    try {
      var el = document.createElement("div");
      el.textContent = msg;
      el.setAttribute("role", "status");
      el.id = "sn-toast";
      el.style.cssText =
        "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;" +
        "background:#1a2235;color:#f1f1f1;border:1px solid rgba(255,255,255,.14);" +
        "border-radius:999px;padding:.6rem 1.1rem;box-shadow:0 6px 24px rgba(0,0,0,.4);" +
        "font:500 14px/1.2 'DM Sans',system-ui,-apple-system,sans-serif;" +
        "opacity:0;transition:opacity .25s;";
      var place = function () {
        document.body.appendChild(el);
        setTimeout(function () { el.style.opacity = "1"; }, 20);
        setTimeout(function () {
          el.style.opacity = "0";
          setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
          }, 400);
        }, 4500);
      };
      if (document.body) place();
      else document.addEventListener("DOMContentLoaded", place);
    } catch (e) {}
  }

  var asked = q.has("notrack") || q.has("track");
  if (q.has("notrack")) flag(q.get("notrack") === "0" ? null : "1");
  if (q.has("track")) flag(q.get("track") === "0" ? "1" : null);

  var OFF = flag() === "1";

  if (window.console && console.log) {
    console.log(
      "visit notes: " +
        (OFF
          ? "off for this browser — add ?track=1 to any page to turn it back on"
          : "on — add ?notrack=1 to any page to silence this browser")
    );
  }
  if (asked) {
    toast(
      OFF
        ? "Visit notes off for this browser."
        : "Visit notes on for this browser."
    );
  }
  if (OFF) return;

  // A throwaway id that lives only for this browser tab, so we can tell
  // "one person read four pages" from "four people read one page."
  var v = "";
  try {
    v = sessionStorage.getItem("sn");
    if (!v) {
      v = Math.random().toString(36).slice(2, 12);
      sessionStorage.setItem("sn", v);
    }
  } catch (e) {}

  function send(d) {
    d.v = v;
    d.w = window.innerWidth || 0;
    var body = JSON.stringify(d);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(EP, new Blob([body], { type: "text/plain" }));
        return;
      }
    } catch (e) {}
    try {
      fetch(EP, { method: "POST", body: body, keepalive: true }).catch(
        function () {}
      );
    } catch (e) {}
  }

  // ---- the page view -------------------------------------------------------
  send({ k: "view", p: PATH, r: document.referrer || "", c: CAMPAIGN });

  // ---- links they follow ---------------------------------------------------
  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var a = t.closest("a");
      if (a && a.getAttribute("href")) {
        send({ k: "click", p: PATH, t: a.href });
      }
      // the landing page's signup is a plain button, not a form submit
      if (t.closest("button.form-submit")) {
        send({ k: "signup", p: PATH, r: document.referrer || "", c: CAMPAIGN });
      }
    },
    true
  );

  // ---- signups on the pages that use a real form ---------------------------
  document.addEventListener(
    "submit",
    function (e) {
      var f = e.target;
      if (f && f.classList && f.classList.contains("signup-form")) {
        send({ k: "signup", p: PATH, r: document.referrer || "", c: CAMPAIGN });
      }
    },
    true
  );

  // ---- how far they read, and how long they stayed -------------------------
  var started = Date.now();
  var deepest = 0;
  var closed = false;

  function measure() {
    var doc = document.documentElement;
    var height = Math.max(
      doc.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    );
    if (!height) return;
    var seen = (window.scrollY || doc.scrollTop || 0) + window.innerHeight;
    var pct = Math.round((seen / height) * 100);
    if (pct > deepest) deepest = Math.max(0, Math.min(100, pct));
  }

  window.addEventListener("scroll", measure, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  measure();

  function close() {
    if (closed) return;
    closed = true;
    measure();
    send({
      k: "end",
      p: PATH,
      d: deepest,
      s: Math.round((Date.now() - started) / 1000)
    });
  }

  // pagehide is the reliable one; visibilitychange catches tab switches
  // and mobile, where pagehide often never fires at all.
  window.addEventListener("pagehide", close);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") close();
  });
})();
