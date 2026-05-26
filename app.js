// ─────────────────────────────────────────────
//  Basketball Shooting Tracker — Multi-Team
// ─────────────────────────────────────────────

const CATS    = ["Form Shooting","Catch & Shoot","Catch & Shoot 3s","1-Dribble Pull-Up","1-Dribble Pull-Up 3s","Finishes"];
const DAYS    = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const N_SPOTS = 5;

// ── Date helpers ─────────────────────────────
function weekKey() {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0) ? -6 : 1 - day;
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
let teamCode = null;
let teamName = "";
let teams    = [];

let screen      = "home";
let curPlayer   = null;
let coachOpen   = false;
let coachTab    = "dashboard";
let coachViewPlayer = null;   // player being viewed in coach panel
let coachCommentDay = 0;      // selected day for coach day comment
let pinEntry    = "";
let pinErr      = "";
let pinMode     = "coach";
let pinSetupFirst = "";
let sbPeriod    = "week";
let sbSection   = "overall";
let localEdits  = {};
let selectedDay = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
let allNotes = [];
let allSpotNames = [];
let allSpotCounts = [];
let allDailyCheckins = [];
let allWeeklyCheckins = [];
let allWeights = [];
let allPlayerPins = [];
let allCoachComments = [];
let teamCompete  = false;   // whether this team is opted into league
let leagueShots  = [];      // shots from all competing teams
let leagueRosters = {};     // { teamCode: [playerNames] }
let leagueTeams  = [];      // competing team objects
let checkinTemp = {};
let onboardStep = 0;
let joinCodeInput = "";
let joinErr     = "";

// ── Session unlock ────────────────────────────
function getUnlockedPlayers() {
  try { const r=sessionStorage.getItem("bball_unlocked"); return r?JSON.parse(r):{}; } catch(e){return{};}
}
function setUnlockedPlayer(player, tc) {
  try { const u=getUnlockedPlayers(); u[tc+"|"+player]=true; sessionStorage.setItem("bball_unlocked",JSON.stringify(u)); } catch(e){}
}
function isPlayerUnlocked(player, tc) { return !!getUnlockedPlayers()[tc+"|"+player]; }
function unlockAllPlayers() {
  try { const u=getUnlockedPlayers(); roster.forEach(p=>{u[teamCode+"|"+p]=true;}); sessionStorage.setItem("bball_unlocked",JSON.stringify(u)); } catch(e){}
}

// ── Persist team ──────────────────────────────
function savedTeam() { try{return localStorage.getItem("bball_team");}catch(e){return null;} }
function saveTeam(code) { try{localStorage.setItem("bball_team",code);}catch(e){} }
function hasSeenOnboarding() { try{return localStorage.getItem("bball_seen_onboarding")==="yes";}catch(e){return false;} }
function markOnboardingSeen() { try{localStorage.setItem("bball_seen_onboarding","yes");}catch(e){} }
function clearTeam() { try{localStorage.removeItem("bball_team");}catch(e){} }

// ── Supabase helpers ──────────────────────────
async function loadTeams() {
  const {data,error}=await db.from("teams").select("*").order("name");
  if(error){console.error(error);return;} teams=data||[];
}
async function loadRoster() {
  if(!teamCode)return;
  const {data,error}=await db.from("roster").select("*").eq("team_code",teamCode).order("name");
  if(error){console.error(error);return;}
  roster=(data||[]).filter(r=>r.name!=="__pin__").map(r=>r.name);
  const pinRow=(data||[]).find(r=>r.name==="__pin__");
  if(pinRow&&pinRow.value) appPin=String(pinRow.value).trim();
}
async function loadShots() {
  if(!teamCode)return;
  const {data,error}=await db.from("shots").select("*").eq("team_code",teamCode);
  if(error){console.error(error);return;} allShots=data||[];
}
async function loadNotes() {
  if(!teamCode)return;
  const {data,error}=await db.from("notes").select("*").eq("team_code",teamCode);
  if(error){console.error(error);return;} allNotes=data||[];
}
function getNote(player,week,day) {
  const n=allNotes.find(n=>n.player===player&&n.week===week&&n.day===day&&n.team_code===teamCode);
  return n?n.text:"";
}
async function saveNote(player,week,day,text) {
  const existing=allNotes.find(n=>n.player===player&&n.week===week&&n.day===day&&n.team_code===teamCode);
  if(existing){const{error}=await db.from("notes").update({text}).eq("id",existing.id);if(!error)existing.text=text;}
  else{const{data,error}=await db.from("notes").insert({player,week,day,team_code:teamCode,text}).select().single();if(!error&&data)allNotes.push(data);}
}
async function loadSpotNames() {
  if(!teamCode)return;
  const {data,error}=await db.from("spot_names").select("*").eq("team_code",teamCode);
  if(error){console.error(error);return;} allSpotNames=data||[];
}
function getSpotLabel(player,cat,spot) {
  const sn=allSpotNames.find(s=>s.player===player&&s.category===cat&&s.spot===spot&&s.team_code===teamCode);
  return(sn&&sn.label)?sn.label:"";
}
async function saveSpotLabel(player,cat,spot,label) {
  const existing=allSpotNames.find(s=>s.player===player&&s.category===cat&&s.spot===spot&&s.team_code===teamCode);
  if(existing){const{error}=await db.from("spot_names").update({label}).eq("id",existing.id);if(!error)existing.label=label;}
  else{const{data,error}=await db.from("spot_names").insert({player,category:cat,spot,team_code:teamCode,label}).select().single();if(!error&&data)allSpotNames.push(data);}
}
async function loadSpotCounts() {
  if(!teamCode)return;
  const {data,error}=await db.from("spot_counts").select("*").eq("team_code",teamCode);
  if(error){console.error(error);return;} allSpotCounts=data||[];
}
function getSpotCount(player,cat) {
  const sc=allSpotCounts.find(s=>s.player===player&&s.category===cat&&s.team_code===teamCode);
  return sc?sc.count:N_SPOTS;
}
async function saveSpotCount(player,cat,count) {
  const existing=allSpotCounts.find(s=>s.player===player&&s.category===cat&&s.team_code===teamCode);
  if(existing){const{error}=await db.from("spot_counts").update({count}).eq("id",existing.id);if(!error)existing.count=count;}
  else{const{data,error}=await db.from("spot_counts").insert({player,category:cat,team_code:teamCode,count}).select().single();if(!error&&data)allSpotCounts.push(data);}
}

// ── Player PINs ───────────────────────────────
async function loadPlayerPins() {
  if(!teamCode)return;
  const {data,error}=await db.from("player_pins").select("*").eq("team_code",teamCode);
  if(error){console.error(error);return;} allPlayerPins=data||[];
}
function getPlayerPin(player) {
  const row=allPlayerPins.find(p=>p.player===player&&p.team_code===teamCode);
  return row?row.pin:null;
}
async function savePlayerPin(player,pin) {
  const existing=allPlayerPins.find(p=>p.player===player&&p.team_code===teamCode);
  if(existing){const{error}=await db.from("player_pins").update({pin}).eq("id",existing.id);if(!error)existing.pin=pin;}
  else{const{data,error}=await db.from("player_pins").insert({player,team_code:teamCode,pin}).select().single();if(!error&&data)allPlayerPins.push(data);}
}

// ── Coach Comments ────────────────────────────
async function loadCoachComments() {
  if(!teamCode)return;
  const {data,error}=await db.from("coach_comments").select("*").eq("team_code",teamCode);
  if(error){console.error(error);return;} allCoachComments=data||[];
}

async function saveCompete(val) {
  teamCompete = val;
  await db.from("teams").update({compete: val}).eq("code", teamCode);
  // Update local teams array
  const t = teams.find(t=>t.code===teamCode);
  if(t) t.compete = val;
}

async function loadLeagueData() {
  // Load all competing teams and their shots for the current week
  const {data: compTeams} = await db.from("teams").select("*").eq("compete", true);
  leagueTeams = compTeams || [];

  leagueShots = [];
  leagueRosters = {};

  for(const team of leagueTeams) {
    const {data: shots} = await db.from("shots").select("*").eq("team_code", team.code).eq("week", weekKey());
    if(shots) leagueShots.push(...shots);
    const {data: ros} = await db.from("roster").select("name").eq("team_code", team.code);
    if(ros) leagueRosters[team.code] = ros.filter(r=>r.name!=="__pin__").map(r=>r.name);
  }
}

function getCoachComment(player, type, week, day) {
  if(type==="player") {
    // Most recent player-level comment
    const rows=allCoachComments.filter(c=>c.player===player&&c.team_code===teamCode&&c.comment_type==="player")
      .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    return rows[0]||null;
  }
  if(type==="week") {
    return allCoachComments.find(c=>c.player===player&&c.team_code===teamCode&&c.comment_type==="week"&&c.week===week)||null;
  }
  if(type==="day") {
    return allCoachComments.find(c=>c.player===player&&c.team_code===teamCode&&c.comment_type==="day"&&c.week===week&&c.day===day)||null;
  }
  return null;
}

async function saveCoachComment(player, type, week, day, text) {
  let existing = null;
  if(type==="player") {
    existing=allCoachComments.find(c=>c.player===player&&c.team_code===teamCode&&c.comment_type==="player");
  } else if(type==="week") {
    existing=allCoachComments.find(c=>c.player===player&&c.team_code===teamCode&&c.comment_type==="week"&&c.week===week);
  } else if(type==="day") {
    existing=allCoachComments.find(c=>c.player===player&&c.team_code===teamCode&&c.comment_type==="day"&&c.week===week&&c.day===day);
  }
  if(existing) {
    if(!text.trim()){
      // Delete if cleared
      await db.from("coach_comments").delete().eq("id",existing.id);
      allCoachComments=allCoachComments.filter(c=>c.id!==existing.id);
    } else {
      const{error}=await db.from("coach_comments").update({text,created_at:new Date().toISOString()}).eq("id",existing.id);
      if(!error){existing.text=text;existing.created_at=new Date().toISOString();}
    }
  } else if(text.trim()) {
    const{data,error}=await db.from("coach_comments")
      .insert({player,team_code:teamCode,comment_type:type,week:week||null,day:day??null,text})
      .select().single();
    if(!error&&data)allCoachComments.push(data);
  }
}

// ── Check-ins ─────────────────────────────────
async function loadDailyCheckins() {
  if(!teamCode)return;
  const {data,error}=await db.from("daily_checkins").select("*").eq("team_code",teamCode);
  if(error){console.error(error);return;} allDailyCheckins=data||[];
}
function getDailyCheckin(player,week,day) {
  return allDailyCheckins.find(c=>c.player===player&&c.week===week&&c.day===day&&c.team_code===teamCode);
}
async function saveDailyCheckin(player,week,day,effort,recovery,feeling) {
  const existing=getDailyCheckin(player,week,day);
  if(existing){const{error}=await db.from("daily_checkins").update({effort,recovery,feeling}).eq("id",existing.id);if(!error){existing.effort=effort;existing.recovery=recovery;existing.feeling=feeling;}}
  else{const{data,error}=await db.from("daily_checkins").insert({player,week,day,team_code:teamCode,effort,recovery,feeling}).select().single();if(!error&&data)allDailyCheckins.push(data);}
}
async function loadWeeklyCheckins() {
  if(!teamCode)return;
  const {data,error}=await db.from("weekly_checkins").select("*").eq("team_code",teamCode);
  if(error){console.error(error);return;} allWeeklyCheckins=data||[];
}
function getWeeklyCheckin(player,week) {
  return allWeeklyCheckins.find(c=>c.player===player&&c.week===week&&c.team_code===teamCode);
}
async function saveWeeklyCheckin(player,week,alignment,confidence,selftalk) {
  const existing=getWeeklyCheckin(player,week);
  if(existing){const{error}=await db.from("weekly_checkins").update({alignment,confidence,selftalk}).eq("id",existing.id);if(!error){existing.alignment=alignment;existing.confidence=confidence;existing.selftalk=selftalk;}}
  else{const{data,error}=await db.from("weekly_checkins").insert({player,week,team_code:teamCode,alignment,confidence,selftalk}).select().single();if(!error&&data)allWeeklyCheckins.push(data);}
}
async function loadWeights() {
  if(!teamCode)return;
  const {data,error}=await db.from("category_weights").select("*").eq("team_code",teamCode);
  if(error){console.error(error);return;} allWeights=data||[];
}
function getWeight(cat) {
  const w=allWeights.find(x=>x.team_code===teamCode&&x.category===cat);
  return w?parseFloat(w.weight):1.0;
}

