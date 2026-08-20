const KEYS = { vehicles: 'oliveira_frota_vehicles_v1', records: 'oliveira_frota_records_v1', queue: 'oliveira_frota_sync_queue_v1', meta: 'oliveira_frota_meta_v1' };
const state = { vehicles: [], records: [], syncQueue: [], meta: {}, currentVehicleId: null, deferredPrompt: null, syncing: false };

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

function load(){
  try { state.vehicles = JSON.parse(localStorage.getItem(KEYS.vehicles)) || []; } catch { state.vehicles = []; }
  try { state.records = JSON.parse(localStorage.getItem(KEYS.records)) || []; } catch { state.records = []; }
  try { state.syncQueue = JSON.parse(localStorage.getItem(KEYS.queue)) || []; } catch { state.syncQueue = []; }
  try { state.meta = JSON.parse(localStorage.getItem(KEYS.meta)) || {}; } catch { state.meta = {}; }
}
function save(){
  localStorage.setItem(KEYS.vehicles, JSON.stringify(state.vehicles));
  localStorage.setItem(KEYS.records, JSON.stringify(state.records));
  localStorage.setItem(KEYS.queue, JSON.stringify(state.syncQueue));
  localStorage.setItem(KEYS.meta, JSON.stringify(state.meta));
}
function queueChange(entityType, entityId){
  const now=new Date().toISOString();
  const target = entityType==='vehicle'
    ? state.vehicles.find(v=>v.id===entityId)
    : entityType==='record'
      ? state.records.find(r=>r.id===entityId)
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
  $('recordOdometer').value='';
  $('recordLiters').value='';
  $('recordQuantity').value='';
  $('recordWarning').classList.add('hidden');
  const selectedId=vehicleId || state.currentVehicleId || $('recordVehicle').value;
  const r=lastRecord(selectedId);
  $('recordOil').value=r?.oil || '';
  updateConsumption();
}
$('recordVehicle').addEventListener('change',()=>{
  updatePlate();
  const r=lastRecord($('recordVehicle').value);
  $('recordOil').value=r?.oil || '';
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
  const out=$('recordQuantity'), help=$('recordConsumptionHelp');
  out.value='';
  help.classList.remove('consumption-ready');
  help.classList.add('consumption-pending');
  if(!vid){ help.textContent='Selecione um veículo para calcular o consumo.'; return null; }
  if(!prev){ help.textContent='Primeiro registro do veículo: o consumo será calculado a partir do próximo abastecimento.'; return null; }
  if(odoRaw==='' || litersRaw==='' || !Number.isFinite(odo) || !Number.isFinite(liters) || liters<=0){
    help.textContent='Informe o odômetro atual e os litros abastecidos.'; return null;
  }
  const distance=odo-Number(prev.odometer);
  if(distance<=0){ help.textContent='O odômetro atual precisa ser maior que o último registro.'; return null; }
  const kmL=distance/liters;
  out.value=kmL.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  help.textContent=`Cálculo: ${distance.toLocaleString('pt-BR')} km ÷ ${liters.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} L = ${kmL.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} km/l.`;
  help.classList.remove('consumption-pending');
  help.classList.add('consumption-ready');
  return kmL;
}
$('recordForm').addEventListener('submit',e=>{
  e.preventDefault();
  const v=getVehicle($('recordVehicle').value); if(!v) return showToast('Selecione um veículo.');
  const odo=Number($('recordOdometer').value);
  const liters=Number($('recordLiters').value);
  const prev=lastRecord(v.id);
  if(!Number.isFinite(liters) || liters<=0) return showToast('Informe os litros abastecidos.');
  if(prev && odo <= Number(prev.odometer)) return showToast('O odômetro deve ser maior que o último registro.');
  const consumption=updateConsumption();
  const record={
    id:uuid(), vehicleId:v.id, vehicle:v.name, plate:v.plate,
    odometer:odo, liters, quantity:consumption===null?'':consumption.toFixed(2), date:$('recordDate').value,
    oil:Number($('recordOil').value), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
  };
  state.records.push(record);
  queueChange('record',record.id); e.target.reset(); state.currentVehicleId=v.id;
  showToast(consumption===null?'Primeiro abastecimento salvo. O consumo será calculado no próximo.':'Abastecimento salvo com consumo calculado.');
  renderHome(); prepRecord(v.id);
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
      <div class="detail-box"><span>Litros abastecidos</span><strong>${r?fmtLiters(r.liters):'—'}</strong></div>
      <div class="detail-box"><span>Quant. por litro</span><strong>${r?escapeHTML(fmtConsumption(r.quantity)):'—'}</strong></div>
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
  const now=new Date().toISOString();
  const vehicle={id:uuid(),name,plate,createdAt:now,updatedAt:now}; state.vehicles.push(vehicle); queueChange('vehicle',vehicle.id); $('vehicleDialog').close(); e.target.reset(); renderVehicles(); renderHome(); showToast('Veículo cadastrado.');
});
$('vehiclePlate').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));

