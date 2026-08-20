const KEYS = { vehicles: 'oliveira_frota_vehicles_v1', records: 'oliveira_frota_records_v1', oilChanges: 'oliveira_frota_oil_changes_v1', queue: 'oliveira_frota_sync_queue_v1', meta: 'oliveira_frota_meta_v1' };
const DEVICE_OWNER_KEY='oliveira_frota_device_owner_v1';
const DEVICE_ID_KEY='oliveira_frota_device_id_v1';

const state = { vehicles: [], records: [], oilChanges: [], syncQueue: [], meta: {}, currentVehicleId: null, deferredPrompt: null, syncing: false, recordStep: 1, oilStep: 1 };

const $ = (id) => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = (iso) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const fmtKm = (n) => Number.isFinite(Number(n)) ? `${Number(n).toLocaleString('pt-BR')} km` : '—';
const fmtLiters = (n) => Number.isFinite(Number(n)) ? `${Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} L` : '—';
const consumptionNumber = (v) => { const n=Number(String(v??'').replace(',','.')); return Number.isFinite(n) ? n : null; };
const fmtConsumption = (v) => { const n=consumptionNumber(v); return n===null ? (String(v||'').trim() || '—') : `${n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} km/l`; };
const fmtConsumptionValue = (v) => { const n=consumptionNumber(v); return n===null ? (String(v||'').trim() || '—') : n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); };
const escapeHTML = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function deviceOwnerName(){
  return String(localStorage.getItem(DEVICE_OWNER_KEY)||'').trim();
}
function deviceId(){
  let id=String(localStorage.getItem(DEVICE_ID_KEY)||'').trim();
  if(!id){
    id=uuid();
    localStorage.setItem(DEVICE_ID_KEY,id);
  }
  return id;
}
function recordOperator(r){
  const op=String(r?.operator||'').trim();
  if(op) return op;
  return r?.demoSeed ? 'Demonstração' : 'Não identificado';
}
function updateDeviceOwnerMenu(){
  const label=$('deviceOwnerMenuLabel');
  if(label) label.textContent=deviceOwnerName() || 'Identificar usuário';
}
function openDeviceOwnerDialog({required=false}={}){
  const dlg=$('deviceOwnerDialog');
  if(!dlg) return;
  dlg.dataset.required=required?'1':'0';
  const current=deviceOwnerName();
  $('deviceOwnerNameInput').value=current;
  $('deviceOwnerIntro').textContent=required
    ? 'Antes de continuar, informe o nome da pessoa que normalmente fará os lançamentos neste celular.'
    : 'Se este aparelho mudou de funcionário, altere o nome abaixo. Os lançamentos antigos não serão modificados.';
  $('deviceOwnerCancelBtn').classList.toggle('hidden',required);
  if(!dlg.open) dlg.showModal();
  setTimeout(()=>$('deviceOwnerNameInput')?.focus(),120);
}
function promptDeviceOwnerIfNeeded(){
  updateDeviceOwnerMenu();
  if(deviceOwnerName()) return false;
  setTimeout(()=>openDeviceOwnerDialog({required:true}),2050);
  return true;
}


function load(){
  try { state.vehicles = JSON.parse(localStorage.getItem(KEYS.vehicles)) || []; } catch { state.vehicles = []; }
  try { state.records = JSON.parse(localStorage.getItem(KEYS.records)) || []; } catch { state.records = []; }
  try { state.oilChanges = JSON.parse(localStorage.getItem(KEYS.oilChanges)) || []; } catch { state.oilChanges = []; }
  try { state.syncQueue = JSON.parse(localStorage.getItem(KEYS.queue)) || []; } catch { state.syncQueue = []; }
  try { state.meta = JSON.parse(localStorage.getItem(KEYS.meta)) || {}; } catch { state.meta = {}; }
}

function ensurePresentationDemoData(){
  // Esta versão é de apresentação. Não recria os dados depois que a
  // limpeza de testes tiver sido executada neste aparelho.
  if(state.meta?.testDataClearedAt) return false;

  const now='2026-08-20T17:30:00-03:00';
  let changed=false;

  const addQueue=(entityType,entityId,updatedAt)=>{
    state.syncQueue=state.syncQueue.filter(q=>!(q.entityType===entityType && q.entityId===entityId));
    state.syncQueue.push({id:uuid(),entityType,entityId,updatedAt:updatedAt||now});
  };

  const demoVehicles=[
    {
      id:'demo-v23-basculante-02',
      name:'Caminhão Basculante 02',
      plate:'RFA2C18',
      createdAt:'2026-08-09T08:00:00-03:00',
      updatedAt:now,
      demoSeed:true
    },
    {
      id:'demo-v23-cacamba-03',
      name:'Caminhão Caçamba 03',
      plate:'RFB3D29',
      createdAt:'2026-08-09T08:05:00-03:00',
      updatedAt:now,
      demoSeed:true
    }
  ];

  for(const v of demoVehicles){
    if(!state.vehicles.some(x=>x.id===v.id)){
      state.vehicles.push(v);
      addQueue('vehicle',v.id,v.updatedAt);
      changed=true;
    }
  }

  const demoOilChanges=[
    {
      id:'demo-v23-oil-basculante-02',
      vehicleId:'demo-v23-basculante-02',
      vehicle:'Caminhão Basculante 02',
      plate:'RFA2C18',
      odometer:44000,
      nextOdometer:49000,
      date:'2026-07-05',
      createdAt:'2026-07-05T10:15:00-03:00',
      updatedAt:now,
      demoSeed:true
    },
    {
      id:'demo-v23-oil-cacamba-03',
      vehicleId:'demo-v23-cacamba-03',
      vehicle:'Caminhão Caçamba 03',
      plate:'RFB3D29',
      odometer:62000,
      nextOdometer:67000,
      date:'2026-07-20',
      createdAt:'2026-07-20T14:10:00-03:00',
      updatedAt:now,
      demoSeed:true
    }
  ];

  for(const o of demoOilChanges){
    if(!state.oilChanges.some(x=>x.id===o.id)){
      state.oilChanges.push(o);
      addQueue('oilChange',o.id,o.updatedAt);
      changed=true;
    }
  }

  const demoRecords=[
    {id:'demo-v23-b02-0810',vehicleId:'demo-v23-basculante-02',vehicle:'Caminhão Basculante 02',plate:'RFA2C18',odometer:47210,liters:115.00,quantity:'',date:'2026-08-10',oil:49000,createdAt:'2026-08-10T07:45:00-03:00'},
    {id:'demo-v23-c03-0809',vehicleId:'demo-v23-cacamba-03',vehicle:'Caminhão Caçamba 03',plate:'RFB3D29',odometer:63500,liters:98.00,quantity:'',date:'2026-08-09',oil:67000,createdAt:'2026-08-09T17:10:00-03:00'},

    {id:'demo-v23-b02-0812',vehicleId:'demo-v23-basculante-02',vehicle:'Caminhão Basculante 02',plate:'RFA2C18',odometer:47510,liters:109.50,quantity:'2.74',date:'2026-08-12',oil:49000,createdAt:'2026-08-12T07:55:00-03:00'},
    {id:'demo-v23-c03-0811',vehicleId:'demo-v23-cacamba-03',vehicle:'Caminhão Caçamba 03',plate:'RFB3D29',odometer:63784,liters:92.40,quantity:'3.07',date:'2026-08-11',oil:67000,createdAt:'2026-08-11T17:25:00-03:00'},

    {id:'demo-v23-b02-0814',vehicleId:'demo-v23-basculante-02',vehicle:'Caminhão Basculante 02',plate:'RFA2C18',odometer:47822,liters:112.00,quantity:'2.79',date:'2026-08-14',oil:49000,createdAt:'2026-08-14T08:20:00-03:00'},
    {id:'demo-v23-c03-0813',vehicleId:'demo-v23-cacamba-03',vehicle:'Caminhão Caçamba 03',plate:'RFB3D29',odometer:64072,liters:93.70,quantity:'3.07',date:'2026-08-13',oil:67000,createdAt:'2026-08-13T17:05:00-03:00'},

    {id:'demo-v23-b02-0816',vehicleId:'demo-v23-basculante-02',vehicle:'Caminhão Basculante 02',plate:'RFA2C18',odometer:48135,liters:110.30,quantity:'2.84',date:'2026-08-16',oil:49000,createdAt:'2026-08-16T07:30:00-03:00'},
    {id:'demo-v23-c03-0815',vehicleId:'demo-v23-cacamba-03',vehicle:'Caminhão Caçamba 03',plate:'RFB3D29',odometer:64366,liters:95.20,quantity:'3.09',date:'2026-08-15',oil:67000,createdAt:'2026-08-15T16:55:00-03:00'},

    {id:'demo-v23-b02-0818',vehicleId:'demo-v23-basculante-02',vehicle:'Caminhão Basculante 02',plate:'RFA2C18',odometer:48452,liters:111.80,quantity:'2.84',date:'2026-08-18',oil:49000,createdAt:'2026-08-18T08:05:00-03:00'},
    {id:'demo-v23-c03-0817',vehicleId:'demo-v23-cacamba-03',vehicle:'Caminhão Caçamba 03',plate:'RFB3D29',odometer:64655,liters:94.10,quantity:'3.07',date:'2026-08-17',oil:67000,createdAt:'2026-08-17T17:20:00-03:00'},

    {id:'demo-v23-b02-0820',vehicleId:'demo-v23-basculante-02',vehicle:'Caminhão Basculante 02',plate:'RFA2C18',odometer:48760,liters:108.70,quantity:'2.83',date:'2026-08-20',oil:49000,createdAt:'2026-08-20T07:50:00-03:00'},
    {id:'demo-v23-c03-0819',vehicleId:'demo-v23-cacamba-03',vehicle:'Caminhão Caçamba 03',plate:'RFB3D29',odometer:64952,liters:96.40,quantity:'3.08',date:'2026-08-19',oil:67000,createdAt:'2026-08-19T17:15:00-03:00'}
  ];

  for(const base of demoRecords){
    if(!state.records.some(x=>x.id===base.id)){
      const record={...base,updatedAt:now,demoSeed:true};
      state.records.push(record);
      addQueue('record',record.id,record.updatedAt);
      changed=true;
    }
  }

  if(changed){
    state.meta.demoPresentationSeedV23=true;
    state.meta.lastLocalChange=now;
    save();
    if(navigator.onLine) setTimeout(()=>attemptCloudSync(false),450);
  }
  return changed;
}

function save(){
  localStorage.setItem(KEYS.vehicles, JSON.stringify(state.vehicles));
  localStorage.setItem(KEYS.records, JSON.stringify(state.records));
  localStorage.setItem(KEYS.oilChanges, JSON.stringify(state.oilChanges));
  localStorage.setItem(KEYS.queue, JSON.stringify(state.syncQueue));
  localStorage.setItem(KEYS.meta, JSON.stringify(state.meta));
}
function queueChange(entityType, entityId){
  const now=new Date().toISOString();
  const target = entityType==='vehicle'
    ? state.vehicles.find(v=>v.id===entityId)
    : entityType==='record'
      ? state.records.find(r=>r.id===entityId)
      : entityType==='oilChange'
        ? state.oilChanges.find(r=>r.id===entityId)
        : null;
  if(target) target.updatedAt=now;
  state.syncQueue=state.syncQueue.filter(q=>!(q.entityType===entityType && q.entityId===entityId));
  state.syncQueue.push({id:uuid(),entityType,entityId,updatedAt:now});
  state.meta.lastLocalChange=now;
  save();
  updateSyncUI();
  if(navigator.onLine) setTimeout(()=>attemptCloudSync(false),80);
}

