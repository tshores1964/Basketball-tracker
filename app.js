// ─────────────────────────────────────────────
//  Basketball Shooting Tracker — Multi-Team
// ─────────────────────────────────────────────

const CATS    = ["Form Shooting","Catch & Shoot","1-Dribble Pull-Up","Finishes"];
const DAYS    = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const N_SPOTS = 5;

// ── Date helpers ─────────────────────────────
function weekKey() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = (day === 0) ? -6 : 1 - day; // go back to Monday
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  const y = mon.getFullYear();
  const m = String(mon.getMonth()+1).padStart(2,"0");
  const dd = String(mon.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+dd;
}
function monthKey() { return new Date().toISOString().slice(0, 7); }
function yearKey()  { return String(new Date().getFullYear()); }
function fmtWeek(k) {
  const d = new Date(k + "T12:00:00");
  return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}
function fmtMonth(k) {
  const [y,m] = k.split("-");
  return new Date(y, m-1, 1).toLocaleDateString("en-US", { month:"long", year:"numeric" });
}

// ── App state ────────────────────────────────
let roster   = [];
let allShots = [];
let appPin   = "1234";
let teamCode = null;   // current team code
let teamName = "";     // current team name
let teams    = [];     // all teams (for browse)

let screen      = "home";
let curPlayer   = null;
let coachOpen   = false;
let coachTab    = "dashboard";
let pinEntry    = "";
let pinErr      = "";
let sbPeriod    = "week";
let sbSection   = "overall";
let localEdits  = {};
let selectedDay = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;  // Mon=0...Sun=6
let allNotes = [];  // notes from DB
let allSpotNames = [];  // custom spot names
let allSpotCounts = [];  // custom spot counts per player/category
let joinCodeInput = "";
let joinErr     = "";

// ── Persist team selection ────────────────────
function savedTeam() {
  try { return localStorage.getItem("bball_team"); } catch(e) { return null; }
}
function saveTeam(code) {
  try { localStorage.setItem("bball_team", code); } catch(e) {}
}
function clearTeam() {
  try { localStorage.removeItem("bball_team"); } catch(e) {}
}

// ── Supabase helpers ─────────────────────────
async function loadTeams() {
  const { data, error } = await db.from("teams").select("*").order("name");
  if (error) { console.error(error); return; }
  teams = data || [];
}

async function loadRoster() {
  if (!teamCode) return;
  const { data, error } = await db.from("roster")
    .select("*").eq("team_code", teamCode).order("name");
  if (error) { console.error(error); return; }
  roster = (data || []).filter(r => r.name !== "__pin__").map(r => r.name);
  const pinRow = (data || []).find(r => r.name === "__pin__");
  if (pinRow && pinRow.value) appPin = String(pinRow.value).trim();
}

async function loadShots() {
  if (!teamCode) return;
  const { data, error } = await db.from("shots")
    .select("*").eq("team_code", teamCode);
  if (error) { console.error(error); return; }
  allShots = data || [];
}

async function loadNotes() {
  if (!teamCode) return;
  const { data, error } = await db.from("notes")
    .select("*").eq("team_code", teamCode);
  if (error) { console.error(error); return; }
  allNotes = data || [];
}

function getNote(player, week, day) {
  const n = allNotes.find(n => n.player===player && n.week===week && n.day===day && n.team_code===teamCode);
  return n ? n.text : "";
}

async function saveNote(player, week, day, text) {
  const existing = allNotes.find(n => n.player===player && n.week===week && n.day===day && n.team_code===teamCode);
  if (existing) {
    const { error } = await db.from("notes").update({ text }).eq("id", existing.id);
    if (!error) existing.text = text;
  } else {
    const { data, error } = await db.from("notes")
      .insert({ player, week, day, team_code: teamCode, text })
      .select().single();
    if (!error && data) allNotes.push(data);
  }
}

async function loadSpotNames() {
  if (!teamCode) return;
  const { data, error } = await db.from("spot_names")
    .select("*").eq("team_code", teamCode);
  if (error) { console.error(error); return; }
  allSpotNames = data || [];
}

function getSpotLabel(player, cat, spot) {
  const sn = allSpotNames.find(s => s.player===player && s.category===cat && s.spot===spot && s.team_code===teamCode);
  return (sn && sn.label) ? sn.label : "";
}

async function saveSpotLabel(player, cat, spot, label) {
  const existing = allSpotNames.find(s => s.player===player && s.category===cat && s.spot===spot && s.team_code===teamCode);
  if (existing) {
    const { error } = await db.from("spot_names").update({ label }).eq("id", existing.id);
    if (!error) existing.label = label;
  } else {
    const { data, error } = await db.from("spot_names")
      .insert({ player, category: cat, spot, team_code: teamCode, label })
      .select().single();
    if (!error && data) allSpotNames.push(data);
  }
}

async function loadSpotCounts() {
  if (!teamCode) return;
  const { data, error } = await db.from("spot_counts")
    .select("*").eq("team_code", teamCode);
  if (error) { console.error(error); return; }
  allSpotCounts = data || [];
}

function getSpotCount(player, cat) {
  const sc = allSpotCounts.find(s => s.player===player && s.category===cat && s.team_code===teamCode);
  return sc ? sc.count : N_SPOTS;
}

async function saveSpotCount(player, cat, count) {
  const existing = allSpotCounts.find(s => s.player===player && s.category===cat && s.team_code===teamCode);
  if (existing) {
    const { error } = await db.from("spot_counts").update({ count }).eq("id", existing.id);
    if (!error) existing.count = count;
  } else {
    const { data, error } = await db.from("spot_counts")
      .insert({ player, category: cat, team_code: teamCode, count })
      .select().single();
    if (!error && data) allSpotCounts.push(data);
  }
}

