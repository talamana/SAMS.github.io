import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  "https://myymgkdlndiieipqakrs.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15eW1na2RsbmRpaWVpcHFha3JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4ODcwMTgsImV4cCI6MjA4NjQ2MzAxOH0.4HLTHvfpLC_mnIts4-QVRPYDgg3wY219B0SVKbIto6o"
);
let elBossCard;
let bossSelect;
let bossDisplay;



let cfg = null;
let state = null;

let elTitle;
let elTabs;
let elRoomsGrid;
let elInterventionsRow;

let elReserveList;
let elHorsList;
let elCountReserve;
let elCountHors;

let btnAllReserve;
let btnManage;

// Détails
let elDetailsTitle;
let elDetailsSub;
let elDetailsCount;
let elDetailsList;

const STATE_ROW_ID = "main";
const TB_DOCTORS = "dispatch_doctors";
const TB_STATE = "dispatch_state";


// CRUD modal
let dlg;
let crudList;
let fId;
let fName;
let fRole;
let fPhone;
let fBucket;
let btnNew;
let btnSave;
let btnDelete;

let selectedZoneId = null;
let selectedDoctorId = null;
let realtimeChannel = null;

window.addEventListener("DOMContentLoaded", () => {
  init();
});


async function init(){

elBossCard = document.getElementById("bossCard");
bossSelect = document.getElementById("bossSelect");
bossDisplay = document.getElementById("bossDisplay");


elTitle = document.getElementById("appTitle");
elTabs = document.getElementById("tabs");
elRoomsGrid = document.getElementById("roomsGrid");
elInterventionsRow = document.getElementById("interventionsRow");

elReserveList = document.getElementById("reserveList");
elHorsList = document.getElementById("horsList");
elCountReserve = document.getElementById("countReserve");
elCountHors = document.getElementById("countHors");

btnAllReserve = document.getElementById("btnAllReserve");
btnManage = document.getElementById("btnManage");

// Détails
elDetailsTitle = document.getElementById("detailsTitle");
elDetailsSub = document.getElementById("detailsSub");
elDetailsCount = document.getElementById("detailsCount");
elDetailsList = document.getElementById("detailsList");

// CRUD modal
dlg = document.getElementById("crud");
crudList = document.getElementById("crudList");
fId = document.getElementById("fId");
fName = document.getElementById("fName");
fRole = document.getElementById("fRole");
fPhone = document.getElementById("fPhone");
fBucket = document.getElementById("fBucket");
btnNew = document.getElementById("btnNew");
btnSave = document.getElementById("btnSave");
btnDelete = document.getElementById("btnDelete");

  cfg = await fetch("./config.json", { cache: "no-store" }).then(r => r.json());

  // 1) doctors (DB -> UI)
  cfg.doctors = await dbLoadDoctors();

  // 2) state (DB -> UI) ; si pas existant, on initialise
  state = await dbLoadStateOrCreate(cfg);

  // 3) render
  elTitle.textContent = cfg.appTitle || "Dispatch SAMS";
  renderTabs();
  renderAll();
  wireGlobalDroppables();
  s();
  renderBossSelect();
  wireBossSelect();

  // 4) realtime (multi-user)
  startRealtime();
}
async function dbLoadDoctors(){
  const { data, error } = await supabase
    .from(TB_DOCTORS)
    .select("id,name,role,phone,bucket")
    .order("role", { ascending: true })
    .order("name", { ascending: true });

  if(error){
    console.error("dbLoadDoctors error:", error);
    return []; // fallback
  }
  return data || [];
}
async function dbLoadStateOrCreate(cfg){
  // tente de charger
  const { data, error } = await supabase
    .from(TB_STATE)
    .select("id,active_site_id,boss_doctor_id,placements")
    .eq("id", STATE_ROW_ID)
    .maybeSingle();

  if(error){
    console.error("dbLoadStateOrCreate load error:", error);
  }

  // si existe
  if(data?.placements){
    return {
      activeSiteId: data.active_site_id || (cfg.sites?.[0]?.id ?? "sud"),
      placements: data.placements || {},
      dispatchBossId: data.boss_doctor_id || null
    };
  }

  // sinon créer un état initial (ex: tout "hors" si bucket=hors)
  const initial = makeInitialState(cfg);
  // makeInitialState renvoie { activeSiteId, placements } ; on ajoute boss
  const newState = {
    activeSiteId: initial.activeSiteId,
    placements: initial.placements,
    dispatchBossId: null
  };

  const { error: insErr } = await supabase
    .from(TB_STATE)
    .insert([{
      id: STATE_ROW_ID,
      active_site_id: newState.activeSiteId,
      boss_doctor_id: null,
      placements: newState.placements
    }]);

  if(insErr){
    console.error("dbLoadStateOrCreate insert error:", insErr);
  }

  return newState;
}
async function saveState(){
  const payload = {
    active_site_id: state.activeSiteId,
    boss_doctor_id: state.dispatchBossId || null,
    placements: state.placements
  };

  const { error } = await supabase
    .from(TB_STATE)
    .update(payload)
    .eq("id", STATE_ROW_ID);

  if(error){
    console.error("saveState error:", error);
  }
}


