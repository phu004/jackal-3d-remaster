// The final boss: a super-heavy tank in the spirit of Red Alert 2's Apocalypse tank, about 8.2 x 5.4 m with the turret reaching 4 m up and the main gun about 5 m past the nose.
// Hull and four tread assemblies from the Claude.ai artifact (asset-sources/boss-tank.html); the turret, guns, launcher and drone bays added in the port.
// Named parts (-Z is forward; origin on the ground at the centre):
//   tracks > treadFL / treadFR / treadRL / treadRR   the four belts, each with its OWN material and map: scroll map.offset.y
//   turret (yaws on Y, pivot at the middle of the hull, (0, 2.4, 0))
//     mainGun > mainBarrel (recoil: slides back on Z up to .6 m) > coil1 coil2 coil3 mainLens (each its own emissive material: raise emissiveIntensity from .3 to charge) and mainMuzzle (where the beam leaves)
//     sideTurretL / sideTurretR (each yaws on Y) > sideGunL / sideGunR (recoil on Z) > sideMuzzleL1 / R1 (one barrel each)
//     lamp5 lamp6, smoke4
//   hull > vlsLid (hinged at its REAR edge: rotation.x 0 shut .. +1.9 open), vlsMuzzle1..9
//   hull > droneLid1..4 (each hinged at its REAR edge: rotation.x 0 shut .. +1.5 open), droneSpawn1..4
//   hull > lamp1..4, smoke1..3. The three painted materials have userData.paint = true (swapped for a scorched look at low health).
import * as THREE from 'three';

export function buildBossTank(){
const T=THREE,TILE=2.5,TAU=Math.PI*2;
const root=new T.Group();root.name='bossTank';
const hull=new T.Group();hull.name='hull';
const tracks=new T.Group();tracks.name='tracks';
root.add(hull,tracks);
const R=s=>()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const rr=R(11);

/* ---------- procedural canvas textures ---------- */
const tex=(w,h,fn)=>{const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);
  const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t};
const rivet=(g,x,y,r=3)=>{g.fillStyle='#08090a';g.beginPath();g.arc(x,y,r,0,TAU);g.fill();g.fillStyle='rgba(170,175,180,.35)';g.beginPath();g.arc(x-.8,y-.8,r*.45,0,TAU);g.fill()};
const streak=(g,x,y,len,wd,col,a)=>{const gr=g.createLinearGradient(0,y,0,y+len);gr.addColorStop(0,`rgba(${col},${a})`);gr.addColorStop(1,`rgba(${col},0)`);g.fillStyle=gr;g.fillRect(x,y,wd,len)};
const speck=(g,r,w,h,n,c0)=>{for(let i=0;i<n;i++){const v=r()*60|0;g.fillStyle=`rgba(${v+c0[0]},${v+c0[1]},${v+c0[2]},${.06+r()*.12})`;g.fillRect(r()*w,r()*h,1+r()*8,1+r()*4)}};

const armorTex=tex(512,512,(g,w,h)=>{const r=R(3);
  g.fillStyle='#2e353c';g.fillRect(0,0,w,h);speck(g,r,w,h,3500,[14,16,20]);
  g.strokeStyle='rgba(130,135,140,.22)';
  for(let i=0;i<70;i++){const x=r()*w,y=r()*h;g.beginPath();g.moveTo(x,y);g.lineTo(x+r()*50-25,y+r()*8-4);g.stroke()}
  for(const p of[0,256]){g.fillStyle='#050607';g.fillRect(p,0,3,h);g.fillRect(0,p,w,3);g.fillStyle='rgba(150,156,162,.22)';g.fillRect(p+3,0,1,h);g.fillRect(0,p+3,w,1);
    for(let k=16;k<w;k+=32){rivet(g,k,p+10);rivet(g,p+10,k)}}
  for(let i=0;i<36;i++)streak(g,r()*w,(r()<.5?0:256)+3,40+r()*150,1+r()*4,'135,62,22',.25+r()*.3);
  for(let i=0;i<60;i++){g.fillStyle=`rgba(125,62,26,${.2+r()*.35})`;g.beginPath();g.arc(r()*w,r()*h,1+r()*3,0,TAU);g.fill()}
  g.font='bold 30px monospace';g.fillStyle='rgba(215,205,180,.38)';g.fillText('BOSS-01',300,170);g.fillRect(300,180,120,5);
  g.font='bold 22px monospace';g.fillStyle='rgba(215,205,180,.3)';g.fillText('TYPE-X HVY',60,420)});
