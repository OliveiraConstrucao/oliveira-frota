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
        truncateText(r.quantity,22),
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
