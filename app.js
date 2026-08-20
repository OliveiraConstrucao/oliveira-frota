const KEYS = { vehicles: 'oliveira_frota_vehicles_v1', records: 'oliveira_frota_records_v1' };
const state = { vehicles: [], records: [], currentVehicleId: null, deferredPrompt: null };

const $ = (id) => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = (iso) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const fmtKm = (n) => Number.isFinite(Number(n)) ? `${Number(n).toLocaleString('pt-BR')} km` : '—';
const escapeHTML = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function load(){
  try { state.vehicles = JSON.parse(localStorage.getItem(KEYS.vehicles)) || []; } catch { state.vehicles = []; }
  try { state.records = JSON.parse(localStorage.getItem(KEYS.records)) || []; } catch { state.records = []; }
}
function save(){
  localStorage.setItem(KEYS.vehicles, JSON.stringify(state.vehicles));
  localStorage.setItem(KEYS.records, JSON.stringify(state.records));
}

function getVehicle(id){ return state.vehicles.find(v => v.id === id); }
function vehicleRecords(id){ return state.records.filter(r => r.vehicleId === id).sort((a,b) => (b.date+b.createdAt).localeCompare(a.date+a.createdAt)); }
function lastRecord(id){ return vehicleRecords(id)[0] || null; }
function oilStatus(v){
  const r = lastRecord(v.id);
  if (!r) return {type:'none', label:'Sem registros', delta:null};
  const odo = Number(r.odometer), oil = Number(r.oil);
  if (!Number.isFinite(odo) || !Number.isFinite(oil)) return {type:'none', label:'Sem referência', delta:null};
  const d = oil - odo;
  if (d < 0) return {type:'overdue', label:`Vencida há ${Math.abs(d).toLocaleString('pt-BR')} km`, delta:d};
  if (d <= 1000) return {type:'soon', label:`Faltam ${d.toLocaleString('pt-BR')} km`, delta:d};
  return {type:'ok', label:`Faltam ${d.toLocaleString('pt-BR')} km`, delta:d};
}

function showToast(msg){
  const el=$('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>el.classList.remove('show'),2200);
}

function nav(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.dataset.view===view));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.nav===view));
  if(view==='record') prepRecord();
  if(view==='vehicles') renderVehicles();
  if(view==='history') renderHistory();
  if(view==='oil') renderOil();
  if(view==='home') renderHome();
  window.scrollTo({top:0,behavior:'smooth'});
  history.replaceState(null,'',`#${view}`);
}

document.addEventListener('click', e=>{
  const btn=e.target.closest('[data-nav]'); if(btn) nav(btn.dataset.nav);
});

function renderHome(){
  $('statVehicles').textContent=state.vehicles.length;
  $('statToday').textContent=state.records.filter(r=>r.date===todayISO()).length;
  const statuses=state.vehicles.map(oilStatus);
  $('statOilSoon').textContent=statuses.filter(s=>s.type==='soon').length;
  $('statOilOverdue').textContent=statuses.filter(s=>s.type==='overdue').length;
  const attention=state.vehicles.map(v=>({v,s:oilStatus(v)})).filter(x=>['soon','overdue'].includes(x.s.type)).slice(0,4);
  $('homeOilList').innerHTML = attention.length ? attention.map(({v,s})=>oilCard(v,s)).join('') : '<div class="empty">Nenhuma troca próxima ou vencida.</div>';
}

