// Content script injected on all pages to collect visible text and show overlay with two user-message lines.
// No network/API calls are made. Background will request context via runtime messaging.
// Verbose logging enabled so you can see exactly what is being prepared and sent.

(function () {
  try {
    console.log("[CubAI][CS] Loaded on", location.href);
  } catch {}
  // Config
  const MAX_CONTEXT_CHARS = 200000; // cap to avoid extreme pages; still large enough
  const MIN_TEXT_LEN = 2;

  // Util: check if element is visible in viewport and computed visible
  function isVisible(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const style = window.getComputedStyle(el);
    if (!style || style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity || "1") === 0) return false;
    const rect = el.getBoundingClientRect();
    // Treat off-screen as still potentially meaningful; do not require intersection strictly.
    return rect.width >= 1 && rect.height >= 1;
  }

  // Util: whether node is within a non-content container to skip
  function isInSkippableContainer(el) {
    // Skip nav/asides with aria-hidden or role that implies chrome
    let cur = el;
    while (cur && cur.nodeType === Node.ELEMENT_NODE) {
      const tag = cur.tagName.toLowerCase();
      if (tag === "script" || tag === "style" || tag === "noscript") return true;
      if (cur.getAttribute && (cur.getAttribute("aria-hidden") === "true")) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  // Gather text from visible content-bearing elements
  function collectVisibleText() {
    const parts = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT, null);
    const contentTags = new Set([
      "p","h1","h2","h3","h4","h5","h6","li","blockquote","figcaption","caption","th","td","article","section","main","aside","nav","footer","header","summary","details","dd","dt"
    ]);

    const preCodeTexts = [];
    document.querySelectorAll("pre, code").forEach((el) => {
      if (!isVisible(el) || isInSkippableContainer(el)) return;
      const t = (el.innerText || el.textContent || "").replace(/\s+\n/g, "\n").trim();
      if (t.length >= MIN_TEXT_LEN) preCodeTexts.push(t);
    });

    while (walker.nextNode()) {
      const el = walker.currentNode;
      const tag = (el.tagName || "").toLowerCase();
      if (!contentTags.has(tag)) continue;
      if (!isVisible(el) || isInSkippableContainer(el)) continue;
      const txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (txt.length >= MIN_TEXT_LEN) parts.push(txt);
    }

    // Include important title/meta
    const title = (document.title || "").trim();
    if (title) parts.unshift(`Title: ${title}`);
    const ogTitle = document.querySelector("meta[property='og:title']")?.getAttribute("content") || "";
    const ogDesc = document.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
    if (ogTitle) parts.unshift(`OG Title: ${ogTitle}`);
    if (ogDesc) parts.push(`OG Description: ${ogDesc}`);

    // Merge pre/code last to avoid duplicates from innerText traversal
    if (preCodeTexts.length) {
      parts.push("Code/Pre blocks:");
      parts.push(preCodeTexts.join("\n\n"));
    }

    // Deduplicate consecutive duplicates and collapse whitespace
    const seen = new Set();
    const deduped = [];
    for (const p of parts) {
      const key = p.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
    }

    let context = deduped.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();

    let truncated = false;
    if (context.length > MAX_CONTEXT_CHARS) {
      context = context.slice(0, MAX_CONTEXT_CHARS);
      truncated = true;
    }

    if (truncated) {
      context += "\n\n[Context truncated due to length cap]";
    }

    console.log("[CubAI] Scraped Page Content:", context);
    return context;
  }

  // Get current selection text if any
  function getSelectedText() {
    const sel = window.getSelection && window.getSelection();
    const t = sel ? String(sel).trim() : "";
    return t || "";
  }

  // Prepare payload helper
  function preparePayload() {
    const context = collectVisibleText();
    const selected = getSelectedText();
    const ask = selected ? `explain "${selected}" to me` : "";
    const line1 = `user-message: ${context}`;
    const line2 = `user-message: "${ask}"`;
    try {
      console.log("[CubAI][CS] Prepared:", { preview: context.slice(0, 160) + (context.length > 160 ? "..." : ""), ask });
      console.log("[CubAI][CS] Lines:", line1, line2);
    } catch {}
    return { context, ask, line1, line2 };
  }

  // Overlay removed
  function showOverlay(lines) {
    // no-op
  }

  function buttonStyles() {
    return {
      background: "#2b6cb0",
      color: "#fff",
      border: "none",
      padding: "6px 10px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "12px"
    };
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.position = "fixed";
    el.style.zIndex = "2147483647";
    el.style.bottom = "20px";
    el.style.right = "20px";
    el.style.background = "rgba(0,0,0,0.85)";
    el.style.color = "#fff";
    el.style.padding = "8px 12px";
    el.style.borderRadius = "6px";
    el.style.fontSize = "12px";
    el.style.boxShadow = "0 2px 10px rgba(0,0,0,0.3)";
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  // Listen for requests from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return;
    try { console.log("[CubAI][CS] onMessage:", message.action, "from", sender?.tab?.id, location.href); } catch {}

    if (message.action === "collectPageContext") {
      try {
        const { line1, line2 } = preparePayload();
        // Overlay removed; just log so you can see what is prepared
        try { console.log("[CubAI][CS] collectPageContext lines:", line1, line2); } catch {}
        sendResponse({ ok: true });
      } catch (e) {
        try { console.warn("[CubAI][CS] collectPageContext error:", e); } catch {}
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
      return true;
    }

    if (message.action === "collectPageContextForPanel" || message.action === "collectAndReturnContext") {
      try {
        const { context, ask, line1, line2 } = preparePayload();
        // Return payload for panel and also log
        try {
          console.log("[CubAI][CS] Returning payload to background:", { preview: context.slice(0, 160) + (context.length > 160 ? "..." : ""), ask });
          console.log("[CubAI][CS] Lines:", line1, line2);
        } catch {}
        sendResponse({ ok: true, context, ask });
      } catch (e) {
        try { console.warn("[CubAI][CS] collectPageContextForPanel error:", e); } catch {}
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
      return true;
    }
  });
})();