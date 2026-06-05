// ─────────────────────────────────────────────
//  Basketball Shooting Tracker — Multi-Team
// ─────────────────────────────────────────────

const DEFAULT_CATS = ["Form Shooting","Catch & Shoot","Catch & Shoot 3s","1-Dribble Pull-Up","1-Dribble Pull-Up 3s","Finishes"];
const DEFAULT_WEIGHTS = {"Form Shooting":0.5,"Catch & Shoot":1.0,"Catch & Shoot 3s":3.0,"1-Dribble Pull-Up":2.0,"1-Dribble Pull-Up 3s":4.0,"Finishes":1.0};
let CATS = [...DEFAULT_CATS];
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
let aboutTab    = "coaches";  // "coaches" | "players"
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
let allTeamCategories = [];
let allPlayerCategories = [];
let allPlayerPins = [];
let allCoachComments = [];
let allMessages = [];
let allMessageReads = [];
let teamCompete  = false;
let leagueShots  = [];
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

async function loadMessages() {
  if(!teamCode)return;
  const {data,error}=await db.from("messages").select("*").eq("team_code",teamCode).order("created_at",{ascending:false});
  if(error){console.error(error);return;} allMessages=data||[];
}

async function loadMessageReads() {
  if(!teamCode)return;
  const {data,error}=await db.from("message_reads").select("*").eq("team_code",teamCode);
  if(error){console.error(error);return;} allMessageReads=data||[];
}

async function sendMessage(text, targetPlayer) {
  const row={team_code:teamCode,text};
  if(targetPlayer) row.target_player=targetPlayer;
  const {data,error}=await db.from("messages").insert(row).select().single();
  if(!error&&data) allMessages.unshift(data);
  return error;
}
async function markMessageRead(messageId, player) {
  const existing=allMessageReads.find(r=>r.message_id===messageId&&r.player===player);
  if(existing)return;
  const {data,error}=await db.from("message_reads").insert({message_id:messageId,player,team_code:teamCode}).select().single();
  if(!error&&data) allMessageReads.push(data);
}

async function deleteMessage(messageId) {
  await db.from("messages").delete().eq("id",messageId);
  allMessages=allMessages.filter(m=>m.id!==messageId);
  allMessageReads=allMessageReads.filter(r=>r.message_id!==messageId);
}

function getUnreadMessages(player) {
  return allMessages.filter(function(m){
    if(m.target_player && m.target_player!==player) return false;
    return !allMessageReads.find(function(r){return r.message_id===m.id&&r.player===player;});
  });
}
function hasUnreadMessages(player){ return getUnreadMessages(player).length>0; }

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
  // Check team_categories first, then fallback to category_weights, then defaults
  const tc=allTeamCategories.find(x=>x.name===cat&&x.team_code===teamCode);
  if(tc) return parseFloat(tc.weight);
  const w=allWeights.find(x=>x.team_code===teamCode&&x.category===cat);
  if(w) return parseFloat(w.weight);
  return DEFAULT_WEIGHTS[cat]||1.0;
}

async function loadTeamCategories() {
  if(!teamCode)return;
  const {data,error}=await db.from("team_categories").select("*").eq("team_code",teamCode).order("sort_order").order("created_at");
  if(error){console.error(error);return;}
  allTeamCategories=data||[];
  // Update CATS array if team has custom categories
  if(allTeamCategories.length>0){
    CATS=allTeamCategories.map(function(c){return c.name;});
  } else {
    CATS=[...DEFAULT_CATS];
  }
}

async function saveTeamCategory(id, name, weight) {
  if(id){
    const{error}=await db.from("team_categories").update({name,weight}).eq("id",id);
    if(!error){const c=allTeamCategories.find(x=>x.id===id);if(c){c.name=name;c.weight=weight;}}
  } else {
    const sortOrder=allTeamCategories.length;
    const{data,error}=await db.from("team_categories").insert({team_code:teamCode,name,weight,sort_order:sortOrder}).select().single();
    if(!error&&data) allTeamCategories.push(data);
  }
  CATS=allTeamCategories.length>0?allTeamCategories.map(function(c){return c.name;}):[...DEFAULT_CATS];
}

async function deleteTeamCategory(id) {
  await db.from("team_categories").delete().eq("id",id);
  allTeamCategories=allTeamCategories.filter(function(c){return c.id!==id;});
  CATS=allTeamCategories.length>0?allTeamCategories.map(function(c){return c.name;}):[...DEFAULT_CATS];
}

