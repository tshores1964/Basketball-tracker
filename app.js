// ─────────────────────────────────────────────
//  Basketball Shooting Tracker
//  Full app with Supabase backend
// ─────────────────────────────────────────────

const CATS    = ["Form Shooting","Catch & Shoot","1-Dribble Pull-Up","Finishes"];
const DAYS    = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const N_SPOTS = 5;

// ── Date helpers ─────────────────────────────
function weekKey() {
  const d = new Date(), mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return mon.toISOString().slice(0, 10);
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
let allShots = [];   // rows from Supabase shots table
let appPin   = "1234"; // default PIN

let screen      = "home";
let curPlayer   = null;
let coachOpen   = false;
let coachTab    = "dashboard";
let pinEntry    = "";
let pinErr      = "";
let sbPeriod    = "week";
let sbSection   = "overall";
let localEdits  = {};   // unsaved edits keyed by "cat-si-di-f"

// ── Supabase helpers ─────────────────────────
async function loadRoster() {
  const { data, error } = await db.from("roster").select("*").order("name");
  if (error) { console.error(error); return; }
  roster = (data || []).filter(r => r.name !== "__pin__").map(r => r.name);
  // PIN is managed separately
}

async function loadShots() {
  const { data, error } = await db.from("shots").select("*");
  if (error) { console.error(error); return; }
  allShots = data || [];
}

async function saveShot(player, week, cat, spot, day, made, att) {
  const existing = allShots.find(s =>
    s.player===player && s.week===week &&
    s.category===cat  && s.spot===spot && s.day===day
  );
  if (existing) {
    const { error } = await db.from("shots")
      .update({ made, attempts: att })
      .eq("id", existing.id);
    if (!error) {
      existing.made = made; existing.attempts = att;
    }
  } else {
    const { data, error } = await db.from("shots")
      .insert({ player, week, category: cat, spot, day, made, attempts: att })
      .select().single();
    if (!error && data) allShots.push(data);
  }
}

async function addPlayerToDB(name) {
  const { error } = await db.from("roster").insert({ name });
  if (error) return error.message;
  if (!roster.includes(name)) roster.push(name);
  return null;
}

async function removePlayerFromDB(name) {
  await db.from("roster").delete().eq("name", name);
  await db.from("shots").delete().eq("player", name);
  roster = roster.filter(n => n !== name);
  allShots = allShots.filter(s => s.player !== name);
}

async function savePinToDB(pin) {
  appPin = pin;
  const { data } = await db.from("roster").select("id").eq("name","__pin__").single();
  if (data) {
    await db.from("roster").update({ value: pin }).eq("name","__pin__");
  } else {
    await db.from("roster").insert({ name:"__pin__", value: pin });
  }
}

// ── Stat helpers ─────────────────────────────
function shotsFor(player, weeks) {
  return allShots.filter(s => s.player === player && weeks.includes(s.week));
}

function playerTotals(player, weeks) {
  const shots = shotsFor(player, weeks);
  const tm = shots.reduce((a,s) => a + (s.made||0), 0);
  const ta = shots.reduce((a,s) => a + (s.attempts||0), 0);
  return { m: tm, a: ta, pct: ta ? Math.round(tm/ta*100) : null };
}

function playerCatTotals(player, weeks) {
  const out = {};
  CATS.forEach(cat => {
    const shots = allShots.filter(s =>
      s.player===player && weeks.includes(s.week) && s.category===cat
    );
    const tm = shots.reduce((a,s) => a+(s.made||0), 0);
    const ta = shots.reduce((a,s) => a+(s.attempts||0), 0);
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
    const tm = shots.reduce((a,s) => a+(s.made||0), 0);
    const ta = shots.reduce((a,s) => a+(s.attempts||0), 0);
    if (ta > 0) {
      const p = Math.round(tm/ta*100);
      if (!best || p > best.pct) best = { day: DAYS[di], pct: p, m: tm, a: ta };
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
  return { diff: curr.pct - prev.pct, curr: curr.pct, prev: prev.pct };
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
  const key = `${cat}-${spot}-${day}`;
  if (localEdits[key] !== undefined) return localEdits[key];
  const s = allShots.find(s =>
    s.player===player && s.week===week &&
    s.category===cat  && s.spot===spot && s.day===day
  );
  return s ? { m: s.made, a: s.attempts } : { m:"", a:"" };
}

// ── Utility ──────────────────────────────────
function initials(n) { return n.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2); }
function pctClass(p) {
  if (p===null) return "";
  return p>=70 ? "pct-high" : p>=50 ? "pct-mid" : "pct-low";
}
function rankMedal(i)  { return ["gold","silver","bronze"][i] || "other"; }
function rankSymbol(i) { return ["🥇","🥈","🥉"][i] || String(i+1); }

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

// ── Screens ──────────────────────────────────
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
      <div class="banner-sub">Basketball Shooting Tracker</div>
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
        coachOpen=true; screen="coach"; coachTab="dashboard"; pinErr=""; pinEntry="";
        render(buildCoach());
      } else {
        pinErr="Incorrect PIN"; pinEntry="";
        render(buildPin());
      }
    }, 150);
  }
}

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
      <div style="font-size:11px;color:#888;margin-bottom:6px">Week of ${fmtWeek(wk)}</div>
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
          <button class="btn-sm btn-danger" data-action="rm-player" data-name="${n}">🗑 Remove</button>
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
      <h3>Change PIN</h3>
      <label>New 4-digit PIN</label>
      <div class="row-flex">
        <input type="password" id="npin" maxlength="4" placeholder="New PIN" style="width:130px" />
        <button data-action="save-pin" class="btn-primary">Save</button>
      </div>
      <div id="pmsg"></div>
    </div>`;
}

function buildPlayer() {
  const name = curPlayer, wk = weekKey();
  const tot = playerTotals(name, [wk]);

  let html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <button data-action="go-home">← Back</button>
      <div class="avatar avatar-lg">${initials(name)}</div>
      <div>
        <div style="font-weight:500;font-size:15px">${name}</div>
        <div style="font-size:11px;color:#888">Week of ${fmtWeek(wk)}</div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div style="font-size:20px;font-weight:500" class="${pctClass(tot.pct)}">${tot.pct===null?"—":tot.pct+"%"}</div>
        <div style="font-size:10px;color:#888">${tot.m}/${tot.a} shots</div>
      </div>
    </div>`;

  CATS.forEach(cat => {
    html += `<div class="cat-hdr">${cat}</div>
    <div class="card" style="padding:.65rem .9rem;overflow-x:auto">
      <div class="spot-grid" style="margin-bottom:5px">
        <div></div>
        ${DAYS.map(d => `<div style="text-align:center;font-size:10px;color:#aaa;font-weight:500">${d}</div>`).join("")}
        <div style="text-align:center;font-size:10px;color:#888;font-weight:500">Wk%</div>
      </div>`;

    for (let si = 0; si < N_SPOTS; si++) {
      let sm=0, sa=0;
      const dayInputs = DAYS.map((day,di) => {
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
      html += `
        <div class="spot-grid">
          <div style="font-size:10px;color:#888;font-weight:500">Spot ${si+1}</div>
          ${dayInputs}
          <div class="pct-pill ${pctClass(sp)}" id="pp-${cat.replace(/\W/g,'_')}-${si}">${sp===null?"—":sp+"%"}</div>
        </div>`;
    }
    html += `</div>`;
  });

  html += `
    <button data-action="save-player" class="btn-primary"
      style="width:100%;padding:12px;margin-top:8px;font-size:14px">
      ✓ Save my numbers
    </button>`;
  return html;
}

function buildLeaderboard() {
  const weeks = weeksForPeriod(sbPeriod);
  const wk = weekKey(), mo = monthKey(), yr = yearKey();
  const periodLabel = sbPeriod==="week" ? "Week of "+fmtWeek(wk)
                    : sbPeriod==="month" ? fmtMonth(mo)
                    : yr+" Season";

  function ranked(arr) {
    return arr.filter(x => x.val !== null).sort((a,b) => b.val - a.val);
  }

  const overall  = ranked(roster.map(n => { const t=playerTotals(n,weeks); return {name:n,val:t.pct,sub:`${t.m}/${t.a} shots`}; }));
  const attempts = ranked(roster.map(n => { const t=playerTotals(n,weeks); return {name:n,val:t.a,sub:`${t.m} made`}; }));
  const bestDay  = ranked(roster.map(n => { const b=playerBestDay(n,weeks); return {name:n,val:b?b.pct:null,sub:b?`${b.day} — ${b.m}/${b.a}`:""}; }));
  const improved = ranked(roster.map(n => { const i=playerImproved(n); return {name:n,val:i?i.diff:null,sub:i?`${i.prev}% → ${i.curr}%`:""}; }));
  const catRanks = CATS.map(cat => ({
    cat,
    rows: ranked(roster.map(n => { const c=playerCatTotals(n,weeks)[cat]; return {name:n,val:c.pct,sub:`${c.m}/${c.a}`}; }))
  }));

  function sbRows(rows, isAtt=false, isDiff=false) {
    if (!rows.length) return `<div class="sb-no-data">No data yet — get to work! 🏀</div>`;
    const max = rows[0].val || 1;
    return rows.map((r,i) => {
      const barW = Math.round((r.val/max)*100);
      const valStr = isDiff ? (r.val>0?"+":"")+r.val+"%" : isAtt ? String(r.val) : r.val+"%";
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
    {id:"overall",  label:"Overall %"},
    {id:"attempts", label:"Most Shots"},
    {id:"bestday",  label:"Best Day"},
    {id:"improved", label:"Improved"},
    {id:"cats",     label:"By Category"},
  ];

  let content = "";
  if (sbSection==="overall")  content = `<div class="sb-section"><div class="sb-section-title">Overall shooting %</div>${sbRows(overall)}</div>`;
  if (sbSection==="attempts") content = `<div class="sb-section"><div class="sb-section-title">Most shots attempted</div>${sbRows(attempts,true)}</div>`;
  if (sbSection==="bestday")  content = `<div class="sb-section"><div class="sb-section-title">Best single day</div>${sbRows(bestDay)}</div>`;
  if (sbSection==="improved") content = `<div class="sb-section"><div class="sb-section-title">Most improved (week over week)</div>${sbRows(improved,false,true)}</div>`;
  if (sbSection==="cats")     content = catRanks.map(({cat,rows}) => `
    <div class="sb-section">
      <div class="sb-section-title">${cat}</div>
      ${sbRows(rows)}
    </div>`).join("");

  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <button data-action="go-home">← Back</button>
      <span style="font-weight:500;font-size:15px">🏆 Leaderboard</span>
    </div>
    <div class="sb-wrap">
      <div class="sb-title">🏀 Team Rankings</div>
      <div class="sb-tabs">
        <div class="sb-tab ${sbPeriod==="week"?"active":""}"  data-action="sb-period" data-p="week">This Week</div>
        <div class="sb-tab ${sbPeriod==="month"?"active":""}" data-action="sb-period" data-p="month">This Month</div>
        <div class="sb-tab ${sbPeriod==="year"?"active":""}"  data-action="sb-period" data-p="year">This Year</div>
      </div>
      <div class="period-label">${periodLabel}</div>
      <div class="sb-tabs">
        ${sections.map(s => `<div class="sb-tab ${sbSection===s.id?"active":""}" data-action="sb-sec" data-s="${s.id}">${s.label}</div>`).join("")}
      </div>
      ${content}
    </div>`;
}

// ── Event handling ────────────────────────────
function attachEvents() {
  const app = document.getElementById("app");

  app.addEventListener("click", async e => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const a = b.dataset.action;

    if (a==="sel-player") { curPlayer=b.dataset.name; screen="player"; localEdits={}; render(buildPlayer()); }
    if (a==="go-home")    { screen="home"; coachOpen=false; render(buildHome()); }
    if (a==="go-lb")      { screen="leaderboard"; render(buildLeaderboard()); }
    if (a==="go-coach") {
      if (coachOpen) { screen="coach"; render(buildCoach()); }
      else { pinEntry=""; pinErr=""; screen="pin"; render(buildPin()); }
    }

    if (a==="pk") {
      const k = String(b.dataset.k);
      if (k==="⌫") { pinEntry=pinEntry.slice(0,-1); render(buildPin()); return; }
      if (k==="" || k==="undefined") { return; }
      if (pinEntry.length<4) pinEntry+=k;
      render(buildPin());
      if (pinEntry.length===4) {
        setTimeout(()=>{
          if (pinEntry===appPin) { coachOpen=true; screen="coach"; coachTab="dashboard"; pinErr=""; pinEntry=""; render(buildCoach()); }
          else { pinErr="Incorrect PIN"; pinEntry=""; render(buildPin()); }
        }, 200);
      }
    }

    if (a==="ctab") { coachTab=b.dataset.t; render(buildCoach()); }

    if (a==="add-player") {
      const inp = document.getElementById("np");
      const name = (inp?.value||"").trim();
      const msg  = document.getElementById("rmsg");
      if (!name) { if(msg)msg.innerHTML=`<span class="err">Enter a name.</span>`; return; }
      if (roster.includes(name)) { if(msg)msg.innerHTML=`<span class="err">Already on roster.</span>`; return; }
      b.disabled = true;
      b.textContent = "Adding...";
      const err = await addPlayerToDB(name);
      if (err) { if(msg)msg.innerHTML=`<span class="err">${err}</span>`; b.disabled=false; b.textContent="Add"; return; }
      render(buildCoach());
    }

    if (a==="rm-player") {
      if (!confirm(`Remove ${b.dataset.name} from the roster?`)) return;
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
      b.disabled=true;
      b.textContent="Saving...";
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
        if (m!==""||a!=="") {
          await saveShot(curPlayer,wk,cat,parseInt(si),parseInt(di),parseInt(m)||0,parseInt(a)||0);
        }
      }
      localEdits={};
      showToast("✓ Numbers saved!");
      render(buildPlayer());
    }

    if (a==="sb-period") { sbPeriod=b.dataset.p; render(buildLeaderboard()); }
    if (a==="sb-sec")    { sbSection=b.dataset.s; render(buildLeaderboard()); }
  });

  app.addEventListener("input", e => {
    const inp = e.target;
    if (!inp.dataset.cat) return;
    const {cat,si,di,f} = inp.dataset;
    const key = `${cat}-${si}-${di}-${f}`;
    localEdits[key] = { m:undefined, a:undefined, ...localEdits[`${cat}-${si}-${di}-m`] ? { m:localEdits[`${cat}-${si}-${di}-m`] } : {} };
    localEdits[key] = inp.value;

    const wk = weekKey();
    const vals = { m:"", a:"" };
    for (let ff of ["m","a"]) {
      const k2=`${cat}-${si}-${di}-${ff}`;
      if (localEdits[k2]!==undefined) vals[ff]=localEdits[k2];
      else {
        const s=allShots.find(s=>s.player===curPlayer&&s.week===wk&&s.category===cat&&s.spot===parseInt(si)&&s.day===parseInt(di));
        if(s) vals[ff]=ff==="m"?s.made:s.attempts;
      }
    }
    const sm2=parseInt(vals.m)||0, sa2=parseInt(vals.a)||0;
    const ppId=`pp-${cat.replace(/\W/g,"_")}-${si}`;
    const el=document.getElementById(ppId);
    if(el){const p=sa2?Math.round(sm2/sa2*100):null;el.textContent=p===null?"—":p+"%";el.className="pct-pill "+(p?pctClass(p):"");}
  });
}

// ── Boot ─────────────────────────────────────
async function boot() {
  document.getElementById("app").innerHTML = `<div class="loading">Loading...</div>`;
  attachEvents();
  await Promise.all([loadRoster(), loadShots()]);
  render(buildHome());
}

boot();