const skirtTex=tex(512,256,(g,w,h)=>{const r=R(5);
  g.fillStyle='#343b42';g.fillRect(0,0,w,h);speck(g,r,w,h,2000,[15,17,20]);
  g.fillStyle='#050607';g.fillRect(0,0,w,5);g.fillRect(0,h-5,w,5);g.fillRect(0,0,5,h);g.fillRect(w-5,0,5,h);
  for(let x=20;x<w;x+=36){rivet(g,x,14);rivet(g,x,h-14)}
  for(let i=0;i<26;i++)streak(g,r()*w,6,50+r()*130,1+r()*4,'135,62,22',.3+r()*.3);
  const gr=g.createLinearGradient(0,h*.4,0,h);gr.addColorStop(0,'rgba(25,18,12,0)');gr.addColorStop(1,'rgba(30,22,14,.9)');g.fillStyle=gr;g.fillRect(0,h*.4,w,h*.6);
  for(let i=0;i<45;i++){g.fillStyle=`rgba(190,200,205,${.04+r()*.08})`;g.fillRect(r()*w,h*.5+r()*h*.4,1+r()*2,10+r()*50)}
  for(let i=0;i<40;i++){g.fillStyle=`rgba(125,62,26,${.2+r()*.3})`;g.beginPath();g.arc(r()*w,r()*h*.7,1+r()*3,0,TAU);g.fill()}
  g.font='bold 34px monospace';g.fillStyle='rgba(215,200,170,.42)';g.fillText('DREAD-01',150,125);g.fillRect(150,135,200,5)});
const grimeTex=tex(256,256,(g,w,h)=>{const r=R(9);
  g.fillStyle='#38342d';g.fillRect(0,0,w,h);speck(g,r,w,h,1800,[20,16,10]);
  for(let i=0;i<34;i++)streak(g,r()*w,r()*h*.5,60+r()*120,1+r()*3,'170,180,185',.07+r()*.09);
  for(let i=0;i<20;i++)streak(g,r()*w,0,50+r()*100,1+r()*3,'125,58,22',.25);
  g.fillStyle='#050505';g.fillRect(0,0,w,3);for(let k=12;k<w;k+=24)rivet(g,k,10,2.5)});
const hazardTex=tex(256,64,(g,w,h)=>{const r=R(13);g.fillStyle='#16120e';g.fillRect(0,0,w,h);g.fillStyle='#e8741a';
  for(let x=-64;x<w;x+=32){g.beginPath();g.moveTo(x,h);g.lineTo(x+16,h);g.lineTo(x+16+h*.75,0);g.lineTo(x+h*.75,0);g.fill()}
  for(let i=0;i<500;i++){g.fillStyle=`rgba(20,16,12,${r()*.35})`;g.fillRect(r()*w,r()*h,1+r()*5,1+r()*3)}});
const grilleTex=tex(128,128,(g,w,h)=>{g.fillStyle='#0a0b0c';g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=16){const gr=g.createLinearGradient(0,y,0,y+12);gr.addColorStop(0,'#3b3e42');gr.addColorStop(1,'#16181a');g.fillStyle=gr;g.fillRect(2,y+2,w-4,11)}});
const grilleEm=tex(128,128,(g,w,h)=>{g.fillStyle='#000';g.fillRect(0,0,w,h);g.fillStyle='#8a1208';for(let y=0;y<h;y+=16)g.fillRect(4,y+13,w-8,3)});
const steelTex=tex(128,128,(g,w,h)=>{const r=R(17);g.fillStyle='#4a5056';g.fillRect(0,0,w,h);speck(g,r,w,h,900,[20,22,26]);
  for(let i=0;i<14;i++)streak(g,r()*w,0,40+r()*80,1+r()*2,'125,60,24',.25)});
const beltTex=tex(256,80,(g,w,h)=>{const r=R(21);g.fillStyle='#2b2c2e';g.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=64){g.fillStyle='#3b3c3f';g.fillRect(x+3,8,58,30);g.fillRect(x+3,44,58,28);
    g.fillStyle='rgba(255,255,255,.08)';g.fillRect(x+3,8,58,2);g.fillRect(x+3,44,58,2);
    for(let k=0;k<5;k++){g.fillStyle='rgba(0,0,0,.35)';g.fillRect(x+8+k*11,10,2,26);g.fillRect(x+8+k*11,46,2,24)}}
  g.fillStyle='#0b0b0c';g.fillRect(0,0,w,5);g.fillRect(0,h-5,w,5);g.fillStyle='#4a4b4e';g.fillRect(112,0,32,h);g.fillStyle='#111';g.fillRect(122,6,12,h-12);
  for(let i=0;i<700;i++){g.fillStyle=`rgba(${70+r()*60|0},${40+r()*30|0},${20+r()*15|0},${r()*.3})`;g.fillRect(r()*w,r()*h,1+r()*4,1+r()*3)}
  for(let i=0;i<20;i++)streak(g,r()*w,0,20,2,'125,58,22',.3)});

/* ---------- shared materials (10) ---------- */
const S=o=>new T.MeshStandardMaterial(o);
const M={
  armor:S({map:armorTex,roughness:.58,metalness:.65}),
  skirt:S({map:skirtTex,roughness:.5,metalness:.6}),
  grime:S({map:grimeTex,roughness:.3,metalness:.35}),
  steel:S({map:steelTex,roughness:.5,metalness:.8}),
  rubber:S({color:0x151515,roughness:.9,metalness:.1}),
  red:S({color:0x2a0505,emissive:0xff1a0c,emissiveIntensity:1.5,roughness:.4}),
  amber:S({color:0x3a2205,emissive:0xff9a1a,emissiveIntensity:2,roughness:.3}),
  lens:S({color:0x222222,emissive:0xfff0c8,emissiveIntensity:1.6,roughness:.15}),
  hazard:S({map:hazardTex,roughness:.6,metalness:.3}),
  grille:S({map:grilleTex,emissiveMap:grilleEm,emissive:0xffffff,emissiveIntensity:.7,roughness:.5,metalness:.7})
};