function makeInitialState(cfg){
  const placements = {};
  for(const d of cfg.doctors){
    // bucket initial depuis config : "hors" ou "reserve"
    const bucket = (d.bucket || d.service || "reserve");
    placements[d.id] = (bucket === "hors") ? "hors" : "reserve";
  }
 return {
  activeSiteId: cfg.sites?.[0]?.id ?? "sud",
  placements,
  dispatchBossId: null
};

}

function wireButtons(){
  const missing = [];
  if(!btnAllReserve) missing.push("btnAllReserve");
  if(!btnManage) missing.push("btnManage");
  if(!btnNew) missing.push("btnNew");
  if(!btnSave) missing.push("btnSave");
  if(!btnDelete) missing.push("btnDelete");

  if(missing.length){
    console.error("Boutons introuvables dans le DOM:", missing.join(", "));
    return;
  }
  
  btnAllReserve.addEventListener("click", () => {
  for(const d of cfg.doctors){
    const z = state.placements[d.id];

    // On NE touche JAMAIS ceux qui sont hors service (robuste)
    if (isHorsZone(z)) continue;

    // Tous les autres (salle/intervention/boss/réserve/undefined) -> réserve
    state.placements[d.id] = "reserve";
  }
  saveState();
  renderAll();
});


  btnManage.addEventListener("click", () => {
    selectedDoctorId = null;
    renderCrudList();
    clearForm();
    dlg.showModal();
  });

  btnNew.addEventListener("click", (e) => {
    e.preventDefault();
    selectedDoctorId = null;
    clearForm();
    fId.focus();
  });

  btnSave.addEventListener("click", async (e) => {
  e.preventDefault();
  const doc = readForm();
  if(!doc) return;

  // bucket dans DB
  const ok = await dbUpsertDoctor(doc);
  if(!ok) return;

  // refresh doctors
  await refreshDoctorsFromDb();

  // placement si nouveau ou changement bucket
  if(!state.placements[doc.id]){
    state.placements[doc.id] = (doc.bucket === "hors") ? "hors" : "reserve";
    saveState(); // async
  } else {
    // si bucket=hors => on le met hors, sinon on ne force pas (à toi de choisir)
    if(doc.bucket === "hors") {
      state.placements[doc.id] = "hors";
      saveState();
      renderAll();
    }
  }
});}


  btnDelete.addEventListener("click", async (e) => {
  e.preventDefault();
  const id = (fId.value || "").trim();
  if(!id) return;

  const ok = await dbDeleteDoctor(id);
  if(!ok) return;

  delete state.placements[id];
  saveState();

  await refreshDoctorsFromDb();
  clearForm();
});


function wireGlobalDroppables(){
  document.querySelectorAll(".droppable").forEach(el => makeDroppable(el, el.dataset.zone));
  makeDroppable(elDetailsList, "__DETAILS_DROP__");
}