async function createTeam(name,code,pin) {
  const{error}=await db.from("teams").insert({name,code,pin});
  if(error)return error.message;
  await db.from("roster").insert({name:"__pin__",value:pin,team_code:code});
  teams.push({name,code,pin}); return null;
}
async function joinTeam(code) {
  const team=teams.find(t=>t.code.toUpperCase()===code.toUpperCase());
  if(!team){
    const{data}=await db.from("teams").select("*").ilike("code",code).single();
    if(!data)return "Team not found. Check the code and try again.";
    teamCode=data.code.toUpperCase(); teamName=data.name; appPin=data.pin||"1234";
  } else { teamCode=team.code.toUpperCase(); teamName=team.name; appPin=team.pin||"1234"; }
  saveTeam(teamCode);
  await loadRoster(); await loadShots(); await loadNotes(); await loadSpotNames();
  await loadSpotCounts(); await loadDailyCheckins(); await loadWeeklyCheckins();
  await loadWeights(); await loadPlayerPins(); await loadCoachComments();
  // Load compete flag for this team
  const thisTeam = teams.find(t=>t.code===teamCode) || (await db.from("teams").select("*").eq("code",teamCode).single()).data;
  teamCompete = thisTeam ? !!thisTeam.compete : false;
  return null;
}
async function saveShot(player,week,cat,spot,day,made,att) {
  const existing=allShots.find(s=>s.player===player&&s.week===week&&s.category===cat&&s.spot===spot&&s.day===day&&s.team_code===teamCode);
  if(existing){const{error}=await db.from("shots").update({made,attempts:att}).eq("id",existing.id);if(!error){existing.made=made;existing.attempts=att;}}
  else{const{data,error}=await db.from("shots").insert({player,week,category:cat,spot,day,made,attempts:att,team_code:teamCode}).select().single();if(!error&&data)allShots.push(data);}
}
async function addPlayerToDB(name) {
  const{error}=await db.from("roster").insert({name,team_code:teamCode});
  if(error)return error.message;
  if(!roster.includes(name))roster.push(name); return null;
}
async function removePlayerFromDB(name) {
  await db.from("roster").delete().eq("name",name).eq("team_code",teamCode);
  await db.from("shots").delete().eq("player",name).eq("team_code",teamCode);
  await db.from("player_pins").delete().eq("player",name).eq("team_code",teamCode);
  await db.from("coach_comments").delete().eq("player",name).eq("team_code",teamCode);
  roster=roster.filter(n=>n!==name);
  allShots=allShots.filter(s=>s.player!==name);
  allPlayerPins=allPlayerPins.filter(p=>p.player!==name);
  allCoachComments=allCoachComments.filter(c=>c.player!==name);
}
async function savePinToDB(pin) {
  appPin=pin;
  await db.from("teams").update({pin}).eq("code",teamCode);
  const{data}=await db.from("roster").select("id").eq("name","__pin__").eq("team_code",teamCode).single();
  if(data){await db.from("roster").update({value:pin}).eq("id",data.id);}
  else{await db.from("roster").insert({name:"__pin__",value:pin,team_code:teamCode});}
}

// ── Stat helpers ──────────────────────────────
function playerTotals(player,weeks) {
  const shots=allShots.filter(s=>s.player===player&&weeks.includes(s.week));
  const tm=shots.reduce((a,s)=>a+(s.made||0),0), ta=shots.reduce((a,s)=>a+(s.attempts||0),0);
  return{m:tm,a:ta,pct:ta?Math.round(tm/ta*100):null,exactPct:ta?(tm/ta*100):null};
}
function playerCatTotals(player,weeks) {
  const out={};
  CATS.forEach(cat=>{
    const shots=allShots.filter(s=>s.player===player&&weeks.includes(s.week)&&s.category===cat);
    const tm=shots.reduce((a,s)=>a+(s.made||0),0),ta=shots.reduce((a,s)=>a+(s.attempts||0),0);
    out[cat]={m:tm,a:ta,pct:ta?Math.round(tm/ta*100):null};
  }); return out;
}
function playerBestDay(player,weeks) {
  let best=null;
  for(let di=0;di<7;di++){
    const shots=allShots.filter(s=>s.player===player&&weeks.includes(s.week)&&s.day===di);
    const tm=shots.reduce((a,s)=>a+(s.made||0),0),ta=shots.reduce((a,s)=>a+(s.attempts||0),0);
    if(ta>0){const p=Math.round(tm/ta*100);if(!best||p>best.pct)best={day:DAYS[di],pct:p,m:tm,a:ta};}
  } return best;
}
function playerImproved(player) {
  const wks=[...new Set(allShots.filter(s=>s.player===player).map(s=>s.week))].sort();
  if(wks.length<2)return null;
  const prev=playerTotals(player,[wks[wks.length-2]]),curr=playerTotals(player,[wks[wks.length-1]]);
  if(prev.pct===null||curr.pct===null)return null;
  return{diff:curr.pct-prev.pct,curr:curr.pct,prev:prev.pct};
}
function weeksForPeriod(period) {
  const key=period==="week"?weekKey():period==="month"?monthKey():yearKey();
  const allWks=[...new Set(allShots.map(s=>s.week))];
  return allWks.filter(wk=>{
    if(period==="week") return wk===key;
    if(period==="month") return wk.startsWith(key);
    if(period==="year") return wk.startsWith(key);
    return true;
  });
}
function playerWeightedMakes(player,weeks) {
  let total=0;
  CATS.forEach(cat=>{
    const w=getWeight(cat);
    const shots=allShots.filter(s=>s.player===player&&weeks.includes(s.week)&&s.category===cat);
    total+=shots.reduce((a,s)=>a+(s.made||0),0)*w;
  }); return total;
}
function getShot(player,week,cat,spot,day) {
  const s=allShots.find(s=>s.player===player&&s.week===week&&s.category===cat&&s.spot===spot&&s.day===day);
  return s?{m:s.made,a:s.attempts}:{m:"",a:""};
}

// ── Utility ───────────────────────────────────
function initials(n){return n.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);}
function pctClass(p){if(p===null)return"";return p>=70?"pct-high":p>=50?"pct-mid":"pct-low";}
function rankMedal(i){return["gold","silver","bronze"][i]||"other";}
function rankSymbol(i){return["🥇","🥈","🥉"][i]||String(i+1);}
function genCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");}
function showToast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2200);}
function render(html){document.getElementById("app").innerHTML=html;}

// ══════════════════════════════════════════════
//  SCREENS
// ══════════════════════════════════════════════