/* ---------- helpers ---------- */
function bx(p,w,h,d,m,x,y,z,o={}){
  const g=new T.BoxGeometry(w,h,d),uv=g.attributes.uv,dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(let f=0;f<6;f++){const ox=rr(),oy=rr();for(let i=0;i<4;i++){const k=f*4+i;let u=uv.getX(k),v=uv.getY(k);
    if(o.fit){const q=o.rep||[1,1];u*=q[0];v*=q[1]}else{u=u*dims[f][0]/TILE+ox;v=v*dims[f][1]/TILE+oy}uv.setXY(k,u,v)}}
  const me=new T.Mesh(g,m);me.position.set(x,y,z);if(o.r)me.rotation.set(o.r[0],o.r[1],o.r[2]);p.add(me);return me}
function cy(p,rt,rb,h,s,m,x,y,z,o={}){const me=new T.Mesh(new T.CylinderGeometry(rt,rb,h,s),m);me.position.set(x,y,z);
  if(o.ax==='x')me.rotation.z=Math.PI/2;if(o.ax==='z')me.rotation.x=Math.PI/2;p.add(me);return me}
function prism(p,pts,depth,m,x,y,z,o={}){
  const sh=new T.Shape();pts.forEach((q,i)=>i?sh.lineTo(q[0],q[1]):sh.moveTo(q[0],q[1]));
  const g=new T.ExtrudeGeometry(sh,{depth,bevelEnabled:false});g.translate(0,0,-depth/2);if(o.ax==='x')g.rotateY(-Math.PI/2);
  const uv=g.attributes.uv,P=g.attributes.position;
  if(o.fit){g.computeBoundingBox();const b=g.boundingBox;for(let i=0;i<uv.count;i++)uv.setXY(i,(o.flip?b.max.z-P.getZ(i):P.getZ(i)-b.min.z)/(b.max.z-b.min.z),(P.getY(i)-b.min.y)/(b.max.y-b.min.y))}
  else for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/TILE+x*.37,uv.getY(i)/TILE+z*.23);
  const me=new T.Mesh(g,m);me.position.set(x,y,z);p.add(me);return me}
const loc=(x,y,z,rx=0)=>{const g=new T.Group();g.position.set(x,y,z);g.rotation.x=rx;return g};
const out=(g,par)=>{g.updateMatrix();[...g.children].forEach(m=>{m.updateMatrix();m.matrix.premultiply(g.matrix);m.matrix.decompose(m.position,m.quaternion,m.scale);par.add(m)})};
const lampMat=()=>S({color:0x3a0e05,emissive:0xff3a14,emissiveIntensity:1.6,roughness:.3});
function lamp(n,x,y,z){const m=new T.Mesh(new T.CylinderGeometry(.11,.11,.16,10),lampMat());m.name='lamp'+n;m.position.set(x,y,z);(n>4?turret:hull).add(m);return m}
const bolts=[];const bolt=(x,y,z,rx=0,rz=0)=>bolts.push([x,y,z,rx,rz]);
function mergeG(gs){const p=[],n=[],u=[],ix=[];let o=0;gs.forEach(g=>{const a=g.attributes;p.push(...a.position.array);n.push(...a.normal.array);u.push(...a.uv.array);g.index.array.forEach(i=>ix.push(i+o));o+=a.position.count});
  const m=new T.BufferGeometry();m.setAttribute('position',new T.Float32BufferAttribute(p,3));m.setAttribute('normal',new T.Float32BufferAttribute(n,3));m.setAttribute('uv',new T.Float32BufferAttribute(u,2));m.setIndex(ix);return m}

/* ================= TREADS: 4 assemblies (front/rear x left/right) ================= */
const BR=.85,BA=1.125,BW=1.0,BT=.14,PITCH=.3,SEG=20;
const beltGeo=(()=>{
  const P=[],add=(z,y,nz,ny)=>P.push({z,y,nz,ny});
  add(-BA,0,0,-1);add(BA,0,0,-1);
  for(let i=1;i<SEG;i++){const a=-Math.PI/2+Math.PI*i/SEG;add(BA+BR*Math.cos(a),BR+BR*Math.sin(a),Math.cos(a),Math.sin(a))}
  add(BA,2*BR,0,1);add(-BA,2*BR,0,1);
  for(let i=1;i<SEG;i++){const a=Math.PI/2+Math.PI*i/SEG;add(-BA+BR*Math.cos(a),BR+BR*Math.sin(a),Math.cos(a),Math.sin(a))}
  add(-BA,0,0,-1);
  const s=[0];for(let i=1;i<P.length;i++)s.push(s[i-1]+Math.hypot(P[i].z-P[i-1].z,P[i].y-P[i-1].y));
  const L=s[s.length-1],n=Math.round(L/PITCH),V=s.map(q=>q/L*n);
  const pos=[],nor=[],uv=[],idx=[];
  const surf=fn=>{const b=pos.length/3;P.forEach((p,i)=>{for(let k=0;k<2;k++){const q=fn(p,k);pos.push(q[0],q[1],q[2]);nor.push(q[3],q[4],q[5]);uv.push(k,V[i])}});
    for(let i=0;i<P.length-1;i++){const a=b+i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}};
  surf((p,k)=>[(k-.5)*BW,p.y,p.z,0,p.ny,p.nz]);
  surf((p,k)=>[(k-.5)*BW,p.y-p.ny*BT,p.z-p.nz*BT,0,-p.ny,-p.nz]);
  [-1,1].forEach(sx=>surf((p,k)=>[sx*BW/2,p.y-k*p.ny*BT,p.z-k*p.nz*BT,sx,0,0]));
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);return g})();