async function initTeamCategories() {
  // If no custom categories set yet, seed with defaults
  if(allTeamCategories.length===0){
    for(let i=0;i<DEFAULT_CATS.length;i++){
      const cat=DEFAULT_CATS[i];
      const wt=DEFAULT_WEIGHTS[cat]||1.0;
      const{data,error}=await db.from("team_categories").insert({team_code:teamCode,name:cat,weight:wt,sort_order:i}).select().single();
      if(!error&&data) allTeamCategories.push(data);
    }
    CATS=[...DEFAULT_CATS];
  }
}
async function loadPlayerCategories() {
  if(!teamCode)return;
  const{data,error}=await db.from("player_categories").select("*").eq("team_code",teamCode).order("sort_order").order("created_at");
  if(error){console.error(error);return;}
  allPlayerCategories=data||[];
}
function getPlayerCats(player) {
  const pc=allPlayerCategories.filter(function(c){return c.player===player&&c.team_code===teamCode;});
  if(pc.length>0) return pc.map(function(c){return{name:c.name,weight:c.weight};});
  if(allTeamCategories.length>0) return allTeamCategories.map(function(c){return{name:c.name,weight:c.weight};});
  return DEFAULT_CATS.map(function(c){return{name:c,weight:DEFAULT_WEIGHTS[c]||1.0};});
}
async function savePlayerCategory(player, id, name, weight, sortOrder) {
  if(id){
    const{error}=await db.from("player_categories").update({name,weight}).eq("id",id);
    if(!error){const c=allPlayerCategories.find(function(x){return x.id===id;});if(c){c.name=name;c.weight=weight;}}
  } else {
    const{data,error}=await db.from("player_categories").insert({team_code:teamCode,player,name,weight,sort_order:sortOrder}).select().single();
    if(!error&&data) allPlayerCategories.push(data);
  }
}
async function deletePlayerCategory(id) {
  await db.from("player_categories").delete().eq("id",id);
  allPlayerCategories=allPlayerCategories.filter(function(c){return c.id!==id;});
}
async function initPlayerCategories(player) {
  const existing=allPlayerCategories.filter(function(c){return c.player===player&&c.team_code===teamCode;});
  if(existing.length>0) return;
  const source=allTeamCategories.length>0?allTeamCategories:DEFAULT_CATS.map(function(c,i){return{name:c,weight:DEFAULT_WEIGHTS[c]||1.0,sort_order:i};});
  for(let i=0;i<source.length;i++){
    const{data,error}=await db.from("player_categories").insert({team_code:teamCode,player,name:source[i].name,weight:source[i].weight,sort_order:i}).select().single();
    if(!error&&data) allPlayerCategories.push(data);
  }
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
  await loadWeights(); await loadTeamCategories(); await loadPlayerCategories(); await loadPlayerPins(); await loadCoachComments();
  await loadMessages(); await loadMessageReads();
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
function h(str){return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

function getYouTubeId(text) {
  // Extract YouTube video ID from various URL formats
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (var i=0;i<patterns.length;i++){
    const m=text.match(patterns[i]);
    if(m)return m[1];
  }
  return null;
}

function renderMessageText(text) {
  // If message contains a YouTube link, show thumbnail + embed player
  const ytId=getYouTubeId(text);
  if(ytId){
    // Strip the URL from the text to show just the accompanying message
    const cleanText=text.replace(/https?:\/\/\S+/g,"").trim();
    return (cleanText?'<div style="font-size:13px;color:#333;line-height:1.5;margin-bottom:8px">'+h(cleanText)+'</div>':"")
      +'<div data-action="play-video" data-vid="'+ytId+'" style="cursor:pointer;border-radius:10px;overflow:hidden;position:relative;background:#000">'
      +'<img src="https://img.youtube.com/vi/'+ytId+'/hqdefault.jpg" style="width:100%;display:block;opacity:0.85" />'
      +'<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,0,0,0.85);border-radius:50%;width:52px;height:52px;display:flex;align-items:center;justify-content:center">'
      +'<div style="width:0;height:0;border-top:12px solid transparent;border-bottom:12px solid transparent;border-left:20px solid #fff;margin-left:4px"></div></div>'
      +'<div style="position:absolute;bottom:8px;left:10px;font-size:10px;color:#fff;background:rgba(0,0,0,.5);padding:2px 6px;border-radius:4px">Tap to watch</div>'
      +'</div>';
  }
  return '<div style="font-size:13px;color:#333;line-height:1.5">'+h(text)+'</div>';
}

function buildVideoPlayer(videoId) {
  return '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.92);z-index:999;display:flex;flex-direction:column">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px">'
    +'<div style="font-size:13px;color:#fff;font-weight:500">📺 Drill Video</div>'
    +'<button data-action="close-video" style="font-size:14px;color:#FFD700;background:none;border:none;padding:6px 10px;cursor:pointer">✕ Close</button></div>'
    +'<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:0 8px">'
    +'<div style="width:100%;max-width:640px">'
    +'<div style="position:relative;padding-bottom:56.25%;height:0">'
    +'<iframe src="https://www.youtube.com/embed/'+videoId+'?autoplay=1&playsinline=1" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:8px" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>'
    +'</div></div></div></div>';
}

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
  return '<div class="banner"><div class="banner-quote">"What gets measured, improves"</div><div class="banner-sub">Sharpshooter</div></div>'
    +'<div class="card"><h3>Enter your team code</h3>'
    +'<p style="font-size:12px;color:#888;margin-bottom:10px">Your coach will give you a 6-character team code.</p>'
    +'<div class="row-flex"><input type="text" id="join-code" maxlength="6" placeholder="e.g. HOOPS1" value="'+h(joinCodeInput)+'" style="flex:1;text-transform:uppercase;font-size:18px;font-weight:500;letter-spacing:3px;text-align:center" />'
    +'<button onclick="handleJoin()" class="btn-primary">Join</button></div>'
    +(joinErr?'<p class="err">'+h(joinErr)+'</p>':"")
    +'</div>'
    +'<div style="text-align:center;margin-top:8px"><button onclick="handleNewTeam()" class="btn-primary" style="margin-right:8px">+ Create New Team</button>'
    +'<button data-action="go-coach-global" style="font-size:12px;color:#888">🔒 Coach</button></div>';
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
    ?'<p style="color:#888;font-size:13px">No players yet — coach can add players in the coach panel.</p>'
    :roster.map(function(n){
      const hasPin=getPlayerPin(n)!==null;
      const unlocked=isPlayerUnlocked(n,teamCode);
      const hasMsg=hasUnreadMessages(n);
      const pinIcon=unlocked?'🔓':hasPin?'🔒':'🔑 Set PIN';
      const pinColor=unlocked?'#27500A':hasPin?'#888':'#2E75B6';
      const msgBadge=hasMsg?'<span style="font-size:11px;background:#1A3A5C;color:#FFD700;padding:2px 7px;border-radius:10px;margin-right:4px">msg</span>':"";
      return '<button class="player-btn" data-action="sel-player" data-name="'+h(n)+'"><div class="avatar">'+initials(n)+'</div>'
        +'<span style="flex:1">'+h(n)+'</span>'+msgBadge
        +'<span style="font-size:11px;color:'+pinColor+';margin-left:4px">'+pinIcon+'</span></button>';
    }).join("");
  return `
    <div class="banner">
      <div class="banner-quote">"What gets measured, improves"</div>
      <div class="banner-sub">${teamName||"Basketball Shooting Tracker"}</div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:11px;color:#888">Team Code: <strong>${teamCode}</strong></div>
      <div style="display:flex;gap:6px">
        <button onclick="refreshData()" style="font-size:11px;color:#888;padding:4px 8px">🔄 Refresh</button>
        <button onclick="handleSwitchTeam()" style="font-size:11px;color:#888;padding:4px 8px">Switch Team</button>
      </div>
    </div>
    <div class="card"><h3>Select your name</h3>${btns}</div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:4px;flex-wrap:wrap">
      <button class="btn-primary" data-action="go-lb">🏆 Leaderboard</button>
      <button class="btn-primary" data-action="go-league" style="background:#27500A">🌐 League</button>
      <button data-action="go-coach" style="font-size:12px;color:#666">🔒 Coach</button>
    </div>
    <div style="text-align:center;margin-top:10px">
      <button data-action="go-about" style="font-size:11px;color:#aaa;border:none;background:transparent;padding:4px">ℹ️ About Sharpshooter</button>
    </div>`;
}

function buildPin() {
  const dots=Array.from({length:4},function(_,i){return'<div class="pin-dot '+(i<pinEntry.length?"filled":"")+'"></div>';}).join("");
  const keys=[1,2,3,4,5,6,7,8,9,null,0,"back"];
  const keyBtns=keys.map(function(k){
    if(k===null)return'<div></div>';
    if(k==="back")return'<button onclick="pinKey(\'back\')" style="padding:14px;font-size:18px">⌫</button>';
    return'<button onclick="pinKey(\''+k+'\')" style="padding:14px;font-size:18px">'+k+'</button>';
  }).join("");
  var title="Coach PIN",subtitle=teamName?'<div style="font-size:11px;color:#888;margin-bottom:8px">'+h(teamName)+'</div>':"",hint="";
  if(pinMode==="player-setup"){title="Set Your PIN";subtitle='<div style="font-size:12px;color:#1A3A5C;margin-bottom:8px;font-weight:500">'+h(curPlayer)+'</div>';hint='<div style="font-size:11px;color:#888;margin-top:4px">Choose a 4-digit PIN to protect your data.</div>';}
  else if(pinMode==="player-confirm"){title="Confirm Your PIN";subtitle='<div style="font-size:12px;color:#1A3A5C;margin-bottom:8px;font-weight:500">'+h(curPlayer)+'</div>';hint='<div style="font-size:11px;color:#888;margin-top:4px">Enter the same PIN again.</div>';}
  else if(pinMode==="player-enter"){title="Enter Your PIN";subtitle='<div style="font-size:12px;color:#1A3A5C;margin-bottom:8px;font-weight:500">'+h(curPlayer)+'</div>';hint='<div style="font-size:11px;color:#888;margin-top:4px">Or ask your coach to unlock it.</div>';}
  return '<div class="card" style="max-width:280px;margin:20px auto;text-align:center">'
    +'<h3>'+title+'</h3>'+subtitle
    +'<div class="pin-dots">'+dots+'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">'+keyBtns+'</div>'
    +(pinErr?'<p class="err">'+h(pinErr)+'</p>':"")
    +hint
    +'<button data-action="go-home" style="width:100%;margin-top:10px;font-size:12px">Cancel</button>'
    +'</div>';
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
  const tabs=["dashboard","roster","messages","categories","settings"];
  const nav='<div class="nav-bar">'
    +tabs.map(function(t){return'<button data-action="ctab" data-t="'+t+'" class="'+(coachTab===t?"btn-primary":"")+'">'+ t.charAt(0).toUpperCase()+t.slice(1)+'</button>';}).join("")
    +'<button onclick="refreshData()" style="font-size:11px;color:#888;margin-left:4px">🔄</button>'
    +'<button data-action="go-home" style="margin-left:auto;font-size:12px">← Exit</button></div>';
  let body="";
  if(coachTab==="dashboard")  body=buildDash();
  if(coachTab==="roster")     body=coachViewPlayer ? buildCoachPlayerView() : buildRoster();
  if(coachTab==="messages")   body=buildCoachMessages();
  if(coachTab==="categories") body=buildCoachCategories();
  if(coachTab==="settings")   body=buildSettings();
  return nav+body;
}

function buildDash() {
  const wk=weekKey(),weeks=[wk];
  if(!roster.length)return'<div class="card"><p style="color:#888">Add players in the Roster tab.</p></div>';
  const catShort=["Form","C&S","C&S 3","PU","PU 3","Finish"];
  const rows=roster.map(function(name){
    const cats=playerCatTotals(name,weeks),tot=playerTotals(name,weeks);
    return'<tr><td style="font-weight:500">'+h(name)+'</td>'
      +CATS.map(function(c){const p=cats[c]?cats[c].pct:null;return'<td class="'+pctClass(p)+'">'+(p===null?"--":p+"%")+"</td>";}).join("")
      +'<td class="'+pctClass(tot.pct)+'" style="font-weight:500">'+(tot.pct===null?"--":tot.pct+"%")+'</td><td style="color:#888">'+tot.m+"/"+tot.a+'</td></tr>';
  }).join("");
  const catAvgs=CATS.map(function(cat,ci){
    let tm=0,ta=0;roster.forEach(function(n){const c=playerCatTotals(n,weeks)[cat];tm+=c.m;ta+=c.a;});
    const p=ta?Math.round(tm/ta*100):null;
    return'<div class="metric"><div class="metric-label">'+(catShort[ci]||cat)+'</div><div class="metric-val '+pctClass(p)+'">'+(p===null?"--":p+"%")+'</div></div>';
  }).join("");
  const thCats=catShort.map(function(c){return"<th>"+c+"</th>";}).join("");
  return '<div class="card">'
    +'<div style="font-size:11px;color:#888;margin-bottom:4px">Team: <strong>'+h(teamName)+'</strong> · Code: <strong>'+h(teamCode)+'</strong> · Week of '+fmtWeek(wk)+'</div>'
    +'<h3>Team this week</h3>'
    +'<div style="overflow-x:auto"><table class="dash"><thead><tr><th style="text-align:left">Player</th>'+thCats+'<th>Overall</th><th>M/A</th></tr></thead>'
    +'<tbody>'+rows+'</tbody></table></div></div>'
    +'<div class="card"><h3>Category averages</h3><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">'+catAvgs+'</div></div>';
}
function buildRoster() {
  var items="";
  if(roster.length===0){
    items='<p style="color:#888;font-size:13px;padding:6px 0">No players yet.</p>';
  } else {
    roster.forEach(function(n){
      const hasPin=getPlayerPin(n)!==null;
      const playerComment=getCoachComment(n,"player",null,null);
      items+='<div class="roster-item">'
        +'<div style="display:flex;align-items:center;gap:9px"><div class="avatar">'+initials(n)+'</div>'
        +'<div><div>'+h(n)+'</div>'
        +'<div style="font-size:10px;color:'+(hasPin?'#888':'#2E75B6')+'">'+(hasPin?'🔒 PIN set':'🔑 No PIN yet')+'</div>'
        +(playerComment?'<div style="font-size:10px;color:#856404;margin-top:1px">Has coach note</div>':"")
        +'</div></div>'
        +'<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">'
        +'<button class="btn-sm btn-primary" data-action="coach-view-player" data-name="'+h(n)+'" style="font-size:11px;width:100%">💬 Comments</button>'
        +'<div style="display:flex;gap:4px">'
        +(hasPin?'<button class="btn-sm" data-action="reset-player-pin" data-name="'+h(n)+'" style="font-size:10px">Reset PIN</button>':"")
        +'<button class="btn-sm btn-danger" data-action="rm-player" data-name="'+h(n)+'">🗑</button>'
        +'</div></div></div>';
    });
  }
  return '<div class="card"><h3>Roster ('+roster.length+')</h3>'+items+'</div>'
    +'<div class="card"><h3>Add player</h3>'
    +'<div class="row-flex"><input type="text" id="np" placeholder="Player name" style="flex:1" /><button data-action="add-player" class="btn-primary">Add</button></div>'
    +'<div id="rmsg"></div></div>';
}
function buildCoachPlayerView() {
  const name=coachViewPlayer,wk=weekKey(),tot=playerTotals(name,[wk]);
  const playerCmnt=getCoachComment(name,"player",null,null);
  const weekCmnt=getCoachComment(name,"week",wk,null);
  const dayCmnt=getCoachComment(name,"day",wk,coachCommentDay);
  const dayLabels=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  var dayBtns="";
  DAYS.forEach(function(d,di){
    dayBtns+='<button onclick="coachSelectDay('+di+')" style="flex:1;min-width:38px;padding:7px 4px;border:none;border-radius:6px;font-size:11px;font-weight:500;background:'+(coachCommentDay===di?'#1A3A5C':'#f0f0f0')+';color:'+(coachCommentDay===di?'#fff':'#444')+';cursor:pointer">'+d+'</button>';
  });
  return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
    +'<button data-action="coach-back-roster" style="font-size:12px">Back to Roster</button>'
    +'<div class="avatar avatar-lg">'+initials(name)+'</div>'
    +'<div style="flex:1"><div style="font-weight:500;font-size:15px">'+h(name)+'</div>'
    +'<div style="font-size:11px;color:#888">This week: '+(tot.pct===null?"no data":tot.pct+"% ("+tot.m+"/"+tot.a+")")+'</div></div></div>'
    +'<div class="card" style="padding:16px;margin-bottom:10px">'
    +'<div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:4px">Player Note</div>'
    +'<div style="font-size:11px;color:#888;margin-bottom:8px">Stays on their profile until you update it.</div>'
    +'<textarea id="coach-player-note" placeholder="e.g. Great attitude this week. Keep working on left-hand finishes." style="width:100%;min-height:70px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;background:#fafafa">'+h(playerCmnt?playerCmnt.text:"")+'</textarea>'
    +'<button data-action="save-coach-comment" data-type="player" data-week="" data-day="" class="btn-primary" style="width:100%;padding:10px;margin-top:8px;font-size:13px">Save Player Note</button></div>'
    +'<div class="card" style="padding:16px;margin-bottom:10px">'
    +'<div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:4px">Week Note</div>'
    +'<div style="font-size:11px;color:#888;margin-bottom:8px">For week of '+fmtWeek(wk)+'.</div>'
    +'<textarea id="coach-week-note" placeholder="e.g. Good effort this week. Focus on form next week." style="width:100%;min-height:70px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;background:#fafafa">'+h(weekCmnt?weekCmnt.text:"")+'</textarea>'
    +'<button data-action="save-coach-comment" data-type="week" data-week="'+wk+'" data-day="" class="btn-primary" style="width:100%;padding:10px;margin-top:8px;font-size:13px">Save Week Note</button></div>'
    +'<div class="card" style="padding:16px;margin-bottom:10px">'
    +'<div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:4px">Day Note</div>'
    +'<div style="font-size:11px;color:#888;margin-bottom:8px">Pick a day then leave your note.</div>'
    +'<div style="display:flex;gap:4px;margin-bottom:10px;overflow-x:auto">'+dayBtns+'</div>'
    +'<div style="font-size:12px;color:#888;margin-bottom:6px">'+dayLabels[coachCommentDay]+'</div>'
    +'<textarea id="coach-day-note" placeholder="e.g. Looked tired today. Good pull-up game from the right side." style="width:100%;min-height:70px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;background:#fafafa">'+h(dayCmnt?dayCmnt.text:"")+'</textarea>'
    +'<button data-action="save-coach-comment" data-type="day" data-week="'+wk+'" data-day="'+coachCommentDay+'" class="btn-primary" style="width:100%;padding:10px;margin-top:8px;font-size:13px">Save Day Note</button></div>'
    +buildPlayerCategoryEditor(name);
}

function coachSelectDay(d) { coachCommentDay=d; render(buildCoach()); }

function buildPlayerCategoryEditor(player) {
  const cats=getPlayerCats(player);
  const hasOverride=allPlayerCategories.filter(function(c){return c.player===player&&c.team_code===teamCode;}).length>0;
  const playerCatRows=allPlayerCategories.filter(function(c){return c.player===player&&c.team_code===teamCode;});
  var rows="";
  for(var i=0;i<cats.length;i++){
    const dbRow=playerCatRows[i],id=dbRow?dbRow.id:"";
    rows+='<div style="display:grid;grid-template-columns:1fr 70px 36px;gap:6px;align-items:center;margin-bottom:6px">'
      +'<input type="text" id="pcat-name-'+i+'" value="'+h(cats[i].name)+'" style="padding:7px 9px;border:1px solid #ccc;border-radius:7px;font-size:12px;font-family:inherit;background:#fafafa" />'
      +'<input type="number" id="pcat-weight-'+i+'" value="'+cats[i].weight+'" min="0.1" max="10" step="0.5" style="padding:7px 4px;border:1px solid #ccc;border-radius:7px;font-size:12px;text-align:center;background:#fafafa" />'
      +'<button data-action="delete-player-cat" data-player="'+h(player)+'" data-idx="'+i+'" data-id="'+id+'" class="btn-sm btn-danger" style="padding:6px">X</button></div>';
  }
  return '<div class="card" style="padding:16px;margin-bottom:10px">'
    +'<div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:4px">'+h(player)+"'s Categories</div>"
    +'<div style="font-size:11px;color:#888;margin-bottom:10px">'+(hasOverride?'Custom categories set for this player.':'Using team defaults. Save to customize.')+' King Pts weight in right column.</div>'
    +'<div style="display:grid;grid-template-columns:1fr 70px 36px;gap:6px;margin-bottom:6px">'
    +'<div style="font-size:10px;color:#aaa;font-weight:500">Category</div><div style="font-size:10px;color:#aaa;font-weight:500;text-align:center">Wt</div><div></div></div>'
    +rows
    +'<button data-action="save-player-cats" data-player="'+h(player)+'" class="btn-primary" style="width:100%;padding:10px;margin-top:6px;font-size:12px;font-weight:500">Save Player Categories</button>'
    +'<div style="display:grid;grid-template-columns:1fr 70px;gap:6px;margin-top:10px;padding-top:10px;border-top:0.5px solid #eee">'
    +'<input type="text" id="new-pcat-name" placeholder="Add category..." style="padding:7px 9px;border:1px solid #ccc;border-radius:7px;font-size:12px;font-family:inherit" />'
    +'<input type="number" id="new-pcat-weight" value="1.0" min="0.1" max="10" step="0.5" style="padding:7px 4px;border:1px solid #ccc;border-radius:7px;font-size:12px;text-align:center" /></div>'
    +'<button data-action="add-player-cat" data-player="'+h(player)+'" class="btn-primary" style="width:100%;padding:9px;margin-top:6px;font-size:12px">+ Add Category for '+h(player)+'</button>'
    +'<button data-action="reset-player-cats" data-player="'+h(player)+'" style="width:100%;padding:7px;margin-top:4px;font-size:11px;color:#888">Reset to team defaults</button>'
    +'</div>';
}

function buildCoachCategories() {
  const cats=allTeamCategories.length>0?allTeamCategories:DEFAULT_CATS.map(function(c,i){return{id:null,name:c,weight:DEFAULT_WEIGHTS[c]||1.0,sort_order:i};});
  var rows="";
  for(var i=0;i<cats.length;i++){
    rows+='<div style="display:grid;grid-template-columns:1fr 80px 40px;gap:8px;align-items:center;margin-bottom:8px">'
      +'<input type="text" id="cat-name-'+i+'" value="'+h(cats[i].name)+'" style="padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;background:#fafafa" />'
      +'<input type="number" id="cat-weight-'+i+'" value="'+cats[i].weight+'" min="0.1" max="10" step="0.5" style="padding:8px 6px;border:1px solid #ccc;border-radius:8px;font-size:13px;text-align:center;background:#fafafa" />'
      +'<button data-action="delete-category" data-idx="'+i+'" data-id="'+(cats[i].id||"")+'" class="btn-sm btn-danger" style="padding:8px">X</button></div>';
  }
  return '<div class="card"><h3>Shooting Categories</h3>'
    +'<p style="font-size:12px;color:#888;margin-bottom:12px">Rename categories, adjust King Point weights, or add your own.</p>'
    +'<div style="display:grid;grid-template-columns:1fr 80px 40px;gap:8px;margin-bottom:6px">'
    +'<div style="font-size:10px;color:#aaa;font-weight:500">Category Name</div><div style="font-size:10px;color:#aaa;font-weight:500;text-align:center">King Pts</div><div></div></div>'
    +rows
    +'<button data-action="save-categories" class="btn-primary" style="width:100%;padding:11px;margin-top:4px;font-size:13px;font-weight:500">Save Categories</button></div>'
    +'<div class="card"><h3>Add Category</h3>'
    +'<div style="display:grid;grid-template-columns:1fr 80px;gap:8px;margin-bottom:8px">'
    +'<input type="text" id="new-cat-name" placeholder="e.g. Mid-Range Pull-Up" style="padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit" />'
    +'<input type="number" id="new-cat-weight" value="1.0" min="0.1" max="10" step="0.5" style="padding:8px 6px;border:1px solid #ccc;border-radius:8px;font-size:13px;text-align:center" /></div>'
    +'<div style="font-size:10px;color:#888;margin-bottom:8px">King Points weight - higher = worth more on the leaderboard</div>'
    +'<button data-action="add-category" class="btn-primary" style="width:100%;padding:11px;font-size:13px">+ Add Category</button>'
    +'<div id="cat-msg" style="margin-top:6px"></div></div>'
    +'<div class="card" style="background:#FFF9E6;border:1px solid #FFD700">'
    +'<div style="font-size:12px;font-weight:500;color:#856404;margin-bottom:6px">King Points Reference</div>'
    +'<div style="font-size:11px;color:#555;line-height:1.7">Higher weight = harder shot = more King Points. Suggested: Easy = 0.5, Standard = 1.0, Pull-up = 2.0, 3pt = 3.0, Pull-up 3 = 4.0</div></div>';
}


function buildCoachMessages() {
  var msgList="";
  if(allMessages.length===0){
    msgList='<div style="text-align:center;padding:20px;color:#888;font-size:13px">No messages sent yet.</div>';
  } else {
    allMessages.forEach(function(m){
      const reads=allMessageReads.filter(function(r){return r.message_id===m.id;}).length;
      const target=m.target_player||"Everyone";
      const total=m.target_player?1:roster.length;
      const diff=Date.now()-new Date(m.created_at).getTime();
      const mins=Math.floor(diff/60000),hrs=Math.floor(diff/3600000),days=Math.floor(diff/86400000);
      const timeAgo=days>0?days+"d ago":hrs>0?hrs+"h ago":mins>0?mins+"m ago":"Just now";
      const readColor=reads===total?"#27500A":"#856404",readBg=reads===total?"#E6F7EC":"#FFF9E6";
      const unread=m.target_player?[]:roster.filter(function(p){return !allMessageReads.find(function(r){return r.message_id===m.id&&r.player===p;});});
      const unreadLine=unread.length>0?'<div style="font-size:10px;color:#888;margin-top:4px">Not yet read: '+unread.map(h).join(", ")+'</div>':"";
      msgList+='<div style="padding:12px 14px;border:0.5px solid #e0e0e0;border-radius:10px;margin-bottom:8px;background:#fafafa">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">'
        +'<div><div style="font-size:12px;color:#888">'+timeAgo+'</div>'
        +'<div style="font-size:10px;color:#1A3A5C;font-weight:500;margin-top:2px">To: '+h(target)+'</div></div>'
        +'<div style="display:flex;align-items:center;gap:6px">'
        +'<div style="font-size:11px;color:'+readColor+';background:'+readBg+';padding:2px 8px;border-radius:10px">'+reads+"/"+total+' read</div>'
        +'<button data-action="delete-message" data-id="'+m.id+'" style="font-size:11px;color:#A32D2D;background:none;border:none;padding:2px 4px;cursor:pointer">X</button>'
        +'</div></div>'
        +'<div style="margin-bottom:4px">'+renderMessageText(m.text)+'</div>'
        +unreadLine+'</div>';
    });
  }
  const playerOpts='<option value="">Everyone</option>'
    +roster.map(function(n){return'<option value="'+h(n)+'">'+h(n)+'</option>';}).join("");
  return '<div class="card"><h3>Send Message</h3>'
    +'<p style="font-size:12px;color:#888;margin-bottom:10px">Paste a YouTube link to send a video. Player sees it as a banner when they open the app.</p>'
    +'<div style="margin-bottom:10px">'
    +'<label style="font-size:12px;font-weight:500;color:#1A3A5C;display:block;margin-bottom:4px">Send to:</label>'
    +'<select id="msg-target" style="width:100%;padding:9px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;background:#fafafa">'+playerOpts+'</select></div>'
    +'<textarea id="msg-text" placeholder="Type a message or paste a YouTube link..." style="width:100%;min-height:80px;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;background:#fafafa;margin-bottom:10px"></textarea>'
    +'<button data-action="send-message" class="btn-primary" style="width:100%;padding:12px;font-size:14px;font-weight:500">Send</button></div>'
    +'<div class="card"><h3>Sent Messages</h3>'+msgList+'</div>';
}

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
  const name=curPlayer,wk=weekKey(),isMobile=window.innerWidth<700;
  const tot=playerTotals(name,[wk]);
  const playerCats=getPlayerCats(name);
  const unread=getUnreadMessages(name);
  var msgBanners="";
  unread.forEach(function(m){
    msgBanners+='<div style="background:linear-gradient(135deg,#1A3A5C,#0C2340);border-radius:10px;padding:12px 14px;margin-bottom:10px">'
      +'<div style="font-size:10px;color:#FFD700;text-transform:uppercase;letter-spacing:1px;font-weight:500;margin-bottom:6px">Message from Coach</div>'
      +'<div style="margin-bottom:10px">'+renderMessageText(m.text)+'</div>'
      +'<button data-action="dismiss-message" data-id="'+m.id+'" class="btn-primary" style="width:100%;padding:8px;font-size:12px;background:#FFD700;color:#1A3A5C;font-weight:500">Got it</button></div>';
  });
  var html='<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
    +'<button data-action="go-home">Back</button>'
    +'<div class="avatar avatar-lg">'+initials(name)+'</div>'
    +'<div style="flex:1"><div style="font-weight:500;font-size:15px">'+h(name)+'</div>'
    +'<div style="font-size:11px;color:#888">Week of '+fmtWeek(wk)+'</div></div>'
    +'<div style="text-align:right"><div style="font-size:20px;font-weight:500" class="'+pctClass(tot.pct)+'">'+(tot.pct===null?"--":tot.pct+"%")+'</div>'
    +'<div style="font-size:10px;color:#888">'+tot.m+"/"+tot.a+' shots</div></div></div>'
    +msgBanners
    +'<div style="display:flex;gap:6px;margin-bottom:10px">'
    +'<button data-action="go-summary" class="btn-primary" style="flex:1;padding:8px;font-size:12px">My Summary</button></div>';
  if(isMobile){
    html+='<div style="display:flex;gap:4px;margin-bottom:10px;background:#fff;padding:6px;border-radius:10px;border:0.5px solid #e0e0e0;overflow-x:auto">';
    for(var di2=0;di2<7;di2++){
      var dm=0,da=0;
      playerCats.forEach(function(pc){
        const nS=getSpotCount(name,pc.name);
        for(var si2=0;si2<nS;si2++){const v=getShot(name,wk,pc.name,si2,di2);dm+=parseInt(v.m)||0;da+=parseInt(v.a)||0;}
      });
      const isToday=di2===selectedDay,hasData=da>0;
      html+='<button onclick="selectDay('+di2+')" style="flex:1;min-width:42px;padding:8px 4px;border:none;border-radius:7px;font-size:11px;font-weight:500;background:'+(isToday?"#1A3A5C":hasData?"#E6F1FB":"transparent")+';color:'+(isToday?"#fff":hasData?"#0C447C":"#888")+';cursor:pointer">'
        +'<div>'+DAYS[di2]+'</div>'+(hasData?'<div style="font-size:9px;margin-top:2px;opacity:.8">'+dm+"/"+da+'</div>':'')+'</button>';
    }
    html+='</div>';
    const dayLabel=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][selectedDay];
    html+='<div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:8px;text-align:center">'+dayLabel+"s Workout</div>";
    const noteText=getNote(name,wk,selectedDay);
    html+='<div class="card" style="padding:.75rem 1rem;margin-bottom:10px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
      +'<div style="font-size:12px;font-weight:500;color:#1A3A5C">'+dayLabel+' Notes</div>'
      +'<div style="font-size:10px;color:#888">How did it feel?</div></div>'
      +'<textarea data-note-day="'+selectedDay+'" placeholder="Quick thoughts..." style="width:100%;min-height:60px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;background:#fafafa">'+h(noteText)+'</textarea></div>';
    playerCats.forEach(function(pc,catIdxM){
      const cat=pc.name,nSpots=getSpotCount(name,cat);
      html+='<div class="cat-hdr" style="display:flex;align-items:center;justify-content:space-between"><span>'+h(cat)+'</span>'
        +'<span style="display:flex;gap:4px;align-items:center">'
        +'<button data-action="spot-minus" data-catidx="'+catIdxM+'" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:26px;height:26px;border-radius:4px;font-size:15px;font-weight:500;cursor:pointer">-</button>'
        +'<span style="font-size:10px;color:#fff;min-width:38px;text-align:center">'+nSpots+' spots</span>'
        +'<button data-action="spot-plus" data-catidx="'+catIdxM+'" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:26px;height:26px;border-radius:4px;font-size:15px;font-weight:500;cursor:pointer">+</button></span></div>'
        +'<div class="card" style="padding:.75rem 1rem">'
        +'<div style="display:grid;grid-template-columns:78px 1fr 1fr 50px;gap:6px;align-items:center;margin-bottom:6px">'
        +'<div style="font-size:10px;color:#aaa;font-weight:500">Spot</div>'
        +'<div style="font-size:10px;color:#aaa;font-weight:500;text-align:center">Made</div>'
        +'<div style="font-size:10px;color:#aaa;font-weight:500;text-align:center">Attempts</div>'
        +'<div style="font-size:10px;color:#aaa;font-weight:500;text-align:center">%</div></div>';
      for(var si=0;si<nSpots;si++){
        const val=getShot(name,wk,cat,si,selectedDay),mv=parseInt(val.m)||0,av=parseInt(val.a)||0,p=av?Math.round(mv/av*100):null,customLabel=getSpotLabel(name,cat,si);
        html+='<div style="display:grid;grid-template-columns:78px 1fr 1fr 50px;gap:6px;align-items:center;margin-bottom:8px">'
          +'<input type="text" data-spot-label-cat="'+h(cat)+'" data-spot-label-si="'+si+'" placeholder="Spot '+(si+1)+'" value="'+h(customLabel)+'" style="font-size:11px;color:#1A3A5C;font-weight:500;padding:6px 4px;border:0.5px solid #e0e0e0;border-radius:6px;background:#f5f7fa;width:100%" />'
          +'<input type="number" min="0" max="99" inputmode="numeric" placeholder="0" value="'+h(val.m)+'" data-cat="'+h(cat)+'" data-si="'+si+'" data-di="'+selectedDay+'" data-f="m" style="padding:10px;text-align:center;font-size:16px;font-weight:500;border:1px solid #ccc;border-radius:8px;width:100%" />'
          +'<input type="number" min="0" max="99" inputmode="numeric" placeholder="0" value="'+h(val.a)+'" data-cat="'+h(cat)+'" data-si="'+si+'" data-di="'+selectedDay+'" data-f="a" style="padding:10px;text-align:center;font-size:16px;font-weight:500;border:1px solid #ccc;border-radius:8px;background:#fafafa;width:100%" />'
          +'<div class="pct-pill '+pctClass(p)+'" id="pp-'+cat.replace(/\W/g,"_")+'-'+si+'" style="font-size:12px;padding:6px">'+(p===null?"--":p+"%")+'</div></div>';
      }
      html+='</div>';
    });
  } else {
    html+='<div class="card" style="padding:.75rem 1rem;margin-bottom:10px"><div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:8px">Daily Notes</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">';
    for(var dni=0;dni<7;dni++){
      const nt=getNote(name,wk,dni);
      html+='<div><div style="font-size:10px;color:#888;font-weight:500;margin-bottom:3px">'+DAYS[dni]+'</div>'
        +'<textarea data-note-day="'+dni+'" placeholder="Notes..." style="width:100%;min-height:50px;padding:5px 6px;border:0.5px solid #ddd;border-radius:5px;font-size:11px;font-family:inherit;resize:none;background:#fafafa">'+h(nt)+'</textarea></div>';
    }
    html+='</div></div>';
    playerCats.forEach(function(pc,catIdxD){
      const cat=pc.name,nSpots=getSpotCount(name,cat);
      html+='<div class="cat-hdr" style="display:flex;align-items:center;justify-content:space-between"><span>'+h(cat)+'</span>'
        +'<span style="display:flex;gap:4px;align-items:center">'
        +'<button data-action="spot-minus" data-catidx="'+catIdxD+'" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:22px;height:22px;border-radius:4px;font-size:13px;cursor:pointer">-</button>'
        +'<span style="font-size:10px;color:#fff;min-width:40px;text-align:center">'+nSpots+' spots</span>'
        +'<button data-action="spot-plus" data-catidx="'+catIdxD+'" style="background:rgba(255,255,255,.2);color:#fff;border:none;width:22px;height:22px;border-radius:4px;font-size:13px;cursor:pointer">+</button></span></div>'
        +'<div class="card" style="padding:.65rem .9rem;overflow-x:auto"><div class="spot-grid" style="margin-bottom:5px"><div></div>';
      DAYS.forEach(function(d){html+='<div style="text-align:center;font-size:10px;color:#aaa;font-weight:500">'+d+'</div>';});
      html+='<div style="text-align:center;font-size:10px;color:#888;font-weight:500">Wk%</div></div>';
      for(var si=0;si<nSpots;si++){
        var sm=0,sa=0;
        const customLabel=getSpotLabel(name,cat,si);
        html+='<div class="spot-grid"><input type="text" data-spot-label-cat="'+h(cat)+'" data-spot-label-si="'+si+'" placeholder="Spot '+(si+1)+'" value="'+h(customLabel)+'" style="font-size:10px;color:#1A3A5C;font-weight:500;padding:3px 4px;border:0.5px solid #e0e0e0;border-radius:4px;background:#f5f7fa;width:100%" />';
        for(var di=0;di<7;di++){
          const val=getShot(name,wk,cat,si,di);
          sm+=parseInt(val.m)||0;sa+=parseInt(val.a)||0;
          html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px">'
            +'<input type="number" min="0" max="99" placeholder="M" value="'+h(val.m)+'" data-cat="'+h(cat)+'" data-si="'+si+'" data-di="'+di+'" data-f="m" style="padding:4px 2px;text-align:center;font-size:11px;border:0.5px solid #ddd;border-radius:3px;width:100%" />'
            +'<input type="number" min="0" max="99" placeholder="A" value="'+h(val.a)+'" data-cat="'+h(cat)+'" data-si="'+si+'" data-di="'+di+'" data-f="a" style="padding:4px 2px;text-align:center;font-size:11px;border:0.5px solid #ddd;border-radius:3px;background:#f9f9f9;width:100%" />'
            +'</div>';
        }
        const sp=sa?Math.round(sm/sa*100):null;
        html+='<div class="pct-pill '+pctClass(sp)+'" id="pp-'+cat.replace(/\W/g,"_")+'-'+si+'">'+(sp===null?"--":sp+"%")+'</div></div>';
      }
      html+='</div>';
    });
  }
  html+='<button data-action="save-player" class="btn-primary" style="width:100%;padding:14px;margin-top:10px;font-size:15px;font-weight:500">Save my numbers</button>';
  return html;
}