function renderTabs(){
  elTabs.innerHTML = "";
  for(const site of cfg.sites){
    const b = document.createElement("button");
    b.className = "tab" + (site.id === state.activeSiteId ? " active" : "");
    b.textContent = site.name;
    b.addEventListener("click", () => {
      state.activeSiteId = site.id;
      saveState();
      renderAll();
      renderTabs();
    });
    elTabs.appendChild(b);
  }
}

function renderAll(){
  renderRooms();
  renderInterventions();
  renderRightPanels();
  renderDetails();
  renderBoss();
}

function renderRooms(){
  elRoomsGrid.innerHTML = "";

  const site = (cfg.sites || []).find(s => s.id === state.activeSiteId);
  const rooms = site?.rooms || [];

  for(const r of rooms){
    const zoneId = r.id;
    const docs = getDoctorsInZone(zoneId);

    const card = document.createElement("div");
    card.className = `roomPill droppable pill-${r.color || "blue"}`;
    card.dataset.zone = zoneId;

    // HEADER
    const header = document.createElement("div");
    header.className = "zoneHeader";

    const title = document.createElement("div");
    title.textContent = r.label;

    const count = document.createElement("div");
    count.className = "small";
    count.textContent = `${docs.length} médecin${docs.length > 1 ? "s" : ""}`;

    header.appendChild(title);
    header.appendChild(count);

    // BODY
    const body = document.createElement("div");
    body.className = "zoneBody";

    if(docs.length === 0){
      const empty = document.createElement("div");
      empty.className = "small";
      empty.style.opacity = "0.7";
      empty.textContent = "—";
      body.appendChild(empty);
    }else{
      for(const d of docs){
        body.appendChild(makeDoctorCardCompact(d));
      }
    }

    card.appendChild(header);
    card.appendChild(body);

    makeDroppable(card, zoneId);
    elRoomsGrid.appendChild(card);
  }
}

function renderInterventions(){
  elInterventionsRow.innerHTML = "";

  const interventions = cfg.interventions || [];

  for(const it of interventions){
    const zoneId = it.id;
    const docs = getDoctorsInZone(zoneId);

    const card = document.createElement("div");
    card.className = "roomPill droppable pill-pink";
    card.dataset.zone = zoneId;

    // HEADER
    const header = document.createElement("div");
    header.className = "zoneHeader";

    const title = document.createElement("div");
    title.textContent = it.label;

    const count = document.createElement("div");
    count.className = "small";
    count.textContent = `${docs.length} médecin${docs.length > 1 ? "s" : ""}`;

    header.appendChild(title);
    header.appendChild(count);

    // BODY
    const body = document.createElement("div");
    body.className = "zoneBody";

    if(docs.length === 0){
      const empty = document.createElement("div");
      empty.className = "small";
      empty.style.opacity = "0.7";
      empty.textContent = "—";
      body.appendChild(empty);
    }else{
      for(const d of docs){
        body.appendChild(makeDoctorCardCompact(d));
      }
    }

    card.appendChild(header);
    card.appendChild(body);

    makeDroppable(card, zoneId);
    elInterventionsRow.appendChild(card);
  }
}

function renderRightPanels(){
  // Réserve
  elReserveList.innerHTML = "";
  const reserveDocs = cfg.doctors.filter(d => state.placements[d.id] === "reserve");
  elCountReserve.textContent = formatCount(reserveDocs.length, "médecin");

  // clique réserve -> détails
  document.querySelector('[data-zone="reserve"]')?.addEventListener("click", () => {
    selectedZoneId = "reserve";
    renderDetails();
  });

  for(const d of reserveDocs) elReserveList.appendChild(makeDoctorCard(d));

  // Hors service
  elHorsList.innerHTML = "";
  const horsDocs = cfg.doctors.filter(d => state.placements[d.id] === "hors");
  elCountHors.textContent = formatCount(horsDocs.length, "médecin");

  // clique hors -> détails
  document.querySelector('[data-zone="hors"]')?.addEventListener("click", () => {
    selectedZoneId = "hors";
    renderDetails();
  });

  for(const d of horsDocs) elHorsList.appendChild(makeDoctorCard(d));
}