[['FL',-1,-1],['FR',1,-1],['RL',-1,1],['RR',1,1]].forEach(([c,sx,fa])=>{
  const x=sx*2.0,zc=fa*2.125;
  const t=beltTex.clone();t.needsUpdate=true;
  const mat=S({map:t,roughness:.7,metalness:.55,side:T.DoubleSide});   // own material + own map per belt
  const belt=new T.Mesh(beltGeo,mat);belt.name='tread'+c;belt.position.set(x,0,zc);tracks.add(belt);
  [-.75,0,.75].forEach(k=>{cy(tracks,.36,.36,.8,24,M.rubber,x,.5,zc+k,{ax:'x'});cy(tracks,.2,.2,.86,12,M.steel,x,.5,zc+k,{ax:'x'})});
  const zs=zc+fa*BA,zi=zc-fa*BA;                                       // sprocket at outer end, idler at inner end
  cy(tracks,.58,.58,.5,20,M.steel,x,BR,zs,{ax:'x'});cy(tracks,.3,.3,.66,12,M.armor,x,BR,zs,{ax:'x'});
  for(let k=0;k<10;k++){const a=k*TAU/10;bx(tracks,.5,.16,.12,M.steel,x,BR+.64*Math.sin(a),zs+.64*Math.cos(a),{r:[Math.PI/2-a,0,0]})}
  cy(tracks,.62,.62,.5,24,M.steel,x,BR,zi,{ax:'x'});cy(tracks,.34,.34,.64,12,M.armor,x,BR,zi,{ax:'x'});cy(tracks,.12,.12,.7,8,M.rubber,x,BR,zi,{ax:'x'});
  [-.5,.5].forEach(k=>cy(tracks,.14,.14,.5,12,M.steel,x,1.42,zc+k,{ax:'x'}));
});

/* ================= HULL ================= */
bx(hull,2.9,1.5,7.0,M.grime,0,1.25,.45);                                        // lower tub (wet grime)
prism(hull,[[-3.0,1.6],[-3.7,1.6],[-4.05,.8],[-3.6,.45],[-3.0,.45]],2.9,M.grime,0,0,0,{ax:'x'}); // lower front plate
bx(hull,2.9,1.0,.4,M.grime,0,1.1,4.0);                                          // lower rear plate
prism(hull,[[-2.55,2.0],[2.55,2.0],[2.55,2.2],[2.35,2.4],[-2.35,2.4],[-2.55,2.2]],7.05,M.armor,0,0,.525); // upper hull, roof y=2.4
prism(hull,[[-3.0,2.4],[-3.95,1.6],[-3.95,1.45],[-3.0,1.45]],5.1,M.armor,0,0,0,{ax:'x'});               // thick sloped glacis
prism(hull,[[3.9,2.4],[4.1,2.4],[4.2,2.2],[4.2,1.6],[3.9,1.6]],5.1,M.armor,0,0,0,{ax:'x'});              // rear upper plate
// bridges between front and rear tread pairs
[-1,1].forEach(sx=>{bx(hull,1.1,1.4,.28,M.armor,sx*2.0,.95,0);bx(hull,1.1,.3,2.0,M.armor,sx*2.0,1.85,0);bx(hull,.02,.38,.28,M.hazard,sx*2.56,.46,0,{fit:1})});

// side skirts (4 panels per side, fit-UV weathering texture)
const SK=[[[-3.96,2.05],[-3.96,1.25],[-3.4,.65],[-2.04,.65],[-2.04,2.05]],[[-1.96,2.05],[-1.96,.65],[-.04,.65],[-.04,2.05]],
          [[.04,2.05],[.04,.65],[1.96,.65],[1.96,2.05]],[[2.04,2.05],[2.04,.65],[3.4,.65],[3.96,1.25],[3.96,2.05]]];
[-1,1].forEach(sx=>SK.forEach(pts=>{
  prism(hull,pts,.12,M.skirt,sx*2.58,0,0,{ax:'x',fit:1,flip:sx>0});
  const zc=(pts[0][0]+pts[pts.length-1][0])/2;
  [-.55,.55].forEach(d=>{bx(hull,.05,1.25,.08,M.armor,sx*2.665,1.4,zc+d);bx(hull,.1,.14,.3,M.steel,sx*2.6,2.08,zc+d)});
  bx(hull,.03,.07,.7,M.red,sx*2.56,2.12,zc)}));

