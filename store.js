/* Data layer shared by the public site (index.html) and the dashboard (admin.html).
   - If config.js sets SUPABASE_URL + SUPABASE_ANON_KEY  -> real database (Supabase).
   - Otherwise -> demo mode: data lives in this browser (localStorage), seeded from data.js. */
(function(){
  const CFG=window.FAMILY_CONFIG||{};
  const LS='dajani-demo-db-v1';
  const ROLE_PERMS={owner:['people','martyrs','submissions','pages','users','settings'],editor:['people','martyrs','submissions','pages'],reviewer:['submissions'],viewer:[]};
  const yearOf=s=>{const m=String(s||'').match(/(\d{4})/);return m?+m[1]:null};
  /* ---------- mapping between app format and DB rows ---------- */
  const toRow=p=>({id:p.id,parent_id:p.p>=0?p.p:null,name:p.n,gender:p.g,birth:p.bd||null,death:p.dd||null,martyr:!!p.m,martyr_info:p.mi||{},spouses:p.sp||[],father_ext:p.fa||null,mother_ext:p.mo||null,residence:p.res||null,city:p.city||null,education:p.edu||null,work:p.work||null,notes:(p.notes||[]).join('\n')||null,bio:p.bio||null,photo:p.photo||null,hidden_fields:p.hf||[],sort:p.sort||0});
  const fromRow=r=>{const p={id:+r.id,p:r.parent_id==null?-1:+r.parent_id,n:r.name,g:r.gender||'m',m:!!r.martyr};
    if(r.birth){p.bd=r.birth;p.by=yearOf(r.birth)}if(r.death){p.dd=r.death;p.dy=yearOf(r.death)}
    if(r.spouses&&r.spouses.length)p.sp=r.spouses;if(r.father_ext)p.fa=r.father_ext;if(r.mother_ext)p.mo=r.mother_ext;
    if(r.residence)p.res=r.residence;if(r.city)p.city=r.city;if(r.education)p.edu=r.education;if(r.work)p.work=r.work;
    if(r.notes)p.notes=String(r.notes).split('\n').filter(Boolean);if(r.bio)p.bio=r.bio;if(r.photo)p.photo=r.photo;
    if(r.martyr_info&&Object.keys(r.martyr_info).length)p.mi=r.martyr_info;if(r.hidden_fields&&r.hidden_fields.length)p.hf=r.hidden_fields;return p};
  const norm=p=>{p=Object.assign({},p);p.by=yearOf(p.bd);p.dy=yearOf(p.dd);if(!p.by)delete p.by;if(!p.dy)delete p.dy;return p};
  /* fields hidden from the public */
  const FIELDS=['bd','dd','res','city','edu','work','sp','fa','mo','notes','bio','photo'];
  function publicView(p){if(!p.hf||!p.hf.length)return p;const q=Object.assign({},p),all=p.hf.includes('all');(all?FIELDS:p.hf).forEach(f=>{delete q[f];if(f==='bd')delete q.by;if(f==='dd')delete q.dy});return q}

  /* ---------- demo backend ---------- */
  function demoLoad(){let d=null;try{d=JSON.parse(localStorage.getItem(LS))}catch(e){}
    if(!d){d={people:(window.SEED_PEOPLE||[]).map(norm),pages:window.SEED_PAGES||[],settings:window.SEED_SETTINGS||{},submissions:[],admins:[{email:'admin@demo',name:'المدير العام',role:'owner',perms:ROLE_PERMS.owner}],activity:[]}}
    return d}
  let MEM=null;const D=()=>MEM||(MEM=demoLoad());
  const demoSave=()=>{try{localStorage.setItem(LS,JSON.stringify(MEM))}catch(e){console.warn('storage full',e)}};
  const nextId=a=>a.reduce((m,x)=>Math.max(m,+x.id||0),0)+1;
  /* compress images before saving/uploading (max 1600px, JPEG) to stay inside free storage */
  async function shrink(f){if(!f||!/^image\/(jpeg|png|webp|heic|heif)/.test(f.type)||f.size<350e3)return f;
    try{const bmp=await createImageBitmap(f),k=Math.min(1,1600/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
      const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.82));return b&&b.size<f.size?new File([b],f.name.replace(/\.\w+$/,'')+'.jpg',{type:'image/jpeg'}):f}catch(e){return f}}
  const MAXV=60e6;
  const fileToData=f=>new Promise(r=>{if(f.size>1.5e6)return r(null);const fr=new FileReader();fr.onload=()=>r(fr.result);fr.onerror=()=>r(null);fr.readAsDataURL(f)});
  const demo={
    mode:'demo',
    async people(){return D().people},
    async publicPeople(){return D().people.map(publicView)},
    async savePerson(p){p=norm(p);const L=D().people;if(p.id==null||p.id===''){p.id=nextId(L);L.push(p)}else{const i=L.findIndex(x=>x.id===p.id);i<0?L.push(p):L[i]=p}demoSave();return p},
    async deletePerson(id){const L=D().people;if(L.some(x=>x.p===id))throw new Error('لا يمكن حذف شخص له أبناء. احذف الأبناء أو انقلهم أولًا.');MEM.people=L.filter(x=>x.id!==id);demoSave()},
    async pages(){return D().pages.slice().sort((a,b)=>(a.sort||0)-(b.sort||0))},
    async savePage(pg){const L=D().pages;if(!pg.id){pg.id=nextId(L);L.push(pg)}else{const i=L.findIndex(x=>x.id===pg.id);L[i]=pg}demoSave();return pg},
    async deletePage(id){MEM.pages=D().pages.filter(x=>x.id!==id);demoSave()},
    async settings(){return D().settings},
    async saveSettings(s){MEM.settings=s;demoSave()},
    async submit(sub,files){const L=D().submissions,att=[];for(let f of files||[]){f=await shrink(f);att.push({name:f.name,type:f.type,size:f.size,url:await fileToData(f)})}
      const s=Object.assign({id:nextId(L),status:'new',created_at:new Date().toISOString(),files:att},sub);L.unshift(s);demoSave();return s},
    async submissions(){return D().submissions},
    async updateSubmission(id,patch){const s=D().submissions.find(x=>x.id===id);Object.assign(s,patch);demoSave()},
    async deleteSubmission(id){MEM.submissions=D().submissions.filter(x=>x.id!==id);demoSave()},
    async admins(){return D().admins},
    async saveAdmin(a){const L=D().admins,i=L.findIndex(x=>x.email===a.email);i<0?L.push(a):L[i]=a;demoSave()},
    async deleteAdmin(email){MEM.admins=D().admins.filter(x=>x.email!==email);demoSave()},
    async log(action,target){D().activity.unshift({at:new Date().toISOString(),user_email:(demo._user||{}).email||'—',action,target});MEM.activity=MEM.activity.slice(0,500);demoSave()},
    async activity(){return D().activity},
    async upload(file){file=await shrink(file);const u=await fileToData(file);if(!u)throw new Error('في وضع التجربة: الحد الأقصى للملف 1.5MB');return u},
    async signIn(email){const a=D().admins.find(x=>x.email===email)||D().admins[0];demo._user=a;return a},
    async signUp(email){return demo.signIn(email)},
    async signOut(){demo._user=null},
    async me(){return demo._user||null},
    async exportAll(){return JSON.parse(JSON.stringify(D()))},
    async importAll(o){MEM=o;demoSave()},
    async reset(){localStorage.removeItem(LS);MEM=null;D()},
  };

  /* ---------- Supabase backend ---------- */
  function supa(){
    const sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
    const chk=({data,error})=>{if(error)throw new Error(error.message);return data};
    let ME=null;
    const api={
      mode:'supabase',sb,
      async people(){return chk(await sb.from('people').select('*').order('id').limit(20000)).map(fromRow)},
      async publicPeople(){return chk(await sb.from('people_public').select('*').order('id').limit(20000)).map(fromRow)},
      async savePerson(p){p=norm(p);const row=toRow(p);if(p.id==null||p.id==='')delete row.id;row.updated_at=new Date().toISOString();return fromRow(chk(await sb.from('people').upsert(row).select().single()))},
      async deletePerson(id){const kids=chk(await sb.from('people').select('id').eq('parent_id',id).limit(1));if(kids.length)throw new Error('لا يمكن حذف شخص له أبناء.');chk(await sb.from('people').delete().eq('id',id))},
      async pages(){return chk(await sb.from('pages').select('*').order('sort'))},
      async savePage(pg){const r=Object.assign({},pg);if(!r.id)delete r.id;return chk(await sb.from('pages').upsert(r).select().single())},
      async deletePage(id){chk(await sb.from('pages').delete().eq('id',id))},
      async settings(){const rows=chk(await sb.from('settings').select('*'));const o={};rows.forEach(r=>o[r.key]=r.value);return Object.keys(o).length?o:(window.SEED_SETTINGS||{})},
      async saveSettings(s){chk(await sb.from('settings').upsert(Object.entries(s).map(([key,value])=>({key,value}))))},
      async submit(sub,files){const att=[];for(let f of files||[]){f=await shrink(f);if(f.size>MAXV)throw new Error('الملف '+f.name+' أكبر من 60MB. للفيديو الطويل ارفعه على يوتيوب وأرسل الرابط.');const path='submissions/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'-'+f.name.replace(/[^\w.\-]/g,'_');chk(await sb.storage.from('media').upload(path,f));att.push({name:f.name,type:f.type,size:f.size,url:sb.storage.from('media').getPublicUrl(path).data.publicUrl})}
        chk(await sb.from('submissions').insert(Object.assign({},sub,{files:att})));return true},
      async submissions(){return chk(await sb.from('submissions').select('*').order('created_at',{ascending:false}))},
      async updateSubmission(id,patch){chk(await sb.from('submissions').update(patch).eq('id',id))},
      async deleteSubmission(id){chk(await sb.from('submissions').delete().eq('id',id))},
      async admins(){return chk(await sb.from('admins').select('*').order('created_at'))},
      async saveAdmin(a){chk(await sb.from('admins').upsert({email:a.email.toLowerCase(),name:a.name,role:a.role,perms:a.perms}))},
      async deleteAdmin(email){chk(await sb.from('admins').delete().eq('email',email))},
      async log(action,target){try{await sb.from('activity').insert({user_email:(ME||{}).email,action,target})}catch(e){}},
      async activity(){return chk(await sb.from('activity').select('*').order('at',{ascending:false}).limit(300))},
      async upload(file){file=await shrink(file);const path='media/'+Date.now()+'-'+file.name.replace(/[^\w.\-]/g,'_');chk(await sb.storage.from('media').upload(path,file));return sb.storage.from('media').getPublicUrl(path).data.publicUrl},
      async signIn(email,password){chk(await sb.auth.signInWithPassword({email,password}));return api.me()},
      async signUp(email,password){chk(await sb.auth.signUp({email,password}));return api.me()},
      async signOut(){await sb.auth.signOut();ME=null},
      async me(){const u=(await sb.auth.getUser()).data.user;if(!u)return null;const a=chk(await sb.from('admins').select('*').eq('email',u.email.toLowerCase()));ME=a[0]?Object.assign({},a[0]):{email:u.email,role:'none',perms:[]};return ME},
      async exportAll(){return{people:(await api.people()),pages:await api.pages(),settings:await api.settings(),submissions:await api.submissions(),admins:await api.admins()}},
      async importAll(o){const rows=o.people.map(toRow);rows.sort((a,b)=>(a.parent_id??-1)-(b.parent_id??-1));
        // insert parents before children
        const done=new Set(),order=[];const byId=new Map(rows.map(r=>[r.id,r]));const add=r=>{if(done.has(r.id))return;if(r.parent_id!=null&&byId.has(r.parent_id))add(byId.get(r.parent_id));done.add(r.id);order.push(r)};rows.forEach(add);
        for(let i=0;i<order.length;i+=200)chk(await sb.from('people').upsert(order.slice(i,i+200)));
        if(o.pages&&o.pages.length)chk(await sb.from('pages').upsert(o.pages));if(o.settings)await api.saveSettings(o.settings);
        try{await sb.rpc('reset_people_id_seq')}catch(e){}},
    };
    return api;
  }
  const useSupa=!!(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&window.supabase);
  window.Store=useSupa?supa():demo;
  window.Store.ROLE_PERMS=ROLE_PERMS;
  window.Store.can=(u,perm)=>!!u&&(u.role==='owner'||(u.perms||[]).includes(perm));
})();