function renderDetails(){
  // zone par défaut
  if(!selectedZoneId) {
    selectedZoneId = "reserve";
  }

  const zoneName = getZoneLabel(selectedZoneId);
  elDetailsTitle.textContent = zoneName;
  elDetailsSub.textContent = "Médecins dans cette zone (glisser-déposer possible ici)";
  elDetailsList.dataset.zone = selectedZoneId; // drop direct dans la zone sélectionnée

  const docs = getDoctorsInZone(selectedZoneId);
  elDetailsCount.textContent = String(docs.length);
  elDetailsList.innerHTML = "";
  for(const d of docs) elDetailsList.appendChild(makeDoctorCard(d));
}

function makeDoctorCard(d){
  const card = document.createElement("div");
  card.className = "docCard";
  card.draggable = true;
  card.dataset.doc = d.id;

  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", d.id);
    e.dataTransfer.effectAllowed = "move";
  });

  // double-clic => réserve (sauf hors service)
  card.addEventListener("dblclick", () => {
  if(!isHorsZone(state.placements[d.id])){
    state.placements[d.id] = "reserve";
    saveState();      // supabase
    setSelectedZone("reserve");
    renderAll();
  }
});


  const top = document.createElement("div");
  top.className = "docTop";

  const left = document.createElement("div");
  const name = document.createElement("div");
  name.className = "docName";
  name.textContent = d.name;

  const phone = document.createElement("div");
  phone.className = "docLine";
  phone.innerHTML = `📞 <span>${d.phone || "—"}</span>`;

  left.appendChild(name);
  left.appendChild(phone);

  const badges = document.createElement("div");
  badges.className = "badges";

  const role = document.createElement("div");
  role.className = "badge b-yellow";
  role.textContent = d.role || "—";

  badges.appendChild(role);

  top.appendChild(left);
  top.appendChild(badges);

  card.appendChild(top);
  return card;
}


function makeIcon(txt){
  const el = document.createElement("span");
  el.className = "icon";
  el.textContent = txt;
  return el;
}

let saveTimer = null;

function scheduleSaveState(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveState(); // async fire-and-forget
    saveTimer = null;
  }, 120); // 120ms = fluide + évite spam DB
}

function makeDroppable(el, zoneId){
  if(!el) return;

  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("dragOver");
    e.dataTransfer.dropEffect = "move";
  });

  el.addEventListener("dragleave", () => el.classList.remove("dragOver"));

  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("dragOver");

    const docId = e.dataTransfer.getData("text/plain");
    if(!docId) return;

    let targetZone = zoneId;

    // Drop depuis le panneau Détails => dans la zone sélectionnée
    if(targetZone === "__DETAILS_DROP__"){
      targetZone = selectedZoneId || "reserve";
    }

    // ✅ si rien ne change, on ne spam pas
    if(state.placements[docId] === targetZone) return;

    // Update state (UI instant)
    state.placements[docId] = targetZone;
    renderAll();

    // Persist (DB) - debounced
    scheduleSaveState();
  });
}

function countInZone(zoneId){
  return cfg.doctors.reduce((acc, d) => acc + ((state.placements[d.id] === zoneId) ? 1 : 0), 0);
}

function getDoctorsInZone(zoneId){
  return cfg.doctors.filter(d => state.placements[d.id] === zoneId);
}