// -- Progress chart
function buildProgressChart(playerName){
  const weeks=[...new Set(allShots.filter(function(s){return s.player===playerName;}).map(function(s){return s.week;}))].sort();
  if(weeks.length<2)return'<div class="card" style="padding:16px;text-align:center;color:#888;font-size:12px">Progress chart will appear after 2+ weeks of data.</div>';
  const catData={};
  const pCats=getPlayerCats(playerName);
  pCats.forEach(function(pc){const cat=pc.name;catData[cat]=weeks.map(function(wk){const shots=allShots.filter(function(s){return s.player===playerName&&s.week===wk&&s.category===cat;});const m=shots.reduce(function(a,s){return a+(s.made||0);},0),a=shots.reduce(function(a,s){return a+(s.attempts||0);},0);return{wk:wk,pct:a>0?Math.round(m/a*100):null};});});
  const CAT_COLORS={"Form Shooting":"#888888","Catch & Shoot":"#2E75B6","Catch & Shoot 3s":"#1A3A5C","1-Dribble Pull-Up":"#27500A","1-Dribble Pull-Up 3s":"#1E8449","Finishes":"#B8860B"};
  const W=340,H=200,padL=40,padR=14,padT=14,padB=30,chartW=W-padL-padR,chartH=H-padT-padB;
  const xStep=weeks.length>1?chartW/(weeks.length-1):0;
  function xPos(i){return padL+i*xStep;}
  function yPct(p){return padT+chartH-(p/100)*chartH;}
  var yGridLines="";
  [0,25,50,75,100].forEach(function(p){yGridLines+='<line x1="'+padL+'" y1="'+yPct(p)+'" x2="'+(W-padR)+'" y2="'+yPct(p)+'" stroke="#eee" stroke-width="0.5" /><text x="'+(padL-4)+'" y="'+(yPct(p)+3)+'" font-size="9" text-anchor="end" fill="#888">'+p+'%</text>';});
  var allLines="";
  pCats.forEach(function(pc,ci){
    const cat=pc.name,color=CAT_COLORS[cat]||["#888","#2E75B6","#1A3A5C","#27500A","#1E8449","#B8860B"][ci]||"#888";
    const pts=catData[cat].map(function(d,i){return d.pct!==null?{x:xPos(i),y:yPct(d.pct)}:null;}).filter(function(p){return p;});
    if(!pts.length)return;
    allLines+='<polyline points="'+pts.map(function(p){return p.x+","+p.y;}).join(" ")+'" fill="none" stroke="'+color+'" stroke-width="1.8" />';
    allLines+=pts.map(function(p){return '<circle cx="'+p.x+'" cy="'+p.y+'" r="2.5" fill="'+color+'" />';}).join("");
  });
  const labelIdxs=weeks.length<=4?weeks.map(function(_,i){return i;}):[0,Math.floor((weeks.length-1)/2),weeks.length-1];
  const xLabels=labelIdxs.map(function(i){const d=new Date(weeks[i]+"T12:00:00"),lbl=d.toLocaleDateString("en-US",{month:"short",day:"numeric"});return '<text x="'+xPos(i)+'" y="'+(H-14)+'" font-size="9" text-anchor="middle" fill="#888">'+lbl+'</text>';}).join("");
  const legend=pCats.map(function(pc,ci){const cat=pc.name,color=CAT_COLORS[cat]||["#888","#2E75B6","#1A3A5C","#27500A","#1E8449","#B8860B"][ci]||"#888",latest=[...( catData[cat]||[])].reverse().find(function(d){return d.pct!==null;});return '<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:#444"><span style="display:inline-block;width:10px;height:10px;background:'+color+';border-radius:2px"></span><span style="flex:1">'+h(cat)+'</span><span style="font-weight:500;color:'+color+'">'+( latest?latest.pct+"%":"--" )+'</span></div>';}).join("");
  return '<div class="card" style="padding:14px 16px">'
    +'<div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:10px">Weekly % by Category</div>'
    +'<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+yGridLines+allLines+xLabels+'</svg>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;padding-top:10px;border-top:0.5px solid #eee">'+legend+'</div>'
    +'<div style="font-size:10px;color:#888;margin-top:8px;text-align:center;font-style:italic">In-gym shooting % is the ceiling - what you can do here predicts what you will do in a game</div>'
    +'</div>';
}
// ── Coach feedback block (player-facing) ──────
function buildCoachFeedback(playerName) {
  const wk=weekKey();
  const playerCmnt=getCoachComment(playerName,"player",null,null);
  const weekCmnt=getCoachComment(playerName,"week",wk,null);
  var recentDayCmnt=null,recentDayIdx=null;
  for(var d=6;d>=0;d--){const c=getCoachComment(playerName,"day",wk,d);if(c&&c.text){recentDayCmnt=c;recentDayIdx=d;break;}}
  if(!playerCmnt&&!weekCmnt&&!recentDayCmnt) return "";
  const dayLabels=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  return '<div class="card" style="padding:16px;background:linear-gradient(135deg,#1A3A5C08,transparent);border-left:3px solid #1A3A5C;margin-bottom:8px">'
    +'<div style="font-size:12px;font-weight:500;color:#1A3A5C;margin-bottom:10px">Coach Feedback</div>'
    +(playerCmnt?'<div style="margin-bottom:10px"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;font-weight:500;margin-bottom:4px">General</div>'+renderMessageText(playerCmnt.text)+'</div>':"")
    +(weekCmnt?'<div style="margin-bottom:10px"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;font-weight:500;margin-bottom:4px">This Week</div>'+renderMessageText(weekCmnt.text)+'</div>':"")
    +(recentDayCmnt?'<div><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;font-weight:500;margin-bottom:4px">'+dayLabels[recentDayIdx]+'</div>'+renderMessageText(recentDayCmnt.text)+'</div>':"")
    +'</div>';
}