function getVehicle(id){ return state.vehicles.find(v => v.id === id); }
function managedVehicles(){ return state.vehicles.filter(v=>!v.deletedAt); }
function activeVehicles(){ return state.vehicles.filter(v=>!v.deletedAt && !v.archivedAt); }
function visibleRecords(){ return state.records.filter(r=>!r.deletedAt && !r.cancelledAt); }
function correctionRecords(){ return state.records.filter(r=>!r.deletedAt); }
function vehicleRecords(id){ return visibleRecords().filter(r => r.vehicleId === id).sort((a,b) => (b.date+(b.createdAt||'')).localeCompare(a.date+(a.createdAt||''))); }
function lastRecord(id){ return vehicleRecords(id)[0] || null; }
function vehicleOilChanges(id){ return state.oilChanges.filter(r => r.vehicleId === id && !r.deletedAt).sort((a,b) => (b.date+(b.createdAt||'')).localeCompare(a.date+(a.createdAt||''))); }
function latestOilChange(id){ return vehicleOilChanges(id)[0] || null; }
function oilReference(id){
  const change=latestOilChange(id);
  if(change && Number.isFinite(Number(change.nextOdometer))){
    return {nextOdometer:Number(change.nextOdometer), changeOdometer:Number(change.odometer), date:change.date, source:'maintenance'};
  }
  const legacy=vehicleRecords(id).find(r=>Number.isFinite(Number(r.oil)) && Number(r.oil)>0);
  if(legacy){
    return {nextOdometer:Number(legacy.oil), changeOdometer:null, date:legacy.date, source:'legacy'};
  }
  return null;
}
function currentVehicleOdometer(id){
  const v=getVehicle(id);
  const candidates=[];
  const fuel=lastRecord(id);
  const oil=latestOilChange(id);
  if(fuel && Number.isFinite(Number(fuel.odometer))) candidates.push({value:Number(fuel.odometer),at:fuel.createdAt||`${fuel.date}T12:00:00`});
  if(oil && Number.isFinite(Number(oil.odometer))) candidates.push({value:Number(oil.odometer),at:oil.createdAt||`${oil.date}T12:00:00`});
  if(v && Number.isFinite(Number(v.manualOdometer))) candidates.push({value:Number(v.manualOdometer),at:v.manualOdometerAt||v.updatedAt||v.createdAt||''});
  if(!candidates.length) return null;
  candidates.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  return candidates[0].value;
}
function recalcVehicleConsumptions(vehicleId){
  const list=visibleRecords()
    .filter(r=>r.vehicleId===vehicleId)
    .sort((a,b)=>(a.date+(a.createdAt||'')).localeCompare(b.date+(b.createdAt||'')));
  let prev=null;
  const now=new Date().toISOString();
  for(const r of list){
    let nextQuantity='';
    if(prev){
      const distance=Number(r.odometer)-Number(prev.odometer);
      const liters=Number(r.liters);
      if(distance>0 && liters>0) nextQuantity=(distance/liters).toFixed(2);
    }
    if(String(r.quantity??'')!==String(nextQuantity)){
      r.quantity=nextQuantity;
      r.updatedAt=now;
      queueChange('record',r.id);
    }
    prev=r;
  }
}
function oilStatus(v){
  const ref=oilReference(v.id);
  const current=currentVehicleOdometer(v.id);
  if(!ref) return {type:'none', label:'Sem troca cadastrada', delta:null, next:null, current};
  if(!Number.isFinite(current)) return {type:'none', label:`Próxima: ${ref.nextOdometer.toLocaleString('pt-BR')} km`, delta:null, next:ref.nextOdometer, current:null};
  const d=ref.nextOdometer-current;
  if(d < 0) return {type:'overdue', label:`Vencida há ${Math.abs(d).toLocaleString('pt-BR')} km`, delta:d, next:ref.nextOdometer, current};
  if(d <= 1000) return {type:'soon', label:`Faltam ${d.toLocaleString('pt-BR')} km`, delta:d, next:ref.nextOdometer, current};
  return {type:'ok', label:`Faltam ${d.toLocaleString('pt-BR')} km`, delta:d, next:ref.nextOdometer, current};
}

function showToast(msg){
  const el=$('toast');
  const openDialog=document.querySelector('dialog[open]');
  if(openDialog){
    // <dialog> usa a "top layer" do navegador; mover o toast para dentro
    // do modal garante que a mensagem não fique borrada atrás do backdrop.
    openDialog.appendChild(el);
  }else if(el.parentElement!==document.body){
    document.body.appendChild(el);
  }
  el.textContent=msg;
  el.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t=setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>{
      if(!document.querySelector('dialog[open]') && el.parentElement!==document.body){
        document.body.appendChild(el);
      }
    },220);
  },3200);
}

const APP_VIEWS=['home','record','menu','manual','admin','vehicles','vehicle-detail','corrections','history','oil','oil-record'];

function activeView(){
  return document.querySelector('.view.active')?.dataset.view || 'home';
}
function applyView(view){
  if(!APP_VIEWS.includes(view)) view='home';
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.dataset.view===view));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.nav===view));
  if(view==='record') prepRecord();
  if(view==='oil-record') prepOilRecord();
  if(view==='vehicles') renderVehicles();
  if(view==='history') renderHistory();
  if(view==='corrections') renderCorrections();
  if(view==='oil') renderOil();
  if(view==='home') renderHome();
  if(view==='admin' || view==='menu') updateSyncUI();
  window.scrollTo({top:0,behavior:'smooth'});
}
function nav(view,{replace=false}={}){
  if(!APP_VIEWS.includes(view)) view='home';
  const current=activeView();
  applyView(view);

  // Cada tela passa a ter uma entrada real no histórico do PWA.
  // Assim o botão Voltar do Android retorna dentro do app.
  if(replace){
    history.replaceState({oliveiraView:view},'',`#${view}`);
  }else if(current!==view || history.state?.oliveiraView!==view){
    history.pushState({oliveiraView:view},'',`#${view}`);
  }
}
function closeOpenDialogFromBack(){
  const dialogs=[...document.querySelectorAll('dialog[open]')];
  const dlg=dialogs[dialogs.length-1];
  if(!dlg) return false;
  if(dlg.id==='deviceOwnerDialog' && dlg.dataset.required==='1'){
    return true;
  }
  try{ dlg.close(); }catch{}
  if(dlg.id==='pdfPreviewDialog' && typeof clearCurrentPdfPreview==='function'){
    setTimeout(clearCurrentPdfPreview,120);
  }
  return true;
}

window.addEventListener('popstate',e=>{
  const current=activeView();

  // 1) Se houver modal aberto, o botão Voltar fecha só o modal.
  if(closeOpenDialogFromBack()){
    history.pushState({oliveiraView:current,oliveiraGuard:true},'',`#${current}`);
    return;
  }

  // 2) Nos formulários em etapas, Voltar retorna uma etapa antes.
  if(current==='record' && Number(state.recordStep)>1){
    setRecordStep(state.recordStep-1);
    history.pushState({oliveiraView:'record',oliveiraGuard:true},'','#record');
    return;
  }
  if(current==='oil-record' && Number(state.oilStep)>1){
    setOilStep(state.oilStep-1);
    history.pushState({oliveiraView:'oil-record',oliveiraGuard:true},'','#oil-record');
    return;
  }

  const target=e.state?.oliveiraView || location.hash.replace('#','') || 'home';

  // A entrada-base existe para proteger modais/telas internas.
  // Chegando nela sem nada aberto, o segundo movimento realmente sai do app.
  if(e.state?.oliveiraBase && target===current){
    history.back();
    return;
  }

  applyView(APP_VIEWS.includes(target)?target:'home');
});

document.addEventListener('click', e=>{
  const btn=e.target.closest('[data-nav]');
  if(btn) nav(btn.dataset.nav);
});


function recentMovementOilValue(record){
  const snapshot=Number(record?.oil);
  if(Number.isFinite(snapshot) && snapshot>0) return snapshot;
  const ref=oilReference(record?.vehicleId);
  return Number.isFinite(Number(ref?.nextOdometer)) ? Number(ref.nextOdometer) : null;
}
function renderRecentMovements(){
  const body=$('recentMovementsBody');
  if(!body) return;

  const list=visibleRecords()
    .slice()
    .sort((a,b)=>(b.date+(b.createdAt||'')).localeCompare(a.date+(a.createdAt||'')))
    .slice(0,10);

  if(!list.length){
    body.innerHTML='<tr><td colspan="7" class="recent-empty">Nenhuma movimentação registrada.</td></tr>';
    return;
  }

  body.innerHTML=list.map(r=>{
    const oil=recentMovementOilValue(r);
    const quantity=fmtConsumptionValue(r.quantity);
    return `<tr>
      <td><strong>${escapeHTML(r.vehicle||'—')}</strong></td>
      <td><span class="recent-plate">${escapeHTML(r.plate||'—')}</span></td>
      <td>${Number.isFinite(Number(r.odometer))?Number(r.odometer).toLocaleString('pt-BR'):'—'}</td>
      <td>${escapeHTML(quantity)}</td>
      <td>${fmtDate(r.date)}</td>
      <td>${oil===null?'—':oil.toLocaleString('pt-BR')}</td>
      <td>${escapeHTML(recordOperator(r))}</td>
    </tr>`;
  }).join('');
}

function renderHome(){
  renderRecentMovements();
  const attention=activeVehicles()
    .map(v=>({v,s:oilStatus(v)}))
    .filter(x=>['soon','overdue'].includes(x.s.type));
  const alert=$('simpleOilAlert');
  if(alert){
    if(attention.length){
      const overdue=attention.filter(x=>x.s.type==='overdue').length;
      const soon=attention.filter(x=>x.s.type==='soon').length;
      alert.innerHTML=`<div class="simple-alert-icon">⚠</div><div><strong>Atenção à troca de óleo</strong><span>${overdue?`${overdue} vencida(s)`:''}${overdue&&soon?' • ':''}${soon?`${soon} próxima(s)`:''}</span></div><button type="button" data-nav="oil">VER</button>`;
      alert.classList.remove('hidden');
    }else{
      alert.classList.add('hidden');
      alert.innerHTML='';
    }
  }
}

function renderVehicleOptions(selected){
  const sel=$('recordVehicle');
  if(!sel) return;
  sel.innerHTML='<option value="">Selecione</option>'+activeVehicles()
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
    .map(v=>`<option value="${v.id}" ${selected===v.id?'selected':''}>${escapeHTML(v.name)} — ${escapeHTML(v.plate)}</option>`).join('');
  renderSimpleVehicleChoices(selected);
  updatePlate();
}
function renderSimpleVehicleChoices(selected=''){
  const box=$('simpleVehicleChoices');
  const empty=$('noVehicleSimple');
  if(!box) return;
  const list=activeVehicles().slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  box.innerHTML=list.map(v=>`
    <button type="button" class="vehicle-choice ${selected===v.id?'selected':''}" data-vehicle-id="${v.id}">
      <span class="vehicle-choice-icon">🚚</span>
      <span class="vehicle-choice-text"><strong>${escapeHTML(v.name)}</strong><small>${escapeHTML(v.plate)}</small></span>
      <span class="vehicle-choice-check">✓</span>
    </button>`).join('');
  if(empty) empty.classList.toggle('hidden',list.length>0);
}
function updatePlate(){
  const v=getVehicle($('recordVehicle').value);
  $('recordPlate').value=v?.plate || '';
  renderSimpleVehicleChoices(v?.id || '');
  const prev=v?lastRecord(v.id):null;
  if($('lastOdometerSimple')){
    $('lastOdometerSimple').textContent=prev
      ? `Último registro: ${Number(prev.odometer).toLocaleString('pt-BR')} km. Digite o número que aparece no painel agora.`
      : 'Primeiro registro deste veículo. Digite o número que aparece no painel.';
  }
}
function prepRecord(vehicleId=null){
  // Por segurança operacional, um novo lançamento normal sempre começa
  // pela escolha do veículo. Só pré-seleciona quando a ficha do veículo
  // chama explicitamente prepRecord(vehicleId).
  const chosen=vehicleId || '';
  renderVehicleOptions(chosen);
  $('recordDate').value=todayISO();
  $('recordOdometer').value='';
  $('recordLiters').value='';
  $('recordQuantity').value='';
  $('recordWarning').classList.add('hidden');
  updatePlate();
  updateConsumption();
  setRecordStep(chosen ? 2 : 1);
}
$('recordVehicle').addEventListener('change',()=>{
  state.currentVehicleId=$('recordVehicle').value || null;
  updatePlate();
  checkOdometer();
  updateConsumption();
});
$('recordOdometer').addEventListener('input',()=>{ checkOdometer(); updateConsumption(); });
$('recordLiters').addEventListener('input',updateConsumption);
function checkOdometer(){
  const vid=$('recordVehicle').value, raw=$('recordOdometer').value, val=Number(raw), r=lastRecord(vid), box=$('recordWarning');
  if(r && raw!=='' && Number.isFinite(val) && val <= Number(r.odometer)){
    box.textContent=`O odômetro deve ser maior que o último registro (${Number(r.odometer).toLocaleString('pt-BR')} km) para calcular o consumo.`;
    box.classList.remove('hidden');
  } else box.classList.add('hidden');
}
function updateConsumption(){
  const vid=$('recordVehicle').value;
  const odoRaw=$('recordOdometer').value;
  const litersRaw=$('recordLiters').value;
  const odo=Number(odoRaw), liters=Number(litersRaw), prev=lastRecord(vid);
  const out=$('recordQuantity'), help=$('recordConsumptionHelp'), simple=$('simpleConsumptionValue');
  out.value='';
  if(simple) simple.textContent='—';
  help.classList.remove('consumption-ready');
  help.classList.add('consumption-pending');
  if(!vid){ help.textContent='Escolha um veículo primeiro.'; return null; }
  if(!prev){
    help.textContent='Primeiro abastecimento: o consumo será calculado no próximo registro.';
    if(simple) simple.textContent='Primeiro registro';
    return null;
  }
  if(odoRaw==='' || litersRaw==='' || !Number.isFinite(odo) || !Number.isFinite(liters) || liters<=0){
    help.textContent='Informe o KM atual e os litros abastecidos.'; return null;
  }
  const distance=odo-Number(prev.odometer);
  if(distance<=0){ help.textContent='Confira o KM: ele precisa ser maior que o último registro.'; return null; }
  const kmL=distance/liters;
  out.value=kmL.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(simple) simple.textContent=`${kmL.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} km/l`;
  help.textContent=`Percorreu ${distance.toLocaleString('pt-BR')} km desde o último registro.`;
  help.classList.remove('consumption-pending');
  help.classList.add('consumption-ready');
  return kmL;
}