// glacis details (local frame lying on the slope; local +y = outward normal, +z = up-slope)
const G=loc(0,2.0,-3.475,-.7);
bx(G,2.3,.08,.95,M.armor,0,.04,0);bx(G,1.6,.06,.5,M.armor,0,.11,.1);
[-1,1].forEach(sx=>{
  bx(G,.07,.035,.8,M.red,sx*1.28,.03,0);bx(G,.15,.14,1.2,M.armor,sx*2.42,.07,0);
  bx(G,.9,.3,.7,M.armor,sx*1.8,.15,0);bx(G,1.0,.07,.3,M.armor,sx*1.8,.38,.36);
  cy(G,.25,.25,.08,16,sx<0?M.lens:M.amber,sx*1.8,.33,-.05);cy(G,.3,.3,.04,16,M.steel,sx*1.8,.31,-.05);
  [-1,1].forEach(k=>cy(G,.06,.06,.06,8,M.red,sx*1.8+k*.34,.33,-.05));
  bx(G,.55,.03,.03,M.steel,sx*1.8,.38,-.05)});
out(G,hull);
const gb=(lx,lz)=>bolt(lx,2.0+.765*.03+.644*lz,-3.475-.644*.03+.765*lz,-.7);
[-.8,.8].forEach(sx=>[-.4,.4].forEach(lz=>gb(sx,lz)));[-.5,.5].forEach(lz=>[-2.42,2.42].forEach(lx=>gb(lx,lz)));
// tow hook + hazard bumper
bx(hull,.6,.42,.28,M.hazard,0,1.0,-4.08,{fit:1});bx(hull,2.9,.18,.1,M.hazard,0,.62,-3.95,{fit:1,rep:[4,1]});
cy(hull,.07,.07,.4,8,M.steel,0,.78,-4.1,{ax:'z'});
{const h=new T.Mesh(new T.TorusGeometry(.22,.06,8,18,Math.PI*1.6),M.steel);h.position.set(0,.74,-4.34);h.rotation.z=-.5;hull.add(h)}
// rear tow lugs + tail lamps + rear vents
[-1,1].forEach(sx=>{bx(hull,.3,.3,.3,M.hazard,sx*1.0,.8,4.3,{fit:1});bx(hull,.3,.15,.04,M.red,sx*2.25,1.85,4.21);bx(hull,1.5,.5,.04,M.grille,sx*1.1,2.0,4.21,{fit:1,rep:[2,.8]})});

// roof: turret ring (clear Ø3 m opening), centred at z=-0.7
const RZ=0;
{const pts=[[1.2,0],[1.2,.2],[1.3,.26],[1.5,.14],[1.62,0]].map(q=>new T.Vector2(q[0],q[1]));
 const ring=new T.Mesh(new T.LatheGeometry(pts,40),M.steel);ring.position.set(0,2.4,RZ);hull.add(ring)}
cy(hull,1.2,1.2,.03,40,M.rubber,0,2.415,RZ);
for(let k=0;k<24;k++){const a=k*TAU/24;bolt(Math.cos(a)*1.42,2.6,RZ+Math.sin(a)*1.42)}
for(let k=0;k<8;k++){const a=(k+.5)*TAU/8;bx(hull,.3,.03,.07,M.red,Math.cos(a)*1.55,2.46,RZ+Math.sin(a)*1.55,{r:[0,-a+Math.PI/2,0],fit:1})}
// front deck plate, shoulder wings with intake grilles + red strips, beacons
bx(hull,4.2,.08,.35,M.armor,0,2.44,-2.85);bx(hull,2.0,.03,.2,M.grille,0,2.5,-2.85,{fit:1,rep:[3,1]});
[-1,1].forEach(sx=>{
  prism(hull,[[-.18,0],[.18,0],[.14,.14],[-.14,.14]],3.2,M.armor,sx*2.2,2.4,-1.0);
  bx(hull,.28,.02,2.4,M.grille,sx*2.2,2.55,-1.0,{fit:1,rep:[1,5]});bx(hull,.04,.05,2.6,M.red,sx*2.03,2.45,-1.0);
  [-2.4,.4].forEach(z=>bolt(sx*2.2,2.55,z));
  cy(hull,.16,.18,.1,12,M.steel,sx*2.3,2.45,-2.75);lamp(sx<0?1:2,sx*2.3,2.57,-2.75);   // warning beacons
  lamp(sx<0?3:4,sx*.6,2.5,4.0);cy(hull,.16,.18,.1,12,M.steel,sx*.6,2.45,4.0);
  [.9,2.2].forEach(z=>bx(hull,.03,.02,.9,M.steel,sx*2.35,2.41,z));
});
bx(hull,5.0,.03,.05,M.steel,0,2.41,-2.55);