function buildDailyCheckin() {
  const name=curPlayer,wk=weekKey();
  const dayLabel=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][selectedDay];
  const ex=getDailyCheckin(name,wk,selectedDay)||{};
  function btn(field,val,label){const sel=checkinTemp[field]!==undefined?checkinTemp[field]:ex[field];return'<button data-checkin="'+field+'" data-val="'+h(val)+'" class="'+(sel===val?"btn-primary":"")+'" style="padding:11px;font-size:13px;font-weight:500">'+label+'</button>';}
  return '<div style="max-width:520px;margin:0 auto">'
    +'<div style="text-align:center;margin-bottom:18px"><div style="font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;font-weight:500">Daily Check-In</div>'
    +'<div style="font-size:13px;color:#1A3A5C;margin-top:4px">'+dayLabel+' - '+h(name)+'</div></div>'
    +'<div class="card" style="padding:18px 16px;margin-bottom:12px"><div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:12px">Did you bring your best effort today?</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+btn("effort","Yes","Yes")+btn("effort","No","No")+'</div></div>'
    +'<div class="card" style="padding:18px 16px;margin-bottom:12px"><div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:12px">When something went wrong, what did you do?</div>'
    +'<div style="display:grid;gap:6px">'+btn("recovery","Flushed it","Flushed it and moved on")+btn("recovery","Got down a little","Got down a little but recovered")+btn("recovery","Stayed down","Got down and stayed down")+'</div></div>'
    +'<div class="card" style="padding:18px 16px;margin-bottom:14px"><div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:12px">One word for how you felt today?</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'
    +["Locked In","Solid","Off","Frustrated","Tired","Confident"].map(function(f){return btn("feeling",f,f);}).join("")
    +'</div></div>'
    +'<div style="display:flex;gap:8px"><button data-action="skip-checkin" style="flex:1;padding:12px;font-size:13px;color:#888">Skip for now</button>'
    +'<button data-action="save-checkin" class="btn-primary" style="flex:2;padding:12px;font-size:14px;font-weight:500">Save Check-In</button></div></div>';
}