function setRecordStep(step){
  const max=4;
  state.recordStep=Math.max(1,Math.min(max,step));
  document.querySelectorAll('.record-step').forEach(el=>el.classList.toggle('active',Number(el.dataset.step)===state.recordStep));
  if($('wizardProgressText')) $('wizardProgressText').textContent=`Etapa ${state.recordStep} de ${max}`;
  if($('wizardProgressBar')) $('wizardProgressBar').style.width=`${(state.recordStep/max)*100}%`;
  if($('wizardBackBtn')) $('wizardBackBtn').textContent=state.recordStep===1?'← INÍCIO':'← VOLTAR';
  if($('wizardNextBtn')) $('wizardNextBtn').classList.toggle('hidden',state.recordStep===5);
  if($('wizardSaveBtn')) $('wizardSaveBtn').classList.toggle('hidden',state.recordStep!==5);
  if(state.recordStep===5) updateRecordConfirmation();
  setTimeout(()=>{
    const input=document.querySelector(`.record-step[data-step="${state.recordStep}"] input:not([type="hidden"])`);
    if(input && state.recordStep>1 && state.recordStep<5) input.focus({preventScroll:true});
  },120);
  window.scrollTo({top:0,behavior:'smooth'});
}
function validateRecordStep(step){
  if(step===1){
    if(!$('recordVehicle').value){ showToast('Toque no veículo abastecido.'); return false; }
  }
  if(step===2){
    const raw=$('recordOdometer').value;
    const odo=Number(raw), prev=lastRecord($('recordVehicle').value);
    if(raw==='' || !Number.isFinite(odo) || odo<0){ showToast('Digite o KM que aparece no painel.'); return false; }
    if(prev && odo<=Number(prev.odometer)){
      showToast(`Confira o KM. O último foi ${Number(prev.odometer).toLocaleString('pt-BR')}.`);
      return false;
    }
  }
  if(step===3){
    const liters=Number($('recordLiters').value);
    if(!Number.isFinite(liters) || liters<=0){ showToast('Digite quantos litros foram abastecidos.'); return false; }
  }
  if(step===3 && !$('recordDate').value) $('recordDate').value=todayISO();
  return true;
}
function updateRecordConfirmation(){
  const v=getVehicle($('recordVehicle').value);
  const consumption=updateConsumption();
  $('confirmVehicle').textContent=v?.name || '—';
  $('confirmPlate').textContent=v?.plate || '—';
  $('confirmOdometer').textContent=$('recordOdometer').value ? `${Number($('recordOdometer').value).toLocaleString('pt-BR')} km` : '—';
  $('confirmLiters').textContent=$('recordLiters').value ? `${Number($('recordLiters').value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} L` : '—';
  $('confirmConsumption').textContent=consumption===null?'Será calculado no próximo registro':`${consumption.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} km/l`;
  $('confirmDate').textContent=fmtDate($('recordDate').value);
  const oilBox=$('recordOilInfo');
  const s=v?oilStatus(v):null;
  if(oilBox && s && ['soon','overdue'].includes(s.type)){
    oilBox.innerHTML=`<strong>${s.type==='overdue'?'⚠ TROCA DE ÓLEO VENCIDA':'⚠ TROCA DE ÓLEO PRÓXIMA'}</strong><span>${escapeHTML(s.label)}. O abastecimento pode ser salvo normalmente.</span>`;
    oilBox.className=`record-oil-info ${s.type}`;
  }else if(oilBox){
    oilBox.className='record-oil-info hidden';
    oilBox.innerHTML='';
  }
}
document.addEventListener('click',e=>{
  const choice=e.target.closest('.vehicle-choice');
  if(!choice) return;
  const id=choice.dataset.vehicleId;
  $('recordVehicle').value=id;
  $('recordVehicle').dispatchEvent(new Event('change'));
  state.currentVehicleId=id;
  setRecordStep(2);
});
$('wizardNextBtn')?.addEventListener('click',()=>{
  if(validateRecordStep(state.recordStep)) setRecordStep(state.recordStep+1);
});
$('wizardBackBtn')?.addEventListener('click',()=>{
  if(state.recordStep===1) nav('home');
  else setRecordStep(state.recordStep-1);
});
$('wizardExitBtn')?.addEventListener('click',()=>nav('home'));

function showRecordSuccess(v,record){
  if($('successVehicle')) $('successVehicle').textContent=`${v.name} • ${v.plate}`;
  const cons=record.quantity ? `${Number(record.quantity).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} km/l` : 'consumo no próximo registro';
  if($('successDetails')) $('successDetails').textContent=`${Number(record.odometer).toLocaleString('pt-BR')} km • ${Number(record.liters).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} L • ${cons}`;
  $('successDialog')?.showModal();
}
$('successHomeBtn')?.addEventListener('click',()=>{ $('successDialog').close(); nav('home'); });
$('successAgainBtn')?.addEventListener('click',()=>{
  $('successDialog').close();
  nav('record');
});

$('recordForm').addEventListener('submit',e=>{
  e.preventDefault();
  const v=getVehicle($('recordVehicle').value); if(!v) return showToast('Selecione um veículo.');
  const odo=Number($('recordOdometer').value);
  const liters=Number($('recordLiters').value);
  const prev=lastRecord(v.id);
  if(!Number.isFinite(liters) || liters<=0) return showToast('Informe os litros abastecidos.');
  if(prev && odo <= Number(prev.odometer)) return showToast('O odômetro deve ser maior que o último registro.');
  const consumption=updateConsumption();
  const oilRef=oilReference(v.id);
  const now=new Date().toISOString();
  const record={
    id:uuid(), vehicleId:v.id, vehicle:v.name, plate:v.plate,
    odometer:odo, liters, quantity:consumption===null?'':consumption.toFixed(2), date:$('recordDate').value || todayISO(),
    oil:oilRef?.nextOdometer || '', operator:deviceOwnerName() || 'Não identificado', deviceId:deviceId(),
    createdAt:now, updatedAt:now
  };
  state.records.push(record);
  queueChange('record',record.id);
  state.currentVehicleId=v.id;
  renderHome();
  showRecordSuccess(v,record);
  e.target.reset();
  prepRecord();
});

function renderVehicles(){
  const list=managedVehicles().slice().sort((a,b)=>{
    if(Boolean(a.archivedAt)!==Boolean(b.archivedAt)) return a.archivedAt?1:-1;
    return a.name.localeCompare(b.name,'pt-BR');
  });
  $('vehiclesList').innerHTML=list.length ? list.map(v=>{
    const r=lastRecord(v.id), s=oilStatus(v), current=currentVehicleOdometer(v.id);
    const status=v.archivedAt?'<span class="badge archived">Arquivado</span>':`<span class="badge ${s.type==='none'?'':s.type}">${escapeHTML(s.label)}</span>`;
    return `<article class="card vehicle-card ${v.archivedAt?'vehicle-archived':''}">
      <div class="vehicle-card-head"><div><h3>${escapeHTML(v.name)}</h3><div class="plate">${escapeHTML(v.plate)}</div></div>${status}</div>
      <div class="card-row"><span class="muted">Odômetro atual</span><strong>${current===null?'—':fmtKm(current)}</strong></div>
      <div class="card-row"><span class="muted">Próxima troca de óleo</span><strong>${s.next?fmtKm(s.next):'—'}</strong></div>
      <div class="vehicle-admin-actions">
        <button class="btn btn-secondary" type="button" data-edit-vehicle="${v.id}">Editar</button>
        <button class="btn btn-secondary" type="button" data-archive-vehicle="${v.id}">${v.archivedAt?'Reativar':'Arquivar'}</button>
        <button class="btn btn-danger-soft" type="button" data-delete-vehicle="${v.id}">Excluir</button>
      </div>
      <button class="btn btn-secondary btn-block" type="button" onclick="openVehicleDetail('${v.id}')">Abrir ficha</button>
    </article>`;
  }).join('') : '<div class="empty">Nenhum veículo cadastrado.</div>';
}

window.openVehicleDetail=(id)=>{
  state.currentVehicleId=id; const v=getVehicle(id);
  if(!v || v.deletedAt) return nav('vehicles');
  const r=lastRecord(id), s=oilStatus(v), recs=vehicleRecords(id).slice(0,5), current=currentVehicleOdometer(id);
  $('vehicleDetail').innerHTML=`<article class="card detail-card">
    <div class="detail-top"><div><span class="eyebrow">VEÍCULO</span><h2>${escapeHTML(v.name)}</h2><div class="plate">${escapeHTML(v.plate)}</div></div>${v.archivedAt?'<span class="badge archived">Arquivado</span>':`<span class="badge ${s.type==='none'?'':s.type}">${escapeHTML(s.label)}</span>`}</div>
    <div class="detail-grid">
      <div class="detail-box"><span>Odômetro atual</span><strong>${current===null?'—':fmtKm(current)}</strong></div>
      <div class="detail-box"><span>Último abastecimento</span><strong>${r?fmtLiters(r.liters):'—'}</strong></div>
      <div class="detail-box"><span>Quant. por litro</span><strong>${r?escapeHTML(fmtConsumption(r.quantity)):'—'}</strong></div>
      <div class="detail-box"><span>Última data</span><strong>${r?fmtDate(r.date):'—'}</strong></div>
      <div class="detail-box"><span>Próxima troca de óleo</span><strong>${s.next?fmtKm(s.next):'—'}</strong></div>
    </div>
  </article>
  <div class="section-head" style="margin-top:22px"><div><span class="eyebrow">RECENTES</span><h3>Últimos registros</h3></div></div>
  <div class="stack-list">${recs.length?recs.map(historyCard).join(''):'<div class="empty">Nenhum registro para este veículo.</div>'}</div>`;
  nav('vehicle-detail');
}
$('detailNewRecord').addEventListener('click',()=>{
  const id=state.currentVehicleId, v=getVehicle(id);
  if(v?.archivedAt) return showToast('Reative o veículo antes de lançar abastecimento.');
  nav('record'); prepRecord(id);
});

