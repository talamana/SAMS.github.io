const STORAGE_KEY = "dispatch_sams_state_v1";

let baseConfig = null;   // config.json (original)
let state = null;        // état courant (modifiable)

const elTitle = document.getElementById("appTitle");
const elRooms = document.getElementById("rooms");
const elPool  = document.getElementById("pool");
const elSearch = document.getElementById("search");

const btnReset  = document.getElementById("btnReset");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");
const modalOk = document.getElementById("modalOk");

init();

async function init(){
  baseConfig = await loadConfig();
  state = loadStateFromStorage() ?? makeStateFromConfig(baseConfig);

  elTitle.textContent = baseConfig.appTitle || "Dispatch";
  wireUI();
  renderAll();
  autosave();
}

function wireUI(){
  btnReset.addEventListener("click", () => {
    state = makeStateFromConfig(baseConfig);
    saveStateToStorage(state);
    renderAll();
  });

  btnExport.addEventListener("click", () => {
    openModal("Exporter l’état (JSON)", JSON.stringify(state, null, 2), { mode: "export" });
  });

  btnImport.addEventListener("click", () => {
    openModal("Importer un état (JSON)", "", { mode: "import" });
  });

  elSearch.addEventListener("input", () => renderPool());

  // Pool droppable
  makeDroppable(elPool, "__POOL__");
}

function autosave(){
  // sauvegarde automatique sur chaque changement via saveStateToStorage() (appelé dans moveDoctor)
}

async function loadConfig(){
  const res = await fetch("./config.json", { cache: "no-store" });
  if(!res.ok) throw new Error("Impossible de charger config.json");
  return await res.json();
}

function makeStateFromConfig(cfg){
  // On garde doctors/rooms, et assignments
  // + pool implicite (médecins non assignés)
  const rooms = cfg.rooms.map(r => ({...r}));
  const doctors = cfg.doctors.map(d => ({...d}));

  const assignments = {};
  for(const r of rooms){
    assignments[r.id] = Array.isArray(cfg.assignments?.[r.id]) ? [...cfg.assignments[r.id]] : [];
  }

  return { rooms, doctors, assignments };
}

function loadStateFromStorage(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);

    // validation légère
    if(!parsed?.rooms || !parsed?.doctors || !parsed?.assignments) return null;
    return parsed;
  }catch{
    return null;
  }
}

function saveStateToStorage(s){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function renderAll(){
  renderRooms();
  renderPool();
}

function renderRooms(){
  elRooms.innerHTML = "";

  for(const room of state.rooms){
    const wrap = document.createElement("div");
    wrap.className = "room";

    const header = document.createElement("div");
    header.className = "roomHeader";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = room.name;

    const count = document.createElement("div");
    count.className = "count";
    const n = (state.assignments[room.id] || []).length;
    count.textContent = `${n} médecin${n>1 ? "s" : ""}`;

    header.appendChild(name);
    header.appendChild(count);

    const zone = document.createElement("div");
    zone.className = "dropzone droppable";
    zone.dataset.room = room.id;

    wrap.appendChild(header);
    wrap.appendChild(zone);

    elRooms.appendChild(wrap);

    makeDroppable(zone, room.id);
    renderRoomDoctors(room.id);
  }
}

function renderRoomDoctors(roomId){
  const zone = elRooms.querySelector(`.dropzone[data-room="${roomId}"]`);
  if(!zone) return;
  zone.innerHTML = "";

  const ids = state.assignments[roomId] || [];
  for(const docId of ids){
    const doc = getDoctor(docId);
    if(!doc) continue;
    zone.appendChild(makeDoctorCard(doc));
  }
}

function renderPool(){
  // Pool = tous les médecins non présents dans assignments[*]
  const q = (elSearch.value || "").trim().toLowerCase();
  const assigned = new Set();
  for(const roomId of Object.keys(state.assignments)){
    for(const id of state.assignments[roomId] || []) assigned.add(id);
  }

  elPool.innerHTML = "";

  for(const doc of state.doctors){
    if(assigned.has(doc.id)) continue;

    const hay = `${doc.name} ${doc.role || ""}`.toLowerCase();
    if(q && !hay.includes(q)) continue;

    elPool.appendChild(makeDoctorCard(doc));
  }
}

function makeDoctorCard(doc){
  const card = document.createElement("div");
  card.className = "card";
  card.draggable = true;
  card.dataset.doc = doc.id;

  const top = document.createElement("div");
  top.className = "top";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = doc.name;

  const badge = document.createElement("div");
  badge.className = "badge";
  badge.textContent = doc.id;

  top.appendChild(name);
  top.appendChild(badge);

  const role = document.createElement("div");
  role.className = "role";
  role.textContent = doc.role ? doc.role : "—";

  card.appendChild(top);
  card.appendChild(role);

  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", doc.id);
    e.dataTransfer.effectAllowed = "move";
  });

  return card;
}

function makeDroppable(element, roomId){
  element.addEventListener("dragover", (e) => {
    e.preventDefault();
    element.classList.add("dragOver");
    e.dataTransfer.dropEffect = "move";
  });

  element.addEventListener("dragleave", () => {
    element.classList.remove("dragOver");
  });

  element.addEventListener("drop", (e) => {
    e.preventDefault();
    element.classList.remove("dragOver");
    const docId = e.dataTransfer.getData("text/plain");
    if(!docId) return;

    if(roomId === "__POOL__"){
      unassignDoctor(docId);
    }else{
      assignDoctorToRoom(docId, roomId);
    }
    saveStateToStorage(state);
    renderAll();
  });
}

function getDoctor(id){
  return state.doctors.find(d => d.id === id);
}

function unassignDoctor(docId){
  for(const rid of Object.keys(state.assignments)){
    const arr = state.assignments[rid] || [];
    state.assignments[rid] = arr.filter(x => x !== docId);
  }
}

function assignDoctorToRoom(docId, roomId){
  // unassign partout puis add dans roomId
  unassignDoctor(docId);

  if(!state.assignments[roomId]) state.assignments[roomId] = [];
  state.assignments[roomId].push(docId);
}

// Modal
function openModal(title, text, { mode }){
  modalTitle.textContent = title;
  modalText.value = text;
  modal.showModal();

  modalOk.onclick = () => {
    if(mode === "import"){
      const raw = modalText.value.trim();
      if(!raw) return;
      try{
        const parsed = JSON.parse(raw);
        // validation légère
        if(!parsed.rooms || !parsed.doctors || !parsed.assignments){
          alert("JSON invalide : il manque rooms/doctors/assignments");
          return;
        }
        state = parsed;
        saveStateToStorage(state);
        renderAll();
      }catch(err){
        alert("JSON invalide (parse error).");
      }
    }
  };

  if(mode === "export"){
    // sélectionner automatiquement pour copier
    setTimeout(() => {
      modalText.focus();
      modalText.select();
    }, 50);
  }
}
