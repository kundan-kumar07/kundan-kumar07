
import fs from "fs";
import path from "path";

const USERNAME = process.env.LEETCODE_USERNAME || "kundan_kumar07";
const OUT_PATH = process.env.OUT_PATH || "assets/leetcode-stats.svg";

const QUERY = `
query userProfileCalendar($username: String!, $year: Int) {
  matchedUser(username: $username) {
    userCalendar(year: $year) {
      totalActiveDays
      submissionCalendar
    }
  }
}`;

async function fetchCalendar(year) {
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: `https://leetcode.com/${USERNAME}/`,
    },
    body: JSON.stringify({ query: QUERY, variables: { username: USERNAME, year } }),
  });
  if (!res.ok) throw new Error(`LeetCode API error: ${res.status}`);
  const json = await res.json();
  if (!json.data || !json.data.matchedUser) {
    throw new Error(`No LeetCode data found for username "${USERNAME}"`);
  }
  return json.data.matchedUser.userCalendar;
}

function mergeCalendars(calendars) {
  const merged = {};
  for (const cal of calendars) {
    const obj = JSON.parse(cal.submissionCalendar || "{}");
    for (const [ts, count] of Object.entries(obj)) {
      merged[ts] = (merged[ts] || 0) + count;
    }
  }
  return merged;
}

function computeStreaks(calendarMap) {
  const daySeconds = 86400;
  const days = Object.keys(calendarMap)
    .map(Number)
    .sort((a, b) => a - b);
  if (days.length === 0) return { maxStreak: 0, currentStreak: 0 };

  let maxStreak = 1;
  let running = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] - days[i - 1] === daySeconds) {
      running++;
      maxStreak = Math.max(maxStreak, running);
    } else {
      running = 1;
    }
  }

  const today = Math.floor(Date.now() / 1000 / daySeconds) * daySeconds;
  const daySet = new Set(days);
  let cursor = today;
  if (!daySet.has(cursor)) cursor -= daySeconds; // allow "today" to be incomplete
  let currentStreak = 0;
  while (daySet.has(cursor)) {
    currentStreak++;
    cursor -= daySeconds;
  }

  return { maxStreak, currentStreak };
}

function submissionsInPastYear(calendarMap) {
  const cutoff = Math.floor(Date.now() / 1000) - 365 * 86400;
  return Object.entries(calendarMap)
    .filter(([ts]) => Number(ts) >= cutoff)
    .reduce((sum, [, count]) => sum + count, 0);
}

function buildHeatmapCells(calendarMap) {
  const daySeconds = 86400;
  const today = Math.floor(Date.now() / 1000 / daySeconds) * daySeconds;
  const weeks = 53;
  const todayDow = new Date(today * 1000).getUTCDay(); // 0 = Sun
  const end = today + (6 - todayDow) * daySeconds;
  const start = end - (weeks * 7 - 1) * daySeconds;

  const counts = [];
  for (let ts = start; ts <= end; ts += daySeconds) {
    counts.push(calendarMap[ts] || 0);
  }
  return counts;
}

function colorFor(count) {
  if (count === 0) return "#1e2030";
  if (count === 1) return "#3d3a6e";
  if (count <= 3) return "#5b4fc6";
  if (count <= 6) return "#7c3aed";
  return "#00f7ff";
}

function renderSVG(counts, stats) {
  const cell = 11;
  const gap = 3;
  const cols = 53;
  const rows = 7;
  const marginLeft = 20;
  const marginTop = 68;
  const width = marginLeft + cols * (cell + gap) + 20;
  const height = marginTop + rows * (cell + gap) + 20;

  let cells = "";
  for (let i = 0; i < counts.length; i++) {
    const col = Math.floor(i / 7);
    const row = i % 7;
    const x = marginLeft + col * (cell + gap);
    const y = marginTop + row * (cell + gap);
    cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${colorFor(counts[i])}"/>`;
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0d0e1a" rx="10"/>
  <text x="20" y="26" fill="#00f7ff" font-family="Fira Code, monospace" font-size="15" font-weight="600">LeetCode Contribution Activity</text>
  <text x="20" y="48" fill="#a1a1c2" font-family="Fira Code, monospace" font-size="12">Active Days: ${stats.totalActiveDays}  |  Max Streak: ${stats.maxStreak}  |  Current Streak: ${stats.currentStreak}  |  Submissions (past yr): ${stats.pastYear}</text>
  ${cells}
</svg>`;
}

async function main() {
  const currentYear = new Date().getUTCFullYear();
  const [calThis, calLast] = await Promise.all([
    fetchCalendar(currentYear),
    fetchCalendar(currentYear - 1),
  ]);

  const calendarMap = mergeCalendars([calThis, calLast]);
  const { maxStreak, currentStreak } = computeStreaks(calendarMap);
  const pastYear = submissionsInPastYear(calendarMap);
  const totalActiveDays = calThis.totalActiveDays || 0;

  const counts = buildHeatmapCells(calendarMap);
  const svg = renderSVG(counts, { totalActiveDays, maxStreak, currentStreak, pastYear });

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, svg, "utf8");
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
