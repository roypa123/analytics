/**
 * Nexlytics tracking snippet — vanilla JS, no dependencies.
 *
 * Canonical source, served by the collector deployable itself at
 * `GET /tracker.js` (app/collector/main.py) — there is no real CDN yet
 * (Part 2 §2.3 envisions one; this is the honest Phase 1 stand-in, same
 * spirit as the rest of docs/architecture/05-ingestion-pipeline.md's
 * deviation table). The onboarding "install snippet" page
 * (analytics-frontend/src/pages/onboarding/install-snippet-page.tsx) embeds
 * this file's URL directly, so this IS the script real installs load.
 *
 * Mirrors app/schemas/event.py's CollectorEventRequest (CamelModel, so the
 * wire format is camelCase) and posts to this same deployable's
 * POST /event. It does not read or write cookies — that's D-01/D-08's
 * daily-rotating server-side visitor hash, not something this snippet needs
 * to know about.
 *
 * Configure it from the <script> tag itself:
 *   <script src="http://localhost:8001/tracker.js"
 *           data-tracking-id="ap_xxxxxxxxxxxx"
 *           data-collector-url="http://localhost:8001"
 *           data-debug="true"></script>
 *
 * data-collector-url defaults to http://localhost:8001 if omitted — the
 * generated onboarding snippet always sets it explicitly instead, to
 * VITE_COLLECTOR_URL (analytics-frontend/src/config/env.ts), so the same
 * snippet keeps working if the collector's URL differs per environment.
 * data-debug="true" shows a small on-page panel listing events as they fire,
 * for visual confirmation without opening devtools. It is not part of a real
 * install — real sites should omit it.
 */
(function () {
  "use strict";

  var scriptTag = document.currentScript;
  var trackingId = scriptTag.getAttribute("data-tracking-id");
  var collectorUrl = (scriptTag.getAttribute("data-collector-url") || "http://localhost:8001").replace(/\/$/, "");
  var debug = scriptTag.getAttribute("data-debug") === "true";

  if (!trackingId) {
    console.warn("[nexlytics] Missing data-tracking-id on the tracker <script> tag — not tracking.");
    return;
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function send(eventName, properties) {
    var body = {
      eventId: uuid(),
      trackingId: trackingId,
      occurredAt: new Date().toISOString(),
      eventName: eventName || "pageview",
      pageUrl: window.location.href,
      referrerUrl: document.referrer || null,
      screenWidth: window.screen ? window.screen.width : null,
      viewportWidth: window.innerWidth || null,
      properties: properties || null,
    };

    var url = collectorUrl + "/event";
    var json = JSON.stringify(body);
    var delivered = false;

    // Content-Type is deliberately "text/plain", not "application/json": it's
    // one of the three CORS-safelisted content types, so a cross-origin
    // sendBeacon/fetch never triggers a preflight OPTIONS round-trip. That
    // round-trip was the actual bug behind pageviews silently vanishing on
    // fast navigations — a fetch that still needs a preflight can get
    // abandoned by the browser when the page unloads before the OPTIONS+POST
    // pair finishes, even with keepalive:true. The collector
    // (app/collector/main.py) parses the body as JSON regardless of the
    // declared Content-Type, so the payload itself is unchanged.
    if (navigator.sendBeacon) {
      var blob = new Blob([json], { type: "text/plain" });
      delivered = navigator.sendBeacon(url, blob);
    }

    if (!delivered) {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: json,
        keepalive: true,
      }).catch(function (err) {
        logDebug(body, "failed: " + err.message);
      });
    }

    logDebug(body, delivered ? "sent (beacon)" : "sent (fetch)");
  }

  // --- optional debug panel (data-debug="true") ---------------------------

  var panel = null;

  function ensurePanel() {
    if (panel || !debug) return;
    panel = document.createElement("div");
    panel.id = "nexlytics-debug";
    panel.innerHTML =
      '<strong>nexlytics debug</strong><div class="nx-log"></div>';
    Object.assign(panel.style, {
      position: "fixed",
      bottom: "12px",
      right: "12px",
      width: "320px",
      maxHeight: "220px",
      overflowY: "auto",
      background: "#111827",
      color: "#e5e7eb",
      font: "12px/1.4 ui-monospace, monospace",
      padding: "10px 12px",
      borderRadius: "10px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      zIndex: 999999,
    });
    document.body.appendChild(panel);
  }

  function logDebug(eventBody, status) {
    if (!debug) return;
    if (document.body) {
      ensurePanel();
    } else {
      document.addEventListener("DOMContentLoaded", ensurePanel, { once: true });
      return;
    }
    var line = document.createElement("div");
    line.style.borderTop = "1px solid #374151";
    line.style.padding = "4px 0";
    line.textContent =
      new Date().toLocaleTimeString() + "  " + eventBody.eventName + "  [" + status + "]";
    panel.querySelector(".nx-log").prepend(line);
  }

  // Public API for custom events from page scripts, e.g.
  //   window.nexlytics("signup_click", { plan: "pro" })
  window.nexlytics = send;

  send("pageview");
})();
