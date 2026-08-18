/* schooledthemusical.com — visit notes
   Sends a page view and link clicks to our own collector.
   No cookies. No personal data. Nothing leaves for a third party. */
(function () {
  "use strict";

  var EP = "https://schooled-notes.pbnilsson.workers.dev/p";

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

  var q = new URLSearchParams(window.location.search);
  send({
    k: "view",
    p: window.location.pathname,
    r: document.referrer || "",
    c: q.get("utm_source") || q.get("ref") || ""
  });

  document.addEventListener(
    "click",
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a") : null;
      if (!a || !a.getAttribute("href")) return;
      send({ k: "click", p: window.location.pathname, t: a.href });
    },
    true
  );
})();