async function createTeam(name, code, pin) {
  const { error } = await db.from("teams").insert({ name, code, pin });
  if (error) return error.message;
  // Insert pin row in roster
  await db.from("roster").insert({ name:"__pin__", value: pin, team_code: code });
  teams.push({ name, code, pin });
  return null;
}

async function joinTeam(code) {
  const team = teams.find(t => t.code.toUpperCase() === code.toUpperCase());
  if (!team) {
    // Try fetching from DB directly
    const { data } = await db.from("teams").select("*").ilike("code", code).single();
    if (!data) return "Team not found. Check the code and try again.";
    teamCode = data.code.toUpperCase();
    teamName = data.name;
    appPin   = data.pin || "1234";
  } else {
    teamCode = team.code.toUpperCase();
    teamName = team.name;
    appPin   = team.pin || "1234";
  }
  saveTeam(teamCode);
  await loadRoster();
  await loadShots();
  await loadNotes();
  await loadSpotNames();
  await loadSpotCounts();
  return null;
}

async function saveShot(player, week, cat, spot, day, made, att) {
  const existing = allShots.find(s =>
    s.player===player && s.week===week &&
    s.category===cat  && s.spot===spot &&
    s.day===day       && s.team_code===teamCode
  );
  if (existing) {
    const { error } = await db.from("shots")
      .update({ made, attempts: att })
      .eq("id", existing.id);
    if (!error) { existing.made = made; existing.attempts = att; }
  } else {
    const { data, error } = await db.from("shots")
      .insert({ player, week, category:cat, spot, day, made, attempts:att, team_code:teamCode })
      .select().single();
    if (!error && data) allShots.push(data);
  }
}

async function addPlayerToDB(name) {
  const { error } = await db.from("roster").insert({ name, team_code: teamCode });
  if (error) return error.message;
  if (!roster.includes(name)) roster.push(name);
  return null;
}

async function removePlayerFromDB(name) {
  await db.from("roster").delete().eq("name", name).eq("team_code", teamCode);
  await db.from("shots").delete().eq("player", name).eq("team_code", teamCode);
  roster = roster.filter(n => n !== name);
  allShots = allShots.filter(s => s.player !== name);
}

async function savePinToDB(pin) {
  appPin = pin;
  // Update teams table
  await db.from("teams").update({ pin }).eq("code", teamCode);
  // Update roster pin row
  const { data } = await db.from("roster").select("id")
    .eq("name","__pin__").eq("team_code", teamCode).single();
  if (data) {
    await db.from("roster").update({ value: pin }).eq("id", data.id);
  } else {
    await db.from("roster").insert({ name:"__pin__", value: pin, team_code: teamCode });
  }
}

// ── Stat helpers ─────────────────────────────
function playerTotals(player, weeks) {
  const shots = allShots.filter(s => s.player===player && weeks.includes(s.week));
  const tm = shots.reduce((a,s) => a+(s.made||0), 0);
  const ta = shots.reduce((a,s) => a+(s.attempts||0), 0);
  const exactPct = ta ? (tm/ta*100) : null;
  return { m:tm, a:ta, pct: ta ? Math.round(tm/ta*100) : null, exactPct };
}

function playerCatTotals(player, weeks) {
  const out = {};
  CATS.forEach(cat => {
    const shots = allShots.filter(s =>
      s.player===player && weeks.includes(s.week) && s.category===cat
    );
    const tm = shots.reduce((a,s)=>a+(s.made||0),0);
    const ta = shots.reduce((a,s)=>a+(s.attempts||0),0);
    out[cat] = { m:tm, a:ta, pct: ta ? Math.round(tm/ta*100) : null };
  });
  return out;
}

function playerBestDay(player, weeks) {
  let best = null;
  for (let di = 0; di < 7; di++) {
    const shots = allShots.filter(s =>
      s.player===player && weeks.includes(s.week) && s.day===di
    );
    const tm = shots.reduce((a,s)=>a+(s.made||0),0);
    const ta = shots.reduce((a,s)=>a+(s.attempts||0),0);
    if (ta > 0) {
      const p = Math.round(tm/ta*100);
      if (!best || p > best.pct) best = { day:DAYS[di], pct:p, m:tm, a:ta };
    }
  }
  return best;
}

function playerImproved(player) {
  const wks = [...new Set(allShots.filter(s=>s.player===player).map(s=>s.week))].sort();
  if (wks.length < 2) return null;
  const prev = playerTotals(player, [wks[wks.length-2]]);
  const curr = playerTotals(player, [wks[wks.length-1]]);
  if (prev.pct===null || curr.pct===null) return null;
  return { diff: curr.pct-prev.pct, curr:curr.pct, prev:prev.pct };
}

function weeksForPeriod(period) {
  const key = period==="week" ? weekKey() : period==="month" ? monthKey() : yearKey();
  const allWks = [...new Set(allShots.map(s=>s.week))];
  return allWks.filter(wk => {
    if (period==="week")  return wk === key;
    if (period==="month") return wk.startsWith(key);
    if (period==="year")  return wk.startsWith(key);
    return true;
  });
}

function getShot(player, week, cat, spot, day) {
  const s = allShots.find(s =>
    s.player===player && s.week===week &&
    s.category===cat  && s.spot===spot && s.day===day
  );
  return s ? { m:s.made, a:s.attempts } : { m:"", a:"" };
}

// ── Utility ──────────────────────────────────
function initials(n) { return n.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2); }
function pctClass(p) {
  if (p===null) return "";
  return p>=70 ? "pct-high" : p>=50 ? "pct-mid" : "pct-low";
}
function rankMedal(i)  { return ["gold","silver","bronze"][i] || "other"; }
function rankSymbol(i) { return ["🥇","🥈","🥉"][i] || String(i+1); }
function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:6}, ()=>chars[Math.floor(Math.random()*chars.length)]).join("");
}

function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ── Render ───────────────────────────────────
function render(html) {
  document.getElementById("app").innerHTML = html;
}