function openNewVehicleDialog(){
  $('vehicleForm').reset();
  $('vehicleEditId').value='';
  $('vehicleDialogTitle').textContent='Novo veículo';
  $('vehicleSaveBtn').textContent='Salvar veículo';
  $('vehicleDialog').showModal();
}
function openEditVehicleDialog(id){
  const v=getVehicle(id);
  if(!v || v.deletedAt) return;
  $('vehicleEditId').value=v.id;
  $('vehicleName').value=v.name||'';
  $('vehiclePlate').value=v.plate||'';
  const current=currentVehicleOdometer(v.id);
  $('vehicleOdometer').value=current===null?'':current;
  $('vehicleDialogTitle').textContent='Editar veículo';
  $('vehicleSaveBtn').textContent='Salvar alterações';
  $('vehicleDialog').showModal();
}
$('newVehicleBtn').addEventListener('click',openNewVehicleDialog);
$('closeVehicleDialog').addEventListener('click',()=>$('vehicleDialog').close());
$('vehicleDialog').addEventListener('click',e=>{ if(e.target===$('vehicleDialog')) $('vehicleDialog').close(); });
$('vehicleForm').addEventListener('submit',e=>{
  e.preventDefault();
  const id=$('vehicleEditId').value;
  const name=$('vehicleName').value.trim();
  const plate=$('vehiclePlate').value.trim().toUpperCase();
  const odoRaw=$('vehicleOdometer').value;
  if(!name || !plate) return showToast('Informe veículo e placa.');
  if(managedVehicles().some(v=>v.id!==id && String(v.plate||'').toUpperCase()===plate)) return showToast('Já existe um veículo com essa placa.');
  const now=new Date().toISOString();

  if(id){
    const v=getVehicle(id);
    if(!v || v.deletedAt) return;
    const oldName=v.name, oldPlate=v.plate;
    v.name=name; v.plate=plate; v.updatedAt=now;
    if(odoRaw!==''){
      const odo=Number(odoRaw);
      if(!Number.isFinite(odo) || odo<0) return showToast('Confira o odômetro.');
      v.manualOdometer=odo;
      v.manualOdometerAt=now;
    }
    queueChange('vehicle',v.id);

    if(oldName!==name || oldPlate!==plate){
      for(const r of state.records.filter(r=>r.vehicleId===v.id && !r.deletedAt)){
        r.vehicle=name; r.plate=plate; r.updatedAt=now; queueChange('record',r.id);
      }
      for(const o of state.oilChanges.filter(o=>o.vehicleId===v.id && !o.deletedAt)){
        o.vehicle=name; o.plate=plate; o.updatedAt=now; queueChange('oilChange',o.id);
      }
    }
    showToast('Veículo atualizado.');
  }else{
    const vehicle={id:uuid(),name,plate,createdAt:now,updatedAt:now};
    if(odoRaw!==''){
      const odo=Number(odoRaw);
      if(!Number.isFinite(odo) || odo<0) return showToast('Confira o odômetro.');
      vehicle.manualOdometer=odo;
      vehicle.manualOdometerAt=now;
    }
    state.vehicles.push(vehicle);
    queueChange('vehicle',vehicle.id);
    showToast('Veículo cadastrado.');
  }
  $('vehicleDialog').close();
  e.target.reset();
  refreshAllViews();
});
$('vehiclePlate').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));

document.addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-vehicle]');
  if(edit){ openEditVehicleDialog(edit.dataset.editVehicle); return; }

  const archive=e.target.closest('[data-archive-vehicle]');
  if(archive){
    const v=getVehicle(archive.dataset.archiveVehicle);
    if(!v || v.deletedAt) return;
    const now=new Date().toISOString();
    if(v.archivedAt){
      v.archivedAt=null;
      v.updatedAt=now;
      queueChange('vehicle',v.id);
      showToast('Veículo reativado.');
    }else{
      if(!confirm(`Arquivar ${v.name} (${v.plate})? Ele deixará de aparecer nos lançamentos, mas o histórico será preservado.`)) return;
      v.archivedAt=now;
      v.updatedAt=now;
      queueChange('vehicle',v.id);
      showToast('Veículo arquivado.');
    }
    refreshAllViews();
    return;
  }

  const del=e.target.closest('[data-delete-vehicle]');
  if(del){
    const v=getVehicle(del.dataset.deleteVehicle);
    if(!v || v.deletedAt) return;
    const fuelCount=correctionRecords().filter(r=>r.vehicleId===v.id).length;
    const oilCount=state.oilChanges.filter(o=>o.vehicleId===v.id && !o.deletedAt).length;
    const msg=`Excluir ${v.name} (${v.plate}) da frota?\\n\\nExistem ${fuelCount} lançamento(s) de abastecimento e ${oilCount} troca(s) de óleo vinculados. Esses históricos serão preservados, mas o veículo não poderá mais ser usado em novos lançamentos.`;
    if(!confirm(msg)) return;
    const now=new Date().toISOString();
    v.deletedAt=now; v.updatedAt=now; queueChange('vehicle',v.id);
    refreshAllViews();
    showToast('Veículo excluído da frota.');
  }
});

function historyCard(r){
  return `<article class="list-card">
    <div class="list-card-main"><h4>${escapeHTML(r.vehicle)} <span class="plate">${escapeHTML(r.plate)}</span></h4><p>${fmtDate(r.date)}</p></div>
    <div class="history-values">
      <div><span class="muted">Odômetro</span><strong>${fmtKm(r.odometer)}</strong></div>
      <div><span class="muted">Litros</span><strong>${fmtLiters(r.liters)}</strong></div>
      <div><span class="muted">Quant./litro</span><strong>${escapeHTML(fmtConsumption(r.quantity))}</strong></div>
      <div><span class="muted">Próx. troca óleo</span><strong>${r.oil?fmtKm(r.oil):'—'}</strong></div>
      <div><span class="muted">Responsável</span><strong>${escapeHTML(recordOperator(r))}</strong></div>
    </div>
  </article>`;
}
function renderHistory(){
  const q=$('historySearch').value.trim().toLowerCase(), d=$('historyDate').value;
  const list=visibleRecords().slice().sort((a,b)=>(b.date+(b.createdAt||'')).localeCompare(a.date+(a.createdAt||''))).filter(r=>(!q || `${r.vehicle} ${r.plate}`.toLowerCase().includes(q)) && (!d || r.date===d));
  $('historyList').innerHTML=list.length?list.map(historyCard).join(''):'<div class="empty">Nenhum registro encontrado.</div>';
}
$('historySearch').addEventListener('input',renderHistory); $('historyDate').addEventListener('change',renderHistory);
$('clearFilters').addEventListener('click',()=>{$('historySearch').value='';$('historyDate').value='';renderHistory();});


function correctionCard(r){
  const cancelled=Boolean(r.cancelledAt);
  return `<article class="list-card correction-card ${cancelled?'correction-cancelled':''}">
    <div class="list-card-main">
      <h4>${escapeHTML(r.vehicle)} <span class="plate">${escapeHTML(r.plate)}</span></h4>
      <p>${fmtDate(r.date)} • ${fmtKm(r.odometer)} • ${fmtLiters(r.liters)} • ${escapeHTML(fmtConsumption(r.quantity))}</p>
      <p class="record-operator-line">Responsável: <strong>${escapeHTML(recordOperator(r))}</strong></p>
      ${cancelled?'<span class="badge cancelled">Cancelado</span>':''}
    </div>
    <div class="correction-actions">
      <button class="btn btn-secondary" type="button" data-edit-record="${r.id}">Editar</button>
      <button class="btn btn-secondary" type="button" data-toggle-cancel-record="${r.id}">${cancelled?'Reativar':'Cancelar'}</button>
      <button class="btn btn-danger-soft" type="button" data-delete-record="${r.id}">Excluir</button>
    </div>
  </article>`;
}
function renderCorrections(){
  const q=($('correctionSearch')?.value||'').trim().toLowerCase();
  const d=$('correctionDate')?.value||'';
  const status=$('correctionStatus')?.value||'active';
  const list=correctionRecords()
    .slice()
    .sort((a,b)=>(b.date+(b.createdAt||'')).localeCompare(a.date+(a.createdAt||'')))
    .filter(r=>{
      if(q && !`${r.vehicle} ${r.plate}`.toLowerCase().includes(q)) return false;
      if(d && r.date!==d) return false;
      if(status==='active' && r.cancelledAt) return false;
      if(status==='cancelled' && !r.cancelledAt) return false;
      return true;
    });
  if($('correctionsList')) $('correctionsList').innerHTML=list.length?list.map(correctionCard).join(''):'<div class="empty">Nenhum lançamento encontrado.</div>';
}
function renderRecordEditVehicleOptions(selected=''){
  const sel=$('recordEditVehicle');
  if(!sel) return;
  sel.innerHTML=managedVehicles()
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
    .map(v=>`<option value="${v.id}" ${selected===v.id?'selected':''}>${escapeHTML(v.name)} — ${escapeHTML(v.plate)}${v.archivedAt?' (arquivado)':''}</option>`).join('');
}
function openRecordEditDialog(id){
  const r=state.records.find(x=>x.id===id && !x.deletedAt);
  if(!r) return;
  renderRecordEditVehicleOptions(r.vehicleId);
  $('recordEditId').value=r.id;
  $('recordEditVehicle').value=r.vehicleId;
  $('recordEditDate').value=r.date;
  $('recordEditOdometer').value=r.odometer;
  $('recordEditLiters').value=r.liters;
  $('recordEditConsumption').textContent=r.quantity?fmtConsumption(r.quantity):'Primeiro registro / sem cálculo';
  $('recordEditDialog').showModal();
}
function previewEditedConsumption(){
  const id=$('recordEditId')?.value;
  const r=state.records.find(x=>x.id===id);
  if(!r) return;
  const vehicleId=$('recordEditVehicle').value;
  const date=$('recordEditDate').value;
  const odo=Number($('recordEditOdometer').value);
  const liters=Number($('recordEditLiters').value);
  const candidates=visibleRecords()
    .filter(x=>x.id!==id && x.vehicleId===vehicleId)
    .concat([{...r,vehicleId,date,odometer:odo,liters}])
    .sort((a,b)=>(a.date+(a.createdAt||'')).localeCompare(b.date+(b.createdAt||'')));
  const idx=candidates.findIndex(x=>x.id===id);
  const prev=idx>0?candidates[idx-1]:null;
  let txt='Primeiro registro / sem cálculo';
  if(prev && Number.isFinite(odo) && Number.isFinite(liters) && liters>0){
    const distance=odo-Number(prev.odometer);
    txt=distance>0?`${(distance/liters).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} km/l`:'Confira o odômetro';
  }
  $('recordEditConsumption').textContent=txt;
}
$('correctionSearch')?.addEventListener('input',renderCorrections);
$('correctionDate')?.addEventListener('change',renderCorrections);
$('correctionStatus')?.addEventListener('change',renderCorrections);
$('clearCorrectionFilters')?.addEventListener('click',()=>{
  $('correctionSearch').value=''; $('correctionDate').value=''; $('correctionStatus').value='active'; renderCorrections();
});
$('closeRecordEditDialog')?.addEventListener('click',()=>$('recordEditDialog').close());
$('recordEditDialog')?.addEventListener('click',e=>{ if(e.target===$('recordEditDialog')) $('recordEditDialog').close(); });
$('recordEditVehicle')?.addEventListener('change',previewEditedConsumption);
$('recordEditDate')?.addEventListener('change',previewEditedConsumption);
$('recordEditOdometer')?.addEventListener('input',previewEditedConsumption);
$('recordEditLiters')?.addEventListener('input',previewEditedConsumption);

$('recordEditForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const id=$('recordEditId').value;
  const r=state.records.find(x=>x.id===id && !x.deletedAt);
  if(!r) return;
  const newVehicle=getVehicle($('recordEditVehicle').value);
  const odo=Number($('recordEditOdometer').value);
  const liters=Number($('recordEditLiters').value);
  const date=$('recordEditDate').value;
  if(!newVehicle || newVehicle.deletedAt) return showToast('Selecione um veículo válido.');
  if(!Number.isFinite(odo) || odo<0) return showToast('Confira o odômetro.');
  if(!Number.isFinite(liters) || liters<=0) return showToast('Confira os litros.');
  if(!date) return showToast('Informe a data.');

  const oldVehicleId=r.vehicleId;
  const now=new Date().toISOString();
  r.vehicleId=newVehicle.id;
  r.vehicle=newVehicle.name;
  r.plate=newVehicle.plate;
  r.odometer=odo;
  r.liters=liters;
  r.date=date;
  r.updatedAt=now;
  queueChange('record',r.id);

  recalcVehicleConsumptions(oldVehicleId);
  if(newVehicle.id!==oldVehicleId) recalcVehicleConsumptions(newVehicle.id);

  $('recordEditDialog').close();
  refreshAllViews();
  renderCorrections();
  showToast('Lançamento corrigido.');
});