function buildWeeklyCheckin() {
  const name=curPlayer,wk=weekKey(),ex=getWeeklyCheckin(name,wk)||{};
  function wbtn(field,val,label){const sel=checkinTemp[field]!==undefined?checkinTemp[field]:ex[field];return'<button data-wcheckin="'+field+'" data-val="'+h(val)+'" class="'+(sel===val?"btn-primary":"")+'" style="padding:12px;font-size:13px;font-weight:500;text-align:left">'+label+'</button>';}
  function stbtn(val){const sel=checkinTemp.selftalk!==undefined?checkinTemp.selftalk:ex.selftalk;return'<button data-wcheckin="selftalk" data-val="'+val+'" class="'+(sel===val?"btn-primary":"")+'" style="padding:11px;font-size:12px;font-weight:500">'+val+'</button>';}
  return '<div style="max-width:520px;margin:0 auto">'
    +'<div style="text-align:center;margin-bottom:18px"><div style="font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;font-weight:500">Weekly Check-In</div>'
    +'<div style="font-size:13px;color:#1A3A5C;margin-top:4px">Week of '+fmtWeek(wk)+' - '+h(name)+'</div></div>'
    +'<div class="card" style="padding:18px 16px;margin-bottom:12px"><div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:8px">Did your actions this week match your goals?</div>'
    +'<div style="font-size:11px;color:#888;margin-bottom:14px">Slide honestly. 1 = not at all. 10 = locked in all week.</div>'
    +'<div style="display:flex;align-items:center;gap:12px"><input type="range" id="alignment-slider" min="1" max="10" value="'+(ex.alignment||5)+'" style="flex:1" oninput="document.getElementById(\'alignment-val\').textContent=this.value" />'
    +'<div id="alignment-val" style="font-size:22px;font-weight:500;color:#1A3A5C;min-width:30px;text-align:center">'+(ex.alignment||5)+'</div></div></div>'
    +'<div class="card" style="padding:18px 16px;margin-bottom:12px"><div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:12px">Did you compete with confidence this week?</div>'
    +'<div style="display:grid;gap:6px">'+wbtn("confidence","Full confidence","Full confidence - I trusted my work")+wbtn("confidence","Some confidence","Some confidence in spots")+wbtn("confidence","In my head","In my head more than I should have been")+'</div></div>'
    +'<div class="card" style="padding:18px 16px;margin-bottom:14px"><div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:12px">Rate your self-talk this week.</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">'+stbtn("Positive")+stbtn("Mixed")+stbtn("Negative")+'</div></div>'
    +'<div style="display:flex;gap:8px"><button data-action="go-home" style="flex:1;padding:12px;font-size:13px;color:#888">Cancel</button>'
    +'<button data-action="save-wcheckin" class="btn-primary" style="flex:2;padding:12px;font-size:14px;font-weight:500">Save Weekly Check-In</button></div></div>';
}