// ══════════════════════════════════════════════
//  SCREENS
// ══════════════════════════════════════════════

// ── Team selection screen ─────────────────────
function buildTeamSelect() {
  return `
    <div class="banner">
      <div class="banner-quote">"What gets measured, improves"</div>
      <div class="banner-sub">Sharpshooter</div>
    </div>
    <div class="card">
      <h3>Enter your team code</h3>
      <p style="font-size:12px;color:#888;margin-bottom:10px">Your coach will give you a 6-character team code.</p>
      <div class="row-flex">
        <input type="text" id="join-code" maxlength="6" placeholder="e.g. HOOPS1"
          value="${joinCodeInput}"
          style="flex:1;text-transform:uppercase;font-size:18px;font-weight:500;letter-spacing:3px;text-align:center" />
        <button onclick="handleJoin()" class="btn-primary">Join</button>
      </div>
      ${joinErr ? `<p class="err">${joinErr}</p>` : ""}
    </div>
    <div style="text-align:center;margin-top:8px">
      <button onclick="handleNewTeam()" class="btn-primary" style="margin-right:8px">+ Create New Team</button>
      <button data-action="go-coach-global" style="font-size:12px;color:#888">🔒 Coach</button>
    </div>`;
}

// ── Create team screen ────────────────────────
function buildCreateTeam() {
  const code = genCode();
  return `
    <div class="banner">
      <div class="banner-quote">"What gets measured, improves"</div>
      <div class="banner-sub">Sharpshooter — Create New Team</div>
    </div>
    <div class="card">
      <h3>New Team Setup</h3>
      <label>Team Name</label>
      <input type="text" id="new-team-name" placeholder="e.g. Eagles Varsity" style="margin-bottom:10px" />
      <label>Team Code <span style="font-size:11px;color:#888">(share this with your players)</span></label>
      <div class="row-flex">
        <input type="text" id="new-team-code" value="${code}" maxlength="6"
          style="flex:1;text-transform:uppercase;font-size:16px;font-weight:500;letter-spacing:3px;text-align:center" />
        <button onclick="document.getElementById('new-team-code').value='${genCode()}'" style="font-size:11px">New Code</button>
      </div>
      <label style="margin-top:10px">Coach PIN (4 digits)</label>
      <input type="password" id="new-team-pin" maxlength="4" placeholder="4-digit PIN" style="width:140px;margin-bottom:14px" />
      <div id="create-err"></div>
      <button onclick="handleCreateTeam()" class="btn-primary" style="width:100%;padding:11px">Create Team</button>
    </div>
    <div style="text-align:center;margin-top:8px">
      <button data-action="go-team-select" style="font-size:12px;color:#888">← Back</button>
    </div>`;
}

// ── Home screen ───────────────────────────────
function buildHome() {
  const btns = roster.length === 0
    ? `<p style="color:#888;font-size:13px">No players yet — coach can add players in the coach panel.</p>`
    : roster.map(n => `
        <button class="player-btn" data-action="sel-player" data-name="${n}">
          <div class="avatar">${initials(n)}</div>
          <span>${n}</span>
        </button>`).join("");

  return `
    <div class="banner">
      <div class="banner-quote">"What gets measured, improves"</div>
      <div class="banner-sub">${teamName || "Basketball Shooting Tracker"}</div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:11px;color:#888">Team Code: <strong>${teamCode}</strong></div>
      <button onclick="handleSwitchTeam()" style="font-size:11px;color:#888;padding:4px 8px">Switch Team</button>
    </div>
    <div class="card">
      <h3>Select your name</h3>
      ${btns}
    </div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:4px">
      <button class="btn-primary" data-action="go-lb">🏆 Leaderboard</button>
      <button data-action="go-coach" style="font-size:12px;color:#666">🔒 Coach</button>
    </div>`;
}

// ── PIN screen ────────────────────────────────
function buildPin() {
  const dots = Array.from({length:4}, (_,i) =>
    `<div class="pin-dot ${i<pinEntry.length?"filled":""}"></div>`
  ).join("");
  const keys = [1,2,3,4,5,6,7,8,9,null,0,"back"];
  const keyBtns = keys.map(k => {
    if (k===null) return `<div></div>`;
    if (k==="back") return `<button onclick="pinKey('back')" style="padding:14px;font-size:18px">⌫</button>`;
    return `<button onclick="pinKey('${k}')" style="padding:14px;font-size:18px">${k}</button>`;
  }).join("");
  return `
    <div class="card" style="max-width:280px;margin:20px auto;text-align:center">
      <h3>Coach PIN</h3>
      ${teamName ? `<div style="font-size:11px;color:#888;margin-bottom:8px">${teamName}</div>` : ""}
      <div class="pin-dots">${dots}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">
        ${keyBtns}
      </div>
      ${pinErr ? `<p class="err">${pinErr}</p>` : ""}
      <button data-action="go-home" style="width:100%;margin-top:6px;font-size:12px">Cancel</button>
    </div>`;
}

function pinKey(k) {
  if (k==="back") { pinEntry=pinEntry.slice(0,-1); render(buildPin()); return; }
  if (pinEntry.length>=4) return;
  pinEntry += String(k);
  render(buildPin());
  if (pinEntry.length===4) {
    setTimeout(()=>{
      if (pinEntry===appPin) {
        coachOpen=true; screen="coach"; coachTab="dashboard";
        pinErr=""; pinEntry=""; render(buildCoach());
      } else {
        pinErr="Incorrect PIN"; pinEntry=""; render(buildPin());
      }
    }, 150);
  }
}