document.addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-record]');
  if(edit){ openRecordEditDialog(edit.dataset.editRecord); return; }

  const toggle=e.target.closest('[data-toggle-cancel-record]');
  if(toggle){
    const r=state.records.find(x=>x.id===toggle.dataset.toggleCancelRecord && !x.deletedAt);
    if(!r) return;
    const now=new Date().toISOString();
    if(r.cancelledAt){
      r.cancelledAt=null;
      r.updatedAt=now;
      queueChange('record',r.id);
      recalcVehicleConsumptions(r.vehicleId);
      showToast('Lançamento reativado.');
    }else{
      if(!confirm(`Cancelar o lançamento de ${r.vehicle} em ${fmtDate(r.date)}? Ele deixará de contar no histórico, consumo e PDF.`)) return;
      r.cancelledAt=now;
      r.updatedAt=now;
      queueChange('record',r.id);
      recalcVehicleConsumptions(r.vehicleId);
      showToast('Lançamento cancelado.');
    }
    refreshAllViews(); renderCorrections();
    return;
  }

  const del=e.target.closest('[data-delete-record]');
  if(del){
    const r=state.records.find(x=>x.id===del.dataset.deleteRecord && !x.deletedAt);
    if(!r) return;
    if(!confirm(`Excluir definitivamente este lançamento?\\n\\n${r.vehicle} • ${fmtDate(r.date)} • ${fmtKm(r.odometer)}\\n\\nEle será removido do uso normal e a exclusão será sincronizada com os outros aparelhos.`)) return;
    const now=new Date().toISOString();
    r.deletedAt=now; r.updatedAt=now; queueChange('record',r.id);
    recalcVehicleConsumptions(r.vehicleId);
    refreshAllViews(); renderCorrections();
    showToast('Lançamento excluído.');
  }
});

function oilCard(v,s){
  const change=latestOilChange(v.id);
  const legacy=oilReference(v.id);
  const current=currentVehicleOdometer(v.id);
  const lastLine=change
    ? `Última troca: ${fmtDate(change.date)} • ${fmtKm(change.odometer)} • ${escapeHTML(recordOperator(change))}`
    : legacy?.source==='legacy'
      ? `Referência antiga: próxima troca em ${fmtKm(legacy.nextOdometer)}`
      : 'Nenhuma troca registrada';
  return `<article class="list-card oil-status-card">
    <div class="list-card-main">
      <h4>${escapeHTML(v.name)} <span class="plate">${escapeHTML(v.plate)}</span></h4>
      <p>${lastLine}</p>
      <p>KM atual: ${current===null?'—':fmtKm(current)} • Próxima: ${s.next?fmtKm(s.next):'—'}</p>
    </div>
    <div class="list-meta"><span class="badge ${s.type==='none'?'':s.type}">${escapeHTML(s.label)}</span></div>
  </article>`;
}
function renderOil(){
  const list=activeVehicles().slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  $('oilList').innerHTML=list.length?list.map(v=>oilCard(v,oilStatus(v))).join(''):'<div class="empty">Nenhum veículo cadastrado.</div>';
}


function openOilChangeConfirmation(){
  const dlg=$('oilConfirmDialog');
  if(dlg && !dlg.open) dlg.showModal();
}
function closeOilChangeConfirmation(){
  const dlg=$('oilConfirmDialog');
  if(dlg?.open) dlg.close();
}
$('homeOilChangeBtn')?.addEventListener('click',openOilChangeConfirmation);
$('manualOilShortcut')?.addEventListener('click',openOilChangeConfirmation);
$('oilScreenRegisterBtn')?.addEventListener('click',openOilChangeConfirmation);
$('cancelOilConfirmBtn')?.addEventListener('click',closeOilChangeConfirmation);
$('confirmOilChangeBtn')?.addEventListener('click',()=>{
  closeOilChangeConfirmation();
  nav('oil-record');
});
$('oilConfirmDialog')?.addEventListener('click',e=>{
  if(e.target===$('oilConfirmDialog')) closeOilChangeConfirmation();
});

function renderOilVehicleOptions(selected=''){
  const sel=$('oilVehicle');
  if(!sel) return;
  const list=activeVehicles().slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  sel.innerHTML='<option value="">Selecione</option>'+list.map(v=>`<option value="${v.id}" ${selected===v.id?'selected':''}>${escapeHTML(v.name)} — ${escapeHTML(v.plate)}</option>`).join('');
  const box=$('oilVehicleChoices');
  if(box){
    box.innerHTML=list.map(v=>`
      <button type="button" class="vehicle-choice oil-vehicle-choice ${selected===v.id?'selected':''}" data-oil-vehicle-id="${v.id}">
        <span class="vehicle-choice-icon">🚚</span>
        <span class="vehicle-choice-text"><strong>${escapeHTML(v.name)}</strong><small>${escapeHTML(v.plate)}</small></span>
        <span class="vehicle-choice-check">✓</span>
      </button>`).join('');
  }
  if($('noOilVehicleSimple')) $('noOilVehicleSimple').classList.toggle('hidden',list.length>0);
}
function prepOilRecord(){
  renderOilVehicleOptions('');
  $('oilVehicle').value='';
  $('oilOdometer').value='';
  $('oilNextOdometer').value='';
  $('oilDate').value=todayISO();
  if($('oilLastKmHelp')) $('oilLastKmHelp').textContent='Digite a quilometragem do veículo no momento da troca.';
  setOilStep(1);
}
function setOilStep(step){
  const max=4;
  state.oilStep=Math.max(1,Math.min(max,step));
  document.querySelectorAll('.oil-record-step').forEach(el=>el.classList.toggle('active',Number(el.dataset.oilStep)===state.oilStep));
  $('oilWizardProgressText').textContent=`Etapa ${state.oilStep} de ${max}`;
  $('oilWizardProgressBar').style.width=`${(state.oilStep/max)*100}%`;
  $('oilWizardBackBtn').textContent=state.oilStep===1?'← TROCA DE ÓLEO':'← VOLTAR';
  $('oilWizardNextBtn').classList.toggle('hidden',state.oilStep===max);
  $('oilWizardSaveBtn').classList.toggle('hidden',state.oilStep!==max);
  if(state.oilStep===4) updateOilConfirmation();
  setTimeout(()=>{
    const input=document.querySelector(`.oil-record-step[data-oil-step="${state.oilStep}"] input:not([type="hidden"])`);
    if(input && state.oilStep>1 && state.oilStep<4) input.focus({preventScroll:true});
  },120);
  window.scrollTo({top:0,behavior:'smooth'});
}
function validateOilStep(step){
  const vid=$('oilVehicle').value;
  if(step===1 && !vid){ showToast('Toque no veículo que recebeu a troca.'); return false; }
  if(step===2){
    const odo=Number($('oilOdometer').value);
    if(!Number.isFinite(odo) || odo<0){ showToast('Digite o KM da troca de óleo.'); return false; }
    const current=currentVehicleOdometer(vid);
    if(current!==null && odo<current-100){
      showToast(`Confira o KM. O veículo tem referência recente de ${current.toLocaleString('pt-BR')} km.`);
      return false;
    }
  }
  if(step===3){
    const odo=Number($('oilOdometer').value), next=Number($('oilNextOdometer').value);
    if(!Number.isFinite(next) || next<=odo){ showToast('A próxima troca deve ser maior que o KM da troca atual.'); return false; }
  }
  return true;
}
function updateOilConfirmation(){
  const v=getVehicle($('oilVehicle').value);
  $('oilConfirmVehicle').textContent=v?.name || '—';
  $('oilConfirmPlate').textContent=v?.plate || '—';
  $('oilConfirmOdometer').textContent=$('oilOdometer').value?fmtKm(Number($('oilOdometer').value)):'—';
  $('oilConfirmNext').textContent=$('oilNextOdometer').value?fmtKm(Number($('oilNextOdometer').value)):'—';
  $('oilConfirmDate').textContent=fmtDate($('oilDate').value);
}
document.addEventListener('click',e=>{
  const choice=e.target.closest('[data-oil-vehicle-id]');
  if(!choice) return;
  const id=choice.dataset.oilVehicleId;
  $('oilVehicle').value=id;
  renderOilVehicleOptions(id);
  const current=currentVehicleOdometer(id);
  if($('oilLastKmHelp')){
    $('oilLastKmHelp').textContent=current===null
      ? 'Digite a quilometragem do veículo no momento da troca.'
      : `Última referência do veículo: ${current.toLocaleString('pt-BR')} km.`;
  }
  if(current!==null) $('oilOdometer').value=current;
  setOilStep(2);
});
$('oilWizardNextBtn')?.addEventListener('click',()=>{ if(validateOilStep(state.oilStep)) setOilStep(state.oilStep+1); });
$('oilWizardBackBtn')?.addEventListener('click',()=>{
  if(state.oilStep===1) nav('oil');
  else setOilStep(state.oilStep-1);
});
$('oilWizardExitBtn')?.addEventListener('click',()=>nav('oil'));
$('oilForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  if(!validateOilStep(3)) return;
  const v=getVehicle($('oilVehicle').value);
  if(!v) return showToast('Selecione o veículo.');
  const now=new Date().toISOString();
  const change={
    id:uuid(),
    vehicleId:v.id,
    vehicle:v.name,
    plate:v.plate,
    odometer:Number($('oilOdometer').value),
    nextOdometer:Number($('oilNextOdometer').value),
    date:$('oilDate').value || todayISO(),
    operator:deviceOwnerName() || 'Não identificado',
    deviceId:deviceId(),
    createdAt:now,
    updatedAt:now
  };
  state.oilChanges.push(change);
  queueChange('oilChange',change.id);
  if($('oilSuccessVehicle')) $('oilSuccessVehicle').textContent=`${v.name} • ${v.plate}`;
  if($('oilSuccessDetails')) $('oilSuccessDetails').textContent=`Troca em ${fmtKm(change.odometer)} • próxima em ${fmtKm(change.nextOdometer)}`;
  renderHome(); renderOil(); renderVehicles();
  $('oilSuccessDialog')?.showModal();
  e.target.reset();
  prepOilRecord();
});
$('oilSuccessMenuBtn')?.addEventListener('click',()=>{ $('oilSuccessDialog').close(); nav('menu'); });
$('oilSuccessAgainBtn')?.addEventListener('click',()=>{ $('oilSuccessDialog').close(); nav('oil-record'); });


