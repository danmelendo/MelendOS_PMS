/*!
 * Melend/OS booking widget for the hotel's own website.
 *
 *   <div id="melendos-booking"></div>
 *   <script src="https://reservas.suhotel.com/embed.js" data-hotel="hostal-sol" async></script>
 *
 * data-hotel      the hotel (slug); not needed when the script comes from the
 *                 hotel's own booking domain
 * data-target     id of the element that holds the search box (default: a box
 *                 right before this script)
 * data-search     "false" to leave the search box out
 * data-assistant  "false" to leave the booking assistant out
 * data-color      colour of the assistant button (default #1F3A5F)
 * data-label      text of the assistant button
 *
 * The search box and the assistant are iframes of the booking web: prices,
 * availability and payments stay on the booking domain; this page only sizes
 * them, opens the assistant and follows the "Buscar" link.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script || window.__melendosWidget) return;
  window.__melendosWidget = true;

  var origin = new URL(script.src, location.href).origin;
  var attr = function (name, fallback) {
    var v = script.getAttribute("data-" + name);
    return v === null || v === "" ? fallback : v;
  };
  var hotel = attr("hotel", "");
  var query = hotel ? "?hotel=" + encodeURIComponent(hotel) : "";
  var color = attr("color", "#1F3A5F");
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = "#1F3A5F";

  function frame(path, css) {
    var f = document.createElement("iframe");
    f.src = origin + path + query;
    f.title = "Reservas";
    f.setAttribute("allow", "payment");
    f.style.cssText = "border:0;display:block;background:transparent;color-scheme:normal;" + css;
    return f;
  }

  // ── Search box ────────────────────────────────────────────────────────────
  var searchFrame = null;
  if (attr("search", "true") !== "false") {
    var box = document.getElementById(attr("target", "melendos-booking"));
    if (!box) {
      box = document.createElement("div");
      script.parentNode.insertBefore(box, script);
    }
    searchFrame = frame("/embed/search", "width:100%;height:76px;transition:height .15s ease;");
    box.appendChild(searchFrame);
  }

  // ── Assistant ─────────────────────────────────────────────────────────────
  var panel = null;
  var button = null;
  function openPanel() {
    if (panel) return;
    var small = window.matchMedia("(max-width: 640px)").matches;
    panel = frame(
      "/embed/assistant",
      "position:fixed;z-index:2147483646;box-shadow:0 12px 40px rgba(0,0,0,.25);" +
        (small
          ? "inset:0;width:100%;height:100%;"
          : "right:20px;bottom:20px;width:400px;height:600px;max-height:calc(100vh - 40px);"),
    );
    document.body.appendChild(panel);
    button.style.display = "none";
  }
  function closePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
    button.style.display = "flex";
  }
  if (attr("assistant", "true") !== "false") {
    button = document.createElement("button");
    button.type = "button";
    button.textContent = attr("label", "¿Te ayudo a reservar?");
    button.style.cssText =
      "position:fixed;right:20px;bottom:20px;z-index:2147483645;display:flex;align-items:center;" +
      "gap:8px;border:0;cursor:pointer;padding:12px 16px;font:600 14px/1.2 system-ui,sans-serif;" +
      "color:#fff;background:" +
      color +
      ";box-shadow:0 6px 20px rgba(0,0,0,.2);";
    button.addEventListener("click", openPanel);
    document.body.appendChild(button);
  }

  // ── Messages from the frames (only from the booking domain) ───────────────
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || typeof e.data.type !== "string") return;
    var d = e.data;
    if (d.type === "melendos:height" && searchFrame && typeof d.height === "number") {
      searchFrame.style.height = Math.min(Math.max(d.height, 56), 900) + "px";
    } else if (
      d.type === "melendos:navigate" &&
      typeof d.url === "string" &&
      d.url.indexOf(origin + "/") === 0
    ) {
      window.location.href = d.url;
    } else if (d.type === "melendos:close") {
      closePanel();
    }
  });
})();