function renderVehicleOptions(selected){
  const sel=$('recordVehicle');
  sel.innerHTML='<option value="">Selecione</option>'+state.vehicles.map(v=>`<option value="${v.id}" ${selected===v.id?'selected':''}>${escapeHTML(v.name)} — ${escapeHTML(v.plate)}</option>`).join('');
  updatePlate();
}
function updatePlate(){
  const v=getVehicle($('recordVehicle').value); $('recordPlate').value=v?.plate || '';
}
function prepRecord(vehicleId=null){
  renderVehicleOptions(vehicleId || state.currentVehicleId || '');
  $('recordDate').value=todayISO();
  $('recordWarning').classList.add('hidden');
  if(vehicleId){ const r=lastRecord(vehicleId); if(r) $('recordOil').value=r.oil || ''; }
}
$('recordVehicle').addEventListener('change',()=>{
  updatePlate();
  const r=lastRecord($('recordVehicle').value);
  $('recordOil').value=r?.oil || '';
  checkOdometer();
});
$('recordOdometer').addEventListener('input',checkOdometer);
function checkOdometer(){
  const vid=$('recordVehicle').value, val=Number($('recordOdometer').value), r=lastRecord(vid), box=$('recordWarning');
  if(r && Number.isFinite(val) && val < Number(r.odometer)){
    box.textContent=`O odômetro informado é menor que o último registro (${Number(r.odometer).toLocaleString('pt-BR')} km). Confira antes de salvar.`;
    box.classList.remove('hidden');
  } else box.classList.add('hidden');
}
$('recordForm').addEventListener('submit',e=>{
  e.preventDefault();
  const v=getVehicle($('recordVehicle').value); if(!v) return showToast('Selecione um veículo.');
  const odo=Number($('recordOdometer').value); const prev=lastRecord(v.id);
  if(prev && odo < Number(prev.odometer)) return showToast('Confira o odômetro antes de salvar.');
  state.records.push({
    id:uuid(), vehicleId:v.id, vehicle:v.name, plate:v.plate,
    odometer:odo, quantity:$('recordQuantity').value.trim(), date:$('recordDate').value,
    oil:Number($('recordOil').value), createdAt:new Date().toISOString()
  });
  save(); e.target.reset(); state.currentVehicleId=v.id; showToast('Registro salvo.'); renderHome(); prepRecord(v.id);
});

function renderVehicles(){
  $('vehiclesList').innerHTML=state.vehicles.length ? state.vehicles.map(v=>{
    const r=lastRecord(v.id), s=oilStatus(v);
    return `<article class="card vehicle-card">
      <div class="vehicle-card-head"><div><h3>${escapeHTML(v.name)}</h3><div class="plate">${escapeHTML(v.plate)}</div></div><span class="badge ${s.type==='none'?'':s.type}">${escapeHTML(s.label)}</span></div>
      <div class="card-row"><span class="muted">Último odômetro</span><strong>${r?fmtKm(r.odometer):'—'}</strong></div>
      <div class="card-row"><span class="muted">Troca de óleo</span><strong>${r?fmtKm(r.oil):'—'}</strong></div>
      <button class="btn btn-secondary btn-block" onclick="openVehicleDetail('${v.id}')">Abrir ficha</button>
    </article>`;
  }).join('') : '<div class="empty">Nenhum veículo cadastrado.</div>';
}

window.openVehicleDetail=(id)=>{
  state.currentVehicleId=id; const v=getVehicle(id), r=lastRecord(id), s=oilStatus(v), recs=vehicleRecords(id).slice(0,5);
  $('vehicleDetail').innerHTML=`<article class="card detail-card">
    <div class="detail-top"><div><span class="eyebrow">VEÍCULO</span><h2>${escapeHTML(v.name)}</h2><div class="plate">${escapeHTML(v.plate)}</div></div><span class="badge ${s.type==='none'?'':s.type}">${escapeHTML(s.label)}</span></div>
    <div class="detail-grid">
      <div class="detail-box"><span>Último odômetro</span><strong>${r?fmtKm(r.odometer):'—'}</strong></div>
      <div class="detail-box"><span>Quant. por litro</span><strong>${r?escapeHTML(r.quantity):'—'}</strong></div>
      <div class="detail-box"><span>Última data</span><strong>${r?fmtDate(r.date):'—'}</strong></div>
      <div class="detail-box"><span>Troca de óleo</span><strong>${r?fmtKm(r.oil):'—'}</strong></div>
    </div>
  </article>
  <div class="section-head" style="margin-top:22px"><div><span class="eyebrow">RECENTES</span><h3>Últimos registros</h3></div></div>
  <div class="stack-list">${recs.length?recs.map(historyCard).join(''):'<div class="empty">Nenhum registro para este veículo.</div>'}</div>`;
  nav('vehicle-detail');
}
$('detailNewRecord').addEventListener('click',()=>{ const id=state.currentVehicleId; nav('record'); prepRecord(id); });