// ===== Offline, backup e sincronização =====
function fmtDateTime(iso){
  if(!iso) return 'Nunca';
  try{return new Date(iso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}catch{return '—';}
}
function cloudConfigured(){
  try{return Boolean(window.OLIVEIRA_CLOUD_ADAPTER?.isConfigured?.());}catch{return false;}
}
function cloudAuthenticated(){
  try{return Boolean(window.OLIVEIRA_CLOUD_ADAPTER?.isAuthenticated?.());}catch{return false;}
}
function cloudAuthInfo(){
  try{return window.OLIVEIRA_CLOUD_ADAPTER?.getAuthInfo?.() || {};}catch{return {};}
}
function updateSyncUI(){
  const online=navigator.onLine;
  const configured=cloudConfigured();
  const authenticated=cloudAuthenticated();
  const auth=cloudAuthInfo();
  const badge=$('connectionBadge');
  if(badge){ badge.classList.toggle('offline',!online); $('connectionText').textContent=online?'Com internet':'Sem internet'; }
  if($('dataConnection')) $('dataConnection').textContent=online?'Online':'Offline';
  if($('dataPending')) $('dataPending').textContent=state.syncQueue.length.toLocaleString('pt-BR');
  if($('dataLastBackup')) $('dataLastBackup').textContent=fmtDateTime(state.meta.lastBackupAt);
  if($('dataCloud')) $('dataCloud').textContent=!configured?'Não configurada':authenticated?'Conectada':'Login necessário';
  if($('syncNowBtn')) $('syncNowBtn').disabled=state.syncing || !configured || !authenticated;
  if($('cloudAccountBadge')){
    $('cloudAccountBadge').textContent=!configured?'Configuração pendente':authenticated?'Conectado':'Desconectado';
    $('cloudAccountBadge').classList.toggle('connected',authenticated);
  }
  if($('cloudLoginForm')) $('cloudLoginForm').classList.toggle('hidden',!configured || authenticated);
  if($('cloudLoggedArea')) $('cloudLoggedArea').classList.toggle('hidden',!authenticated);
  if($('cloudLoggedEmail')) $('cloudLoggedEmail').textContent=auth.email || 'Conta Firebase';
  if($('syncNotice')){
    let msg='';
    if(!online) msg='Você está offline. Novos dados continuarão sendo salvos neste aparelho.';
    else if(!configured) msg='A sincronização está preparada, mas o projeto Firebase ainda precisa ser configurado no arquivo firebase-config.js.';
    else if(!authenticated) msg='Firebase configurado. Entre com a conta autorizada para ativar a sincronização entre aparelhos.';
    else if(state.syncing) msg='Sincronizando dados com a nuvem…';
    else if(state.syncQueue.length) msg=`${state.syncQueue.length} alteração(ões) aguardando sincronização.`;
    else msg='Dados locais e nuvem estão sincronizados.';
    $('syncNotice').textContent=msg;
  }
}
function refreshAllViews(){
  renderHome(); renderVehicles(); renderHistory(); renderCorrections(); renderOil(); renderVehicleOptions(state.currentVehicleId||$('recordVehicle')?.value||''); renderOilVehicleOptions($('oilVehicle')?.value||'');
}
function exportBackup(){
  const backup={
    app:'Oliveira Frota', backupVersion:1, exportedAt:new Date().toISOString(),
    vehicles:state.vehicles, records:state.records, oilChanges:state.oilChanges
  };
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const d=new Date();
  const stamp=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}`;
  a.href=url; a.download=`Oliveira_Frota_Backup_${stamp}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  state.meta.lastBackupAt=new Date().toISOString(); save(); updateSyncUI(); showToast('Backup salvo com sucesso.');
}
function validBackup(data){
  return data && Array.isArray(data.vehicles) && Array.isArray(data.records) && (data.oilChanges===undefined || Array.isArray(data.oilChanges));
}
async function importBackup(file){
  try{
    const text=await file.text(); const data=JSON.parse(text);
    if(!validBackup(data)) return showToast('Arquivo de backup inválido.');
    const oilCount=Array.isArray(data.oilChanges)?data.oilChanges.length:0;
    if(!confirm(`Restaurar ${data.vehicles.length} veículo(s), ${data.records.length} abastecimento(s) e ${oilCount} troca(s) de óleo? Os dados atuais serão substituídos.`)) return;
    const now=new Date().toISOString();
    state.vehicles=data.vehicles.map(v=>({...v,updatedAt:v.updatedAt||v.createdAt||now}));
    state.records=data.records.map(r=>({...r,updatedAt:r.updatedAt||r.createdAt||now}));
    state.oilChanges=(data.oilChanges||[]).map(r=>({...r,updatedAt:r.updatedAt||r.createdAt||now}));
    state.syncQueue=[{id:uuid(),entityType:'snapshot',entityId:'all',updatedAt:now}];
    state.meta.lastRestoreAt=new Date().toISOString(); state.meta.lastLocalChange=state.meta.lastRestoreAt;
    save(); refreshAllViews(); updateSyncUI(); showToast('Backup restaurado.');
    if(navigator.onLine) setTimeout(()=>attemptCloudSync(false),100);
  }catch(err){ console.error(err); showToast('Não foi possível restaurar o backup.'); }
}
async function attemptCloudSync(manual=false){
  updateSyncUI();
  if(!navigator.onLine){ if(manual) showToast('Sem internet. Os dados continuam salvos no aparelho.'); return false; }
  const adapter=window.OLIVEIRA_CLOUD_ADAPTER;
  if(!adapter?.isConfigured?.()){
    if(manual) showToast('Firebase ainda não está configurado.');
    updateSyncUI(); return false;
  }
  if(!adapter?.isAuthenticated?.()){
    if(manual) showToast('Entre na conta Firebase para sincronizar.');
    updateSyncUI(); return false;
  }
  if(state.syncing) return false;
  state.syncing=true; updateSyncUI();
  try{
    const result=await adapter.sync({vehicles:state.vehicles,records:state.records,oilChanges:state.oilChanges,queue:state.syncQueue,meta:state.meta});
    if(result?.vehicles && Array.isArray(result.vehicles)) state.vehicles=result.vehicles;
    if(result?.records && Array.isArray(result.records)) state.records=result.records;
    if(result?.oilChanges && Array.isArray(result.oilChanges)) state.oilChanges=result.oilChanges;
    state.syncQueue=[]; state.meta.lastSyncAt=new Date().toISOString(); save(); refreshAllViews();
    if(manual) showToast('Sincronização concluída.');
    return true;
  }catch(err){ console.error(err); if(manual) showToast('Não foi possível sincronizar agora.'); return false; }
  finally{ state.syncing=false; updateSyncUI(); }
}

function firebaseErrorExplanation(code){
  const c=String(code||'').toUpperCase();
  if(c.includes('INVALID_LOGIN_CREDENTIALS') || c.includes('INVALID_PASSWORD') || c.includes('EMAIL_NOT_FOUND')){
    return 'O Firebase recusou as credenciais. Confira se o e-mail é exatamente o usuário criado em Authentication e redefina a senha se necessário.';
  }
  if(c.includes('OPERATION_NOT_ALLOWED')){
    return 'O provedor E-mail/senha não está habilitado no Firebase Authentication.';
  }
  if(c.includes('API_KEY_INVALID') || c.includes('API_KEY_NOT_VALID')){
    return 'A chave da API configurada no site não foi aceita pelo Firebase.';
  }
  if(c.includes('API_KEY_HTTP_REFERRER_BLOCKED') || c.includes('REQUEST_DENIED')){
    return 'A chave da API está bloqueando este domínio/origem. Será necessário revisar as restrições da chave no Google Cloud.';
  }
  if(c.includes('TOO_MANY_ATTEMPTS_TRY_LATER')){
    return 'O Firebase bloqueou temporariamente novas tentativas por excesso de logins. Aguarde alguns minutos e tente novamente.';
  }
  if(c.includes('USER_DISABLED')){
    return 'Esse usuário está desativado no Firebase Authentication.';
  }
  if(c.includes('NETWORK_REQUEST_FAILED') || c.includes('FAILED TO FETCH') || c.includes('LOAD FAILED')){
    return 'O navegador não conseguiu alcançar o serviço do Firebase. Pode ser conexão, bloqueador, DNS, extensão do navegador ou política de rede.';
  }
  if(c.includes('PROJECT_NOT_FOUND')){
    return 'O projeto configurado no app não foi encontrado.';
  }
  return 'O Firebase devolveu um erro específico. Use o código abaixo para identificarmos a causa exata.';
}
function setCloudDiagnostic(err=null, successMessage=''){
  const box=$('cloudDiagnostic');
  if(!box) return;
  if(!err && !successMessage){ box.classList.add('hidden'); return; }

  const cfg=window.OLIVEIRA_FIREBASE_CONFIG||{};
  const code=err ? String(err.code||err.message||'ERRO_DESCONHECIDO') : 'OK';
  const http=err ? String(err.httpStatus ?? '—') : '200';
  const explanation=err ? firebaseErrorExplanation(code) : successMessage;

  $('cloudDiagnosticTitle').textContent=err?'Falha ao conectar ao Firebase':'Firebase conectado';
  $('cloudDiagnosticMessage').textContent=explanation;
  $('cloudDiagnosticCode').textContent=code;
  $('cloudDiagnosticHttp').textContent=http;
  $('cloudDiagnosticProject').textContent=cfg.projectId||'—';
  $('cloudDiagnosticOrigin').textContent=location.origin;
  box.classList.toggle('success',!err);
  box.classList.remove('hidden');
}
function diagnosticText(){
  return [
    'Oliveira Frota — Diagnóstico Firebase',
    `Código: ${$('cloudDiagnosticCode')?.textContent||'—'}`,
    `HTTP: ${$('cloudDiagnosticHttp')?.textContent||'—'}`,
    `Projeto: ${$('cloudDiagnosticProject')?.textContent||'—'}`,
    `Origem: ${$('cloudDiagnosticOrigin')?.textContent||'—'}`,
    `Mensagem: ${$('cloudDiagnosticMessage')?.textContent||'—'}`
  ].join('\\n');
}
$('copyDiagnosticBtn')?.addEventListener('click',async()=>{
  try{
    await navigator.clipboard.writeText(diagnosticText());
    showToast('Diagnóstico copiado.');
  }catch{
    showToast('Não foi possível copiar. Tire uma captura desta tela.');
  }
});

$('cloudLoginForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const adapter=window.OLIVEIRA_CLOUD_ADAPTER;
  if(!adapter?.isConfigured?.()) return showToast('Configure o Firebase primeiro.');
  const email=$('cloudEmail').value.trim();
  const password=$('cloudPassword').value;
  if(!email || !password) return showToast('Informe e-mail e senha.');
  const btn=$('cloudLoginBtn');
  btn.disabled=true; btn.textContent='Conectando...';
  try{
    setCloudDiagnostic(null,'');
    await adapter.signIn(email,password);
    $('cloudPassword').value='';
    updateSyncUI();
    setCloudDiagnostic(null,'Login aceito pelo Firebase. Agora o app pode sincronizar os dados.');
    showToast('Nuvem conectada.');
    await attemptCloudSync(false);
  }catch(err){
    console.error('Firebase login diagnostic:',err);
    setCloudDiagnostic(err);
    const msg=String(err?.code||err?.message||'');
    if(msg.includes('INVALID_LOGIN_CREDENTIALS') || msg.includes('INVALID_PASSWORD') || msg.includes('EMAIL_NOT_FOUND')) showToast('E-mail ou senha inválidos.');
    else if(msg.includes('USER_DISABLED')) showToast('Usuário Firebase desativado.');
    else if(msg.includes('NETWORK_REQUEST_FAILED') || msg.includes('Failed to fetch')) showToast('Falha de rede ao acessar o Firebase.');
    else showToast(`Firebase: ${msg || 'erro desconhecido'}`);
  }finally{
    btn.disabled=false; btn.textContent='Conectar nuvem'; updateSyncUI();
  }
});
$('cloudLogoutBtn')?.addEventListener('click',()=>{
  window.OLIVEIRA_CLOUD_ADAPTER?.signOut?.();
  setCloudDiagnostic(null,'');
  updateSyncUI();
  showToast('Conta da nuvem desconectada.');
});

$('dataBtn')?.addEventListener('click',()=>{ updateSyncUI(); $('dataDialog').showModal(); });
$('closeDataDialog').addEventListener('click',()=>$('dataDialog').close());
$('dataDialog').addEventListener('click',e=>{ if(e.target===$('dataDialog')) $('dataDialog').close(); });
$('exportBackupBtn').addEventListener('click',exportBackup);
$('importBackupBtn').addEventListener('click',()=>$('importBackupFile').click());
$('importBackupFile').addEventListener('change',async e=>{ const file=e.target.files?.[0]; if(file) await importBackup(file); e.target.value=''; });
$('syncNowBtn').addEventListener('click',()=>attemptCloudSync(true));

async function clearTestData(){
  if(!navigator.onLine){
    showToast('Conecte o aparelho à internet antes de limpar os dados de teste.');
    return;
  }
  if(!cloudConfigured() || !cloudAuthenticated()){
    showToast('Conecte o Firebase antes de limpar os dados de teste.');
    return;
  }

  // Primeiro traz para este aparelho qualquer dado de teste que esteja na nuvem.
  const synced=await attemptCloudSync(false);
  if(!synced){
    showToast('Não foi possível conferir a nuvem. Tente sincronizar novamente.');
    return;
  }

  const vehicleCount=managedVehicles().length;
  const recordCount=correctionRecords().length;
  const oilCount=state.oilChanges.filter(o=>!o.deletedAt).length;
  const total=vehicleCount+recordCount+oilCount;

  if(total===0){
    showToast('Não há dados de teste para limpar.');
    return;
  }

  const first=confirm(
    `ATENÇÃO\n\nSerão removidos da operação:\n`+
    `• ${vehicleCount} veículo(s)\n`+
    `• ${recordCount} abastecimento(s)\n`+
    `• ${oilCount} troca(s) de óleo\n\n`+
    `O login, Firebase e configurações do app serão preservados.\n\n`+
    `Antes de continuar, é recomendável ter um backup. Deseja prosseguir?`
  );
  if(!first) return;

  const typed=prompt('Para confirmar a limpeza dos dados de teste, digite exatamente: LIMPAR');
  if(String(typed||'').trim().toUpperCase()!=='LIMPAR'){
    showToast('Limpeza cancelada.');
    return;
  }

  // Faz uma cópia local imediatamente antes da limpeza.
  exportBackup();

  const now=new Date().toISOString();
  const enqueue=(entityType,obj)=>{
    state.syncQueue=state.syncQueue.filter(q=>!(q.entityType===entityType && q.entityId===obj.id));
    state.syncQueue.push({id:uuid(),entityType,entityId:obj.id,updatedAt:now});
  };

  for(const v of state.vehicles){
    if(v.deletedAt) continue;
    v.deletedAt=now;
    v.updatedAt=now;
    enqueue('vehicle',v);
  }
  for(const r of state.records){
    if(r.deletedAt) continue;
    r.deletedAt=now;
    r.updatedAt=now;
    enqueue('record',r);
  }
  for(const o of state.oilChanges){
    if(o.deletedAt) continue;
    o.deletedAt=now;
    o.updatedAt=now;
    enqueue('oilChange',o);
  }

  state.currentVehicleId=null;
  state.meta.lastLocalChange=now;
  state.meta.testDataClearedAt=now;
  save();
  refreshAllViews();
  updateSyncUI();

  const cloudOk=await attemptCloudSync(false);
  if(cloudOk){
    showToast('Dados de teste limpos. O app está pronto para os veículos reais.');
  }else{
    showToast('Dados limpos neste aparelho. Há alterações pendentes para sincronizar.');
  }
}