function formatCount(n, word){
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

function getZoneLabel(zoneId){
  if(zoneId === "reserve") return "Réserve";
  if(zoneId === "hors") return "Hors service";
  if(zoneId === "boss") return "Responsable du dispatch";

  for(const s of (cfg.sites ?? [])){
    const r = (s.rooms ?? []).find(x => x.id === zoneId);
    if(r) return r.label;
  }
  const it = (cfg.interventions ?? []).find(x => x.id === zoneId);
  if(it) return it.label;

  return zoneId;
}

/* CRUD */
function renderCrudList(){
  crudList.innerHTML = "";
  for(const d of cfg.doctors){
    const item = document.createElement("div");
    item.className = "crudItem" + (d.id === selectedDoctorId ? " active" : "");
    item.innerHTML = `<strong>${escapeHtml(d.name || d.id)}</strong>
      <small>${escapeHtml(d.role || "—")} • ${escapeHtml(d.phone || "—")}</small>`;
    item.addEventListener("click", () => {
      selectedDoctorId = d.id;
      fillForm(d);
      renderCrudList();
    });
    crudList.appendChild(item);
  }
}

function clearForm(){
  fId.value = "";
  fName.value = "";
  fRole.value = "";
  fPhone.value = "";
  fBucket.value = "reserve";
}

function fillForm(d){
  fId.value = d.id || "";
  fName.value = d.name || "";
  fRole.value = d.role || "";
  fPhone.value = d.phone || "";
  // bucket = où il se trouve maintenant (reserve/hors)
  const z = state.placements[d.id];
  fBucket.value = (z === "hors") ? "hors" : "reserve";
}

function readForm(){
  const id = (fId.value || "").trim();
  const name = (fName.value || "").trim();
  if(!id || !name){
    alert("Id et Nom sont obligatoires.");
    return null;
  }
  return {
    id,
    name,
    role: (fRole.value || "").trim(),
    phone: (fPhone.value || "").trim(),
    bucket: fBucket.value // reserve|hors
  };
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function isHorsZone(z){
  return z === "hors";
}


function setSelectedZone(zoneId){
  selectedZoneId = zoneId;
  renderDetails();
}
function renderBoss(){
  if(!elBossCard) return;
  elBossCard.innerHTML = "";

  const bossDoc = cfg.doctors.find(d => state.placements[d.id] === "boss");
  if(!bossDoc){
    // rien → on laisse juste le hint
    return;
  }
  // petite carte compacte
  elBossCard.appendChild(makeDoctorCard(bossDoc));
}
function makeDoctorCardCompact(d){
  const card = makeDoctorCard(d);
  card.classList.add("compact");
  return card;
}
function renderBossSelect(){
  if(!bossSelect) return;

  bossSelect.innerHTML = "";

  // Option vide
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— Aucun —";
  bossSelect.appendChild(opt0);

  // Options médecins
  for(const d of cfg.doctors){
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${d.name} — ${d.role || "—"}`;
    bossSelect.appendChild(opt);
  }

  bossSelect.value = state.dispatchBossId || "";
  renderBossDisplay();
}

function wireBossSelect(){
  if(!bossSelect) return;

  bossSelect.addEventListener("change", () => {
    state.dispatchBossId = bossSelect.value || null;
    saveState();
    renderBossDisplay();
  });
}

function renderBossDisplay(){
  if(!bossDisplay) return;

  if(!state.dispatchBossId){
    bossDisplay.textContent = "Aucun responsable sélectionné";
    return;
  }

  const d = cfg.doctors.find(x => x.id === state.dispatchBossId);
  bossDisplay.textContent = d ? d.name : "Responsable inconnu";
}


function startRealtime(){
  if(realtimeChannel) return;

  realtimeChannel = supabase
    .channel("dispatch_live")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: TB_STATE, filter: `id=eq.${STATE_ROW_ID}` },
      (payload) => {
        const st = payload.new;
        if(!st) return;

        state.activeSiteId = st.active_site_id || state.activeSiteId;
        state.dispatchBossId = st.boss_doctor_id || null;
        state.placements = st.placements || state.placements;

        renderTabs();
        renderAll();
        renderBossSelect();
      }
    )
    .subscribe();
}

async function dbUpsertDoctor(doc){
  const { error } = await supabase
    .from(TB_DOCTORS)
    .upsert([doc], { onConflict: "id" });

  if(error){
    console.error("dbUpsertDoctor error:", error);
    return false;
  }
  return true;
}

async function dbDeleteDoctor(id){
  const { error } = await supabase
    .from(TB_DOCTORS)
    .delete()
    .eq("id", id);

  if(error){
    console.error("dbDeleteDoctor error:", error);
    return false;
  }
  return true;
}
async function refreshDoctorsFromDb(){
  cfg.doctors = await dbLoadDoctors();

  // nettoyer placements d'IDs qui n'existent plus
  const ids = new Set(cfg.doctors.map(d => d.id));
  for(const k of Object.keys(state.placements || {})){
    if(!ids.has(k)) delete state.placements[k];
  }

  renderAll();
  renderBossSelect();
}