$('newVehicleBtn').addEventListener('click',()=>$('vehicleDialog').showModal());
$('closeVehicleDialog').addEventListener('click',()=>$('vehicleDialog').close());
$('vehicleForm').addEventListener('submit',e=>{
  e.preventDefault(); const name=$('vehicleName').value.trim(), plate=$('vehiclePlate').value.trim().toUpperCase();
  if(state.vehicles.some(v=>v.plate.toUpperCase()===plate)) return showToast('Já existe um veículo com essa placa.');
  state.vehicles.push({id:uuid(),name,plate}); save(); $('vehicleDialog').close(); e.target.reset(); renderVehicles(); renderHome(); showToast('Veículo cadastrado.');
});
$('vehiclePlate').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));

function historyCard(r){
  return `<article class="list-card">
    <div class="list-card-main"><h4>${escapeHTML(r.vehicle)} <span class="plate">${escapeHTML(r.plate)}</span></h4><p>${fmtDate(r.date)}</p></div>
    <div class="history-values">
      <div><span class="muted">Odômetro</span><strong>${fmtKm(r.odometer)}</strong></div>
      <div><span class="muted">Quant./litro</span><strong>${escapeHTML(r.quantity)}</strong></div>
      <div><span class="muted">Troca óleo</span><strong>${fmtKm(r.oil)}</strong></div>
    </div>
  </article>`;
}
function renderHistory(){
  const q=$('historySearch').value.trim().toLowerCase(), d=$('historyDate').value;
  const list=[...state.records].sort((a,b)=>(b.date+b.createdAt).localeCompare(a.date+a.createdAt)).filter(r=>(!q || `${r.vehicle} ${r.plate}`.toLowerCase().includes(q)) && (!d || r.date===d));
  $('historyList').innerHTML=list.length?list.map(historyCard).join(''):'<div class="empty">Nenhum registro encontrado.</div>';
}
$('historySearch').addEventListener('input',renderHistory); $('historyDate').addEventListener('change',renderHistory);
$('clearFilters').addEventListener('click',()=>{$('historySearch').value='';$('historyDate').value='';renderHistory();});

function oilCard(v,s){ const r=lastRecord(v.id); return `<article class="list-card"><div class="list-card-main"><h4>${escapeHTML(v.name)} <span class="plate">${escapeHTML(v.plate)}</span></h4><p>Atual: ${r?fmtKm(r.odometer):'—'} • Troca: ${r?fmtKm(r.oil):'—'}</p></div><div class="list-meta"><span class="badge ${s.type==='none'?'':s.type}">${escapeHTML(s.label)}</span></div></article>`; }
function renderOil(){ $('oilList').innerHTML=state.vehicles.length?state.vehicles.map(v=>oilCard(v,oilStatus(v))).join(''):'<div class="empty">Nenhum veículo cadastrado.</div>'; }

window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); state.deferredPrompt=e; $('installBtn').classList.remove('hidden'); });
$('installBtn').addEventListener('click',async()=>{ if(!state.deferredPrompt)return; state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt=null; $('installBtn').classList.add('hidden'); });

if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch(()=>{})); }

load();
renderHome();
renderVehicleOptions();
const initial=location.hash.replace('#',''); if(['home','record','vehicles','history','oil'].includes(initial)) nav(initial); else nav('home');