$('clearTestDataBtn')?.addEventListener('click',clearTestData);
window.addEventListener('online',()=>{ updateSyncUI(); attemptCloudSync(false); showToast('Internet disponível novamente.'); });
window.addEventListener('offline',()=>{ updateSyncUI(); showToast('Modo offline ativado.'); });


$('deviceOwnerMenuBtn')?.addEventListener('click',()=>openDeviceOwnerDialog({required:false}));
$('deviceOwnerCancelBtn')?.addEventListener('click',()=>$('deviceOwnerDialog')?.close());
$('deviceOwnerDialog')?.addEventListener('cancel',e=>{
  if($('deviceOwnerDialog')?.dataset.required==='1') e.preventDefault();
});
$('deviceOwnerForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const name=$('deviceOwnerNameInput').value.trim().replace(/\s+/g,' ');
  if(name.length<2) return showToast('Informe o nome de quem usa este aparelho.');
  const wasMissing=!deviceOwnerName();
  localStorage.setItem(DEVICE_OWNER_KEY,name);
  deviceId();
  updateDeviceOwnerMenu();
  $('deviceOwnerDialog').dataset.required='0';
  $('deviceOwnerDialog').close();
  showToast(`Aparelho identificado para ${name}.`);
  if(wasMissing) setTimeout(offerInstallOnFirstVisit,350);
});

const INSTALL_OFFER_KEY='oliveira_frota_install_offer_seen_v1';

function playOpeningSplash(){
  const splash=$('openingSplash');
  if(!splash) return;
  document.body.classList.add('splash-lock');
  splash.classList.remove('fade-out');
  splash.removeAttribute('hidden');

  setTimeout(()=>{
    splash.classList.add('fade-out');
    document.body.classList.remove('splash-lock');
  },1450);

  setTimeout(()=>{
    splash.setAttribute('hidden','hidden');
  },1950);
}


function isStandaloneApp(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
}
function isIOSDevice(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
}
function isAndroidDevice(){
  return /android/i.test(navigator.userAgent);
}
function isMobileDevice(){
  return isIOSDevice() || isAndroidDevice() || window.matchMedia('(max-width: 760px)').matches;
}
function setInstallArea(id,show){
  const el=$(id);
  if(el) el.classList.toggle('hidden',!show);
}
function updateInstallUI(){
  const installed=isStandaloneApp();
  const menuBtn=$('menuInstallBtn');
  const adminBtn=$('installBtn');

  if(menuBtn){
    menuBtn.classList.toggle('hidden',installed);
    const help=$('menuInstallHelp');
    if(help){
      help.textContent=installed
        ? 'Aplicativo já instalado'
        : isIOSDevice()
          ? 'Adicionar à Tela de Início no iPhone'
          : 'Colocar o Oliveira Frota no celular';
    }
  }
  if(adminBtn){
    adminBtn.classList.toggle('hidden',installed || (!state.deferredPrompt && !isIOSDevice()));
  }

  if(!$('installDialog')) return;
  setInstallArea('installNativeArea',Boolean(state.deferredPrompt) && !installed);
  setInstallArea('installIosArea',isIOSDevice() && !installed);
  setInstallArea('installAndroidHelp',isAndroidDevice() && !state.deferredPrompt && !installed);
  setInstallArea('installDesktopHelp',!isMobileDevice() && !state.deferredPrompt && !installed);

  if($('installDialogTitle')){
    $('installDialogTitle').textContent=isIOSDevice()
      ? 'Instalar no iPhone'
      : isAndroidDevice()
        ? 'Instalar no Android'
        : 'Instalar aplicativo';
  }
}
function openInstallDialog({automatic=false}={}){
  if(isStandaloneApp()){
    if(!automatic) showToast('O Oliveira Frota já está instalado neste aparelho.');
    return;
  }
  updateInstallUI();
  const dlg=$('installDialog');
  if(dlg && !dlg.open) dlg.showModal();
}
async function runNativeInstall(){
  if(!state.deferredPrompt){
    updateInstallUI();
    if(isIOSDevice()) return;
    showToast('Use a opção “Instalar app” do menu do navegador.');
    return;
  }
  const promptEvent=state.deferredPrompt;
  state.deferredPrompt=null;
  promptEvent.prompt();
  const choice=await promptEvent.userChoice.catch(()=>null);
  updateInstallUI();
  if(choice?.outcome==='accepted'){
    localStorage.setItem(INSTALL_OFFER_KEY,'1');
    $('installDialog')?.close();
    showToast('Instalação iniciada.');
  }
}

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  state.deferredPrompt=e;
  updateInstallUI();

  // Na primeira visita ao celular, abre a oferta assim que o navegador
  // disponibilizar a instalação nativa.
  if(!isStandaloneApp() && isMobileDevice() && !localStorage.getItem(INSTALL_OFFER_KEY)){
    localStorage.setItem(INSTALL_OFFER_KEY,'1');
    setTimeout(()=>openInstallDialog({automatic:true}),350);
  }
});

window.addEventListener('appinstalled',()=>{
  state.deferredPrompt=null;
  localStorage.setItem(INSTALL_OFFER_KEY,'1');
  $('installDialog')?.close();
  updateInstallUI();
  showToast('Oliveira Frota instalado.');
});

$('menuInstallBtn')?.addEventListener('click',()=>openInstallDialog());
$('installBtn')?.addEventListener('click',()=>openInstallDialog());
$('installActionBtn')?.addEventListener('click',runNativeInstall);
$('closeInstallDialog')?.addEventListener('click',()=>$('installDialog').close());
$('installLaterBtn')?.addEventListener('click',()=>{
  localStorage.setItem(INSTALL_OFFER_KEY,'1');
  $('installDialog').close();
});
$('installDialog')?.addEventListener('click',e=>{
  if(e.target===$('installDialog')){
    localStorage.setItem(INSTALL_OFFER_KEY,'1');
    $('installDialog').close();
  }
});

function offerInstallOnFirstVisit(){
  if(isStandaloneApp() || !isMobileDevice() || localStorage.getItem(INSTALL_OFFER_KEY)) return;

  // iPhone não dispara beforeinstallprompt. Por isso a orientação
  // aparece automaticamente no primeiro acesso.
  if(isIOSDevice()){
    localStorage.setItem(INSTALL_OFFER_KEY,'1');
    setTimeout(()=>openInstallDialog({automatic:true}),900);
    return;
  }

  // No Android damos um pequeno tempo para o beforeinstallprompt chegar.
  setTimeout(()=>{
    if(isStandaloneApp() || localStorage.getItem(INSTALL_OFFER_KEY)) return;
    localStorage.setItem(INSTALL_OFFER_KEY,'1');
    openInstallDialog({automatic:true});
  },1800);
}

// ===== Atualização automática do PWA =====
const OLIVEIRA_APP_VERSION='30';

function registerAutoUpdatingServiceWorker(){
  if(!('serviceWorker' in navigator)) return;

  window.addEventListener('load',async()=>{
    try{
      const alreadyControlled=Boolean(navigator.serviceWorker.controller);
      let reloadingForUpdate=false;

      // Quando uma versão nova assume o controle, recarrega uma única vez.
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(!alreadyControlled || reloadingForUpdate) return;
        reloadingForUpdate=true;
        window.location.reload();
      });

      const registration=await navigator.serviceWorker.register(
        `service-worker.js?v=${OLIVEIRA_APP_VERSION}`,
        {updateViaCache:'none'}
      );

      const activateWorker=worker=>{
        if(!worker) return;
        worker.addEventListener('statechange',()=>{
          if(worker.state==='installed' && navigator.serviceWorker.controller){
            worker.postMessage({type:'SKIP_WAITING'});
          }
        });
      };

      if(registration.installing) activateWorker(registration.installing);

      registration.addEventListener('updatefound',()=>{
        activateWorker(registration.installing);
      });

      if(registration.waiting && navigator.serviceWorker.controller){
        registration.waiting.postMessage({type:'SKIP_WAITING'});
      }

      const checkForUpdate=async()=>{
        if(!navigator.onLine) return;
        try{
          await registration.update();
        }catch(err){
          console.warn('Verificação de atualização indisponível:',err);
        }
      };

      // Verifica sempre ao abrir.
      await checkForUpdate();

      // Também verifica ao retornar ao app e quando a internet volta.
      window.addEventListener('pageshow',checkForUpdate);
      window.addEventListener('online',checkForUpdate);
      document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='visible') checkForUpdate();
      });
    }catch(err){
      console.warn('Service Worker indisponível:',err);
    }
  });
}
registerAutoUpdatingServiceWorker();

load();
ensurePresentationDemoData();
playOpeningSplash();
updateSyncUI();
updateInstallUI();
renderHome();
renderVehicleOptions();
const ownerRequired=promptDeviceOwnerIfNeeded();
if(!ownerRequired) offerInstallOnFirstVisit();
if(navigator.onLine) setTimeout(()=>attemptCloudSync(false),250);
setInterval(()=>{ if(navigator.onLine && cloudConfigured() && cloudAuthenticated()) attemptCloudSync(false); },60000);
const initialHash=location.hash.replace('#','');
const initialView=APP_VIEWS.includes(initialHash)?initialHash:'home';

// Mantém uma entrada-base e uma entrada ativa do app.
// A entrada-base permite que o botão Voltar feche um modal aberto na tela inicial
// sem mandar o usuário imediatamente para fora do PWA.
history.replaceState({oliveiraView:initialView,oliveiraBase:true},'',`#${initialView}`);
applyView(initialView);
history.pushState({oliveiraView:initialView,oliveiraGuard:true},'',`#${initialView}`);

