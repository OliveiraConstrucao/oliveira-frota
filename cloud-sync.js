// Oliveira Frota — Firebase Auth + Firestore REST
(() => {
  const AUTH_KEY = 'oliveira_frota_firebase_auth_v1';
  const cfg = () => window.OLIVEIRA_FIREBASE_CONFIG || {};
  const nowMs = () => Date.now();

  function getSession(){
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || null; }
    catch { return null; }
  }
  function setSession(session){
    if(session) localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    else localStorage.removeItem(AUTH_KEY);
  }
  function configured(){
    const c = cfg();
    return Boolean(c.apiKey && c.projectId && c.fleetId);
  }
  function authInfo(){
    const s = getSession();
    return {
      configured: configured(),
      authenticated: Boolean(s?.refreshToken || s?.idToken),
      email: s?.email || '',
      uid: s?.localId || ''
    };
  }
  async function jsonFetch(url, options={}){
    let res;
    try{
      res = await fetch(url, options);
    }catch(networkErr){
      const err = new Error(networkErr?.message || 'NETWORK_REQUEST_FAILED');
      err.code = 'NETWORK_REQUEST_FAILED';
      err.httpStatus = 0;
      err.endpoint = String(url).split('?')[0];
      err.kind = 'network';
      throw err;
    }

    const data = await res.json().catch(() => ({}));
    if(!res.ok){
      const msg = data?.error?.message || data?.error?.status || `HTTP_${res.status}`;
      const err = new Error(msg);
      err.code = msg;
      err.httpStatus = res.status;
      err.endpoint = String(url).split('?')[0];
      err.kind = 'firebase';
      err.response = data;
      throw err;
    }
    return data;
  }
  async function signIn(email, password){
    if(!configured()) throw new Error('Firebase não configurado.');
    const c = cfg();
    const data = await jsonFetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(c.apiKey)}`,
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email, password, returnSecureToken:true})
      }
    );
    const expiresAt = nowMs() + (Number(data.expiresIn || 3600) * 1000);
    setSession({
      idToken:data.idToken,
      refreshToken:data.refreshToken,
      expiresAt,
      email:data.email || email,
      localId:data.localId || ''
    });
    return authInfo();
  }
  function signOut(){
    setSession(null);
    return authInfo();
  }
  async function refreshSession(){
    const c = cfg();
    const s = getSession();
    if(!s?.refreshToken) throw new Error('LOGIN_REQUIRED');
    const body = new URLSearchParams({
      grant_type:'refresh_token',
      refresh_token:s.refreshToken
    });
    const data = await jsonFetch(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(c.apiKey)}`,
      {
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body
      }
    );
    const next = {
      idToken:data.id_token,
      refreshToken:data.refresh_token || s.refreshToken,
      expiresAt:nowMs() + (Number(data.expires_in || 3600) * 1000),
      email:s.email || '',
      localId:data.user_id || s.localId || ''
    };
    setSession(next);
    return next;
  }
  async function token(){
    const s = getSession();
    if(!s) throw new Error('LOGIN_REQUIRED');
    if(s.idToken && Number(s.expiresAt || 0) > nowMs() + 60000) return s.idToken;
    return (await refreshSession()).idToken;
  }

  function docBase(){
    const c = cfg();
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(c.projectId)}/databases/(default)/documents`;
  }
  function docUrl(collection, id){
    const c = cfg();
    return `${docBase()}/fleets/${encodeURIComponent(c.fleetId)}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
  }
  function collectionUrl(collection, pageToken=''){
    const c = cfg();
    let url = `${docBase()}/fleets/${encodeURIComponent(c.fleetId)}/${encodeURIComponent(collection)}?pageSize=1000`;
    if(pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    return url;
  }
  function normalizedUpdatedAt(obj){
    return obj?.updatedAt || obj?.createdAt || new Date(0).toISOString();
  }
  function toFirestoreDoc(obj){
    const payload = {...obj};
    if(!payload.updatedAt) payload.updatedAt = payload.createdAt || new Date().toISOString();
    return {
      fields:{
        payload:{stringValue:JSON.stringify(payload)},
        updatedAt:{timestampValue:payload.updatedAt}
      }
    };
  }
  function fromFirestoreDoc(doc){
    try{
      const raw = doc?.fields?.payload?.stringValue;
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(!obj.id){
        obj.id = String(doc.name || '').split('/').pop();
      }
      if(!obj.updatedAt){
        obj.updatedAt = doc?.fields?.updatedAt?.timestampValue || doc?.updateTime || obj.createdAt || new Date(0).toISOString();
      }
      return obj;
    }catch{
      return null;
    }
  }
  async function authedFetch(url, options={}){
    const idToken = await token();
    return jsonFetch(url, {
      ...options,
      headers:{
        ...(options.headers || {}),
        'Authorization':`Bearer ${idToken}`,
        'Content-Type':'application/json'
      }
    });
  }
  async function upsert(collection, obj){
    await authedFetch(docUrl(collection, obj.id), {
      method:'PATCH',
      body:JSON.stringify(toFirestoreDoc(obj))
    });
  }
  async function listAll(collection){
    const out=[];
    let page='';
    do{
      const data = await authedFetch(collectionUrl(collection, page), {method:'GET'});
      for(const d of (data.documents || [])){
        const obj = fromFirestoreDoc(d);
        if(obj) out.push(obj);
      }
      page = data.nextPageToken || '';
    }while(page);
    return out;
  }
  function mergeByUpdatedAt(local, remote){
    const map = new Map();
    for(const obj of local || []) map.set(obj.id, obj);
    for(const obj of remote || []){
      const cur = map.get(obj.id);
      if(!cur || normalizedUpdatedAt(obj) > normalizedUpdatedAt(cur)) map.set(obj.id, obj);
    }
    return [...map.values()];
  }
  function withUpdatedAt(obj, at){
    if(!obj) return obj;
    if(obj.updatedAt) return obj;
    return {...obj, updatedAt: at || obj.createdAt || new Date().toISOString()};
  }

  async function sync(payload){
    if(!configured()) throw new Error('Firebase não configurado.');
    if(!authInfo().authenticated) throw new Error('LOGIN_REQUIRED');

    let vehicles = (payload.vehicles || []).map(v => withUpdatedAt(v));
    let records = (payload.records || []).map(r => withUpdatedAt(r));
    let oilChanges = (payload.oilChanges || []).map(r => withUpdatedAt(r));
    let auditLogs = (payload.auditLogs || []).map(r => withUpdatedAt(r));

    const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
    const recordMap = new Map(records.map(r => [r.id, r]));
    const oilChangeMap = new Map(oilChanges.map(r => [r.id, r]));
    const auditLogMap = new Map(auditLogs.map(r => [r.id, r]));
    const q = Array.isArray(payload.queue) ? payload.queue : [];

    const snapshot = q.some(item => item.entityType === 'snapshot');

    if(snapshot){
      for(const v of vehicles) await upsert('vehicles', v);
      for(const r of records) await upsert('records', r);
      for(const o of oilChanges) await upsert('oilChanges', o);
      for(const a of auditLogs) await upsert('auditLogs', a);
    }else{
      for(const item of q){
        if(item.entityType === 'vehicle'){
          const v = vehicleMap.get(item.entityId);
          if(v) await upsert('vehicles', {...v, updatedAt:v.updatedAt || item.updatedAt});
        }else if(item.entityType === 'record'){
          const r = recordMap.get(item.entityId);
          if(r) await upsert('records', {...r, updatedAt:r.updatedAt || item.updatedAt});
        }else if(item.entityType === 'oilChange'){
          const o = oilChangeMap.get(item.entityId);
          if(o) await upsert('oilChanges', {...o, updatedAt:o.updatedAt || item.updatedAt});
        }else if(item.entityType === 'auditLog'){
          const a = auditLogMap.get(item.entityId);
          if(a) await upsert('auditLogs', {...a, updatedAt:a.updatedAt || item.updatedAt});
        }
      }
    }

    const [remoteVehicles, remoteRecords, remoteOilChanges, remoteAuditLogs] = await Promise.all([
      listAll('vehicles'),
      listAll('records'),
      listAll('oilChanges'),
      listAll('auditLogs')
    ]);

    vehicles = mergeByUpdatedAt(vehicles, remoteVehicles);
    records = mergeByUpdatedAt(records, remoteRecords);
    oilChanges = mergeByUpdatedAt(oilChanges, remoteOilChanges);
    auditLogs = mergeByUpdatedAt(auditLogs, remoteAuditLogs);

    // Envia itens locais ainda inexistentes na nuvem após o merge.
    const remoteVehicleIds = new Set(remoteVehicles.map(v => v.id));
    const remoteRecordIds = new Set(remoteRecords.map(r => r.id));
    const remoteOilChangeIds = new Set(remoteOilChanges.map(r => r.id));
    const remoteAuditLogIds = new Set(remoteAuditLogs.map(r => r.id));
    for(const v of vehicles) if(!remoteVehicleIds.has(v.id)) await upsert('vehicles', v);
    for(const r of records) if(!remoteRecordIds.has(r.id)) await upsert('records', r);
    for(const o of oilChanges) if(!remoteOilChangeIds.has(o.id)) await upsert('oilChanges', o);
    for(const a of auditLogs) if(!remoteAuditLogIds.has(a.id)) await upsert('auditLogs', a);

    return {vehicles, records, oilChanges, auditLogs};
  }

  window.OLIVEIRA_CLOUD_ADAPTER = {
    name:'Firebase',
    isConfigured:configured,
    isAuthenticated:() => authInfo().authenticated,
    getAuthInfo:authInfo,
    signIn,
    signOut,
    sync
  };
})();