// ── Coach panel ───────────────────────────────
function buildCoach() {
  const tabs = ["dashboard","roster","settings"];
  const nav = `
    <div class="nav-bar">
      ${tabs.map(t => `
        <button data-action="ctab" data-t="${t}" class="${coachTab===t?"btn-primary":""}">
          ${t.charAt(0).toUpperCase()+t.slice(1)}
        </button>`).join("")}
      <button data-action="go-home" style="margin-left:auto;font-size:12px">← Exit</button>
    </div>`;
  let body = "";
  if (coachTab==="dashboard") body = buildDash();
  if (coachTab==="roster")    body = buildRoster();
  if (coachTab==="settings")  body = buildSettings();
  return nav + body;
}

function buildDash() {
  const wk = weekKey();
  const weeks = [wk];
  if (!roster.length) return `<div class="card"><p style="color:#888">Add players in the Roster tab.</p></div>`;
  const catShort = ["Form","C&S","Pull-Up","Finish"];
  const rows = roster.map(name => {
    const cats = playerCatTotals(name, weeks);
    const tot  = playerTotals(name, weeks);
    return `<tr>
      <td style="font-weight:500">${name}</td>
      ${CATS.map(c => { const p=cats[c].pct; return `<td class="${pctClass(p)}">${p===null?"—":p+"%"}</td>`; }).join("")}
      <td class="${pctClass(tot.pct)}" style="font-weight:500">${tot.pct===null?"—":tot.pct+"%"}</td>
      <td style="color:#888">${tot.m}/${tot.a}</td>
    </tr>`;
  }).join("");
  const catAvgs = CATS.map((cat,ci) => {
    let tm=0,ta=0;
    roster.forEach(n => { const c=playerCatTotals(n,weeks)[cat]; tm+=c.m; ta+=c.a; });
    const p = ta ? Math.round(tm/ta*100) : null;
    return `<div class="metric">
      <div class="metric-label">${catShort[ci]}</div>
      <div class="metric-val ${pctClass(p)}">${p===null?"—":p+"%"}</div>
    </div>`;
  }).join("");
  return `
    <div class="card">
      <div style="font-size:11px;color:#888;margin-bottom:4px">Team: <strong>${teamName}</strong> · Code: <strong>${teamCode}</strong> · Week of ${fmtWeek(wk)}</div>
      <h3>Team this week</h3>
      <div style="overflow-x:auto">
        <table class="dash">
          <thead><tr>
            <th style="text-align:left">Player</th>
            ${catShort.map(c=>`<th>${c}</th>`).join("")}
            <th>Overall</th><th>M/A</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h3>Category averages</h3>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${catAvgs}</div>
    </div>`;
}

function buildRoster() {
  const items = roster.length
    ? roster.map(n => `
        <div class="roster-item">
          <div style="display:flex;align-items:center;gap:9px">
            <div class="avatar">${initials(n)}</div><span>${n}</span>
          </div>
          <button class="btn-sm btn-danger" data-action="rm-player" data-name="${n}">🗑</button>
        </div>`).join("")
    : `<p style="color:#888;font-size:13px;padding:6px 0">No players yet.</p>`;
  return `
    <div class="card"><h3>Roster (${roster.length})</h3>${items}</div>
    <div class="card">
      <h3>Add player</h3>
      <div class="row-flex">
        <input type="text" id="np" placeholder="Player name" style="flex:1" />
        <button data-action="add-player" class="btn-primary">Add</button>
      </div>
      <div id="rmsg"></div>
    </div>`;
}

function buildSettings() {
  return `
    <div class="card">
      <h3>Team Info</h3>
      <div style="font-size:13px;margin-bottom:4px">Team Name: <strong>${teamName}</strong></div>
      <div style="font-size:13px;margin-bottom:12px">Team Code: <strong style="letter-spacing:2px;font-size:16px">${teamCode}</strong></div>
      <p style="font-size:11px;color:#888">Share this code with your players so they can join the team.</p>
    </div>
    <div class="card">
      <h3>Change PIN</h3>
      <label>New 4-digit PIN</label>
      <div class="row-flex">
        <input type="password" id="npin" maxlength="4" placeholder="New PIN" style="width:130px" />
        <button data-action="save-pin" class="btn-primary">Save</button>
      </div>
      <div id="pmsg"></div>
    </div>`;
}