// ===== Relatório em PDF por período =====
function monthStartISO(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
function renderPdfVehicleOptions(){
  const sel=$('pdfVehicle');
  sel.innerHTML='<option value="">Todos os veículos</option>'+managedVehicles()
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
    .map(v=>`<option value="${v.id}">${escapeHTML(v.name)} — ${escapeHTML(v.plate)}</option>`).join('');
}
$('openPdfDialog').addEventListener('click',()=>{
  renderPdfVehicleOptions();
  $('pdfStartDate').value=monthStartISO();
  $('pdfEndDate').value=todayISO();
  $('pdfVehicle').value='';
  $('pdfDialog').showModal();
});
$('closePdfDialog').addEventListener('click',()=>$('pdfDialog').close());
$('pdfDialog').addEventListener('click',e=>{
  if(e.target===$('pdfDialog')) $('pdfDialog').close();
});
let currentPdfPreview=null;

function clearCurrentPdfPreview(){
  if(currentPdfPreview?.url){
    URL.revokeObjectURL(currentPdfPreview.url);
  }
  currentPdfPreview=null;
  const content=$('pdfPreviewContent');
  if(content) content.innerHTML='';
}
function downloadCurrentPdf(){
  if(!currentPdfPreview) return showToast('Gere o relatório primeiro.');
  const a=document.createElement('a');
  a.href=currentPdfPreview.url;
  a.download=currentPdfPreview.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Download do PDF iniciado.');
}
async function shareCurrentPdf(){
  if(!currentPdfPreview) return showToast('Gere o relatório primeiro.');

  try{
    const file=new File(
      [currentPdfPreview.blob],
      currentPdfPreview.fileName,
      {type:'application/pdf'}
    );

    if(!navigator.share){
      showToast('Este navegador não permite compartilhar arquivos. Use “Baixar PDF”.');
      return;
    }

    if(navigator.canShare && !navigator.canShare({files:[file]})){
      showToast('Este navegador não permite compartilhar o PDF diretamente. Use “Baixar PDF”.');
      return;
    }

    await navigator.share({
      title:'Relatório Oliveira Frota',
      text:currentPdfPreview.shareText,
      files:[file]
    });
  }catch(err){
    if(err?.name==='AbortError') return;
    console.error(err);
    showToast('Não foi possível compartilhar o PDF. Você pode usar “Baixar PDF”.');
  }
}


function renderPdfPreview(list,start,end,vehicle){
  const host=$('pdfPreviewContent');
  if(!host) return;

  const vehicleLabel=vehicle ? `${vehicle.name} - ${vehicle.plate}` : 'Todos os veículos';
  const rows=list.map(r=>{
    const oil=r.oil ? Number(r.oil).toLocaleString('pt-BR') : '—';
    const operator=recordOperator(r);
    return {
      vehicle:r.vehicle||'—',
      plate:r.plate||'—',
      odometer:Number(r.odometer).toLocaleString('pt-BR'),
      quantity:fmtConsumptionValue(r.quantity),
      date:fmtDate(r.date),
      oil,
      operator
    };
  });

  const desktopRows=rows.map(r=>`
    <tr>
      <td>${escapeHTML(r.vehicle)}</td>
      <td>${escapeHTML(r.plate)}</td>
      <td>${escapeHTML(r.odometer)}</td>
      <td>${escapeHTML(r.quantity)}</td>
      <td>${escapeHTML(r.date)}</td>
      <td>${escapeHTML(r.oil)}</td>
      <td>${escapeHTML(r.operator)}</td>
    </tr>`).join('');

  const mobileCards=rows.map((r,i)=>`
    <article class="pdf-mobile-record">
      <div class="pdf-mobile-record-head">
        <div>
          <span>Registro ${i+1}</span>
          <strong>${escapeHTML(r.vehicle)}</strong>
        </div>
        <b>${escapeHTML(r.plate)}</b>
      </div>
      <div class="pdf-mobile-record-grid">
        <div><span>Odômetro</span><strong>${escapeHTML(r.odometer)} km</strong></div>
        <div><span>Quant. por litro</span><strong>${escapeHTML(r.quantity)}</strong></div>
        <div><span>Data</span><strong>${escapeHTML(r.date)}</strong></div>
        <div><span>Troca de óleo</span><strong>${escapeHTML(r.oil)}${r.oil==='—'?'':' km'}</strong></div>
        <div class="pdf-mobile-operator"><span>Responsável</span><strong>${escapeHTML(r.operator)}</strong></div>
      </div>
    </article>`).join('');

  host.innerHTML=`
    <section class="pdf-screen-report">
      <header class="pdf-screen-report-head">
        <div class="pdf-screen-gold-line"></div>
        <div class="pdf-screen-head-row">
          <div>
            <h4>Oliveira Paisagismo e Locação</h4>
            <strong>Controle de Veículos</strong>
          </div>
          <div class="pdf-screen-count">Registros: <b>${rows.length}</b></div>
        </div>
        <div class="pdf-screen-meta">
          <span>Período: <b>${fmtDate(start)} a ${fmtDate(end)}</b></span>
          <span>Veículo: <b>${escapeHTML(vehicleLabel)}</b></span>
        </div>
      </header>

      <div class="pdf-desktop-preview">
        <div class="pdf-screen-table-wrap">
          <table class="pdf-screen-table">
            <thead>
              <tr>
                <th>Veículo</th>
                <th>Placa</th>
                <th>Odômetro</th>
                <th>Quant. por litro</th>
                <th>Data</th>
                <th>Troca de óleo</th>
                <th>Responsável</th>
              </tr>
            </thead>
            <tbody>${desktopRows}</tbody>
          </table>
        </div>
      </div>

      <div class="pdf-mobile-preview">
        ${mobileCards}
      </div>
    </section>`;
}

$('pdfForm').addEventListener('submit',e=>{
  e.preventDefault();
  const start=$('pdfStartDate').value;
  const end=$('pdfEndDate').value;
  const vehicleId=$('pdfVehicle').value;

  if(!start || !end) return showToast('Informe o período do relatório.');
  if(start>end) return showToast('A data inicial não pode ser maior que a final.');

  const list=visibleRecords().slice()
    .filter(r=>r.date>=start && r.date<=end && (!vehicleId || r.vehicleId===vehicleId))
    .sort((a,b)=>(a.date+(a.createdAt||'')).localeCompare(b.date+(b.createdAt||'')));

  if(!list.length) return showToast('Não há registros nesse período.');

  const vehicle=vehicleId ? getVehicle(vehicleId) : null;

  try{
    const bytes=buildFleetPdf(list,start,end,vehicle);
    const blob=new Blob([bytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob);
    const fileName=`Oliveira_Frota_${fileDate(start)}_a_${fileDate(end)}${vehicle?`_${safeFilePart(vehicle.plate)}`:''}.pdf`;
    const vehicleLabel=vehicle ? `${vehicle.name} - ${vehicle.plate}` : 'Todos os veículos';

    clearCurrentPdfPreview();
    currentPdfPreview={
      blob,
      url,
      fileName,
      shareText:`Oliveira Frota - ${fmtDate(start)} a ${fmtDate(end)} - ${vehicleLabel}`
    };

    renderPdfPreview(list,start,end,vehicle);
    $('pdfPreviewSubtitle').textContent=`${fmtDate(start)} a ${fmtDate(end)} • ${vehicleLabel} • ${list.length} registro(s)`;
    $('pdfDialog').close();
    $('pdfPreviewDialog').showModal();
  }catch(err){
    console.error(err);
    showToast('Não foi possível gerar o PDF.');
  }
});

$('closePdfPreviewDialog')?.addEventListener('click',()=>{
  $('pdfPreviewDialog').close();
  setTimeout(clearCurrentPdfPreview,120);
});
$('pdfPreviewDialog')?.addEventListener('click',e=>{
  if(e.target===$('pdfPreviewDialog')){
    $('pdfPreviewDialog').close();
    setTimeout(clearCurrentPdfPreview,120);
  }
});
$('downloadPdfBtn')?.addEventListener('click',downloadCurrentPdf);
$('sharePdfBtn')?.addEventListener('click',shareCurrentPdf);


function fileDate(iso){
  const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`;
}
function safeFilePart(s){ return String(s||'').replace(/[^A-Za-z0-9_-]+/g,'_'); }
function pdfEsc(text){
  const map={
    '€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,
    'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,
    'œ':156,'ž':158,'Ÿ':159
  };
  let out='';
  for(const ch of String(text??'')){
    const cp=ch.codePointAt(0);
    if(ch==='\\') out+='\\\\';
    else if(ch==='(') out+='\\(';
    else if(ch===')') out+='\\)';
    else if(cp>=32 && cp<=126) out+=ch;
    else {
      const b=(cp>=160 && cp<=255) ? cp : map[ch];
      out += Number.isInteger(b) ? `\\${b.toString(8).padStart(3,'0')}` : '?';
    }
  }
  return out;
}
function pdfNum(n){ return Number(n).toFixed(2).replace(/\.00$/,''); }
function rgb255(hex){
  const h=hex.replace('#','');
  return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255];
}
function pdfColor(hex,stroke=false){
  const [r,g,b]=rgb255(hex); return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} ${stroke?'RG':'rg'}\n`;
}
function truncateText(s,max){
  s=String(s??''); return s.length>max ? `${s.slice(0,Math.max(1,max-1))}…` : s;
}
function buildFleetPdf(records,start,end,vehicle){
  const PW=841.89, PH=595.28, M=30;
  const wine='#8F2E2F', gold='#C8922E', ink='#232323', muted='#666666', line='#D3D3D3', alt='#F5F5F5';
  const rowsPerPage=24;
  const pages=[];
  const totalPages=Math.ceil(records.length/rowsPerPage);
  const colWidths=[142,76,94,112,86,132,140];
  const headers=['Veículo','Placa','Odômetro','Quant. por litro','Data','Troca de óleo','Responsável'];
  const xPositions=[M]; colWidths.forEach(w=>xPositions.push(xPositions[xPositions.length-1]+w));
  const topToY=t=>PH-t;
  const txt=(text,x,top,size=9,bold=false,color=ink)=>`${pdfColor(color)}BT /${bold?'F2':'F1'} ${size} Tf ${pdfNum(x)} ${pdfNum(topToY(top))} Td (${pdfEsc(text)}) Tj ET\n`;
  const rect=(x,top,w,h,fill)=>`${pdfColor(fill)}${pdfNum(x)} ${pdfNum(PH-top-h)} ${pdfNum(w)} ${pdfNum(h)} re f\n`;
  const hline=(x1,x2,top,color=line,width=.5)=>`${pdfColor(color,true)}${width} w ${pdfNum(x1)} ${pdfNum(topToY(top))} m ${pdfNum(x2)} ${pdfNum(topToY(top))} l S\n`;
  const vline=(x,top1,top2,color=line,width=.5)=>`${pdfColor(color,true)}${width} w ${pdfNum(x)} ${pdfNum(topToY(top1))} m ${pdfNum(x)} ${pdfNum(topToY(top2))} l S\n`;
  const vehicleLabel=vehicle ? `${vehicle.name} - ${vehicle.plate}` : 'Todos os veículos';

  for(let p=0;p<totalPages;p++){
    const slice=records.slice(p*rowsPerPage,(p+1)*rowsPerPage);
    let c='';
    c+=rect(M,22,PW-2*M,4,gold);
    c+=txt('Oliveira Paisagismo e Locação',M,50,17,true,ink);
    c+=txt('Controle de Veículos',M,69,10,true,wine);
    c+=txt(`Período: ${fmtDate(start)} a ${fmtDate(end)}`,M,91,9,false,muted);
    c+=txt(`Veículo: ${vehicleLabel}`,M,106,9,false,muted);
    c+=txt(`Registros: ${records.length}`,PW-M-92,91,9,true,ink);

    const tableTop=122, headH=24, rowH=17.2, tableW=colWidths.reduce((a,b)=>a+b,0);
    c+=rect(M,tableTop,tableW,headH,wine);
    for(let i=0;i<headers.length;i++){
      c+=txt(headers[i],xPositions[i]+6,tableTop+16,8,true,'#FFFFFF');
    }
    slice.forEach((r,i)=>{
      const top=tableTop+headH+i*rowH;
      if(i%2===1) c+=rect(M,top,tableW,rowH,alt);
      const vals=[
        truncateText(r.vehicle,25),
        truncateText(r.plate,12),
        Number(r.odometer).toLocaleString('pt-BR'),
        truncateText(fmtConsumptionValue(r.quantity),22),
        fmtDate(r.date),
        r.oil ? Number(r.oil).toLocaleString('pt-BR') : '—',
        truncateText(recordOperator(r),22)
      ];
      for(let k=0;k<vals.length;k++) c+=txt(vals[k],xPositions[k]+6,top+11.8,8,false,ink);
      c+=hline(M,M+tableW,top+rowH,line,.45);
    });
    const tableBottom=tableTop+headH+slice.length*rowH;
    for(const x of xPositions) c+=vline(x,tableTop,tableBottom,line,.45);
    c+=vline(M+tableW,tableTop,tableBottom,line,.45);
    c+=hline(M,M+tableW,tableTop,line,.45);
    c+=hline(M,M+tableW,tableTop+headH,line,.45);

    c+=hline(M,PW-M,PH-25,gold,.7);
    c+=txt(`Página ${p+1} de ${totalPages}`,PW-M-76,PH-12,7,false,muted);
    pages.push(c);
  }

  const objects=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  const pageIds=[];
  for(let i=0;i<pages.length;i++) pageIds.push(5+i*2);
  objects[2]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((stream,i)=>{
    const pageId=5+i*2, contentId=pageId+1;
    objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNum(PW)} ${pdfNum(PH)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId]=`<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
  });

  let pdf='%PDF-1.4\n%OLIVEIRA\n';
  const offsets=[0];
  for(let i=1;i<objects.length;i++){
    offsets[i]=pdf.length;
    pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++) pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
