// Helper utility functions

// Helper: mm:ss from seconds
export function toClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

// Format YouTube timedtext JSON into lines "[mm:ss] text"
export function formatTranscriptWithTimestamps(json) {
  if (!json?.events?.length) return "";
  const lines = [];
  for (const ev of json.events) {
    if (!ev?.segs?.length) continue;
    const start = typeof ev.tStartMs === "number" ? ev.tStartMs / 1000 : 0;
    const text = ev.segs.map(s => s.utf8 || "").join("").replace(/\s+/g, " ").trim();
    if (!text) continue;
    lines.push(`[${toClock(start)}] ${text}`);
  }
  return lines.join("\n");
}

// Generate a random token
export function newToken() {
  return Math.random().toString(36).slice(2);
}