// ── Player screen ─────────────────────────────
function buildPlayer() {
  const name = curPlayer, wk = weekKey();
  const tot = playerTotals(name, [wk]);
  const isMobile = window.innerWidth < 700;

  // Header
  let html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <button data-action="go-home">← Back</button>
      <div class="avatar avatar-lg">${initials(name)}</div>
      <div style="flex:1">
        <div style="font-weight:500;font-size:15px">${name}</div>
        <div style="font-size:11px;color:#888">Week of ${fmtWeek(wk)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:500" class="${pctClass(tot.pct)}">${tot.pct===null?"—":tot.pct+"%"}</div>
        <div style="font-size:10px;color:#888">${tot.m}/${tot.a} shots</div>
      </div>
    </div>`;

  if (isMobile) {
    // ── MOBILE: Day selector + single-day view ──
    html += `<div style="display:flex;gap:4px;margin-bottom:10px;background:#fff;padding:6px;border-radius:10px;border:0.5px solid #e0e0e0;overflow-x:auto">`;
    DAYS.forEach((d, di) => {
      let dayM=0, dayA=0;
      CATS.forEach(cat=>{
        for (let si=0;si<N_SPOTS;si++) {
          const v=getShot(name,wk,cat,si,di);
          dayM+=parseInt(v.m)||0; dayA+=parseInt(v.a)||0;
        }
      });
      const hasData = dayA>0;
      const isToday = di===selectedDay;
      html += `<button onclick="selectDay(${di})" style="flex:1;min-width:42px;padding:8px 4px;border:none;border-radius:7px;font-size:11px;font-weight:500;background:${isToday?'#1A3A5C':hasData?'#E6F1FB':'transparent'};color:${isToday?'#fff':hasData?'#0C447C':'#888'};cursor:pointer">
        <div>${d}</div>
        ${hasData?`<div style="font-size:9px;margin-top:2px;opacity:.8">${dayM}/${dayA}</div>`:''}
      </button>`;
    });
    html += `</div>`;

    // Show selected day's data
    const dayLabel = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][selectedDay];
    html += `<div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:8px;text-align:center">${dayLabel}'s Workout</div>`;

    // Daily Notes
    const noteText = getNote(name, wk, selectedDay);
    html += `
    <div class="card" style="padding:.75rem 1rem;margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:12px;font-weight:500;color:#1A3A5C">📝 ${dayLabel} Notes</div>
        <div style="font-size:10px;color:#888">How did it feel?</div>
      </div>
      <textarea data-note-day="${selectedDay}" placeholder="Quick thoughts... form felt great, struggled from left wing, etc."
        style="width:100%;min-height:60px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;background:#fafafa">${noteText.replace(/"/g,'&quot;')}</textarea>
    </div>`;

    CATS.forEach(cat => {
      const nSpots = getSpotCount(curPlayer, cat);
      html += `<div class="cat-hdr" style="display:flex;align-items:center;justify-content:space-between">
        <span>${cat}</span>
        <span style="display:flex;gap:4px;align-items:center">
          <button onclick="changeSpotCount('${cat}',-1)" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:24px;height:24px;border-radius:4px;font-size:14px;font-weight:500;cursor:pointer">−</button>
          <span style="font-size:10px;color:#fff;min-width:38px;text-align:center">${nSpots} spots</span>
          <button onclick="changeSpotCount('${cat}',1)" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:24px;height:24px;border-radius:4px;font-size:14px;font-weight:500;cursor:pointer">+</button>
        </span>
      </div>
      <div class="card" style="padding:.75rem 1rem">
        <div style="display:grid;grid-template-columns:78px 1fr 1fr 50px;gap:6px;align-items:center;margin-bottom:6px">
          <div style="font-size:10px;color:#aaa;font-weight:500">Spot</div>
          <div style="font-size:10px;color:#aaa;font-weight:500;text-align:center">Made</div>
          <div style="font-size:10px;color:#aaa;font-weight:500;text-align:center">Attempts</div>
          <div style="font-size:10px;color:#aaa;font-weight:500;text-align:center">%</div>
        </div>`;
      for (let si = 0; si < nSpots; si++) {
        const val = getShot(name, wk, cat, si, selectedDay);
        const mv = parseInt(val.m)||0, av = parseInt(val.a)||0;
        const p = av ? Math.round(mv/av*100) : null;
        const customLabel = getSpotLabel(name, cat, si);
        html += `
          <div style="display:grid;grid-template-columns:78px 1fr 1fr 50px;gap:6px;align-items:center;margin-bottom:8px">
            <input type="text" data-spot-label-cat="${cat}" data-spot-label-si="${si}"
              placeholder="Spot ${si+1}" value="${customLabel.replace(/"/g,'&quot;')}"
              style="font-size:11px;color:#1A3A5C;font-weight:500;padding:6px 4px;border:0.5px solid #e0e0e0;border-radius:6px;background:#f5f7fa;width:100%" />
            <input type="number" min="0" max="99" inputmode="numeric" placeholder="0" value="${val.m}"
              data-cat="${cat}" data-si="${si}" data-di="${selectedDay}" data-f="m"
              style="padding:10px;text-align:center;font-size:16px;font-weight:500;border:1px solid #ccc;border-radius:8px;width:100%" />
            <input type="number" min="0" max="99" inputmode="numeric" placeholder="0" value="${val.a}"
              data-cat="${cat}" data-si="${si}" data-di="${selectedDay}" data-f="a"
              style="padding:10px;text-align:center;font-size:16px;font-weight:500;border:1px solid #ccc;border-radius:8px;background:#fafafa;width:100%" />
            <div class="pct-pill ${pctClass(p)}" id="pp-${cat.replace(/\W/g,'_')}-${si}" style="font-size:12px;padding:6px">${p===null?"—":p+"%"}</div>
          </div>`;
      }
      html += `</div>`;
    });
  } else {
    // ── DESKTOP: full week grid ──
    // Daily notes for all days
    html += `<div class="card" style="padding:.75rem 1rem;margin-bottom:10px">
      <div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:8px">📝 Daily Notes</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">`;
    DAYS.forEach((d, di) => {
      const noteText = getNote(name, wk, di);
      html += `<div>
        <div style="font-size:10px;color:#888;font-weight:500;margin-bottom:3px">${d}</div>
        <textarea data-note-day="${di}" placeholder="Notes..."
          style="width:100%;min-height:50px;padding:5px 6px;border:0.5px solid #ddd;border-radius:5px;font-size:11px;font-family:inherit;resize:none;background:#fafafa">${noteText.replace(/"/g,'&quot;')}</textarea>
      </div>`;
    });
    html += `</div></div>`;

    CATS.forEach(cat => {
      const nSpots = getSpotCount(curPlayer, cat);
      html += `<div class="cat-hdr" style="display:flex;align-items:center;justify-content:space-between">
        <span>${cat}</span>
        <span style="display:flex;gap:4px;align-items:center">
          <button onclick="changeSpotCount('${cat}',-1)" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:22px;height:22px;border-radius:4px;font-size:13px;cursor:pointer">−</button>
          <span style="font-size:10px;color:#fff;min-width:40px;text-align:center">${nSpots} spots</span>
          <button onclick="changeSpotCount('${cat}',1)" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:22px;height:22px;border-radius:4px;font-size:13px;cursor:pointer">+</button>
        </span>
      </div>
      <div class="card" style="padding:.65rem .9rem;overflow-x:auto">
        <div class="spot-grid" style="margin-bottom:5px">
          <div></div>
          ${DAYS.map(d=>`<div style="text-align:center;font-size:10px;color:#aaa;font-weight:500">${d}</div>`).join("")}
          <div style="text-align:center;font-size:10px;color:#888;font-weight:500">Wk%</div>
        </div>`;
      for (let si = 0; si < nSpots; si++) {
        let sm=0, sa=0;
        const dayInputs = DAYS.map((_,di) => {
          const val = getShot(name, wk, cat, si, di);
          sm += parseInt(val.m)||0; sa += parseInt(val.a)||0;
          return `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px">
              <input type="number" min="0" max="99" placeholder="M" value="${val.m}"
                data-cat="${cat}" data-si="${si}" data-di="${di}" data-f="m"
                style="padding:4px 2px;text-align:center;font-size:11px;border:0.5px solid #ddd;border-radius:3px;width:100%" />
              <input type="number" min="0" max="99" placeholder="A" value="${val.a}"
                data-cat="${cat}" data-si="${si}" data-di="${di}" data-f="a"
                style="padding:4px 2px;text-align:center;font-size:11px;border:0.5px solid #ddd;border-radius:3px;background:#f9f9f9;width:100%" />
            </div>`;
        }).join("");
        const sp = sa ? Math.round(sm/sa*100) : null;
        const customLabel = getSpotLabel(name, cat, si);
        html += `
          <div class="spot-grid">
            <input type="text" data-spot-label-cat="${cat}" data-spot-label-si="${si}"
              placeholder="Spot ${si+1}" value="${customLabel.replace(/"/g,'&quot;')}"
              style="font-size:10px;color:#1A3A5C;font-weight:500;padding:3px 4px;border:0.5px solid #e0e0e0;border-radius:4px;background:#f5f7fa;width:100%" />
            ${dayInputs}
            <div class="pct-pill ${pctClass(sp)}" id="pp-${cat.replace(/\W/g,'_')}-${si}">${sp===null?"—":sp+"%"}</div>
          </div>`;
      }
      html += `</div>`;
    });
  }

  html += `
    <button data-action="save-player" class="btn-primary"
      style="width:100%;padding:14px;margin-top:10px;font-size:15px;font-weight:500">
      ✓ Save my numbers
    </button>`;
  return html;
}