function buildOnboarding() {
  if(onboardStep===0) return `
    <div style="max-width:480px;margin:0 auto;padding:20px 0">
      <div class="banner" style="padding:24px 18px;margin-bottom:18px">
        <div style="font-size:36px;margin-bottom:8px">🎯</div>
        <div style="font-size:22px;font-weight:500;color:#FFD700;margin-bottom:6px">Welcome to Sharpshooter</div>
        <div style="font-size:12px;opacity:.85;font-style:italic">"What gets measured, improves"</div>
      </div>
      <div class="card" style="padding:18px 16px">
        <div style="font-size:14px;line-height:1.6;color:#333">Sharpshooter is your team's shooting workout tracker — track makes and misses, see your weekly stats, and compete for the <strong>Shooting King</strong> crown.</div>
        <div style="margin:14px 0;padding:12px;background:#FFF9E6;border-radius:8px;border-left:3px solid #FFD700">
          <div style="font-size:12px;font-weight:500;color:#856404;margin-bottom:4px">📱 Important</div>
          <div style="font-size:12px;color:#555">This is a web-based app — you won't find it on the App Store. Add it to your home screen to use it like a regular app.</div>
        </div>
        <button data-action="onboard-next" class="btn-primary" style="width:100%;padding:12px;margin-top:8px;font-size:14px">Next →</button>
        <button data-action="onboard-skip" style="width:100%;padding:8px;margin-top:6px;font-size:12px;color:#888">Skip walkthrough</button>
      </div>
      <div style="text-align:center;margin-top:12px;font-size:11px;color:#aaa">Step 1 of 3</div>
    </div>`;
  if(onboardStep===1) return `
    <div style="max-width:480px;margin:0 auto;padding:20px 0">
      <div style="text-align:center;margin-bottom:14px">
        <div style="font-size:32px;margin-bottom:6px">📲</div>
        <div style="font-size:18px;font-weight:500;color:#1A3A5C">Add to Home Screen</div>
      </div>
      <div class="card" style="padding:16px;margin-bottom:10px">
        <div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:8px">🍎 iPhone (Safari)</div>
        <ol style="font-size:12px;color:#444;line-height:1.7;padding-left:20px;margin:0">
          <li>Tap the <strong>Share button</strong> at the bottom</li>
          <li>Tap <strong>"Add to Home Screen"</strong></li>
          <li>Name it <strong>Sharpshooter</strong> and tap <strong>Add</strong></li>
        </ol>
      </div>
      <div class="card" style="padding:16px;margin-bottom:14px">
        <div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:8px">🤖 Android (Chrome)</div>
        <ol style="font-size:12px;color:#444;line-height:1.7;padding-left:20px;margin:0">
          <li>Tap the <strong>three dots</strong> in the top right</li>
          <li>Tap <strong>"Add to Home Screen"</strong></li>
        </ol>
      </div>
      <div style="display:flex;gap:8px">
        <button data-action="onboard-back" style="flex:1;padding:12px;font-size:13px">← Back</button>
        <button data-action="onboard-next" class="btn-primary" style="flex:2;padding:12px;font-size:14px">Next →</button>
      </div>
      <div style="text-align:center;margin-top:12px;font-size:11px;color:#aaa">Step 2 of 3</div>
    </div>`;
  return `
    <div style="max-width:480px;margin:0 auto;padding:20px 0">
      <div style="text-align:center;margin-bottom:14px">
        <div style="font-size:32px;margin-bottom:6px">🔑</div>
        <div style="font-size:18px;font-weight:500;color:#1A3A5C">Join Your Team</div>
      </div>
      <div class="card" style="padding:18px 16px;margin-bottom:14px">
        <div style="font-size:13px;color:#444;line-height:1.6;margin-bottom:12px">Type the 6-character code your coach gave you (like <strong>TODD01</strong>) and tap <strong>Join</strong>.</div>
        <div style="padding:10px 12px;background:#E6F1FB;border-radius:8px">
          <div style="font-size:11px;color:#0C447C;margin-bottom:4px">After joining, you can:</div>
          <div style="font-size:12px;color:#444;line-height:1.7">🏀 Track your daily makes/attempts<br>🏆 Check the leaderboard<br>📊 See your summary<br>🧠 Mental performance check-ins</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button data-action="onboard-back" style="flex:1;padding:12px;font-size:13px">← Back</button>
        <button data-action="onboard-done" class="btn-primary" style="flex:2;padding:12px;font-size:14px">Got it — let's go! 🏀</button>
      </div>
      <div style="text-align:center;margin-top:12px;font-size:11px;color:#aaa">Step 3 of 3</div>
    </div>`;
}

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
        <input type="text" id="join-code" maxlength="6" placeholder="e.g. HOOPS1" value="${joinCodeInput}"
          style="flex:1;text-transform:uppercase;font-size:18px;font-weight:500;letter-spacing:3px;text-align:center" />
        <button onclick="handleJoin()" class="btn-primary">Join</button>
      </div>
      ${joinErr?`<p class="err">${joinErr}</p>`:""}
    </div>
    <div style="text-align:center;margin-top:8px">
      <button onclick="handleNewTeam()" class="btn-primary" style="margin-right:8px">+ Create New Team</button>
      <button data-action="go-coach-global" style="font-size:12px;color:#888">🔒 Coach</button>
    </div>`;
}

function buildCreateTeam() {
  const code=genCode();
  return `
    <div class="banner"><div class="banner-quote">"What gets measured, improves"</div><div class="banner-sub">Sharpshooter — Create New Team</div></div>
    <div class="card">
      <h3>New Team Setup</h3>
      <label>Team Name</label>
      <input type="text" id="new-team-name" placeholder="e.g. Eagles Varsity" style="margin-bottom:10px" />
      <label>Team Code</label>
      <div class="row-flex">
        <input type="text" id="new-team-code" value="${code}" maxlength="6" style="flex:1;text-transform:uppercase;font-size:16px;font-weight:500;letter-spacing:3px;text-align:center" />
        <button onclick="document.getElementById('new-team-code').value='${genCode()}'" style="font-size:11px">New Code</button>
      </div>
      <label style="margin-top:10px">Coach PIN (4 digits)</label>
      <input type="password" id="new-team-pin" maxlength="4" placeholder="4-digit PIN" style="width:140px;margin-bottom:14px" />
      <div id="create-err"></div>
      <button onclick="handleCreateTeam()" class="btn-primary" style="width:100%;padding:11px">Create Team</button>
    </div>
    <div style="text-align:center;margin-top:8px"><button data-action="go-team-select" style="font-size:12px;color:#888">← Back</button></div>`;
}

function buildHome() {
  const btns=roster.length===0
    ?`<p style="color:#888;font-size:13px">No players yet — coach can add players in the coach panel.</p>`
    :roster.map(n=>{
      const hasPin=getPlayerPin(n)!==null;
      const unlocked=isPlayerUnlocked(n,teamCode);
      return `<button class="player-btn" data-action="sel-player" data-name="${n}">
        <div class="avatar">${initials(n)}</div>
        <span style="flex:1">${n}</span>
        <span style="font-size:11px;color:${unlocked?'#27500A':hasPin?'#888':'#2E75B6'};margin-left:4px">
          ${unlocked?'🔓':hasPin?'🔒':'🔑 Set PIN'}
        </span>
      </button>`;
    }).join("");
  return `
    <div class="banner">
      <div class="banner-quote">"What gets measured, improves"</div>
      <div class="banner-sub">${teamName||"Basketball Shooting Tracker"}</div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:11px;color:#888">Team Code: <strong>${teamCode}</strong></div>
      <button onclick="handleSwitchTeam()" style="font-size:11px;color:#888;padding:4px 8px">Switch Team</button>
    </div>
    <div class="card"><h3>Select your name</h3>${btns}</div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:4px">
      <button class="btn-primary" data-action="go-lb">🏆 Leaderboard</button>
      <button class="btn-primary" data-action="go-league" style="background:#27500A">🌐 League</button>
      <button data-action="go-coach" style="font-size:12px;color:#666">🔒 Coach</button>
    </div>`;
}

function buildPin() {
  const dots=Array.from({length:4},(_,i)=>`<div class="pin-dot ${i<pinEntry.length?"filled":""}"></div>`).join("");
  const keys=[1,2,3,4,5,6,7,8,9,null,0,"back"];
  const keyBtns=keys.map(k=>{
    if(k===null)return`<div></div>`;
    if(k==="back")return`<button onclick="pinKey('back')" style="padding:14px;font-size:18px">⌫</button>`;
    return`<button onclick="pinKey('${k}')" style="padding:14px;font-size:18px">${k}</button>`;
  }).join("");
  let title="Coach PIN",subtitle=teamName?`<div style="font-size:11px;color:#888;margin-bottom:8px">${teamName}</div>`:"",hint="";
  if(pinMode==="player-setup"){title="Set Your PIN";subtitle=`<div style="font-size:12px;color:#1A3A5C;margin-bottom:8px;font-weight:500">${curPlayer}</div>`;hint=`<div style="font-size:11px;color:#888;margin-top:4px">Choose a 4-digit PIN to protect your data.</div>`;}
  else if(pinMode==="player-confirm"){title="Confirm Your PIN";subtitle=`<div style="font-size:12px;color:#1A3A5C;margin-bottom:8px;font-weight:500">${curPlayer}</div>`;hint=`<div style="font-size:11px;color:#888;margin-top:4px">Enter the same PIN again.</div>`;}
  else if(pinMode==="player-enter"){title="Enter Your PIN";subtitle=`<div style="font-size:12px;color:#1A3A5C;margin-bottom:8px;font-weight:500">${curPlayer}</div>`;hint=`<div style="font-size:11px;color:#888;margin-top:4px">Or ask your coach to unlock it.</div>`;}
  return `
    <div class="card" style="max-width:280px;margin:20px auto;text-align:center">
      <h3>${title}</h3>${subtitle}
      <div class="pin-dots">${dots}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">${keyBtns}</div>
      ${pinErr?`<p class="err">${pinErr}</p>`:""}${hint}
      <button data-action="go-home" style="width:100%;margin-top:10px;font-size:12px">Cancel</button>
    </div>`;
}

function pinKey(k) {
  if(k==="back"){pinEntry=pinEntry.slice(0,-1);render(buildPin());return;}
  if(pinEntry.length>=4)return;
  pinEntry+=String(k);render(buildPin());
  if(pinEntry.length===4){
    setTimeout(async()=>{
      if(pinMode==="coach"){
        if(pinEntry===appPin){coachOpen=true;screen="coach";coachTab="dashboard";unlockAllPlayers();pinErr="";pinEntry="";render(buildCoach());}
        else{pinErr="Incorrect PIN";pinEntry="";render(buildPin());}
        return;
      }
      if(pinMode==="player-setup"){pinSetupFirst=pinEntry;pinEntry="";pinMode="player-confirm";pinErr="";render(buildPin());return;}
      if(pinMode==="player-confirm"){
        if(pinEntry===pinSetupFirst){await savePlayerPin(curPlayer,pinEntry);setUnlockedPlayer(curPlayer,teamCode);pinErr="";pinEntry="";pinSetupFirst="";pinMode="coach";showToast("✓ PIN set! You're in.");screen="player";render(buildPlayer());}
        else{pinErr="PINs don't match — try again";pinEntry="";pinMode="player-setup";pinSetupFirst="";render(buildPin());}
        return;
      }
      if(pinMode==="player-enter"){
        const stored=getPlayerPin(curPlayer);
        if(pinEntry===stored||pinEntry===appPin){setUnlockedPlayer(curPlayer,teamCode);pinErr="";pinEntry="";pinMode="coach";screen="player";render(buildPlayer());}
        else{pinErr="Incorrect PIN";pinEntry="";render(buildPin());}
        return;
      }
    },150);
  }
}

// ── Coach panel ───────────────────────────────
function buildCoach() {
  const tabs=["dashboard","roster","settings"];
  const nav=`<div class="nav-bar">
    ${tabs.map(t=>`<button data-action="ctab" data-t="${t}" class="${coachTab===t?"btn-primary":""}">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`).join("")}
    <button data-action="go-home" style="margin-left:auto;font-size:12px">← Exit</button>
  </div>`;
  let body="";
  if(coachTab==="dashboard") body=buildDash();
  if(coachTab==="roster")    body=coachViewPlayer ? buildCoachPlayerView() : buildRoster();
  if(coachTab==="settings")  body=buildSettings();
  return nav+body;
}

function buildDash() {
  const wk=weekKey(),weeks=[wk];
  if(!roster.length)return`<div class="card"><p style="color:#888">Add players in the Roster tab.</p></div>`;
  const catShort=["Form","C&S","C&S 3","PU","PU 3","Finish"];
  const rows=roster.map(name=>{
    const cats=playerCatTotals(name,weeks),tot=playerTotals(name,weeks);
    return`<tr><td style="font-weight:500">${name}</td>${CATS.map(c=>{const p=cats[c].pct;return`<td class="${pctClass(p)}">${p===null?"—":p+"%"}</td>`;}).join("")}<td class="${pctClass(tot.pct)}" style="font-weight:500">${tot.pct===null?"—":tot.pct+"%"}</td><td style="color:#888">${tot.m}/${tot.a}</td></tr>`;
  }).join("");
  const catAvgs=CATS.map((cat,ci)=>{
    let tm=0,ta=0;roster.forEach(n=>{const c=playerCatTotals(n,weeks)[cat];tm+=c.m;ta+=c.a;});
    const p=ta?Math.round(tm/ta*100):null;
    return`<div class="metric"><div class="metric-label">${catShort[ci]}</div><div class="metric-val ${pctClass(p)}">${p===null?"—":p+"%"}</div></div>`;
  }).join("");
  return`
    <div class="card">
      <div style="font-size:11px;color:#888;margin-bottom:4px">Team: <strong>${teamName}</strong> · Code: <strong>${teamCode}</strong> · Week of ${fmtWeek(wk)}</div>
      <h3>Team this week</h3>
      <div style="overflow-x:auto"><table class="dash">
        <thead><tr><th style="text-align:left">Player</th>${catShort.map(c=>`<th>${c}</th>`).join("")}<th>Overall</th><th>M/A</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>
    <div class="card"><h3>Category averages</h3><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${catAvgs}</div></div>`;
}

function buildRoster() {
  const items=roster.length
    ?roster.map(n=>{
      const hasPin=getPlayerPin(n)!==null;
      const playerComment=getCoachComment(n,"player",null,null);
      return`<div class="roster-item">
        <div style="display:flex;align-items:center;gap:9px">
          <div class="avatar">${initials(n)}</div>
          <div>
            <div>${n}</div>
            <div style="font-size:10px;color:${hasPin?'#888':'#2E75B6'}">${hasPin?'🔒 PIN set':'🔑 No PIN yet'}</div>
            ${playerComment?`<div style="font-size:10px;color:#856404;margin-top:1px">💬 Has coach note</div>`:""}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          <button class="btn-sm btn-primary" data-action="coach-view-player" data-name="${n}" style="font-size:11px;width:100%">💬 Comments</button>
          <div style="display:flex;gap:4px">
            ${hasPin?`<button class="btn-sm" data-action="reset-player-pin" data-name="${n}" style="font-size:10px">Reset PIN</button>`:""}
            <button class="btn-sm btn-danger" data-action="rm-player" data-name="${n}">🗑</button>
          </div>
        </div>
      </div>`;
    }).join("")
    :`<p style="color:#888;font-size:13px;padding:6px 0">No players yet.</p>`;
  return`
    <div class="card"><h3>Roster (${roster.length})</h3>${items}</div>
    <div class="card">
      <h3>Add player</h3>
      <div class="row-flex"><input type="text" id="np" placeholder="Player name" style="flex:1" /><button data-action="add-player" class="btn-primary">Add</button></div>
      <div id="rmsg"></div>
    </div>`;
}

// ── Coach player comment view ─────────────────
function buildCoachPlayerView() {
  const name=coachViewPlayer, wk=weekKey();
  const tot=playerTotals(name,[wk]);

  const playerCmnt=getCoachComment(name,"player",null,null);
  const weekCmnt=getCoachComment(name,"week",wk,null);
  const dayCmnt=getCoachComment(name,"day",wk,coachCommentDay);

  const dayLabels=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

  return`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <button data-action="coach-back-roster" style="font-size:12px">← Roster</button>
      <div class="avatar avatar-lg">${initials(name)}</div>
      <div style="flex:1">
        <div style="font-weight:500;font-size:15px">${name}</div>
        <div style="font-size:11px;color:#888">This week: ${tot.pct===null?"no data":tot.pct+"% ("+tot.m+"/"+tot.a+")"}</div>
      </div>
    </div>

    <div class="card" style="padding:16px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:4px">📌 Player Note</div>
      <div style="font-size:11px;color:#888;margin-bottom:8px">Stays on their profile until you update it.</div>
      <textarea id="coach-player-note" placeholder="e.g. Great attitude this week. Keep working on left-hand finishes."
        style="width:100%;min-height:70px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;background:#fafafa">${(playerCmnt?.text||"").replace(/"/g,'&quot;')}</textarea>
      <button data-action="save-coach-comment" data-type="player" data-week="" data-day=""
        class="btn-primary" style="width:100%;padding:10px;margin-top:8px;font-size:13px">Save Player Note</button>
    </div>

    <div class="card" style="padding:16px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:4px">📅 Week Note</div>
      <div style="font-size:11px;color:#888;margin-bottom:8px">For week of ${fmtWeek(wk)}.</div>
      <textarea id="coach-week-note" placeholder="e.g. Good effort this week overall. Focus on Catch & Shoot form next week."
        style="width:100%;min-height:70px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;background:#fafafa">${(weekCmnt?.text||"").replace(/"/g,'&quot;')}</textarea>
      <button data-action="save-coach-comment" data-type="week" data-week="${wk}" data-day=""
        class="btn-primary" style="width:100%;padding:10px;margin-top:8px;font-size:13px">Save Week Note</button>
    </div>

    <div class="card" style="padding:16px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:4px">🗓 Day Note</div>
      <div style="font-size:11px;color:#888;margin-bottom:8px">Pick a day then leave your note.</div>
      <div style="display:flex;gap:4px;margin-bottom:10px;overflow-x:auto">
        ${DAYS.map((d,di)=>`<button onclick="coachSelectDay(${di})" style="flex:1;min-width:38px;padding:7px 4px;border:none;border-radius:6px;font-size:11px;font-weight:500;background:${coachCommentDay===di?'#1A3A5C':'#f0f0f0'};color:${coachCommentDay===di?'#fff':'#444'};cursor:pointer">${d}</button>`).join("")}
      </div>
      <div style="font-size:12px;color:#888;margin-bottom:6px">${dayLabels[coachCommentDay]}</div>
      <textarea id="coach-day-note" placeholder="e.g. Looked tired today. Good pull-up game from the right side."
        style="width:100%;min-height:70px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;background:#fafafa">${(dayCmnt?.text||"").replace(/"/g,'&quot;')}</textarea>
      <button data-action="save-coach-comment" data-type="day" data-week="${wk}" data-day="${coachCommentDay}"
        class="btn-primary" style="width:100%;padding:10px;margin-top:8px;font-size:13px">Save Day Note</button>
    </div>`;
}

function coachSelectDay(d) { coachCommentDay=d; render(buildCoach()); }

function buildSettings() {
  return`
    <div class="card">
      <h3>Team Info</h3>
      <div style="font-size:13px;margin-bottom:4px">Team Name: <strong>${teamName}</strong></div>
      <div style="font-size:13px;margin-bottom:12px">Team Code: <strong style="letter-spacing:2px;font-size:16px">${teamCode}</strong></div>
      <p style="font-size:11px;color:#888">Share this code with your players so they can join the team.</p>
    </div>
    <div class="card">
      <h3>Change Coach PIN</h3>
      <label>New 4-digit PIN</label>
      <div class="row-flex"><input type="password" id="npin" maxlength="4" placeholder="New PIN" style="width:130px" /><button data-action="save-pin" class="btn-primary">Save</button></div>
      <div id="pmsg"></div>
    </div>
    <div class="card">
      <h3>🏆 League Competition</h3>
      <p style="font-size:12px;color:#888;margin-bottom:12px">Opt your team into the cross-team league. Your team's weekly totals will appear on the League board visible to all teams.</p>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:13px;font-weight:500;color:#1A3A5C">${teamCompete ? '✅ Competing in League' : '⭕ Not in League'}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">${teamCompete ? 'Your team shows on the League board.' : 'Enable to compete against other teams.'}</div>
        </div>
        <button data-action="toggle-compete" class="${teamCompete?'btn-primary':''}" style="padding:10px 16px;font-size:13px;font-weight:500">
          ${teamCompete ? 'Leave League' : 'Join League'}
        </button>
      </div>
    </div>`;
}

// ── Player screen ─────────────────────────────
function buildPlayer() {
  const name=curPlayer,wk=weekKey();
  const tot=playerTotals(name,[wk]);
  const isMobile=window.innerWidth<700;
  let html=`
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
    </div>
    <div style="display:flex;gap:6px;margin-bottom:10px">
      <button data-action="go-summary" class="btn-primary" style="flex:1;padding:8px;font-size:12px">📊 My Summary</button>
    </div>`;

  if(isMobile) {
    html+=`<div style="display:flex;gap:4px;margin-bottom:10px;background:#fff;padding:6px;border-radius:10px;border:0.5px solid #e0e0e0;overflow-x:auto">`;
    DAYS.forEach((d,di)=>{
      let dayM=0,dayA=0;
      CATS.forEach(cat=>{for(let si=0;si<N_SPOTS;si++){const v=getShot(name,wk,cat,si,di);dayM+=parseInt(v.m)||0;dayA+=parseInt(v.a)||0;}});
      const hasData=dayA>0,isToday=di===selectedDay;
      html+=`<button onclick="selectDay(${di})" style="flex:1;min-width:42px;padding:8px 4px;border:none;border-radius:7px;font-size:11px;font-weight:500;background:${isToday?'#1A3A5C':hasData?'#E6F1FB':'transparent'};color:${isToday?'#fff':hasData?'#0C447C':'#888'};cursor:pointer">
        <div>${d}</div>${hasData?`<div style="font-size:9px;margin-top:2px;opacity:.8">${dayM}/${dayA}</div>`:''}
      </button>`;
    });
    html+=`</div>`;
    const dayLabel=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][selectedDay];
    html+=`<div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:8px;text-align:center">${dayLabel}'s Workout</div>`;
    const noteText=getNote(name,wk,selectedDay);
    html+=`<div class="card" style="padding:.75rem 1rem;margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:12px;font-weight:500;color:#1A3A5C">📝 ${dayLabel} Notes</div>
        <div style="font-size:10px;color:#888">How did it feel?</div>
      </div>
      <textarea data-note-day="${selectedDay}" placeholder="Quick thoughts..."
        style="width:100%;min-height:60px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;background:#fafafa">${noteText.replace(/"/g,'&quot;')}</textarea>
    </div>`;
    CATS.forEach(cat=>{
      const nSpots=getSpotCount(curPlayer,cat),catIdx=CATS.indexOf(cat);
      html+=`<div class="cat-hdr" style="display:flex;align-items:center;justify-content:space-between">
        <span>${cat}</span>
        <span style="display:flex;gap:4px;align-items:center">
          <button data-action="spot-minus" data-catidx="${catIdx}" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:26px;height:26px;border-radius:4px;font-size:15px;font-weight:500;cursor:pointer">−</button>
          <span style="font-size:10px;color:#fff;min-width:38px;text-align:center">${nSpots} spots</span>
          <button data-action="spot-plus" data-catidx="${catIdx}" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:26px;height:26px;border-radius:4px;font-size:15px;font-weight:500;cursor:pointer">+</button>
        </span>
      </div>
      <div class="card" style="padding:.75rem 1rem">
        <div style="display:grid;grid-template-columns:78px 1fr 1fr 50px;gap:6px;align-items:center;margin-bottom:6px">
          <div style="font-size:10px;color:#aaa;font-weight:500">Spot</div>
          <div style="font-size:10px;color:#aaa;font-weight:500;text-align:center">Made</div>
          <div style="font-size:10px;color:#aaa;font-weight:500;text-align:center">Attempts</div>
          <div style="font-size:10px;color:#aaa;font-weight:500;text-align:center">%</div>
        </div>`;
      for(let si=0;si<nSpots;si++){
        const val=getShot(name,wk,cat,si,selectedDay);
        const mv=parseInt(val.m)||0,av=parseInt(val.a)||0,p=av?Math.round(mv/av*100):null;
        const customLabel=getSpotLabel(name,cat,si);
        html+=`<div style="display:grid;grid-template-columns:78px 1fr 1fr 50px;gap:6px;align-items:center;margin-bottom:8px">
          <input type="text" data-spot-label-cat="${cat}" data-spot-label-si="${si}" placeholder="Spot ${si+1}" value="${customLabel.replace(/"/g,'&quot;')}"
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
      html+=`</div>`;
    });
  } else {
    // Desktop
    html+=`<div class="card" style="padding:.75rem 1rem;margin-bottom:10px">
      <div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:8px">📝 Daily Notes</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">`;
    DAYS.forEach((d,di)=>{
      const noteText=getNote(name,wk,di);
      html+=`<div><div style="font-size:10px;color:#888;font-weight:500;margin-bottom:3px">${d}</div>
        <textarea data-note-day="${di}" placeholder="Notes..." style="width:100%;min-height:50px;padding:5px 6px;border:0.5px solid #ddd;border-radius:5px;font-size:11px;font-family:inherit;resize:none;background:#fafafa">${noteText.replace(/"/g,'&quot;')}</textarea>
      </div>`;
    });
    html+=`</div></div>`;
    CATS.forEach(cat=>{
      const nSpots=getSpotCount(curPlayer,cat),catIdxD=CATS.indexOf(cat);
      html+=`<div class="cat-hdr" style="display:flex;align-items:center;justify-content:space-between">
        <span>${cat}</span>
        <span style="display:flex;gap:4px;align-items:center">
          <button data-action="spot-minus" data-catidx="${catIdxD}" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:22px;height:22px;border-radius:4px;font-size:13px;cursor:pointer">−</button>
          <span style="font-size:10px;color:#fff;min-width:40px;text-align:center">${nSpots} spots</span>
          <button data-action="spot-plus" data-catidx="${catIdxD}" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:22px;height:22px;border-radius:4px;font-size:13px;cursor:pointer">+</button>
        </span>
      </div>
      <div class="card" style="padding:.65rem .9rem;overflow-x:auto">
        <div class="spot-grid" style="margin-bottom:5px">
          <div></div>${DAYS.map(d=>`<div style="text-align:center;font-size:10px;color:#aaa;font-weight:500">${d}</div>`).join("")}
          <div style="text-align:center;font-size:10px;color:#888;font-weight:500">Wk%</div>
        </div>`;
      for(let si=0;si<nSpots;si++){
        let sm=0,sa=0;
        const dayInputs=DAYS.map((_,di)=>{
          const val=getShot(name,wk,cat,si,di);
          sm+=parseInt(val.m)||0;sa+=parseInt(val.a)||0;
          return`<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px">
            <input type="number" min="0" max="99" placeholder="M" value="${val.m}" data-cat="${cat}" data-si="${si}" data-di="${di}" data-f="m" style="padding:4px 2px;text-align:center;font-size:11px;border:0.5px solid #ddd;border-radius:3px;width:100%" />
            <input type="number" min="0" max="99" placeholder="A" value="${val.a}" data-cat="${cat}" data-si="${si}" data-di="${di}" data-f="a" style="padding:4px 2px;text-align:center;font-size:11px;border:0.5px solid #ddd;border-radius:3px;background:#f9f9f9;width:100%" />
          </div>`;
        }).join("");
        const sp=sa?Math.round(sm/sa*100):null,customLabel=getSpotLabel(name,cat,si);
        html+=`<div class="spot-grid">
          <input type="text" data-spot-label-cat="${cat}" data-spot-label-si="${si}" placeholder="Spot ${si+1}" value="${customLabel.replace(/"/g,'&quot;')}"
            style="font-size:10px;color:#1A3A5C;font-weight:500;padding:3px 4px;border:0.5px solid #e0e0e0;border-radius:4px;background:#f5f7fa;width:100%" />
          ${dayInputs}
          <div class="pct-pill ${pctClass(sp)}" id="pp-${cat.replace(/\W/g,'_')}-${si}">${sp===null?"—":sp+"%"}</div>
        </div>`;
      }
      html+=`</div>`;
    });
  }
  html+=`<button data-action="save-player" class="btn-primary" style="width:100%;padding:14px;margin-top:10px;font-size:15px;font-weight:500">✓ Save my numbers</button>`;
  return html;
}

// ── Progress chart ────────────────────────────
function buildProgressChart(playerName) {
  const weeks=[...new Set(allShots.filter(s=>s.player===playerName).map(s=>s.week))].sort();
  if(weeks.length<2)return`<div class="card" style="padding:16px;text-align:center;color:#888;font-size:12px">📈 Progress chart will appear after 2+ weeks of data.</div>`;
  const catData={};
  CATS.forEach(cat=>{catData[cat]=weeks.map(wk=>{const shots=allShots.filter(s=>s.player===playerName&&s.week===wk&&s.category===cat);const m=shots.reduce((a,s)=>a+(s.made||0),0),a=shots.reduce((a,s)=>a+(s.attempts||0),0);return{wk,pct:a>0?Math.round(m/a*100):null};});});
  const CAT_COLORS={"Form Shooting":"#888888","Catch & Shoot":"#2E75B6","Catch & Shoot 3s":"#1A3A5C","1-Dribble Pull-Up":"#27500A","1-Dribble Pull-Up 3s":"#1E8449","Finishes":"#B8860B"};
  const W=340,H=200,padL=40,padR=14,padT=14,padB=30,chartW=W-padL-padR,chartH=H-padT-padB;
  const xStep=weeks.length>1?chartW/(weeks.length-1):0,xPos=i=>padL+i*xStep,yPct=p=>padT+chartH-(p/100)*chartH;
  const yGridLines=[0,25,50,75,100].map(p=>`<line x1="${padL}" y1="${yPct(p)}" x2="${W-padR}" y2="${yPct(p)}" stroke="#eee" stroke-width="0.5" /><text x="${padL-4}" y="${yPct(p)+3}" font-size="9" text-anchor="end" fill="#888">${p}%</text>`).join("");
  let allLines="";
  CATS.forEach(cat=>{
    const color=CAT_COLORS[cat]||"#888",pts=catData[cat].map((d,i)=>d.pct!==null?{x:xPos(i),y:yPct(d.pct)}:null).filter(p=>p);
    if(!pts.length)return;
    allLines+=`<polyline points="${pts.map(p=>`${p.x},${p.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width="1.8" />${pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${color}" />`).join("")}`;
  });
  const labelIdxs=weeks.length<=4?weeks.map((_,i)=>i):[0,Math.floor((weeks.length-1)/2),weeks.length-1];
  const xLabels=labelIdxs.map(i=>{const d=new Date(weeks[i]+"T12:00:00"),lbl=d.toLocaleDateString("en-US",{month:"short",day:"numeric"});return`<text x="${xPos(i)}" y="${H-14}" font-size="9" text-anchor="middle" fill="#888">${lbl}</text>`;}).join("");
  const legend=CATS.map(cat=>{const color=CAT_COLORS[cat]||"#888",latest=[...catData[cat]].reverse().find(d=>d.pct!==null);return`<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:#444"><span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:2px"></span><span style="flex:1">${cat}</span><span style="font-weight:500;color:${color}">${latest?latest.pct+"%":"—"}</span></div>`;}).join("");
  return`<div class="card" style="padding:14px 16px">
    <div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:10px">📈 Weekly % by Category</div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${yGridLines}${allLines}${xLabels}</svg>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;padding-top:10px;border-top:0.5px solid #eee">${legend}</div>
    <div style="font-size:10px;color:#888;margin-top:8px;text-align:center;font-style:italic">💡 In-gym shooting % is the ceiling — what you can do here predicts what you'll do in a game</div>
  </div>`;
}

// ── Coach feedback block (player-facing) ──────
function buildCoachFeedback(playerName) {
  const wk=weekKey();
  const playerCmnt=getCoachComment(playerName,"player",null,null);
  const weekCmnt=getCoachComment(playerName,"week",wk,null);

  // Find most recent day comment this week
  let recentDayCmnt=null,recentDayIdx=null;
  for(let d=6;d>=0;d--){
    const c=getCoachComment(playerName,"day",wk,d);
    if(c&&c.text){recentDayCmnt=c;recentDayIdx=d;break;}
  }

  const hasAny=playerCmnt||weekCmnt||recentDayCmnt;
  if(!hasAny)return"";

  const dayLabels=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

  return`
    <div class="card" style="padding:16px;background:linear-gradient(135deg,#1A3A5C08,transparent);border-left:3px solid #1A3A5C;margin-bottom:8px">
      <div style="font-size:12px;font-weight:500;color:#1A3A5C;margin-bottom:10px">💬 Coach Feedback</div>
      ${playerCmnt?`
        <div style="margin-bottom:10px">
          <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;font-weight:500;margin-bottom:4px">📌 General</div>
          <div style="font-size:13px;color:#333;line-height:1.5">${playerCmnt.text}</div>
        </div>`:""}
      ${weekCmnt?`
        <div style="margin-bottom:10px">
          <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;font-weight:500;margin-bottom:4px">📅 This Week</div>
          <div style="font-size:13px;color:#333;line-height:1.5">${weekCmnt.text}</div>
        </div>`:""}
      ${recentDayCmnt?`
        <div>
          <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;font-weight:500;margin-bottom:4px">🗓 ${dayLabels[recentDayIdx]}</div>
          <div style="font-size:13px;color:#333;line-height:1.5">${recentDayCmnt.text}</div>
        </div>`:""}
    </div>`;
}

// ── Check-ins ─────────────────────────────────
function buildDailyCheckin() {
  const name=curPlayer,wk=weekKey();
  const dayLabel=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][selectedDay];
  const existing=getDailyCheckin(name,wk,selectedDay)||{};
  return`
    <div style="max-width:520px;margin:0 auto">
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;font-weight:500">🧠 Daily Check-In</div>
        <div style="font-size:13px;color:#1A3A5C;margin-top:4px">${dayLabel} — ${name}</div>
      </div>
      <div class="card" style="padding:18px 16px;margin-bottom:12px">
        <div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:12px">Did you bring your best effort today?</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button data-checkin="effort" data-val="Yes" class="${existing.effort==='Yes'?'btn-primary':''}" style="padding:14px;font-size:14px;font-weight:500">✓ Yes</button>
          <button data-checkin="effort" data-val="No" class="${existing.effort==='No'?'btn-primary':''}" style="padding:14px;font-size:14px;font-weight:500">No</button>
        </div>
      </div>
      <div class="card" style="padding:18px 16px;margin-bottom:12px">
        <div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:12px">When something went wrong, what did you do?</div>
        <div style="display:grid;gap:6px">
          <button data-checkin="recovery" data-val="Flushed it" class="${existing.recovery==='Flushed it'?'btn-primary':''}" style="padding:12px;font-size:13px;font-weight:500;text-align:left">🔥 Flushed it and moved on</button>
          <button data-checkin="recovery" data-val="Got down a little" class="${existing.recovery==='Got down a little'?'btn-primary':''}" style="padding:12px;font-size:13px;font-weight:500;text-align:left">😬 Got down a little but recovered</button>
          <button data-checkin="recovery" data-val="Stayed down" class="${existing.recovery==='Stayed down'?'btn-primary':''}" style="padding:12px;font-size:13px;font-weight:500;text-align:left">😔 Got down and stayed down</button>
        </div>
      </div>
      <div class="card" style="padding:18px 16px;margin-bottom:14px">
        <div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:12px">One word for how you felt today?</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${["Locked In","Solid","Off","Frustrated","Tired","Confident"].map(f=>`<button data-checkin="feeling" data-val="${f}" class="${existing.feeling===f?'btn-primary':''}" style="padding:11px;font-size:13px;font-weight:500">${f}</button>`).join("")}
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button data-action="skip-checkin" style="flex:1;padding:12px;font-size:13px;color:#888">Skip for now</button>
        <button data-action="save-checkin" class="btn-primary" style="flex:2;padding:12px;font-size:14px;font-weight:500">✓ Save Check-In</button>
      </div>
    </div>`;
}

function buildWeeklyCheckin() {
  const name=curPlayer,wk=weekKey();
  const existing=getWeeklyCheckin(name,wk)||{};
  return`
    <div style="max-width:520px;margin:0 auto">
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;font-weight:500">🧠 Weekly Check-In</div>
        <div style="font-size:13px;color:#1A3A5C;margin-top:4px">Week of ${fmtWeek(wk)} — ${name}</div>
      </div>
      <div class="card" style="padding:18px 16px;margin-bottom:12px">
        <div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:8px">Did your actions this week match your goals?</div>
        <div style="font-size:11px;color:#888;margin-bottom:14px">Slide honestly. 1 = not at all. 10 = locked in all week.</div>
        <div style="display:flex;align-items:center;gap:12px">
          <input type="range" id="alignment-slider" min="1" max="10" value="${existing.alignment||5}" style="flex:1" oninput="document.getElementById('alignment-val').textContent=this.value" />
          <div id="alignment-val" style="font-size:22px;font-weight:500;color:#1A3A5C;min-width:30px;text-align:center">${existing.alignment||5}</div>
        </div>
      </div>
      <div class="card" style="padding:18px 16px;margin-bottom:12px">
        <div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:12px">Did you compete with confidence this week?</div>
        <div style="display:grid;gap:6px">
          <button data-wcheckin="confidence" data-val="Full confidence" class="${existing.confidence==='Full confidence'?'btn-primary':''}" style="padding:12px;font-size:13px;font-weight:500;text-align:left">💯 Full confidence — I trusted my work</button>
          <button data-wcheckin="confidence" data-val="Some confidence" class="${existing.confidence==='Some confidence'?'btn-primary':''}" style="padding:12px;font-size:13px;font-weight:500;text-align:left">👍 Some confidence in spots</button>
          <button data-wcheckin="confidence" data-val="In my head" class="${existing.confidence==='In my head'?'btn-primary':''}" style="padding:12px;font-size:13px;font-weight:500;text-align:left">🤔 In my head more than I should've been</button>
        </div>
      </div>
      <div class="card" style="padding:18px 16px;margin-bottom:14px">
        <div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:12px">Rate your self-talk this week.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
          <button data-wcheckin="selftalk" data-val="Positive" class="${existing.selftalk==='Positive'?'btn-primary':''}" style="padding:11px;font-size:12px;font-weight:500">Positive</button>
          <button data-wcheckin="selftalk" data-val="Mixed" class="${existing.selftalk==='Mixed'?'btn-primary':''}" style="padding:11px;font-size:12px;font-weight:500">Mixed</button>
          <button data-wcheckin="selftalk" data-val="Negative" class="${existing.selftalk==='Negative'?'btn-primary':''}" style="padding:11px;font-size:12px;font-weight:500">Negative</button>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button data-action="go-home" style="flex:1;padding:12px;font-size:13px;color:#888">Cancel</button>
        <button data-action="save-wcheckin" class="btn-primary" style="flex:2;padding:12px;font-size:14px;font-weight:500">✓ Save Weekly Check-In</button>
      </div>
    </div>`;
}

// ── Summary ───────────────────────────────────
function buildSummary() {
  const name=curPlayer,wk=weekKey(),mo=monthKey(),yr=yearKey();
  const playerWeeks=[...new Set(allShots.filter(s=>s.player===name).map(s=>s.week))].sort();
  const weekWeeks=[wk],monthWeeks=playerWeeks.filter(w=>w.startsWith(mo)),yearWeeks=playerWeeks.filter(w=>w.startsWith(yr));
  function periodStats(weeks){return{tot:playerTotals(name,weeks),cats:playerCatTotals(name,weeks),best:playerBestDay(name,weeks),wkCount:weeks.length};}
  const weekS=periodStats(weekWeeks),monthS=periodStats(monthWeeks),yearS=periodStats(yearWeeks);
  let trend=null;
  if(playerWeeks.length>=2){const prev=playerTotals(name,[playerWeeks[playerWeeks.length-2]]);if(prev.pct!==null&&weekS.tot.pct!==null)trend=weekS.tot.pct-prev.pct;}
  let bestSpot=null;
  CATS.forEach(cat=>{const nSpots=getSpotCount(name,cat);for(let si=0;si<nSpots;si++){let sm=0,sa=0;for(let di=0;di<7;di++){const v=getShot(name,wk,cat,si,di);sm+=parseInt(v.m)||0;sa+=parseInt(v.a)||0;}if(sa>=10){const p=Math.round(sm/sa*100);if(!bestSpot||p>bestSpot.pct){const label=getSpotLabel(name,cat,si)||`Spot ${si+1}`;bestSpot={cat,label,pct:p,m:sm,a:sa};}}}});
  function periodCard(label,stats,color){return`<div class="card" style="padding:14px 16px;background:linear-gradient(135deg,${color}10,transparent)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:11px;color:#888;letter-spacing:.5px;text-transform:uppercase;font-weight:500">${label}</div>
      <div style="font-size:10px;color:#888">${stats.wkCount} week${stats.wkCount===1?'':'s'}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center">
      <div><div style="font-size:22px;font-weight:500;color:${color}">${stats.tot.pct===null?"—":stats.tot.pct+"%"}</div><div style="font-size:10px;color:#888">Shooting %</div></div>
      <div><div style="font-size:22px;font-weight:500;color:#1A3A5C">${stats.tot.m}</div><div style="font-size:10px;color:#888">Makes</div></div>
      <div><div style="font-size:22px;font-weight:500;color:#1A3A5C">${stats.tot.a}</div><div style="font-size:10px;color:#888">Attempts</div></div>
    </div>
  </div>`;}
  const catRows=CATS.map(cat=>{const wkC=weekS.cats[cat],moC=monthS.cats[cat],yrC=yearS.cats[cat];return`<tr><td style="text-align:left;font-weight:500;font-size:11px">${cat}</td><td class="${pctClass(wkC.pct)}">${wkC.pct===null?"—":wkC.pct+"%"}</td><td class="${pctClass(moC.pct)}">${moC.pct===null?"—":moC.pct+"%"}</td><td class="${pctClass(yrC.pct)}">${yrC.pct===null?"—":yrC.pct+"%"}</td></tr>`;}).join("");
  const trendHtml=trend!==null?`<div style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:8px;font-size:11px;font-weight:500;background:${trend>=0?'#E6F7EC':'#FDECEC'};color:${trend>=0?'#27500A':'#A32D2D'}">${trend>=0?'▲':'▼'} ${Math.abs(trend)}% vs last week</div>`:'';
  const hasWeekly=getWeeklyCheckin(name,weekKey());
  return`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <button data-action="go-home">← Back</button>
      <div class="avatar avatar-lg">${initials(name)}</div>
      <div style="flex:1"><div style="font-weight:500;font-size:15px">${name}</div><div style="font-size:11px;color:#888">📊 Summary</div></div>
      ${trendHtml}
    </div>
    <button data-action="go-weekly-checkin" class="btn-primary" style="width:100%;padding:11px;margin-bottom:12px;font-size:13px;font-weight:500">🧠 ${hasWeekly?'Update':'Start'} Weekly Check-In</button>
    ${buildCoachFeedback(name)}
    ${buildProgressChart(name)}
    ${periodCard('This Week',weekS,'#1A3A5C')}
    ${periodCard('This Month',monthS,'#2E75B6')}
    ${periodCard('This Year',yearS,'#1E8449')}
    ${bestSpot?`<div class="card" style="padding:14px 16px;background:linear-gradient(135deg,#FFF9E6,transparent);border:1px solid #FFD700">
      <div style="font-size:11px;color:#856404;letter-spacing:.5px;text-transform:uppercase;font-weight:500;margin-bottom:6px">🎯 Best Spot This Week</div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div><div style="font-weight:500;font-size:14px">${bestSpot.label}</div><div style="font-size:11px;color:#888">${bestSpot.cat}</div></div>
        <div style="text-align:right"><div style="font-size:22px;font-weight:500;color:#856404">${bestSpot.pct}%</div><div style="font-size:10px;color:#888">${bestSpot.m}/${bestSpot.a} shots</div></div>
      </div>
    </div>`:''}
    <div class="card" style="padding:14px 16px">
      <div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:10px">By Category</div>
      <table class="dash"><thead><tr><th style="text-align:left">Category</th><th>Week</th><th>Month</th><th>Year</th></tr></thead><tbody>${catRows}</tbody></table>
    </div>`;
}

// ── League screen ─────────────────────────────
async function buildLeague() {
  render(`<div class="loading" style="padding:40px;text-align:center">Loading League...</div>`);
  await loadLeagueData();

  const wk = weekKey();
  if(leagueTeams.length === 0) {
    render(`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <button data-action="go-home">← Back</button>
        <span style="font-weight:500;font-size:15px">🌐 League</span>
      </div>
      <div class="card" style="text-align:center;padding:30px 20px">
        <div style="font-size:32px;margin-bottom:10px">🏀</div>
        <div style="font-size:15px;font-weight:500;color:#1A3A5C;margin-bottom:8px">No teams in the league yet</div>
        <div style="font-size:12px;color:#888">Coaches can join the league from Coach Panel → Settings.</div>
      </div>`);
    return;
  }

  // Calculate team totals for this week
  const teamStats = leagueTeams.map(team => {
    const shots = leagueShots.filter(s => s.team_code === team.code);
    const made  = shots.reduce((a,s) => a+(s.made||0), 0);
    const att   = shots.reduce((a,s) => a+(s.attempts||0), 0);
    const pct   = att ? Math.round(made/att*100) : null;

    // Weighted King points — use default weights (1.0) for cross-team since we don't load all team weights
    const weightMap = {"Form Shooting":0.5,"Catch & Shoot":1.0,"Catch & Shoot 3s":3.0,"1-Dribble Pull-Up":2.0,"1-Dribble Pull-Up 3s":4.0,"Finishes":1.0};
    let kingPts = 0;
    CATS.forEach(cat => {
      const w = weightMap[cat] || 1.0;
      const catMade = shots.filter(s=>s.category===cat).reduce((a,s)=>a+(s.made||0),0);
      kingPts += catMade * w;
    });

    return { code: team.code, name: team.name, made, att, pct, kingPts: Math.round(kingPts*10)/10 };
  }).filter(t => t.kingPts > 0).sort((a,b) => b.kingPts - a.kingPts);

  if(teamStats.length === 0) {
    render(`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <button data-action="go-home">← Back</button>
        <span style="font-weight:500;font-size:15px">🌐 League</span>
      </div>
      <div class="card" style="text-align:center;padding:30px 20px">
        <div style="font-size:32px;margin-bottom:10px">🏀</div>
        <div style="font-size:15px;font-weight:500;color:#1A3A5C;margin-bottom:8px">${leagueTeams.length} team${leagueTeams.length===1?'':'s'} in the league</div>
        <div style="font-size:12px;color:#888">No shots logged this week yet. Check back after practice!</div>
      </div>`);
    return;
  }

  const champion = teamStats[0];
  const medals = ["🥇","🥈","🥉"];
  const medalColors = ["#FFD700","#C0C0C0","#CD7F32"];

  const championBanner = `
    <div style="background:linear-gradient(135deg,#2a1a00,#1a0f00);border:1.5px solid #FFD700;border-radius:12px;padding:16px;margin-bottom:14px;text-align:center">
      <div style="font-size:10px;letter-spacing:1px;color:#FFD700;text-transform:uppercase;margin-bottom:6px">🏆 League Champion — Week of ${fmtWeek(wk)}</div>
      <div style="font-size:24px;font-weight:500;color:#FFD700;margin-bottom:8px">${champion.name}</div>
      <div style="display:flex;justify-content:center;gap:20px;flex-wrap:wrap">
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:500;color:#FFD700">${champion.kingPts}</div>
          <div style="font-size:10px;color:#888">King Points</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:500;color:#fff">${champion.made}</div>
          <div style="font-size:10px;color:#888">Total Makes</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:500;color:#fff">${champion.pct===null?"—":champion.pct+"%"}</div>
          <div style="font-size:10px;color:#888">Team Shooting %</div>
        </div>
      </div>
    </div>`;

  const maxKing = teamStats[0].kingPts || 1;
  const rows = teamStats.map((t,i) => {
    const barW = Math.round((t.kingPts/maxKing)*100);
    const medal = medals[i] || String(i+1);
    const color = medalColors[i] || "#888";
    return `
      <div class="sb-row ${i<3?`medal-${i+1}`:''}">
        <div class="sb-rank" style="font-size:${i<3?'18':'13'}px">${medal}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;font-size:13px;color:#1A3A5C">${t.name}</div>
          <div style="font-size:10px;color:#888">${t.made} makes · ${t.pct===null?"—":t.pct+"% shooting"}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;min-width:120px">
          <div class="sb-bar-wrap" style="flex:1"><div class="sb-bar" style="width:${barW}%"></div></div>
          <div style="text-align:right;min-width:40px">
            <div class="sb-stat" style="color:${color}">${t.kingPts}</div>
            <div class="sb-sub">pts</div>
          </div>
        </div>
      </div>`;
  }).join("");

  const isCompeting = teamCompete;

  render(`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <button data-action="go-home">← Back</button>
      <span style="font-weight:500;font-size:15px">🌐 League Standings</span>
      ${isCompeting ? '<span style="font-size:11px;color:#27500A;background:#E6F7EC;padding:3px 8px;border-radius:10px">✅ Your team is in</span>' : ''}
    </div>
    ${championBanner}
    <div class="sb-wrap">
      <div class="sb-title">🏀 Team Rankings — Week of ${fmtWeek(wk)}</div>
      <div style="font-size:11px;color:#888;margin-bottom:10px;padding:0 4px">Ranked by King Points (weighted makes)</div>
      ${rows}
    </div>
    <div style="text-align:center;margin-top:12px;font-size:11px;color:#888">
      ${leagueTeams.length} team${leagueTeams.length===1?'':'s'} competing · Updates live
    </div>`);
}

// ── Leaderboard ───────────────────────────────
function buildLeaderboard() {
  const weeks=weeksForPeriod(sbPeriod),wk=weekKey(),mo=monthKey(),yr=yearKey();
  const periodLabel=sbPeriod==="week"?"Week of "+fmtWeek(wk):sbPeriod==="month"?fmtMonth(mo):yr+" Season";
  const kingWeeks=[weekKey()];
  const kingData=roster.map(n=>{const t=playerTotals(n,kingWeeks),wMade=playerWeightedMakes(n,kingWeeks);return{name:n,made:t.m,weighted:wMade,pct:t.pct};}).filter(p=>p.weighted>0).sort((a,b)=>b.weighted-a.weighted);
  const king=kingData[0]||null;
  let streak=0;
  if(king){const currentWk=weekKey(),pastWks=[...new Set(allShots.map(s=>s.week))].filter(w=>w<currentWk).sort().reverse();for(const wk2 of pastWks){const wkData=roster.map(n=>({name:n,w:playerWeightedMakes(n,[wk2])})).filter(p=>p.w>0).sort((a,b)=>b.w-a.w);if(wkData[0]?.name===king.name)streak++;else break;}}
  const kingBanner=king?`
    <div style="background:linear-gradient(135deg,#2a1a00,#1a0f00);border:1.5px solid #FFD700;border-radius:12px;padding:14px 16px;margin-bottom:14px;text-align:center">
      <div style="font-size:10px;letter-spacing:1px;color:#FFD700;text-transform:uppercase;margin-bottom:6px">👑 This Week's Shooting King</div>
      <div style="font-size:26px;font-weight:500;color:#FFD700;margin-bottom:4px">${king.name}</div>
      <div style="display:flex;justify-content:center;gap:16px;margin-top:6px;flex-wrap:wrap">
        <div style="text-align:center"><div style="font-size:18px;font-weight:500;color:#FFD700">${Math.round(king.weighted*10)/10}</div><div style="font-size:10px;color:#888">King Points</div></div>
        <div style="text-align:center"><div style="font-size:18px;font-weight:500;color:#fff">${king.made}</div><div style="font-size:10px;color:#888">Shots Made</div></div>
        <div style="text-align:center"><div style="font-size:18px;font-weight:500;color:#fff">${king.pct===null?"—":king.pct+"%"}</div><div style="font-size:10px;color:#888">Shooting %</div></div>
        <div style="text-align:center"><div style="font-size:18px;font-weight:500;color:#FFD700">${streak}</div><div style="font-size:10px;color:#888">Week Streak</div></div>
      </div>
      ${streak>=2?`<div style="margin-top:8px;font-size:11px;color:#FFD700">🔥 ${streak} weeks in a row!</div>`:""}
    </div>`:`<div style="background:#111;border:1px dashed #334;border-radius:12px;padding:14px;text-align:center;margin-bottom:14px"><div style="font-size:12px;color:#445">👑 No Shooting King yet this week — get to work!</div></div>`;
  function ranked(arr){return arr.filter(x=>x.val!==null).sort((a,b)=>(b.exact||b.val)-(a.exact||a.val));}
  const overall=ranked(roster.map(n=>{const t=playerTotals(n,weeks);return{name:n,val:t.pct,exact:t.exactPct,sub:`${t.m}/${t.a} shots`};}));
  const attempts=ranked(roster.map(n=>{const t=playerTotals(n,weeks);return{name:n,val:t.a,sub:`${t.m} made`};}));
  const bestDay=ranked(roster.map(n=>{const b=playerBestDay(n,weeks);return{name:n,val:b?b.pct:null,sub:b?`${b.day} — ${b.m}/${b.a}`:""};}));
  const improved=ranked(roster.map(n=>{const i=playerImproved(n);return{name:n,val:i?i.diff:null,sub:i?`${i.prev}% → ${i.curr}%`:""};}));
  const catRanks=CATS.map(cat=>({cat,rows:ranked(roster.map(n=>{const c=playerCatTotals(n,weeks)[cat];return{name:n,val:c.pct,sub:`${c.m}/${c.a}`};}))}));
  function sbRows(rows,isAtt=false,isDiff=false){
    if(!rows.length)return`<div class="sb-no-data">No data yet — get to work! 🏀</div>`;
    const max=rows[0].val||1;
    return rows.map((r,i)=>{const barW=Math.round((r.val/max)*100),valStr=isDiff?(r.val>0?"+":"")+r.val+"%":isAtt?String(r.val):r.val+"%";
      return`<div class="sb-row ${i<3?`medal-${i+1}`:""}"><div class="sb-rank ${rankMedal(i)}">${rankSymbol(i)}</div><div class="sb-avatar">${initials(r.name)}</div><div class="sb-name">${r.name}</div><div class="sb-bar-wrap"><div class="sb-bar" style="width:${barW}%"></div></div><div><div class="sb-stat">${valStr}</div><div class="sb-sub">${r.sub}</div></div></div>`;
    }).join("");}
  const sections=[{id:"overall",label:"Overall %"},{id:"attempts",label:"Most Shots"},{id:"bestday",label:"Best Day"},{id:"improved",label:"Improved"},{id:"cats",label:"By Category"}];
  let content="";
  if(sbSection==="overall")  content=`<div class="sb-section"><div class="sb-section-title">Overall shooting %</div>${sbRows(overall)}</div>`;
  if(sbSection==="attempts") content=`<div class="sb-section"><div class="sb-section-title">Most shots attempted</div>${sbRows(attempts,true)}</div>`;
  if(sbSection==="bestday")  content=`<div class="sb-section"><div class="sb-section-title">Best single day</div>${sbRows(bestDay)}</div>`;
  if(sbSection==="improved") content=`<div class="sb-section"><div class="sb-section-title">Most improved (week over week)</div>${sbRows(improved,false,true)}</div>`;
  if(sbSection==="cats")     content=catRanks.map(({cat,rows})=>`<div class="sb-section"><div class="sb-section-title">${cat}</div>${sbRows(rows)}</div>`).join("");
  return`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <button data-action="go-home">← Back</button>
      <span style="font-weight:500;font-size:15px">🏆 ${teamName} Rankings</span>
    </div>
    ${kingBanner}
    <div class="sb-wrap">
      <div class="sb-title">🏀 Team Rankings</div>
      <div class="sb-tabs">
        <div class="sb-tab ${sbPeriod==="week"?"active":""}" data-action="sb-period" data-p="week">This Week</div>
        <div class="sb-tab ${sbPeriod==="month"?"active":""}" data-action="sb-period" data-p="month">This Month</div>
        <div class="sb-tab ${sbPeriod==="year"?"active":""}" data-action="sb-period" data-p="year">This Year</div>
      </div>
      <div class="period-label">${periodLabel}</div>
      <div class="sb-tabs">${sections.map(s=>`<div class="sb-tab ${sbSection===s.id?"active":""}" data-action="sb-sec" data-s="${s.id}">${s.label}</div>`).join("")}</div>
      ${content}
    </div>`;
}

// ── Inline handlers ───────────────────────────
async function handleJoin() {
  const code=(document.getElementById("join-code")?.value||"").trim().toUpperCase();
  if(!code||code.length<4){joinErr="Enter a valid team code.";render(buildTeamSelect());return;}
  joinCodeInput=code;
  const btn=document.querySelector("button[onclick='handleJoin()']");
  if(btn){btn.disabled=true;btn.textContent="Joining...";}
  const err=await joinTeam(code);
  if(err){joinErr=err;render(buildTeamSelect());return;}
  joinErr="";joinCodeInput="";screen="home";render(buildHome());
}
async function handleCreateTeam() {
  const name=(document.getElementById("new-team-name")?.value||"").trim();
  const code=(document.getElementById("new-team-code")?.value||"").trim().toUpperCase();
  const pin=(document.getElementById("new-team-pin")?.value||"").trim();
  const msg=document.getElementById("create-err");
  if(!name){if(msg)msg.innerHTML=`<span class="err">Enter a team name.</span>`;return;}
  if(code.length<4){if(msg)msg.innerHTML=`<span class="err">Code must be at least 4 characters.</span>`;return;}
  if(!/^\d{4}$/.test(pin)){if(msg)msg.innerHTML=`<span class="err">PIN must be 4 digits.</span>`;return;}
  const btn=document.querySelector("button[onclick='handleCreateTeam()']");
  if(btn){btn.disabled=true;btn.textContent="Creating...";}
  const err=await createTeam(name,code,pin);
  if(err){if(msg)msg.innerHTML=`<span class="err">${err}</span>`;if(btn){btn.disabled=false;btn.textContent="Create Team";}return;}
  teamCode=code;teamName=name;appPin=pin;saveTeam(code);
  await loadRoster();await loadShots();
  screen="coach";coachOpen=true;coachTab="roster";render(buildCoach());
}
function handleNewTeam(){screen="create-team";render(buildCreateTeam());}
function handleSwitchTeam(){clearTeam();teamCode=null;teamName="";roster=[];allShots=[];allPlayerPins=[];allCoachComments=[];teamCompete=false;leagueShots=[];leagueRosters={};leagueTeams=[];screen="team-select";render(buildTeamSelect());}

// ── Event handling ────────────────────────────
function attachEvents() {
  document.getElementById("app").addEventListener("click", async e => {
    const b=e.target.closest("[data-action]");
    if(!b)return;
    const a=b.dataset.action;

    if(a==="go-team-select"){screen="team-select";render(buildTeamSelect());}
    if(a==="onboard-next"){onboardStep++;render(buildOnboarding());}
    if(a==="onboard-back"){onboardStep--;render(buildOnboarding());}
    if(a==="onboard-skip"||a==="onboard-done"){markOnboardingSeen();onboardStep=0;if(teamCode){screen="home";render(buildHome());}else{screen="team-select";render(buildTeamSelect());}}

    if(a==="sel-player"){
      const name=b.dataset.name;curPlayer=name;localEdits={};
      const existingPin=getPlayerPin(name);
      if(isPlayerUnlocked(name,teamCode)){screen="player";render(buildPlayer());}
      else if(existingPin===null){pinMode="player-setup";pinEntry="";pinErr="";pinSetupFirst="";screen="pin";render(buildPin());}
      else{pinMode="player-enter";pinEntry="";pinErr="";screen="pin";render(buildPin());}
    }

    if(a==="go-home"){screen="home";coachOpen=false;coachViewPlayer=null;render(buildHome());}
    if(a==="go-lb"){screen="leaderboard";render(buildLeaderboard());}
    if(a==="go-league"){screen="league";buildLeague();}
    if(a==="toggle-compete"){
      const btn=b;btn.disabled=true;btn.textContent="Saving...";
      await saveCompete(!teamCompete);
      showToast(teamCompete?"✅ Joined the League!":"⭕ Left the League");
      render(buildCoach());
    }
    if(a==="go-summary"){screen="summary";render(buildSummary());}
    if(a==="go-coach"){
      if(coachOpen){screen="coach";render(buildCoach());}
      else{pinEntry="";pinErr="";pinMode="coach";screen="pin";render(buildPin());}
    }
    if(a==="ctab"){coachTab=b.dataset.t;coachViewPlayer=null;render(buildCoach());}

    if(a==="coach-view-player"){coachViewPlayer=b.dataset.name;coachCommentDay=selectedDay;render(buildCoach());}
    if(a==="coach-back-roster"){coachViewPlayer=null;render(buildCoach());}

    if(a==="save-coach-comment"){
      const type=b.dataset.type,week=b.dataset.week||null,dayVal=b.dataset.day;
      const day=dayVal!==""?parseInt(dayVal):null;
      let text="";
      if(type==="player") text=(document.getElementById("coach-player-note")?.value||"").trim();
      if(type==="week")   text=(document.getElementById("coach-week-note")?.value||"").trim();
      if(type==="day")    text=(document.getElementById("coach-day-note")?.value||"").trim();
      b.disabled=true;b.textContent="Saving...";
      await saveCoachComment(coachViewPlayer,type,week,day,text);
      showToast("✓ Comment saved!");
      b.disabled=false;b.textContent=`Save ${type.charAt(0).toUpperCase()+type.slice(1)} Note`;
    }

    if(a==="reset-player-pin"){
      const name=b.dataset.name;
      if(!confirm(`Reset PIN for ${name}? They'll set a new one next time they log in.`))return;
      await db.from("player_pins").delete().eq("player",name).eq("team_code",teamCode);
      allPlayerPins=allPlayerPins.filter(p=>!(p.player===name&&p.team_code===teamCode));
      try{const u=getUnlockedPlayers();delete u[teamCode+"|"+name];sessionStorage.setItem("bball_unlocked",JSON.stringify(u));}catch(e){}
      showToast(`PIN reset for ${name}`);render(buildCoach());
    }

    if(a==="add-player"){
      if(b.disabled)return;
      const inp=document.getElementById("np"),name=(inp?.value||"").trim(),msg=document.getElementById("rmsg");
      if(!name){if(msg)msg.innerHTML=`<span class="err">Enter a name.</span>`;return;}
      if(roster.includes(name)){if(msg)msg.innerHTML=`<span class="err">Already on roster.</span>`;return;}
      b.disabled=true;b.textContent="Adding...";
      const err=await addPlayerToDB(name);
      if(err){if(msg)msg.innerHTML=`<span class="err">${err}</span>`;b.disabled=false;b.textContent="Add";return;}
      render(buildCoach());
    }
    if(a==="rm-player"){
      const pname=b.dataset.name;
      if(!confirm(`⚠️ Remove ${pname}?\n\nThis will permanently delete ALL their shots, notes, check-ins, and PIN. This cannot be undone.`))return;
      if(!confirm(`Are you sure? All data for ${pname} will be gone forever.`))return;
      await removePlayerFromDB(pname);render(buildCoach());
    }
    if(a==="save-pin"){
      const v=(document.getElementById("npin")?.value||"").trim(),msg=document.getElementById("pmsg");
      if(!/^\d{4}$/.test(v)){if(msg)msg.innerHTML=`<span class="err">Must be 4 digits.</span>`;return;}
      await savePinToDB(v);if(msg)msg.innerHTML=`<span class="ok">PIN updated.</span>`;
    }

    if(a==="save-player"){
      if(b.disabled)return;b.disabled=true;b.textContent="Saving...";
      const wk=weekKey(),inputs=document.querySelectorAll("[data-cat][data-si][data-di][data-f]"),bySpot={};
      inputs.forEach(inp=>{const key=`${inp.dataset.cat}|${inp.dataset.si}|${inp.dataset.di}`;if(!bySpot[key])bySpot[key]={};bySpot[key][inp.dataset.f]=inp.value;});
      for(const key of Object.keys(bySpot)){const[cat,si,di]=key.split("|"),{m,a}=bySpot[key],mVal=parseInt(m),aVal=parseInt(a);if(!isNaN(mVal)&&!isNaN(aVal)&&m!==" "&&a!==" "&&m!==undefined&&a!==undefined)await saveShot(curPlayer,wk,cat,parseInt(si),parseInt(di),mVal,aVal);}
      const noteInputs=document.querySelectorAll("[data-note-day]");
      for(const ni of noteInputs){const day=parseInt(ni.dataset.noteDay),text=ni.value.trim();if(text!==getNote(curPlayer,wk,day))await saveNote(curPlayer,wk,day,text);}
      const labelInputs=document.querySelectorAll("[data-spot-label-cat]"),seenLabels=new Set();
      for(const li of labelInputs){const cat=li.dataset.spotLabelCat,si=parseInt(li.dataset.spotLabelSi),key=`${cat}|${si}`;if(seenLabels.has(key))continue;seenLabels.add(key);const label=li.value.trim();if(label!==getSpotLabel(curPlayer,cat,si))await saveSpotLabel(curPlayer,cat,si,label);}
      localEdits={};showToast("✓ Numbers saved!");screen="daily-checkin";checkinTemp={};render(buildDailyCheckin());
    }

    if(a==="sb-period"){sbPeriod=b.dataset.p;render(buildLeaderboard());}
    if(a==="sb-sec"){sbSection=b.dataset.s;render(buildLeaderboard());}
    if(a==="go-weekly-checkin"){screen="weekly-checkin";checkinTemp={};render(buildWeeklyCheckin());}
    if(a==="skip-checkin"){screen="player";checkinTemp={};render(buildPlayer());}
    if(a==="save-checkin"){
      if(b.disabled)return;b.disabled=true;const wk=weekKey(),existing=getDailyCheckin(curPlayer,wk,selectedDay)||{};
      await saveDailyCheckin(curPlayer,wk,selectedDay,checkinTemp.effort??existing.effort??null,checkinTemp.recovery??existing.recovery??null,checkinTemp.feeling??existing.feeling??null);
      checkinTemp={};showToast("✓ Check-in saved!");screen="player";render(buildPlayer());
    }
    if(a==="save-wcheckin"){
      if(b.disabled)return;b.disabled=true;const wk=weekKey(),existing=getWeeklyCheckin(curPlayer,wk)||{};
      const align=parseInt(document.getElementById("alignment-slider")?.value)||existing.alignment||5;
      await saveWeeklyCheckin(curPlayer,wk,align,checkinTemp.confidence??existing.confidence??null,checkinTemp.selftalk??existing.selftalk??null);
      checkinTemp={};showToast("✓ Weekly check-in saved!");screen="summary";render(buildSummary());
    }
    if(a==="spot-plus"||a==="spot-minus"){if(b.disabled)return;b.disabled=true;const cat=CATS[parseInt(b.dataset.catidx)];await changeSpotCount(cat,a==="spot-plus"?1:-1);}
  });

  document.getElementById("app").addEventListener("click",e=>{
    const btn=e.target.closest("[data-checkin]");
    if(btn){checkinTemp[btn.dataset.checkin]=btn.dataset.val;render(buildDailyCheckin());return;}
    const wbtn=e.target.closest("[data-wcheckin]");
    if(wbtn){checkinTemp[wbtn.dataset.wcheckin]=wbtn.dataset.val;render(buildWeeklyCheckin());return;}
  });

  document.getElementById("app").addEventListener("input",e=>{
    const inp=e.target;if(!inp.dataset.cat)return;
    const{cat,si}=inp.dataset,ppId=`pp-${cat.replace(/\W/g,"_")}-${si}`,el=document.getElementById(ppId);
    if(el){let sm=0,sa=0;for(let d=0;d<7;d++){const mI=document.querySelector(`[data-cat="${cat}"][data-si="${si}"][data-di="${d}"][data-f="m"]`),aI=document.querySelector(`[data-cat="${cat}"][data-si="${si}"][data-di="${d}"][data-f="a"]`);sm+=parseInt(mI?.value)||0;sa+=parseInt(aI?.value)||0;}const p=sa?Math.round(sm/sa*100):null;el.textContent=p===null?"—":p+"%";el.className="pct-pill "+(p?pctClass(p):"");}
  });
}

// ── Change spot count ─────────────────────────
async function changeSpotCount(cat,delta) {
  const current=getSpotCount(curPlayer,cat),newCount=Math.max(1,Math.min(15,current+delta));
  if(newCount===current)return;
  const wk=weekKey(),inputs=document.querySelectorAll("[data-cat][data-si][data-di][data-f]"),bySpot={};
  inputs.forEach(inp=>{const key=`${inp.dataset.cat}|${inp.dataset.si}|${inp.dataset.di}`;if(!bySpot[key])bySpot[key]={};bySpot[key][inp.dataset.f]=inp.value;});
  for(const key of Object.keys(bySpot)){const[c,si,di]=key.split("|"),{m,a}=bySpot[key],mVal=parseInt(m),aVal=parseInt(a);if(!isNaN(mVal)&&!isNaN(aVal)&&m!==""&&a!==""&&m!==undefined&&a!==undefined)await saveShot(curPlayer,wk,c,parseInt(si),parseInt(di),mVal,aVal);}
  const noteInputs=document.querySelectorAll("[data-note-day]");
  for(const ni of noteInputs){const day=parseInt(ni.dataset.noteDay),text=ni.value.trim();if(text!==getNote(curPlayer,wk,day))await saveNote(curPlayer,wk,day,text);}
  const labelInputs=document.querySelectorAll("[data-spot-label-cat]"),seen=new Set();
  for(const li of labelInputs){const c=li.dataset.spotLabelCat,si=parseInt(li.dataset.spotLabelSi),k=`${c}|${si}`;if(seen.has(k))continue;seen.add(k);const label=li.value.trim();if(label!==getSpotLabel(curPlayer,c,si))await saveSpotLabel(curPlayer,c,si,label);}
  await saveSpotCount(curPlayer,cat,newCount);render(buildPlayer());
}

function selectDay(d){selectedDay=d;render(buildPlayer());}

// ── Boot ──────────────────────────────────────
async function boot() {
  render(`<div class="loading">Loading...</div>`);
  attachEvents();
  await loadTeams();
  if(!hasSeenOnboarding()){onboardStep=0;screen="onboarding";render(buildOnboarding());return;}
  const saved=savedTeam();
  if(saved){const err=await joinTeam(saved);if(!err){screen="home";render(buildHome());return;}}
  screen="team-select";render(buildTeamSelect());
}

boot();