// engine deck: raised block, grilles, glow strips, 2 flat hatch areas (1.9 x 2.5 m), exhaust stacks
prism(hull,[[-.47,2.4],[-.38,2.78],[.38,2.78],[.47,2.4]],2.5,M.armor,0,0,2.75);
[1.95,2.75,3.55].forEach(z=>bx(hull,.7,.02,.8,M.grille,0,2.79,z,{fit:1,rep:[2,3]}));
[2.35,3.15].forEach(z=>bx(hull,.76,.03,.1,M.red,0,2.8,z));
[-1,1].forEach(sx=>{
  const px=sx*1.45,pz=2.55;
  bx(hull,1.9,.04,2.5,M.armor,px,2.42,pz);                                  // flat hatch pad
  bx(hull,1.98,.07,.08,M.steel,px,2.45,pz-1.29);bx(hull,1.98,.07,.08,M.steel,px,2.45,pz+1.29);
  bx(hull,.08,.07,2.5,M.steel,px-.97,2.45,pz);bx(hull,.08,.07,2.5,M.steel,px+.97,2.45,pz);
  [-1,1].forEach(a=>[-1,1].forEach(b=>bolt(px+a*.85,2.47,pz+b*1.15)));
  [.3,.6].forEach(d=>bx(hull,.02,.03,2.5,M.red,sx*2.42,2.43,pz));
  [1.5,3.5].forEach(z=>{cy(hull,.025,.025,.3,6,M.steel,sx*2.46,2.5,z);});
  cy(hull,.025,.025,2.0,6,M.steel,sx*2.46,2.65,2.5,{ax:'z'});
  // stacks
  [[2.2,.2],[1.5,.16]].forEach(([x,r])=>{
    const L=loc(sx*x,2.43,4.0,.25);
    cy(L,r+.07,r+.09,.06,14,M.steel,0,.03,0);cy(L,r,r+.03,1.1,16,M.steel,0,.6,0);
    [.25,.55,.85].forEach(y=>{const t=new T.Mesh(new T.TorusGeometry(r+.03,.03,6,16),M.armor);t.rotation.x=Math.PI/2;t.position.y=y;L.add(t)});
    cy(L,r+.02,r,.08,16,M.steel,0,1.16,0);cy(L,r-.04,r-.04,.02,12,M.red,0,1.2,0);out(L,hull)})
});
// roof weld seams / layered plates / side grab plates
[[0,-2.2,3.2,.7],[0,1.8,2.0,.3]].forEach(([x,z,w,d])=>bx(hull,w,.03,d,M.armor,x,2.415,z));
[[-2.3,.2],[2.3,.2]].forEach(([x,z])=>bx(hull,.2,.06,1.0,M.steel,x,2.36,z+1.2));


/* ---------- extra hull detail added in the port: stepped shoulder armour over the tread pairs (kept outside the turret's sweep: its drum has a radius of 2.2 m) ---------- */
[-1,1].forEach(sx=>{
  const pts=sx>0?[[2.38,2.4],[2.78,2.4],[2.78,2.52],[2.56,2.66],[2.38,2.66]]:[[-2.38,2.66],[-2.56,2.66],[-2.78,2.52],[-2.78,2.4],[-2.38,2.4]];
  prism(hull,pts,4.6,M.armor,0,0,.3);
  bx(hull,.04,.05,4.2,M.red,sx*2.79,2.52,.3);
  [-1.6,-.4,.8,2.0].forEach(z=>bx(hull,.1,.2,.08,M.steel,sx*2.82,2.5,z));
});

/* ================= TURRET: yaws on Y about the turret ring (0, 2.4, -0.7) ================= */
const turret=new T.Group();turret.name='turret';turret.position.set(0,2.4,RZ);root.add(turret);
const TC=(rt,rb,h,s,m,x,y,z,o)=>cy(turret,rt,rb,h,s,m,x,y,z,o);
TC(1.32,1.38,.3,32,M.steel,0,.17,0);                           // the collar riding in the ring
TC(1.3,1.3,.5,24,M.armor,0,.5,0);                          // neck (the drum floats above the hull's deck blocks)
{const d=TC(2.0,2.2,.6,8,M.armor,0,1.05,0);d.rotation.y=Math.PI/8}  // octagonal drum
{const d=TC(1.7,1.95,.3,8,M.armor,0,1.5,0);d.rotation.y=Math.PI/8}
{const d=TC(1.25,1.5,.26,8,M.skirt,0,1.78,0);d.rotation.y=Math.PI/8}
for(let k=0;k<8;k++){const a=k*TAU/8+Math.PI/8;bx(turret,.5,.04,.08,M.red,Math.cos(a)*2.14,1.11,Math.sin(a)*2.14,{r:[0,-a+Math.PI/2,0],fit:1})}   // glow strips round the drum
const turretBolts=[];for(let k=0;k<16;k++){const a=k*TAU/16;turretBolts.push([Math.cos(a)*1.4,1.93,Math.sin(a)*1.4,0,0])}   // (merged into the turret below)
// front mantlet housing and the rear capacitor bustle
prism(turret,[[-1.35,.78],[1.35,.78],[1.1,1.73],[-1.1,1.73]],1.4,M.armor,0,0,-1.85);
bx(turret,2.0,.08,.5,M.hazard,0,1.76,-1.55,{fit:1,rep:[3,1]});
prism(turret,[[-1.25,.83],[1.25,.83],[1.1,1.58],[-1.1,1.58]],1.3,M.armor,0,0,2.05);
for(let k=0;k<6;k++){bx(turret,.28,.7,.04,M.red,-1.0+k*.4,1.23,2.72);bx(turret,.34,.78,.07,M.steel,-1.0+k*.4,1.23,2.69)}   // capacitor fins, glowing
bx(turret,2.2,.1,1.2,M.grille,0,1.6,2.05,{fit:1,rep:[3,2]});
// commander's cupola, sensor dome, hatches
cy(turret,.5,.55,.3,16,M.steel,-.75,2.07,.55);cy(turret,.38,.4,.12,16,M.armor,-.75,2.28,.55);
[-.2,.2].forEach(d=>bx(turret,.2,.1,.05,M.lens,-.75+d,2.17,.18));
{const s=new T.Mesh(new T.SphereGeometry(.34,14,10,0,TAU,0,Math.PI/2),M.steel);s.position.set(.85,1.91,.5);turret.add(s)}
cy(turret,.05,.05,.8,6,M.steel,.85,2.43,.5);
bx(turret,.9,.06,.7,M.armor,.2,1.93,-.7);bx(turret,.7,.03,.5,M.grille,.2,1.97,-.7,{fit:1,rep:[2,2]});
// warning lamps 5 and 6 on the turret roof
lamp(5,-1.05,1.97,-.2);lamp(6,1.05,1.97,-.2);