function buildSummary() {
  const name=curPlayer,wk=weekKey(),mo=monthKey(),yr=yearKey();
  const allPWks=[...new Set(allShots.filter(function(s){return s.player===name;}).map(function(s){return s.week;}))].sort();
  const weekW=[wk],moW=allPWks.filter(function(w){return w.startsWith(mo);}),yrW=allPWks.filter(function(w){return w.startsWith(yr);});
  function ps(weeks){return{tot:playerTotals(name,weeks),cats:playerCatTotals(name,weeks),best:playerBestDay(name,weeks),wkCount:weeks.length};}
  const weekS=ps(weekW),monthS=ps(moW),yearS=ps(yrW);
  var trend=null;
  if(allPWks.length>=2){const prev=playerTotals(name,[allPWks[allPWks.length-2]]);if(prev.pct!==null&&weekS.tot.pct!==null)trend=weekS.tot.pct-prev.pct;}
  var bestSpot=null;
  const pCats=getPlayerCats(name);
  pCats.forEach(function(pc){
    const cat=pc.name,nSpots=getSpotCount(name,cat);
    for(var si=0;si<nSpots;si++){var sm=0,sa=0;for(var di=0;di<7;di++){const v=getShot(name,wk,cat,si,di);sm+=parseInt(v.m)||0;sa+=parseInt(v.a)||0;}if(sa>=10){const p=Math.round(sm/sa*100);if(!bestSpot||p>bestSpot.pct){bestSpot={cat:cat,label:getSpotLabel(name,cat,si)||"Spot "+(si+1),pct:p,m:sm,a:sa};}}}
  });
  function periodCard(label,stats,color){
    return '<div class="card" style="padding:14px 16px;background:linear-gradient(135deg,'+color+'10,transparent)">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
      +'<div style="font-size:11px;color:#888;letter-spacing:.5px;text-transform:uppercase;font-weight:500">'+label+'</div>'
      +'<div style="font-size:10px;color:#888">'+stats.wkCount+' week'+(stats.wkCount===1?'':'s')+'</div></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center">'
      +'<div><div style="font-size:22px;font-weight:500;color:'+color+'">'+(stats.tot.pct===null?"--":stats.tot.pct+"%")+'</div><div style="font-size:10px;color:#888">Shooting %</div></div>'
      +'<div><div style="font-size:22px;font-weight:500;color:#1A3A5C">'+stats.tot.m+'</div><div style="font-size:10px;color:#888">Makes</div></div>'
      +'<div><div style="font-size:22px;font-weight:500;color:#1A3A5C">'+stats.tot.a+'</div><div style="font-size:10px;color:#888">Attempts</div></div>'
      +'</div></div>';
  }
  var catRows="";
  CATS.forEach(function(cat){
    const wkC=weekS.cats[cat]||{pct:null},moC=monthS.cats[cat]||{pct:null},yrC=yearS.cats[cat]||{pct:null};
    catRows+='<tr><td style="text-align:left;font-weight:500;font-size:11px">'+h(cat)+'</td>'
      +'<td class="'+pctClass(wkC.pct)+'">'+(wkC.pct===null?"--":wkC.pct+"%")+'</td>'
      +'<td class="'+pctClass(moC.pct)+'">'+(moC.pct===null?"--":moC.pct+"%")+'</td>'
      +'<td class="'+pctClass(yrC.pct)+'">'+(yrC.pct===null?"--":yrC.pct+"%")+'</td></tr>';
  });
  const trendHtml=trend!==null?'<div style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:8px;font-size:11px;font-weight:500;background:'+(trend>=0?'#E6F7EC':'#FDECEC')+';color:'+(trend>=0?'#27500A':'#A32D2D')+'">'+(trend>=0?"\u25B2":"\u25BC")+' '+Math.abs(trend)+'% vs last week</div>':"";
  const hasWeekly=getWeeklyCheckin(name,weekKey());
  return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
    +'<button data-action="go-home">\u2190 Back</button><div class="avatar avatar-lg">'+initials(name)+'</div>'
    +'<div style="flex:1"><div style="font-weight:500;font-size:15px">'+h(name)+'</div><div style="font-size:11px;color:#888">Summary</div></div>'
    +trendHtml+'</div>'
    +'<button data-action="go-weekly-checkin" class="btn-primary" style="width:100%;padding:11px;margin-bottom:12px;font-size:13px;font-weight:500">'+(hasWeekly?'Update':'Start')+' Weekly Check-In</button>'
    +buildCoachFeedback(name)
    +buildProgressChart(name)
    +periodCard('This Week',weekS,'#1A3A5C')
    +periodCard('This Month',monthS,'#2E75B6')
    +periodCard('This Year',yearS,'#1E8449')
    +(bestSpot?'<div class="card" style="padding:14px 16px;background:linear-gradient(135deg,#FFF9E6,transparent);border:1px solid #FFD700">'
      +'<div style="font-size:11px;color:#856404;letter-spacing:.5px;text-transform:uppercase;font-weight:500;margin-bottom:6px">Best Spot This Week</div>'
      +'<div style="display:flex;align-items:center;justify-content:space-between">'
      +'<div><div style="font-weight:500;font-size:14px">'+h(bestSpot.label)+'</div><div style="font-size:11px;color:#888">'+h(bestSpot.cat)+'</div></div>'
      +'<div style="text-align:right"><div style="font-size:22px;font-weight:500;color:#856404">'+bestSpot.pct+'%</div><div style="font-size:10px;color:#888">'+bestSpot.m+"/"+bestSpot.a+' shots</div></div></div></div>':'')
    +'<div class="card" style="padding:14px 16px"><div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:10px">By Category</div>'
    +'<table class="dash"><thead><tr><th style="text-align:left">Category</th><th>Week</th><th>Month</th><th>Year</th></tr></thead><tbody>'+catRows+'</tbody></table></div>';
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
      '<div class="sb-row '+(i<3?"medal-"+(i+1):"")+'">'
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
  try {
    const weeks=weeksForPeriod(sbPeriod);
    const wk=weekKey(), mo=monthKey(), yr=yearKey();
    const periodLabel=sbPeriod==="week"?"Week of "+fmtWeek(wk):sbPeriod==="month"?fmtMonth(mo):yr+" Season";
    const kingWeeks=[weekKey()];
    const kingData=roster.map(function(n){
      const t=playerTotals(n,kingWeeks), wMade=playerWeightedMakes(n,kingWeeks);
      return{name:n,made:t.m,weighted:wMade,pct:t.pct};
    }).filter(function(p){return p.weighted>0;}).sort(function(a,b){return b.weighted-a.weighted;});
    const king=kingData[0]||null;

    let streak=0;
    if(king){
      try{
        const currentWk=weekKey();
        const pastWks=[...new Set(allShots.map(function(s){return s.week;}))].filter(function(w){return w<currentWk;}).sort().reverse().slice(0,10);
        for(let wi=0;wi<pastWks.length;wi++){
          const wkData=roster.map(function(n){return{name:n,w:playerWeightedMakes(n,[pastWks[wi]])};}).filter(function(p){return p.w>0;}).sort(function(a,b){return b.w-a.w;});
          if(wkData[0]&&wkData[0].name===king.name) streak++;
          else break;
        }
      }catch(e2){streak=0;}
    }

    let kingBanner;
    if(king){
      const streakLine=streak>=2?'<div style="margin-top:8px;font-size:11px;color:#FFD700">🔥 '+streak+' weeks in a row!</div>':"";
      const kingPct=king.pct===null?"—":king.pct+"%";
      kingBanner='<div style="background:linear-gradient(135deg,#2a1a00,#1a0f00);border:1.5px solid #FFD700;border-radius:12px;padding:14px 16px;margin-bottom:14px;text-align:center">'
        +'<div style="font-size:10px;letter-spacing:1px;color:#FFD700;text-transform:uppercase;margin-bottom:6px">👑 This Week\'s Shooting King</div>'
        +'<div style="font-size:26px;font-weight:500;color:#FFD700;margin-bottom:4px">'+king.name+'</div>'
        +'<div style="display:flex;justify-content:center;gap:16px;margin-top:6px;flex-wrap:wrap">'
        +'<div style="text-align:center"><div style="font-size:18px;font-weight:500;color:#FFD700">'+Math.round(king.weighted*10)/10+'</div><div style="font-size:10px;color:#888">King Points</div></div>'
        +'<div style="text-align:center"><div style="font-size:18px;font-weight:500;color:#fff">'+king.made+'</div><div style="font-size:10px;color:#888">Shots Made</div></div>'
        +'<div style="text-align:center"><div style="font-size:18px;font-weight:500;color:#fff">'+kingPct+'</div><div style="font-size:10px;color:#888">Shooting %</div></div>'
        +'<div style="text-align:center"><div style="font-size:18px;font-weight:500;color:#FFD700">'+streak+'</div><div style="font-size:10px;color:#888">Week Streak</div></div>'
        +'</div>'+streakLine+'</div>';
    } else {
      kingBanner='<div style="background:#111;border:1px dashed #334;border-radius:12px;padding:14px;text-align:center;margin-bottom:14px"><div style="font-size:12px;color:#445">👑 No Shooting King yet this week — get to work!</div></div>';
    }

    function ranked(arr){
      return arr.filter(function(x){return x.val!==null;}).sort(function(a,b){return(b.exact||b.val)-(a.exact||a.val);});
    }
    const overall=ranked(roster.map(function(n){const t=playerTotals(n,weeks);return{name:n,val:t.pct,exact:t.exactPct,sub:t.m+"/"+t.a+" shots"};}));
    const attempts=ranked(roster.map(function(n){const t=playerTotals(n,weeks);return{name:n,val:t.a,sub:t.m+" made"};}));
    const bestDay=ranked(roster.map(function(n){const b=playerBestDay(n,weeks);return{name:n,val:b?b.pct:null,sub:b?b.day+" \u2014 "+b.m+"/"+b.a:""};}));
    const improved=ranked(roster.map(function(n){const i=playerImproved(n);return{name:n,val:i?i.diff:null,sub:i?i.prev+"% \u2192 "+i.curr+"%":""};}));
    const catRanks=CATS.map(function(cat){return{cat:cat,rows:ranked(roster.map(function(n){const c=playerCatTotals(n,weeks)[cat];return{name:n,val:c.pct,sub:c.m+"/"+c.a};}))};});

    function sbRows(rows,isAtt,isDiff){
      isAtt=!!isAtt; isDiff=!!isDiff;
      if(!rows.length) return '<div class="sb-no-data">No data yet \u2014 get to work! \uD83C\uDFC0</div>';
      const max=rows[0].val||1;
      return rows.map(function(r,i){
        const barW=Math.round((r.val/max)*100);
        const valStr=isDiff?(r.val>0?"+":"")+r.val+"%":isAtt?String(r.val):r.val+"%";
        const medalClass=i<3?"medal-"+(i+1):"";
        return '<div class="sb-row '+medalClass+'">'
          +'<div class="sb-rank '+rankMedal(i)+'">'+rankSymbol(i)+'</div>'
          +'<div class="sb-avatar">'+initials(r.name)+'</div>'
          +'<div class="sb-name">'+r.name+'</div>'
          +'<div class="sb-bar-wrap"><div class="sb-bar" style="width:'+barW+'%"></div></div>'
          +'<div><div class="sb-stat">'+valStr+'</div><div class="sb-sub">'+r.sub+'</div></div>'
          +'</div>';
      }).join("");
    }

    const periodTabs='<div class="sb-tabs">'
      +'<div class="sb-tab '+(sbPeriod==="week"?"active":"")+'" data-action="sb-period" data-p="week">This Week</div>'
      +'<div class="sb-tab '+(sbPeriod==="month"?"active":"")+'" data-action="sb-period" data-p="month">This Month</div>'
      +'<div class="sb-tab '+(sbPeriod==="year"?"active":"")+'" data-action="sb-period" data-p="year">This Year</div>'
      +'</div>';

    const sectionIds=["overall","attempts","bestday","improved","cats"];
    const sectionLabels=["Overall %","Most Shots","Best Day","Improved","By Category"];
    const sectionTabs='<div class="sb-tabs">'+sectionIds.map(function(id,i){
      return '<div class="sb-tab '+(sbSection===id?"active":"")+'" data-action="sb-sec" data-s="'+id+'">'+sectionLabels[i]+'</div>';
    }).join("")+'</div>';

    let content="";
    if(sbSection==="overall")  content='<div class="sb-section"><div class="sb-section-title">Overall shooting %</div>'+sbRows(overall)+'</div>';
    if(sbSection==="attempts") content='<div class="sb-section"><div class="sb-section-title">Most shots attempted</div>'+sbRows(attempts,true)+'</div>';
    if(sbSection==="bestday")  content='<div class="sb-section"><div class="sb-section-title">Best single day</div>'+sbRows(bestDay)+'</div>';
    if(sbSection==="improved") content='<div class="sb-section"><div class="sb-section-title">Most improved (week over week)</div>'+sbRows(improved,false,true)+'</div>';
    if(sbSection==="cats")     content=catRanks.map(function(cr){return'<div class="sb-section"><div class="sb-section-title">'+cr.cat+'</div>'+sbRows(cr.rows)+'</div>';}).join("");

    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">'
      +'<button data-action="go-home">\u2190 Back</button>'
      +'<span style="font-weight:500;font-size:15px">\uD83C\uDFC6 '+teamName+' Rankings</span>'
      +'</div>'
      +kingBanner
      +'<div class="sb-wrap">'
      +'<div class="sb-title">\uD83C\uDFC0 Team Rankings</div>'
      +periodTabs
      +'<div class="period-label">'+periodLabel+'</div>'
      +sectionTabs
      +content
      +'</div>';

  } catch(e) {
    return '<div class="card" style="padding:20px;text-align:center">'
      +'<div style="color:#A32D2D;font-size:13px;margin-bottom:8px">Leaderboard error: '+e.message+'</div>'
      +'<button data-action="go-home" style="margin-top:12px">Back</button>'
      +'</div>';
  }
}