// ── Leaderboard ───────────────────────────────
function buildLeaderboard() {
  const weeks = weeksForPeriod(sbPeriod);
  const wk = weekKey(), mo = monthKey(), yr = yearKey();
  const periodLabel = sbPeriod==="week" ? "Week of "+fmtWeek(wk)
                    : sbPeriod==="month" ? fmtMonth(mo) : yr+" Season";

  // Shooting King
  const kingWeeks = [weekKey()];
  const kingData = roster.map(n => {
    const t = playerTotals(n, kingWeeks);
    return { name:n, made:t.m, pct:t.pct };
  }).filter(p => p.made > 0).sort((a,b) => b.made - a.made);
  const king = kingData[0] || null;

  let streak = 0;
  if (king) {
    const currentWk = weekKey();
    // Only count PAST weeks for streak — not the current week
    const pastWks = [...new Set(allShots.map(s=>s.week))]
      .filter(w => w < currentWk).sort().reverse();
    for (const wk2 of pastWks) {
      const wkData = roster.map(n => ({ name:n, made:playerTotals(n,[wk2]).m }))
        .filter(p=>p.made>0).sort((a,b)=>b.made-a.made);
      if (wkData[0]?.name === king.name) streak++;
      else break;
    }
  }

  const kingBanner = king ? `
    <div style="background:linear-gradient(135deg,#2a1a00,#1a0f00);border:1.5px solid #FFD700;border-radius:12px;padding:14px 16px;margin-bottom:14px;text-align:center">
      <div style="font-size:10px;letter-spacing:1px;color:#FFD700;text-transform:uppercase;margin-bottom:6px">👑 This Week's Shooting King</div>
      <div style="font-size:26px;font-weight:500;color:#FFD700;margin-bottom:4px">${king.name}</div>
      <div style="display:flex;justify-content:center;gap:20px;margin-top:6px">
        <div style="text-align:center">
          <div style="font-size:18px;font-weight:500;color:#fff">${king.made}</div>
          <div style="font-size:10px;color:#888">Shots Made</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:18px;font-weight:500;color:#fff">${king.pct===null?"—":king.pct+"%"}</div>
          <div style="font-size:10px;color:#888">Shooting %</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:18px;font-weight:500;color:#FFD700">${streak}</div>
          <div style="font-size:10px;color:#888">Week Streak</div>
        </div>
      </div>
      ${streak >= 2 ? `<div style="margin-top:8px;font-size:11px;color:#FFD700">🔥 ${streak} weeks in a row!</div>` : ""}
    </div>` : `
    <div style="background:#111;border:1px dashed #334;border-radius:12px;padding:14px;text-align:center;margin-bottom:14px">
      <div style="font-size:12px;color:#445">👑 No Shooting King yet this week — get to work!</div>
    </div>`;

  function ranked(arr) {
    return arr.filter(x=>x.val!==null).sort((a,b)=>(b.exact||b.val)-(a.exact||a.val));
  }

  const overall  = ranked(roster.map(n=>{const t=playerTotals(n,weeks);return{name:n,val:t.pct,exact:t.exactPct,sub:`${t.m}/${t.a} shots`};}));
  const attempts = ranked(roster.map(n=>{const t=playerTotals(n,weeks);return{name:n,val:t.a,sub:`${t.m} made`};}));
  const bestDay  = ranked(roster.map(n=>{const b=playerBestDay(n,weeks);return{name:n,val:b?b.pct:null,sub:b?`${b.day} — ${b.m}/${b.a}`:""};}));
  const improved = ranked(roster.map(n=>{const i=playerImproved(n);return{name:n,val:i?i.diff:null,sub:i?`${i.prev}% → ${i.curr}%`:""};}));
  const catRanks = CATS.map(cat=>({cat,rows:ranked(roster.map(n=>{const c=playerCatTotals(n,weeks)[cat];return{name:n,val:c.pct,sub:`${c.m}/${c.a}`};}))}));

  function sbRows(rows, isAtt=false, isDiff=false) {
    if (!rows.length) return `<div class="sb-no-data">No data yet — get to work! 🏀</div>`;
    const max = rows[0].val||1;
    return rows.map((r,i)=>{
      const barW = Math.round((r.val/max)*100);
      const valStr = isDiff?(r.val>0?"+":"")+r.val+"%":isAtt?String(r.val):r.val+"%";
      return `
        <div class="sb-row ${i<3?`medal-${i+1}`:""}">
          <div class="sb-rank ${rankMedal(i)}">${rankSymbol(i)}</div>
          <div class="sb-avatar">${initials(r.name)}</div>
          <div class="sb-name">${r.name}</div>
          <div class="sb-bar-wrap"><div class="sb-bar" style="width:${barW}%"></div></div>
          <div>
            <div class="sb-stat">${valStr}</div>
            <div class="sb-sub">${r.sub}</div>
          </div>
        </div>`;
    }).join("");
  }

  const sections = [
    {id:"overall",label:"Overall %"},
    {id:"attempts",label:"Most Shots"},
    {id:"bestday",label:"Best Day"},
    {id:"improved",label:"Improved"},
    {id:"cats",label:"By Category"},
  ];

  let content = "";
  if (sbSection==="overall")  content=`<div class="sb-section"><div class="sb-section-title">Overall shooting %</div>${sbRows(overall)}</div>`;
  if (sbSection==="attempts") content=`<div class="sb-section"><div class="sb-section-title">Most shots attempted</div>${sbRows(attempts,true)}</div>`;
  if (sbSection==="bestday")  content=`<div class="sb-section"><div class="sb-section-title">Best single day</div>${sbRows(bestDay)}</div>`;
  if (sbSection==="improved") content=`<div class="sb-section"><div class="sb-section-title">Most improved (week over week)</div>${sbRows(improved,false,true)}</div>`;
  if (sbSection==="cats")     content=catRanks.map(({cat,rows})=>`<div class="sb-section"><div class="sb-section-title">${cat}</div>${sbRows(rows)}</div>`).join("");

  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <button data-action="go-home">← Back</button>
      <span style="font-weight:500;font-size:15px">🏆 ${teamName} Rankings</span>
    </div>
    ${kingBanner}
    <div class="sb-wrap">
      <div class="sb-title">🏀 Team Rankings</div>
      <div class="sb-tabs">
        <div class="sb-tab ${sbPeriod==="week"?"active":""}"  data-action="sb-period" data-p="week">This Week</div>
        <div class="sb-tab ${sbPeriod==="month"?"active":""}" data-action="sb-period" data-p="month">This Month</div>
        <div class="sb-tab ${sbPeriod==="year"?"active":""}"  data-action="sb-period" data-p="year">This Year</div>
      </div>
      <div class="period-label">${periodLabel}</div>
      <div class="sb-tabs">
        ${sections.map(s=>`<div class="sb-tab ${sbSection===s.id?"active":""}" data-action="sb-sec" data-s="${s.id}">${s.label}</div>`).join("")}
      </div>
      ${content}
    </div>`;
}

// ── Inline handlers ───────────────────────────
async function handleJoin() {
  const code = (document.getElementById("join-code")?.value||"").trim().toUpperCase();
  if (!code || code.length < 4) { joinErr="Enter a valid team code."; render(buildTeamSelect()); return; }
  joinCodeInput = code;
  const btn = document.querySelector("button[onclick='handleJoin()']");
  if (btn) { btn.disabled=true; btn.textContent="Joining..."; }
  const err = await joinTeam(code);
  if (err) { joinErr=err; render(buildTeamSelect()); return; }
  joinErr=""; joinCodeInput="";
  screen="home"; render(buildHome());
}

async function handleCreateTeam() {
  const name = (document.getElementById("new-team-name")?.value||"").trim();
  const code = (document.getElementById("new-team-code")?.value||"").trim().toUpperCase();
  const pin  = (document.getElementById("new-team-pin")?.value||"").trim();
  const msg  = document.getElementById("create-err");
  if (!name) { if(msg)msg.innerHTML=`<span class="err">Enter a team name.</span>`; return; }
  if (code.length < 4) { if(msg)msg.innerHTML=`<span class="err">Code must be at least 4 characters.</span>`; return; }
  if (!/^\d{4}$/.test(pin)) { if(msg)msg.innerHTML=`<span class="err">PIN must be 4 digits.</span>`; return; }
  const btn = document.querySelector("button[onclick='handleCreateTeam()']");
  if (btn) { btn.disabled=true; btn.textContent="Creating..."; }
  const err = await createTeam(name, code, pin);
  if (err) { if(msg)msg.innerHTML=`<span class="err">${err}</span>`; if(btn){btn.disabled=false;btn.textContent="Create Team";} return; }
  teamCode=code; teamName=name; appPin=pin;
  saveTeam(code);
  await loadRoster(); await loadShots();
  screen="coach"; coachOpen=true; coachTab="roster";
  render(buildCoach());
}

function handleNewTeam() { screen="create-team"; render(buildCreateTeam()); }
function handleSwitchTeam() { clearTeam(); teamCode=null; teamName=""; roster=[]; allShots=[]; screen="team-select"; render(buildTeamSelect()); }

// ── Event handling ────────────────────────────
function attachEvents() {
  document.getElementById("app").addEventListener("click", async e => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const a = b.dataset.action;

    if (a==="go-team-select") { screen="team-select"; render(buildTeamSelect()); }
    if (a==="sel-player")  { curPlayer=b.dataset.name; screen="player"; localEdits={}; render(buildPlayer()); }
    if (a==="go-home")     { screen="home"; coachOpen=false; render(buildHome()); }
    if (a==="go-lb")       { screen="leaderboard"; render(buildLeaderboard()); }
    if (a==="go-coach") {
      if (coachOpen) { screen="coach"; render(buildCoach()); }
      else { pinEntry=""; pinErr=""; screen="pin"; render(buildPin()); }
    }
    if (a==="ctab") { coachTab=b.dataset.t; render(buildCoach()); }

    if (a==="add-player") {
      if (b.disabled) return;
      const inp = document.getElementById("np");
      const name = (inp?.value||"").trim();
      const msg  = document.getElementById("rmsg");
      if (!name) { if(msg)msg.innerHTML=`<span class="err">Enter a name.</span>`; return; }
      if (roster.includes(name)) { if(msg)msg.innerHTML=`<span class="err">Already on roster.</span>`; return; }
      b.disabled=true; b.textContent="Adding...";
      const err = await addPlayerToDB(name);
      if (err) { if(msg)msg.innerHTML=`<span class="err">${err}</span>`; b.disabled=false; b.textContent="Add"; return; }
      render(buildCoach());
    }

    if (a==="rm-player") {
      if (!confirm(`Remove ${b.dataset.name}?`)) return;
      await removePlayerFromDB(b.dataset.name);
      render(buildCoach());
    }

    if (a==="save-pin") {
      const v = (document.getElementById("npin")?.value||"").trim();
      const msg = document.getElementById("pmsg");
      if (!/^\d{4}$/.test(v)) { if(msg)msg.innerHTML=`<span class="err">Must be 4 digits.</span>`; return; }
      await savePinToDB(v);
      if(msg) msg.innerHTML=`<span class="ok">PIN updated.</span>`;
    }

    if (a==="save-player") {
      if (b.disabled) return;
      b.disabled=true; b.textContent="Saving...";
      const wk = weekKey();
      const inputs = document.querySelectorAll("[data-cat][data-si][data-di][data-f]");
      const bySpot = {};
      inputs.forEach(inp => {
        const key=`${inp.dataset.cat}|${inp.dataset.si}|${inp.dataset.di}`;
        if (!bySpot[key]) bySpot[key]={};
        bySpot[key][inp.dataset.f]=inp.value;
      });
      for (const key of Object.keys(bySpot)) {
        const [cat,si,di]=key.split("|");
        const {m,a}=bySpot[key];
        const mVal = parseInt(m);
        const aVal = parseInt(a);
        if (!isNaN(mVal) && !isNaN(aVal) && m!==" " && a!==" " && m!==undefined && a!==undefined) {
          await saveShot(curPlayer,wk,cat,parseInt(si),parseInt(di),mVal,aVal);
        }
      }
      // Save notes
      const noteInputs = document.querySelectorAll("[data-note-day]");
      for (const ni of noteInputs) {
        const day = parseInt(ni.dataset.noteDay);
        const text = ni.value.trim();
        const existing = getNote(curPlayer, wk, day);
        if (text !== existing) {
          await saveNote(curPlayer, wk, day, text);
        }
      }
      // Save spot labels
      const labelInputs = document.querySelectorAll("[data-spot-label-cat]");
      const seenLabels = new Set();
      for (const li of labelInputs) {
        const cat = li.dataset.spotLabelCat;
        const si = parseInt(li.dataset.spotLabelSi);
        const key = `${cat}|${si}`;
        if (seenLabels.has(key)) continue;
        seenLabels.add(key);
        const label = li.value.trim();
        const existing = getSpotLabel(curPlayer, cat, si);
        if (label !== existing) {
          await saveSpotLabel(curPlayer, cat, si, label);
        }
      }
      localEdits={};
      showToast("✓ Numbers saved!");
      render(buildPlayer());
    }

    if (a==="sb-period") { sbPeriod=b.dataset.p; render(buildLeaderboard()); }
    if (a==="sb-sec")    { sbSection=b.dataset.s; render(buildLeaderboard()); }
  });

  document.getElementById("app").addEventListener("input", e => {
    const inp = e.target;
    if (!inp.dataset.cat) return;
    const {cat,si,di} = inp.dataset;
    const ppId = `pp-${cat.replace(/\W/g,"_")}-${si}`;
    const el = document.getElementById(ppId);
    if (el) {
      const wk = weekKey();
      let sm=0,sa=0;
      for (let d=0;d<7;d++) {
        const mInp = document.querySelector(`[data-cat="${cat}"][data-si="${si}"][data-di="${d}"][data-f="m"]`);
        const aInp = document.querySelector(`[data-cat="${cat}"][data-si="${si}"][data-di="${d}"][data-f="a"]`);
        sm+=parseInt(mInp?.value)||0; sa+=parseInt(aInp?.value)||0;
      }
      const p=sa?Math.round(sm/sa*100):null;
      el.textContent=p===null?"—":p+"%";
      el.className="pct-pill "+(p?pctClass(p):"");
    }
  });
}

// ── Change spot count ─────────────────────────
async function changeSpotCount(cat, delta) {
  const current = getSpotCount(curPlayer, cat);
  const newCount = Math.max(1, Math.min(15, current + delta));
  if (newCount === current) return;
  await saveSpotCount(curPlayer, cat, newCount);
  render(buildPlayer());
}

// ── Day selector for mobile ───────────────────
function selectDay(d) {
  selectedDay = d;
  render(buildPlayer());
}

// ── Boot ─────────────────────────────────────
async function boot() {
  render(`<div class="loading">Loading...</div>`);
  attachEvents();
  await loadTeams();
  const saved = savedTeam();
  if (saved) {
    const err = await joinTeam(saved);
    if (!err) { await loadNotes(); await loadSpotNames(); await loadSpotCounts(); screen="home"; render(buildHome()); return; }
  }
  screen="team-select";
  render(buildTeamSelect());
}

boot();