/* ---- MAIN GUN: a huge charged-beam cannon. 'mainBarrel' slides back on Z (recoil, up to .6 m); coil1-3 and mainLens have their own emissive materials for the charge; the beam leaves 'mainMuzzle' ---- */
const mainGun=new T.Group();mainGun.name='mainGun';mainGun.position.set(0,1.28,-2.45);mainGun.scale.set(.8,.8,.86);turret.add(mainGun);   // (a little smaller than first drawn)
bx(mainGun,1.3,1.1,1.5,M.armor,0,0,.15);bx(mainGun,1.1,.5,.9,M.steel,0,.62,.1);
cy(mainGun,.62,.7,.35,16,M.steel,0,0,-.62,{ax:'z'});
const mainBarrel=new T.Group();mainBarrel.name='mainBarrel';mainGun.add(mainBarrel);
cy(mainBarrel,.4,.46,6.4,20,M.steel,0,0,-3.7,{ax:'z'});                     // the barrel, tapering to the muzzle
[-1.0,-2.5,-4.6].forEach(z=>cy(mainBarrel,.58,.58,.36,20,M.armor,0,0,z,{ax:'z'}));  // collars
bx(mainBarrel,.82,.1,.5,M.hazard,0,.52,-5.6,{fit:1});bx(mainBarrel,.82,.1,.5,M.hazard,0,-.52,-5.6,{fit:1});
cy(mainBarrel,.5,.34,.9,20,M.armor,0,0,-6.55,{ax:'z'});                      // muzzle bell
[-.4,.4].forEach(x=>bx(mainBarrel,.08,.5,.5,M.rubber,x,0,-6.3));            // vents
const coilMat=()=>S({color:0x2a0505,emissive:0xff1a0c,emissiveIntensity:.3,roughness:.4});
[[1,-1.8],[2,-3.1],[3,-4.0]].forEach(([n,z])=>{const c=new T.Mesh(new T.TorusGeometry(.56,.1,8,24),coilMat());c.name='coil'+n;c.position.set(0,0,z);mainBarrel.add(c)});
const lens=new T.Mesh(new T.CylinderGeometry(.24,.2,.16,16),S({color:0x2a0505,emissive:0xff2a14,emissiveIntensity:.3,roughness:.25}));lens.name='mainLens';lens.rotation.x=Math.PI/2;lens.position.set(0,0,-6.95);mainBarrel.add(lens);
const mainMuzzle=new T.Object3D();mainMuzzle.name='mainMuzzle';mainMuzzle.position.set(0,0,-7.05);mainBarrel.add(mainMuzzle);

/* ---- SIDE GUNS: two independent turrets on sponsons; 'sideGunL/R' slide back on Z when they fire; muzzles sideMuzzleL1/L2, R1/R2 ---- */
[['L',-1],['R',1]].forEach(([c,sx])=>{
  const sp=new T.Group();sp.name='sideTurret'+c;sp.position.set(sx*2.15,1.13,.55);turret.add(sp);
  bx(turret,1.0,.3,1.2,M.armor,sx*1.95,.95,.55);                        // the sponson the turret stands on
  cy(sp,.62,.66,.3,16,M.steel,0,-.02,0);
  {const d=cy(sp,.5,.6,.5,8,M.armor,0,.38,0);d.rotation.y=Math.PI/8}
  bx(sp,.7,.4,.5,M.armor,0,.45,-.5);bx(sp,.5,.04,.4,M.red,0,.7,-.35);
  cy(sp,.12,.12,.14,10,M.lens,0,.72,.1);
  const gun=new T.Group();gun.name='sideGun'+c;gun.position.set(0,.45,-.75);sp.add(gun);
  // one heavy barrel: a thick recoil sleeve, the barrel, a vented muzzle brake and a hazard band
  cy(gun,.26,.28,.9,16,M.armor,0,0,-.35,{ax:'z'});                              // the recoil sleeve
  cy(gun,.13,.16,2.1,14,M.steel,0,0,-1.55,{ax:'z'});                            // the barrel, a little thicker at the breech
  [-.9,-2.0].forEach(z=>cy(gun,.2,.2,.18,14,M.armor,0,0,z,{ax:'z'}));            // collars
  cy(gun,.22,.2,.42,14,M.armor,0,0,-2.5,{ax:'z'});                              // the muzzle brake
  [-.14,.14].forEach(x=>bx(gun,.05,.22,.28,M.rubber,x,0,-2.5));                  // its vents
  bx(gun,.4,.5,.1,M.hazard,0,0,-1.45,{fit:1});                                   // the hazard band
  bx(gun,.34,.16,.3,M.armor,0,.3,-.2);cy(gun,.06,.06,.1,10,M.lens,0,.3,-.37,{ax:'z'});   // a sight on top
  {const m=new T.Object3D();m.name='sideMuzzle'+c+'1';m.position.set(0,0,-2.75);gun.add(m)}
});