// ── About / Feature Explainer ────────────────
function buildAbout() {
  const coachFeatures=[
    ["Shot Tracking","Players log makes and attempts by category, spot, and day — every workout, every week."],
    ["Shooting King","A weighted leaderboard crowns the week's best shooter. 3-point makes count more. Pull-ups count more."],
    ["Mental Performance","Daily and weekly check-ins built on CMPT principles — effort, recovery, confidence, self-talk."],
    ["Coach Comments","Leave feedback per player, per week, or per day. Only that player sees it."],
    ["Player Summaries","Week, month, and year stats. Best spot. Progress chart by category. Trend vs last week."],
    ["League Competition","Opt your team into cross-team competition. Weekly totals compete against other Sharpshooter teams."],
    ["Player PINs","Each player protects their own data with a personal PIN. Coach has master override."],
  ];
  const kingScoring=[
    ["Form Shooting","0.5x"],["Catch & Shoot","1.0x"],["Finishes","1.0x"],
    ["1-Dribble Pull-Up","2.0x"],["Catch & Shoot 3s","3.0x"],["1-Dribble Pull-Up 3s","4.0x"],
  ];
  const playerSteps=[
    ["Join Your Team","Your coach gives you a team code. Type it in and you're on the roster."],
    ["Set Your PIN","Pick a 4-digit PIN. Your data is yours — nobody else can change your numbers."],
    ["Log Your Workout","Tap your name, pick the day, enter makes and attempts for each spot. Takes 2 minutes."],
    ["Check the King Board","See who's leading in weighted shooting points. Can you take the crown?"],
    ["Do Your Check-In","After saving, answer 3 quick questions about your mental game. 30 seconds."],
    ["See Your Summary","Track your progress week over week. See your best spot and your coach's feedback."],
  ];

  const coachContent='<div style="padding:4px 0">'
    +'<div style="background:linear-gradient(135deg,#1A3A5C,#0C2340);border-radius:12px;padding:20px 18px;margin-bottom:16px;text-align:center">'
    +'<div style="font-size:32px;margin-bottom:8px">🎯</div>'
    +'<div style="font-size:20px;font-weight:500;color:#FFD700;margin-bottom:6px">Sharpshooter</div>'
    +'<div style="font-size:12px;color:#ccc;font-style:italic;margin-bottom:10px">"What gets measured, improves"</div>'
    +'<div style="display:inline-block;background:#FFD700;color:#1A3A5C;font-size:11px;font-weight:500;padding:4px 12px;border-radius:20px">MVP — Early Access</div></div>'
    +'<div class="card" style="border-left:3px solid #FFD700"><div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:8px">🏀 Built by a Coach, for Coaches</div>'
    +'<div style="font-size:13px;color:#444;line-height:1.7">Sharpshooter was built by Coach Todd Shores — 30+ years coaching youth basketball, CMPT, and a coach who got tired of players not tracking their work.<br><br>This is a <strong>culture tool</strong>. It rewards the work that wins games — the shooting workouts nobody sees.</div></div>'
    +'<div class="card"><div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:10px">⚙️ What It Does</div>'
    +coachFeatures.map(function(item){return'<div style="display:flex;gap:10px;margin-bottom:12px;align-items:flex-start"><div style="font-size:13px;font-weight:500;color:#1A3A5C;min-width:0"><strong>'+item[0]+'</strong></div><div style="font-size:12px;color:#555;line-height:1.5">'+item[1]+'</div></div>';}).join("")+'</div>'
    +'<div class="card" style="background:linear-gradient(135deg,#FFF9E6,#fff);border:1px solid #FFD700">'
    +'<div style="font-size:13px;font-weight:500;color:#856404;margin-bottom:10px">👑 The King Scoring System</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'
    +kingScoring.map(function(r){return'<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#fff;border-radius:6px;border:0.5px solid #e8d77a"><span style="font-size:11px;color:#555">'+r[0]+'</span><span style="font-size:12px;font-weight:500;color:#856404">'+r[1]+'</span></div>';}).join("")
    +'</div></div>'
    +'<div class="card" style="background:#0a0f1a;border:1px solid #334"><div style="font-size:13px;font-weight:500;color:#FFD700;margin-bottom:8px">💰 Pricing — Early Access</div>'
    +'<div style="font-size:12px;color:#aaa;line-height:1.7">Free MVP version while we build and test with real teams. Full App Store launch coming — <strong style="color:#fff">$9.99/month per team</strong>.</div></div>'
    +'<div class="card" style="border:1px solid #1A3A5C"><div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:6px">📲 Get Started</div>'
    +'<ol style="font-size:12px;color:#444;line-height:2;padding-left:18px;margin:0"><li>Open <strong>basketball-tracker-nine.vercel.app</strong></li><li>Add to your home screen</li><li>Create your team and get a team code</li><li>Share the code with your players</li></ol></div>'
    +'<button data-action="share-coach" class="btn-primary" style="width:100%;padding:14px;font-size:14px;font-weight:500;margin-bottom:8px">📤 Share with Another Coach</button>'
    +'</div>';

  const playerContent='<div style="padding:4px 0">'
    +'<div style="background:linear-gradient(135deg,#1A3A5C,#0C2340);border-radius:12px;padding:20px 18px;margin-bottom:16px;text-align:center">'
    +'<div style="font-size:32px;margin-bottom:8px">🎯</div><div style="font-size:20px;font-weight:500;color:#FFD700;margin-bottom:6px">Sharpshooter</div>'
    +'<div style="font-size:12px;color:#ccc;font-style:italic">"What gets measured, improves"</div></div>'
    +'<div class="card" style="border-left:3px solid #FFD700"><div style="font-size:14px;font-weight:500;color:#1A3A5C;margin-bottom:8px">The best players track their work.</div>'
    +'<div style="font-size:13px;color:#444;line-height:1.7">Log your makes, compete for the crown, and get feedback from your coach.</div></div>'
    +'<div class="card"><div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:10px">📱 How It Works</div>'
    +playerSteps.map(function(s,i){return'<div style="display:flex;gap:10px;margin-bottom:12px;align-items:flex-start"><div style="font-size:16px;min-width:28px;font-weight:500;color:#1A3A5C">'+(i+1)+'.</div><div><div style="font-size:13px;font-weight:500;color:#1A3A5C">'+s[0]+'</div><div style="font-size:12px;color:#555;line-height:1.5;margin-top:2px">'+s[1]+'</div></div></div>';}).join("")+'</div>'
    +'<div class="card" style="background:linear-gradient(135deg,#2a1a00,#1a0f00);border:1.5px solid #FFD700">'
    +'<div style="font-size:13px;font-weight:500;color:#FFD700;margin-bottom:8px">👑 What is the Shooting King?</div>'
    +'<div style="font-size:12px;color:#aaa;line-height:1.7">The player with the most <strong style="color:#FFD700">weighted makes</strong> in a week. Pull-up threes count <strong style="color:#FFD700">4x</strong> more than form shooting.</div></div>'
    +'<div class="card"><div style="font-size:13px;font-weight:500;color:#1A3A5C;margin-bottom:8px">💬 Coach Feedback</div>'
    +'<div style="font-size:12px;color:#444;line-height:1.7">Check your <strong>Summary screen</strong> to see notes from your coach. Private — only you see it.</div></div>'
    +'</div>';

  return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">'
    +'<button data-action="go-home">← Back</button>'
    +'<span style="font-weight:500;font-size:15px">ℹ️ About Sharpshooter</span></div>'
    +'<div style="display:flex;gap:6px;margin-bottom:14px">'
    +'<button data-action="about-tab" data-t="coaches" class="'+(aboutTab==="coaches"?"btn-primary":"")+'" style="flex:1;padding:10px;font-size:13px;font-weight:500">🏀 For Coaches</button>'
    +'<button data-action="about-tab" data-t="players" class="'+(aboutTab==="players"?"btn-primary":"")+'" style="flex:1;padding:10px;font-size:13px;font-weight:500">👤 For Players</button></div>'
    +(aboutTab==="coaches"?coachContent:playerContent);
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
function handleSwitchTeam(){clearTeam();teamCode=null;teamName="";roster=[];allShots=[];allPlayerPins=[];allCoachComments=[];allMessages=[];allMessageReads=[];allTeamCategories=[];allPlayerCategories=[];CATS=[...DEFAULT_CATS];teamCompete=false;leagueShots=[];leagueRosters={};leagueTeams=[];screen="team-select";render(buildTeamSelect());}

// ── Event handling ────────────────────────────
function attachEvents() {
  // Body-level handler for video overlay (renders outside #app)
  document.body.addEventListener("click",function(e){
    const bv=e.target.closest("[data-action='close-video']");
    if(bv){const overlay=bv.closest("div[style*='position:fixed']");if(overlay)overlay.remove();}
  });
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
    if(a==="play-video"){
      document.body.insertAdjacentHTML("beforeend", buildVideoPlayer(b.dataset.vid));
    }
    if(a==="close-video"){
      const el=document.querySelector("[data-action='close-video']");
      if(el)el.closest("div[style*='position:fixed']").remove();
    }
    if(a==="go-about"){screen="about";aboutTab="coaches";render(buildAbout());}
    if(a==="about-tab"){aboutTab=b.dataset.t;render(buildAbout());}
    if(a==="share-coach"){
      const subject="Free Basketball Shooting Tracker — Sharpshooter";
      const body=`Coach,\n\nI want to share something I've been building for my team that I think you'll find useful.\n\nIt's called Sharpshooter — a free basketball shooting tracker built specifically for team workouts. Players log their makes and attempts by category and spot, compete for the Shooting King crown each week, and do quick mental performance check-ins after every session. You get a live dashboard of your whole team's shooting percentages by category, plus the ability to leave private feedback for each player.\n\nHere's how to get started in about 5 minutes:\n\n1. Open basketball-tracker-nine.vercel.app on your phone\n2. Tap "Create New Team" and set up your roster\n3. Share your team code with your players\n4. Players join, set their PIN, and start logging\n\nAdd it to your home screen and it works just like a regular app — no App Store required.\n\nIt's completely free right now. We're in early MVP testing before a full App Store launch later this year. I'd love to have another team on it and get your feedback.\n\nAny questions, just reply.\n\nCoach Todd Shores\nBobcat Basketball\nOrange, TX`;
      const gmailUrl = `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(gmailUrl, '_blank');
    }
    if(a==="save-player-cats"){
      if(b.disabled)return;const player=b.dataset.player;b.disabled=true;b.textContent="Saving...";
      await initPlayerCategories(player);
      const pRows=allPlayerCategories.filter(function(c){return c.player===player&&c.team_code===teamCode;});
      for(var i=0;i<pRows.length;i++){
        const ne=document.getElementById("pcat-name-"+i),we=document.getElementById("pcat-weight-"+i);
        if(ne&&we){const n2=ne.value.trim(),w2=parseFloat(we.value)||1.0;if(n2)await savePlayerCategory(player,pRows[i].id,n2,w2,i);}
      }
      showToast("Categories saved for "+player+"!");render(buildCoach());
    }
    if(a==="add-player-cat"){
      const player=b.dataset.player,ne=document.getElementById("new-pcat-name"),we=document.getElementById("new-pcat-weight");
      const n2=(ne?ne.value:"").trim(),w2=parseFloat(we?we.value:1)||1.0;
      if(!n2){showToast("Enter a category name.");return;}
      b.disabled=true;b.textContent="Adding...";
      await initPlayerCategories(player);
      const so=allPlayerCategories.filter(function(c){return c.player===player&&c.team_code===teamCode;}).length;
      await savePlayerCategory(player,null,n2,w2,so);
      showToast("Category added for "+player+"!");render(buildCoach());
    }
    if(a==="delete-player-cat"){
      const player=b.dataset.player,id=b.dataset.id,idx=parseInt(b.dataset.idx);
      const pRows=allPlayerCategories.filter(function(c){return c.player===player&&c.team_code===teamCode;});
      const catName=pRows[idx]?pRows[idx].name:"this category";
      if(!confirm("Remove "+catName+" from "+player+"?"))return;
      if(id)await deletePlayerCategory(id);
      showToast("Category removed.");render(buildCoach());
    }
    if(a==="reset-player-cats"){
      const player=b.dataset.player;
      if(!confirm("Reset "+player+" to team default categories? Their custom categories will be deleted."))return;
      await db.from("player_categories").delete().eq("player",player).eq("team_code",teamCode);
      allPlayerCategories=allPlayerCategories.filter(function(c){return!(c.player===player&&c.team_code===teamCode);});
      showToast("Reset to team defaults.");render(buildCoach());
    }
    if(a==="save-categories"){
      if(b.disabled)return;
      b.disabled=true;b.textContent="Saving...";
      const cats=allTeamCategories.length>0?allTeamCategories:DEFAULT_CATS.map(function(c,i){return{id:null,name:c,weight:DEFAULT_WEIGHTS[c]||1.0,sort_order:i};});
      // If not seeded yet, seed first
      if(allTeamCategories.length===0) await initTeamCategories();
      for(let i=0;i<allTeamCategories.length;i++){
        const nameEl=document.getElementById("cat-name-"+i);
        const weightEl=document.getElementById("cat-weight-"+i);
        if(nameEl&&weightEl){
          const name=nameEl.value.trim();
          const weight=parseFloat(weightEl.value)||1.0;
          if(name) await saveTeamCategory(allTeamCategories[i].id,name,weight);
        }
      }
      showToast("✓ Categories saved!");
      render(buildCoach());
    }
    if(a==="add-category"){
      if(b.disabled)return;
      const nameEl=document.getElementById("new-cat-name");
      const weightEl=document.getElementById("new-cat-weight");
      const msg=document.getElementById("cat-msg");
      const name=(nameEl?.value||"").trim();
      const weight=parseFloat(weightEl?.value)||1.0;
      if(!name){if(msg)msg.innerHTML='<span class="err">Enter a category name.</span>';return;}
      if(allTeamCategories.find(function(c){return c.name.toLowerCase()===name.toLowerCase();})){
        if(msg)msg.innerHTML='<span class="err">Category already exists.</span>';return;
      }
      b.disabled=true;b.textContent="Adding...";
      // Seed defaults first if not done yet
      if(allTeamCategories.length===0) await initTeamCategories();
      await saveTeamCategory(null,name,weight);
      showToast("✓ Category added!");
      render(buildCoach());
    }
    if(a==="delete-category"){
      const idx=parseInt(b.dataset.idx);
      const id=b.dataset.id;
      const catName=allTeamCategories[idx]?allTeamCategories[idx].name:"this category";
      if(!confirm("Delete "+catName+"? Player data for this category is kept but won't show on the entry screen."))return;
      if(id) await deleteTeamCategory(id);
      showToast("Category removed.");
      render(buildCoach());
    }
    if(a==="send-message"){
      if(b.disabled)return;
      const text=(document.getElementById("msg-text")?.value||"").trim();
      const target=(document.getElementById("msg-target")?.value||"").trim();
      if(!text){showToast("Type a message first.");return;}
      b.disabled=true;b.textContent="Sending...";
      const err=await sendMessage(text,target||null);
      if(err){showToast("Error sending message.");b.disabled=false;b.textContent="Send";return;}
      showToast("Sent"+(target?" to "+target:"to everyone")+"!");
      render(buildCoach());
    }
    if(a==="delete-message"){
      if(!confirm("Delete this message?"))return;
      await deleteMessage(b.dataset.id);
      render(buildCoach());
    }
    if(a==="dismiss-message"){
      await markMessageRead(b.dataset.id, curPlayer);
      render(buildPlayer());
    }
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
      if(b.disabled)return;b.disabled=true;b.textContent="Saving...";const shotsToSave=[];
      const wk=weekKey(),inputs=document.querySelectorAll("[data-cat][data-si][data-di][data-f]"),bySpot={};
      inputs.forEach(inp=>{const key=`${inp.dataset.cat}|${inp.dataset.si}|${inp.dataset.di}`;if(!bySpot[key])bySpot[key]={};bySpot[key][inp.dataset.f]=inp.value;});
      for(const key of Object.keys(bySpot)){const[cat,si,di]=key.split("|"),{m,a}=bySpot[key],mVal=parseInt(m),aVal=parseInt(a);if(!isNaN(mVal)&&!isNaN(aVal)&&m!==" "&&a!=="&&m!==undefined&&a!==undefined)shotsToSave.push({player:curPlayer,week:wk,category:cat,spot:parseInt(si),day:parseInt(di),made:mVal,attempts:aVal,team_code:teamCode});}
      if(shotsToSave.length>0){
        const{data:upserted,error}=await db.from("shots").upsert(shotsToSave,{onConflict:"player,week,category,spot,day,team_code"}).select();
        if(error){console.error("Shot save error:",error);showToast("⚠️ Shots didn't save — check connection and try again");b.disabled=false;b.textContent="Save my numbers";return;}
        if(upserted){upserted.forEach(s=>{const idx=allShots.findIndex(x=>x.player===s.player&&x.week===s.week&&x.category===s.category&&x.spot===s.spot&&x.day===s.day&&x.team_code===s.team_code);if(idx>=0)allShots[idx]=s;else allShots.push(s);});}
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

// ── Refresh ───────────────────────────────────
async function refreshData() {
  if(!teamCode) return;
  await loadShots();
  await loadNotes();
  await loadSpotNames();
  await loadSpotCounts();
  await loadDailyCheckins();
  await loadWeeklyCheckins();
  await loadPlayerPins();
  await loadTeamCategories();
  await loadPlayerCategories();
  await loadCoachComments();
  await loadMessages();
  await loadMessageReads();
  // Re-render current screen
  if(screen==="home")        render(buildHome());
  if(screen==="leaderboard") render(buildLeaderboard());
  // Don't re-render coach or player screens — user may be actively typing
  if(screen==="summary")     render(buildSummary());
}

// ── Boot ──────────────────────────────────────
async function boot() {
  render(`<div class="loading">Loading...</div>`);
  attachEvents();
  await loadTeams();
  if(!hasSeenOnboarding()){onboardStep=0;screen="onboarding";render(buildOnboarding());return;}
  const saved=savedTeam();
  if(saved){const err=await joinTeam(saved);if(!err){screen="home";render(buildHome());
    // Auto-refresh every 2 minutes
    setInterval(refreshData, 120000);
    return;
  }}
  screen="team-select";render(buildTeamSelect());
}

boot();