function historyCard(r){
  return `<article class="list-card">
    <div class="list-card-main"><h4>${escapeHTML(r.vehicle)} <span class="plate">${escapeHTML(r.plate)}</span></h4><p>${fmtDate(r.date)}</p></div>
    <div class="history-values">
      <div><span class="muted">Odômetro</span><strong>${fmtKm(r.odometer)}</strong></div>
      <div><span class="muted">Litros</span><strong>${fmtLiters(r.liters)}</strong></div>
      <div><span class="muted">Quant./litro</span><strong>${escapeHTML(fmtConsumption(r.quantity))}</strong></div>
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
  if(badge){ badge.classList.toggle('offline',!online); $('connectionText').textContent=online?'Online':'Offline'; }
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
  renderHome(); renderVehicles(); renderHistory(); renderOil(); renderVehicleOptions(state.currentVehicleId||'');
}
function exportBackup(){
  const backup={
    app:'Oliveira Frota', backupVersion:1, exportedAt:new Date().toISOString(),
    vehicles:state.vehicles, records:state.records
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
  return data && Array.isArray(data.vehicles) && Array.isArray(data.records);
}
async function importBackup(file){
  try{
    const text=await file.text(); const data=JSON.parse(text);
    if(!validBackup(data)) return showToast('Arquivo de backup inválido.');
    if(!confirm(`Restaurar ${data.vehicles.length} veículo(s) e ${data.records.length} registro(s)? Os dados atuais serão substituídos.`)) return;
    const now=new Date().toISOString();
    state.vehicles=data.vehicles.map(v=>({...v,updatedAt:v.updatedAt||v.createdAt||now}));
    state.records=data.records.map(r=>({...r,updatedAt:r.updatedAt||r.createdAt||now}));
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
    const result=await adapter.sync({vehicles:state.vehicles,records:state.records,queue:state.syncQueue,meta:state.meta});
    if(result?.vehicles && Array.isArray(result.vehicles)) state.vehicles=result.vehicles;
    if(result?.records && Array.isArray(result.records)) state.records=result.records;
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

$('dataBtn').addEventListener('click',()=>{ updateSyncUI(); $('dataDialog').showModal(); });
$('closeDataDialog').addEventListener('click',()=>$('dataDialog').close());
$('dataDialog').addEventListener('click',e=>{ if(e.target===$('dataDialog')) $('dataDialog').close(); });
$('exportBackupBtn').addEventListener('click',exportBackup);
$('importBackupBtn').addEventListener('click',()=>$('importBackupFile').click());
$('importBackupFile').addEventListener('change',async e=>{ const file=e.target.files?.[0]; if(file) await importBackup(file); e.target.value=''; });
$('syncNowBtn').addEventListener('click',()=>attemptCloudSync(true));
window.addEventListener('online',()=>{ updateSyncUI(); attemptCloudSync(false); showToast('Internet disponível novamente.'); });
window.addEventListener('offline',()=>{ updateSyncUI(); showToast('Modo offline ativado.'); });

window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); state.deferredPrompt=e; $('installBtn').classList.remove('hidden'); });
$('installBtn').addEventListener('click',async()=>{ if(!state.deferredPrompt)return; state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt=null; $('installBtn').classList.add('hidden'); });

if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js?v=11').catch(()=>{})); }

load();
updateSyncUI();
renderHome();
renderVehicleOptions();
if(navigator.onLine) setTimeout(()=>attemptCloudSync(false),250);
setInterval(()=>{ if(navigator.onLine && cloudConfigured() && cloudAuthenticated()) attemptCloudSync(false); },60000);
const initial=location.hash.replace('#',''); if(['home','record','vehicles','history','oil'].includes(initial)) nav(initial); else nav('home');

// ===== Relatório em PDF por período =====
function monthStartISO(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
function renderPdfVehicleOptions(){
  const sel=$('pdfVehicle');
  sel.innerHTML='<option value="">Todos os veículos</option>'+state.vehicles
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
$('pdfForm').addEventListener('submit',e=>{
  e.preventDefault();
  const start=$('pdfStartDate').value;
  const end=$('pdfEndDate').value;
  const vehicleId=$('pdfVehicle').value;
  if(!start || !end) return showToast('Informe o período do relatório.');
  if(start>end) return showToast('A data inicial não pode ser maior que a final.');
  const list=[...state.records]
    .filter(r=>r.date>=start && r.date<=end && (!vehicleId || r.vehicleId===vehicleId))
    .sort((a,b)=>(a.date+a.createdAt).localeCompare(b.date+b.createdAt));
  if(!list.length) return showToast('Não há registros nesse período.');
  const vehicle=vehicleId ? getVehicle(vehicleId) : null;
  try{
    const bytes=buildFleetPdf(list,start,end,vehicle);
    const blob=new Blob([bytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`Oliveira_Frota_${fileDate(start)}_a_${fileDate(end)}${vehicle?`_${safeFilePart(vehicle.plate)}`:''}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    $('pdfDialog').close();
    showToast('PDF gerado com sucesso.');
  }catch(err){
    console.error(err);
    showToast('Não foi possível gerar o PDF.');
  }
});

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
  const colWidths=[164,92,115,150,105,156];
  const headers=['Veículo','Placa','Odômetro','Quant. por litro','Data','Troca de óleo'];
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
        Number(r.oil).toLocaleString('pt-BR')
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