/* ---- VLS: 9 cells (3 x 3) on the left rear deck pad (x -1.45, z 1.8 .. 3.7); the lid 'vlsLid' hinges at the REAR edge: rotation.x from 0 (shut) to +1.9 (open); vlsMuzzle1..9 at the cell mouths ---- */
{
  const px=-1.45,pz=2.75;
  bx(hull,1.7,.1,1.7,M.rubber,px,2.46,pz);
  [[1.94,.5,.08,0,.95],[1.94,.5,.08,0,-.95],[.08,.5,1.9,.97,0],[.08,.5,1.9,-.97,0]].forEach(([w,h,d,ox,oz])=>bx(hull,w,h,d,M.armor,px+ox,2.68,pz+oz));  // the coaming
  let n=0;
  for(let j=0;j<3;j++)for(let i=0;i<3;i++){
    const x=px+(i-1)*.54,z=pz+(j-1)*.56;
    bx(hull,.46,.4,.46,M.steel,x,2.66,z);bx(hull,.5,.03,.5,M.red,x,2.87,z);
    const m=new T.Object3D();m.name='vlsMuzzle'+(++n);m.position.set(x,2.9,z);hull.add(m);
  }
  const lid=new T.Group();lid.name='vlsLid';lid.position.set(px,2.97,pz+.95);hull.add(lid);
  bx(lid,1.9,.14,1.9,M.armor,0,0,-.95);bx(lid,1.5,.04,.6,M.hazard,0,.09,-.55,{fit:1,rep:[3,1]});bx(lid,1.7,.04,.1,M.red,0,.09,-1.7);
  [-.7,.7].forEach(x=>bx(lid,.06,.1,1.7,M.steel,x,.1,-.95));
}

/* ---- DRONE BAYS: 4 hatches on the right rear deck pad (x 1.45, z 2.55). Each lid 'droneLid1'..'droneLid4' hinges at its REAR edge: rotation.x from 0 (shut) to +1.5 (open); 'droneSpawn1'..'4' about .65 m above the bay ---- */
{
  let n=0;
  [[-.5,-.52],[.5,-.52],[-.5,.52],[.5,.52]].forEach(([ox,oz])=>{
    n++;const x=1.45+ox,z=2.75+oz;
    bx(hull,.9,.12,.95,M.rubber,x,2.46,z);
    [[.98,.18,.06,0,.5],[.98,.18,.06,0,-.5],[.06,.18,.95,.46,0],[.06,.18,.95,-.46,0]].forEach(([w,h,d,qx,qz])=>bx(hull,w,h,d,M.steel,x+qx,2.52,z+qz));
    const lid=new T.Group();lid.name='droneLid'+n;lid.position.set(x,2.6,z+.475);hull.add(lid);
    bx(lid,.9,.1,.95,M.armor,0,0,-.475);bx(lid,.5,.03,.3,M.hazard,0,.07,-.4,{fit:1});bx(lid,.04,.03,.75,M.red,.36,.07,-.475);
    const sp=new T.Object3D();sp.name='droneSpawn'+n;sp.position.set(x,3.25,z);hull.add(sp);
  });
}

/* ---- paint, lamps, smoke ---- */
M.armor.userData.paint=true;M.skirt.userData.paint=true;M.grime.userData.paint=true;
[[0,3.0,3.0],[1.4,2.9,3.4],[-1.4,2.9,3.4],[0,2.4,.3]].forEach(([x,y,z],i)=>{const s=new T.Object3D();s.name='smoke'+(i+1);s.position.set(x,y,z);(i===3?turret:hull).add(s)});

// merged bolt heads (hull, then the turret's)
const boltMesh=(list,par)=>{const gs=list.map(b=>{const g=new T.CylinderGeometry(.055,.07,.05,6,1);g.rotateX(b[3]);g.rotateZ(b[4]);g.translate(b[0],b[1],b[2]);return g});par.add(new T.Mesh(mergeG(gs),M.steel))};
boltMesh(bolts,hull);boltMesh(turretBolts,turret);

root.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true}});
return root}
