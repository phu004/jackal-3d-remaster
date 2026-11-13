// An oil-fired power station with its fuel tank farm and fuel pier, for the secret level's island (made in Claude.ai: asset-sources/oil-fired-power-station.html). Front (the long turbine hall) faces -Z, the tank farm and the pier lie on +Z.
// Footprint about 43 x 32 m on land, plus a 20 m pier; chimneys 23.5 m. Two child groups, 'intact' and 'ruin' (hidden until the plant is destroyed). opts.snow(material, key): lets the game coat the roofs and tanks in snow.
// (the preview's coreGlow point light is left out: a light in the scene makes every material in the game rebuild its shader)
import * as THREE from 'three';

export function buildPowerStation(opts={}){
const T=THREE,P=Math.PI,TC={},MC={};let sd=11;
const rnd=()=>(sd=sd*16807%2147483647)/2147483647,rr=(a,b)=>a+rnd()*(b-a);
const cvt=(w,h,f)=>{const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d'));const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;return t};
const sp=(g,n,a)=>{for(let i=0;i<n;i++){const v=rnd()<.5?0:255;g.fillStyle=`rgba(${v},${v},${v},${a})`;g.fillRect(rnd()*256,rnd()*256,2,2)}};
const sk=(g,c,n)=>{for(let i=0;i<n;i++){const l=rr(40,170),q=g.createLinearGradient(0,0,0,l);q.addColorStop(0,c);q.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=q;g.fillRect(rnd()*256,rnd()*60,rr(2,8),l)}};
const gm=(g,c)=>{const q=g.createLinearGradient(0,150,0,256);q.addColorStop(0,'rgba(0,0,0,0)');q.addColorStop(1,c);g.fillStyle=q;g.fillRect(0,150,256,106)};
const gl=(g,c,xs,ys)=>{g.strokeStyle=c;g.lineWidth=2;g.beginPath();xs.forEach(x=>{g.moveTo(x,0);g.lineTo(x,256)});ys.forEach(y=>{g.moveTo(0,y);g.lineTo(256,y)});g.stroke()};
const fl=(g,c)=>{g.fillStyle=c;g.fillRect(0,0,256,256)};
const TX={
conc:g=>{fl(g,'#8c8982');sp(g,1800,.06);gl(g,'rgba(30,28,25,.5)',[0,128],[0,128]);sk(g,'rgba(45,38,30,.35)',8);gm(g,'rgba(25,22,18,.55)')},
wall:g=>{fl(g,'#9a9488');sp(g,1800,.06);gl(g,'rgba(40,36,30,.45)',[0,64,128,192],[0,128]);sk(g,'rgba(60,45,30,.35)',8);gm(g,'rgba(25,22,18,.5)')},
roof:g=>{fl(g,'#6a7076');sp(g,1500,.05);gl(g,'rgba(20,22,25,.6)',[0,64,128,192],[]);gl(g,'rgba(190,195,200,.25)',[4,68,132,196],[]);gl(g,'rgba(20,20,20,.4)',[],[128]);sk(g,'rgba(120,65,30,.4)',7);gm(g,'rgba(20,18,15,.4)')},
tank:g=>{fl(g,'#7d8286');sp(g,1500,.05);gl(g,'rgba(25,25,25,.55)',[0,128],[0,85,170]);sk(g,'rgba(115,62,32,.4)',8);gm(g,'rgba(20,15,10,.6)')},
rust:g=>{fl(g,'#7b4b2f');sp(g,2500,.12);sk(g,'rgba(40,20,10,.5)',8)},
haz:g=>{fl(g,'#d9b21a');g.fillStyle='#161616';for(let i=-256;i<512;i+=64){g.beginPath();g.moveTo(i,256);g.lineTo(i+32,256);g.lineTo(i+288,0);g.lineTo(i+256,0);g.fill()}sp(g,1500,.12)},
band:g=>{for(let i=0;i<8;i++){g.fillStyle=i%2?'#8d9296':'#c4561a';g.fillRect(i*32,0,32,256)}sp(g,1500,.08);sk(g,'rgba(40,30,20,.3)',6)},
chim:g=>{fl(g,'#8d8b86');sp(g,1500,.07);sk(g,'rgba(40,35,30,.5)',14);gm(g,'rgba(25,22,18,.5)')},
domeo:g=>{fl(g,'#c4561a');sp(g,1800,.07);sk(g,'rgba(60,25,10,.35)',8);gm(g,'rgba(30,14,6,.35)')},
oil:g=>{const q=g.createRadialGradient(128,128,10,128,128,126);q.addColorStop(0,'rgba(12,10,8,.85)');q.addColorStop(.6,'rgba(18,14,10,.5)');q.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=q;g.fillRect(0,0,256,256)}};
const tex=(n,rx,ry)=>{const k=n+rx+ry;if(!TC[k]){const t=cvt(256,256,TX[n]);t.repeat.set(rx,ry);TC[k]=t}return TC[k]};
const MD={conc:{m:'conc',rx:2,r:.95},concD:{m:'conc',c:0x8a867f,rx:2,r:1},wall:{m:'wall',rx:4,r:.9},wallB:{m:'wall',c:0x5a554f,rx:4,r:1},
roof:{m:'roof',rx:8,r:.65,mt:.35},steel:{c:0x575d62,r:.55,mt:.6},tank:{m:'tank',rx:4,r:.65,mt:.35},burnt:{c:0x151413,r:1,s:2},rust:{m:'rust',r:.9},
haz:{m:'haz',rx:2,r:.8},band:{m:'band',r:.7},chim:{m:'chim',r:.9,s:2},chimO:{m:'chim',c:0xd0662a,r:.85,s:2},dark:{c:0x1a1b1d,r:.85},
glass:{c:0x2b3c4a,r:.15,mt:.6,e:0x08121a},org:{c:0xc4561a,r:.7},domeO:{m:'domeo',rx:2,r:.7},lag:{c:0xa49b8a,r:.85},pipe:{c:0x484e54,r:.5,mt:.6},porc:{c:0xb9ad94,r:.4},
tfm:{c:0x56635b,r:.6,mt:.3},red:{c:0x400000,e:0xff1414,ei:2.5},glow:{c:0x331100,e:0xff6a1a,ei:2.2},oil:{m:'oil',tr:1,r:.2}};
const M=k=>{if(MC[k])return MC[k];const d=MD[k],o={color:d.c??0xffffff,roughness:d.r??.8,metalness:d.mt??0};if(d.m)o.map=tex(d.m,d.rx||1,d.ry||1);if(d.e){o.emissive=d.e;o.emissiveIntensity=d.ei||1}
if(d.tr){o.transparent=true;o.depthWrite=false;o.polygonOffset=true;o.polygonOffsetFactor=-2}if(d.s)o.side=2;let mm=new T.MeshStandardMaterial(o);if(opts.snow&&['roof','conc','concD','tank','band','lag','wall','domeO'].includes(k))mm=opts.snow(mm,k);return MC[k]=mm};
const lab=(s,c='#d8d2c0')=>{const k='L'+s+c;return MC[k]||(MC[k]=new T.MeshStandardMaterial({map:cvt(128,64,g=>{g.font='bold 44px Arial';g.fillStyle=c;g.textAlign='center';g.textBaseline='middle';g.fillText(s,64,34)}),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,roughness:.9}))};
const add=(p,ge,m,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const o=new T.Mesh(ge,typeof m=='string'?M(m):m);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);o.castShadow=o.receiveShadow=true;p.add(o);return o};
const bx=(p,m,w,h,d,x,y,z,ry,rx,rz)=>add(p,new T.BoxGeometry(w,h,d),m,x,y,z,rx,ry,rz);
const cy=(p,m,r,h,x,y,z,rx,rz,s=16,r2)=>add(p,new T.CylinderGeometry(r2??r,r,h,s),m,x,y,z,rx,0,rz);
const pl=(p,m,w,h,x,y,z,rx,ry,rz)=>{const o=add(p,new T.PlaneGeometry(w,h),m,x,y,z,rx,ry,rz);o.castShadow=false;return o};
const tor=(p,m,R,t,x,y,z,rx=P/2,s=20)=>add(p,new T.TorusGeometry(R,t,6,s),m,x,y,z,rx,0,0);
const sph=(p,m,r,x,y,z)=>add(p,new T.SphereGeometry(r,12,8),m,x,y,z);
const G=(n,p,x=0,y=0,z=0)=>{const g=new T.Group();g.name=n;g.position.set(x,y,z);p&&p.add(g);return g};
const pp=(p,m,r,a,b,s=10)=>{const v=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),L=v.length(),o=add(p,new T.CylinderGeometry(r,r,L,s),m,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return o};
const rail=(p,x1,z1,x2,z2,y)=>{const L=Math.hypot(x2-x1,z2-z1),a=Math.atan2(-(z2-z1),x2-x1),n=Math.max(1,Math.round(L/1.6)),mx=(x1+x2)/2,mz=(z1+z2)/2;bx(p,'steel',L,.06,.06,mx,y+1,mz,a);bx(p,'steel',L,.05,.05,mx,y+.5,mz,a);for(let i=0;i<=n;i++)bx(p,'steel',.06,1,.06,x1+(x2-x1)*i/n,y+.5,z1+(z2-z1)*i/n)};
const rub=(p,x,z,n,s,y=0,ms=['conc','concD','burnt','rust'])=>{for(let i=0;i<n;i++){const o=add(p,new T.DodecahedronGeometry(rr(.2,.6),0),ms[i%ms.length],x+rr(-s,s),y+rr(.1,.4),z+rr(-s,s),rnd()*3,rnd()*3,rnd()*3);o.scale.set(rr(.8,2),rr(.4,1),rr(.8,2))}};
const gird=(p,x,y,z,L,rx,ry,rz)=>{let q=G('',p,x,y,z);q.rotation.set(rx,ry,rz);const l=L/2;for(let k=0;k<2;k++){bx(q,'rust',l,.35,.08,l/2,0,0);bx(q,'rust',l,.08,.3,l/2,.17,0);bx(q,'rust',l,.08,.3,l/2,-.17,0);q=G('',q,l,0,0);q.rotation.set(rr(-1,1),rr(-.3,.3),rr(-.5,.5))}};

function hall(V,R){const g=G('turbineHall',V,0,0,-13);bx(g,'conc',30.6,.7,6.6,0,.35,0);
if(!R)bx(g,'wall',30,7,6,0,3.5,0);else{[[-15,-5,7],[-5,4,3.6],[4,15,6]].forEach(([a,b,h])=>[-2.75,2.75].forEach(z=>bx(g,'wallB',b-a,h,.5,(a+b)/2,h/2,z)));bx(g,'wallB',.5,6.5,6,-14.75,3.25,0);bx(g,'wallB',.5,5.2,6,14.75,2.6,0);bx(g,'dark',29,.2,5.5,0,.75,0);[-9,-1,7].forEach((x,i)=>cy(g,i?'rust':'burnt',1.2,6,x,2,0,0,P/2,14))}
for(let i=2;i<10;i++){const x=-13.5+i*3;if(R&&x>-5&&x<4)continue;bx(g,'glass',2,1.2,.1,x,4.6,-3.02)}
bx(g,'steel',4.9,5.1,.12,-11.9,2.55,-3.03);bx(g,'dark',4.6,4.8,.15,-11.9,2.4,-3.07);for(let k=0;k<7;k++)bx(g,'steel',4.6,.07,.05,-11.9,.5+k*.62,-3.16);bx(g,'haz',4.9,.4,.08,-11.9,.25,-3.13);pl(g,lab('TH-1'),2.2,1.1,-11.9,5.9,-3.07,0,P);bx(g,'haz',6,.9,.1,9.5,.8,-3.06);pl(g,lab('07'),1.4,.7,3,1.6,-3.06,0,P);
if(!R){bx(g,'roof',30.2,.35,6.2,0,7.17,0);[-9,0,9].forEach(x=>{bx(g,'steel',8,.3,2.4,x,7.5,1);bx(g,'glass',7.4,.08,1.9,x,7.68,1,0,.18)});for(let x=-12;x<=12;x+=6)bx(g,'steel',.25,.25,6.2,x,7.4,0);
[-13,-6,5,12].forEach(x=>cy(g,'steel',.45,.8,x,7.55,2.3,0,0,12,.12));cy(g,'pipe',.35,11,-8,7.7,-1.2,0,P/2);for(let x=-13;x<-2;x+=2.5)cy(g,'steel',.42,.15,x,7.7,-1.2,0,P/2);
bx(g,'haz',1.2,.12,1.2,12,7.4,-.5);bx(g,'steel',28,.1,1,0,7.4,-2.4);rail(g,-14,-2.9,14,-2.9,7.4);rail(g,-14,-2.9,-14,-1.9,7.4)}
else{bx(g,'roof',10,.35,6.2,-10,7.17,0);bx(g,'steel',8,.3,2.4,-10,7.5,1);bx(g,'roof',7,.3,6,10.5,5.6,0,0,0,-.3);bx(g,'roof',6,.3,5,0,2.6,0,0,.1,.5);bx(g,'roof',5,.3,4.6,-3.5,4.2,0,0,0,-.62);
for(let i=0;i<5;i++)gird(g,rr(-6,8),rr(3,6.5),rr(-2,2),rr(4,7),rr(-.5,.5),rr(0,3),rr(-.8,.8));rub(g,0,0,16,5,.7);rub(g,2,-4.5,8,6,0)}}

function boiler(V,R){const g=G('boilerBlock',V,0,0,-6);bx(g,'conc',26.6,.6,8.6,0,.3,0);bx(g,R?'wallB':'wall',26,11.4,8,0,6.3,0);
for(let i=0;i<=8;i++){const x=-12+i*3;bx(g,'concD',.5,11.4,.3,x,6.3,-4.1);if(i<8)bx(g,'dark',.3,2.6,.05,x+1.5,8,-4.06)}
bx(g,'rust',26,.5,.1,0,3,-4.05);[-10,-4,4,10].forEach((cx,i)=>{pl(g,lab('B-'+(i+1)),1.6,.8,cx,5,-4.07,0,P);
if(R&&i==0){bx(g,'wallB',5.6,1.2,8,cx,12.6,0,0,0,.06);rub(g,cx,0,12,3,12.3);gird(g,cx-2,13,-1,5,.3,.5,.6);gird(g,cx+1,12.6,1.5,4,-.4,1,.3);return}
bx(g,R?'wallB':'wall',5.6,2.2,8.2,cx,13,0);bx(g,'roof',5.8,.25,8.4,cx,14.12,0,0,0,R&&i==2?.28:0);
if(R&&i==2){rub(g,cx,0,6,2,13.8);return}
bx(g,'steel',3,.2,1.6,cx,14.3,-1.5);bx(g,'glass',2.7,.06,1.3,cx,14.45,-1.5,0,.2);bx(g,'haz',1,.1,1,cx+1.6,14.3,-3);bx(g,'pipe',1.1,.8,3.4,cx+1.2,14.6,2);cy(g,'pipe',.3,1,cx-1.8,14.7,2.8,0,0,12,.18)});
bx(g,'steel',24.6,.08,1,0,14.55,-3.4);for(let x=-12;x<=12;x+=4)bx(g,'steel',.12,.35,.12,x,14.37,-3.4);rail(g,-12.3,-3.9,12.3,-3.9,14.55);rail(g,-12.3,-2.9,12.3,-2.9,14.55);
cy(g,'lag',.4,R?10:23,R?6:0,14.95,1.8,0,P/2);for(let x=-9;x<=9;x+=3)if(!R||x>0)cy(g,'steel',.5,.15,x,14.95,1.8,0,P/2);tor(g,'org',.25,.03,8,15.5,1.8,P/2);
[-7,7].forEach(x=>{if(!R||x>0){bx(g,'steel',2.2,2.2,2.6,x,8.6,5.3);bx(g,'concD',2.6,.3,.5,x,9.8,4.1)}});
for(let k=0;k<6;k++)bx(g,'steel',2.6,.08,.1,0,12.2,-2.5+k);
const c=G('coreGlow',g,0,12.06,0);add(c,new T.BoxGeometry(2.2,.12,6.4),'glow');c.visible=false;
if(R){pl(g,'oil',7,6,2,14.3,0,-P/2);rub(g,5,-5,10,2,0)}
else{[-10,-4,4,10].forEach((cx,i)=>{const b=G('droneBay'+i,g,cx-.6,14.245,.35); // a drone launch bay on each boiler house roof, between the skylight and the lagged pipe: a low steel coaming round a dark well, closed by two sliding doors (droneBayL/droneBayR, which the game slides apart when a drone is launched), with a hazard strip and a beacon
bx(b,'steel',2.1,.34,.16,0,.17,-.95);bx(b,'steel',2.1,.34,.16,0,.17,.95);bx(b,'steel',.16,.34,1.74,-.97,.17,0);bx(b,'steel',.16,.34,1.74,.97,.17,0);bx(b,'dark',1.78,.04,1.78,0,.3,0);bx(b,'haz',2.1,.03,.12,0,.355,1.1);
cy(b,'red',.11,.18,1.0,.45,-.95,0,0,10);
[-1,1].forEach(s=>{const d=G(s<0?'droneBayL'+i:'droneBayR'+i,b,s*.5,.38,0);bx(d,'roof',1.0,.09,1.9,0,0,0);bx(d,'haz',.8,.012,.12,0,.05,.78);bx(d,'steel',.9,.05,.08,0,.06,0)})})}}

function chim(V,R,x,n){const g=G(n,V,x,0,.2),cut=R&&n=='chimneyR'?11:22,rd=y=>1.45-.5*y/22,sg=[[0,13,'chim'],[13,17,'chimO'],[17,19.5,'chim'],[19.5,22,'chimO']];
bx(g,'conc',3,1,3,0,.5,0);sg.forEach(([a,b,m])=>{const t=Math.min(b,cut);if(t>a)add(g,new T.CylinderGeometry(rd(t),rd(a),t-a,24,1,true),m,0,(a+t)/2,0)});add(g,new T.CircleGeometry(rd(17),24),'dark',0,17,0,-P/2);
[13,17,19.5].forEach(a=>{if(a<cut)cy(g,'steel',rd(a)+.12,.25,0,a,0,0,0,24)});cy(g,'haz',rd(2)+.03,1.2,0,2.4,0,0,0,24);
bx(g,'steel',.06,cut-1.5,.06,-.25,cut/2+.5,rd(cut/2)+.12);bx(g,'steel',.06,cut-1.5,.06,.25,cut/2+.5,rd(cut/2)+.12);
if(cut==22){add(g,new T.RingGeometry(rd(22)-.12,rd(22)+.14,24),'steel',0,22.03,0,-P/2);tor(g,'steel',rd(22)+.14,.04,0,22.03,0,P/2,24)}
else{for(let k=0;k<9;k++){const a=k/9*P*2,h=rr(.5,1.9);bx(g,'chim',.5,h,.3,rd(11)*Math.cos(a),11+h/2-.2,rd(11)*Math.sin(a),-a);if(k%3==0)cy(g,'rust',.03,1.4,rd(11)*.8*Math.cos(a),11.6,rd(11)*.8*Math.sin(a),rr(-.4,.4),rr(-.4,.4),5)}
const f=G('',g,6,1.2,2.2);f.rotation.set(0,.5,.1);sg.forEach(([a,b,m])=>{if(b>11){const a0=Math.max(a,11);add(f,new T.CylinderGeometry(rd(b),rd(a0),b-a0,20,1,true),m,(a0+b)/2-11,0,0,0,0,-P/2)}});rub(g,4,1,8,4,0)}}

function yard(V,R){const g=G('transformerYard',V,18.8,0,-11);bx(g,'concD',5.6,.2,8,0,.1,0);
[[-2.8,-4,2.8,-4],[-2.8,4,2.8,4],[-2.8,-4,-2.8,4],[2.8,-4,2.8,4]].forEach((s,i)=>{if(R&&i%2)return;rail(g,...s,.2);rail(g,...s,1.2)});pl(g,lab('HV','#e0c020'),1.4,.7,0,1.6,-4.1,0,P);
[-2,2].forEach((z,i)=>{const d=R&&i,t=G('',g,-.4,.2,z),m=d?'burnt':'tfm';if(d)t.rotation.z=.35;bx(t,m,2.2,2.2,1.9,0,1.1,0);bx(t,'steel',2.3,.15,2,0,2.25,0);for(let j=0;j<5;j++)bx(t,m,.1,1.7,1.4,1.3+j*.2,1.2,0);
[-.7,0,.7].forEach(x=>cy(t,d?'burnt':'porc',.14,1.1,x,2.9,0,0,0,10,.08));cy(t,'steel',.3,2,0,2.55,.0,P/2);if(!d)pp(g,'dark',.04,[-1.1,3.2,z],[2.4,9.1,z*1.2])});
if(R)pl(g,'oil',4,4,-.4,.22,2,-P/2);
[-3.5,3.5].forEach((z,i)=>{const o=G('',g,2.4,.2,z);if(R&&i)o.rotation.z=.28;bx(o,'steel',.25,10,.25,0,5,0)});bx(g,'steel',.25,.25,7.5,2.4,10.2,0,0,R?.2:0);
if(!R)[-.8,0,.8].forEach(z=>cy(g,'porc',.1,1,2.4,9.6,z,0,0,10))}

function mast(V,R){const g=G('cableMast',V,-20,0,-11),C=[[1,1],[1,-1],[-1,-1],[-1,1]],w=y=>.9-.6*y/16;if(R)g.rotation.z=.1;
C.forEach(c=>pp(g,'steel',.08,[c[0]*.9,0,c[1]*.9],[c[0]*.3,16,c[1]*.3]));
for(let i=0;i<4;i++){const y0=i*4,y1=y0+4;for(let j=0;j<4;j++){const a=C[j],b=C[(j+1)%4];pp(g,'steel',.04,[a[0]*w(y0),y0,a[1]*w(y0)],[b[0]*w(y1),y1,b[1]*w(y1)],5);pp(g,'steel',.05,[a[0]*w(y1),y1,a[1]*w(y1)],[b[0]*w(y1),y1,b[1]*w(y1)],5)}}
bx(g,'steel',.15,.15,R?1.4:2.4,0,14.2,R?-.5:0);bx(g,'steel',.15,.15,R?1.4:2.4,0,16,0);if(!R)[-.8,0,.8].forEach(z=>cy(g,'porc',.1,1.2,0,13.6,z,0,0,10));
[-.8,0,.8].forEach(z=>{const pts=R?[[41.2,9.2],[36,6],[30,2],[24,.2]]:[[41.2,9.2],[30,10.1],[20,10.5],[10,11.4],[0,13]];const mk=a=>new T.CatmullRomCurve3(a.map(p=>new T.Vector3(p[0],p[1],z)));add(g,new T.TubeGeometry(mk(pts),24,.09,5),'dark');
if(R)add(g,new T.TubeGeometry(mk([[0,13],[3,9],[7,3],[11,.2]]),20,.09,5),'dark')});}

function intake(V,R){const g=G('intakePipes',V);[-16,-17.8].forEach((x,i)=>{const z1=R&&i?-4:1.5;pp(g,'pipe',.8,[x,1.2,-13],[x,1.2,z1],20);for(let z=-11;z<z1;z+=3){cy(g,'steel',.92,.25,x,1.2,z,P/2,0,20);bx(g,'conc',1.8,.6,.5,x,.3,z)}
if(R&&i){cy(g,'burnt',.8,.1,x,1.2,-4,P/2,0,12);pl(g,'oil',5,5,x,.12,-2,-P/2)}});
tor(g,'org',.3,.04,-16,2.4,-8,0);bx(g,'steel',.06,.8,.06,-16,2.1,-8);bx(g,'conc',5,2.2,1,-16.9,1.1,2.1);pl(g,lab('IN-2'),1.6,.8,-16.9,1.2,2.62,0,0)}

function tank(Pn,i,x,z,r,h,dome,R,dead){const g=G('tank'+(i+1),Pn,x,0,z),fm=new T.MeshStandardMaterial({color:0x1b1710,roughness:.25,metalness:.15});g.userData.fuelMat=fm;
if(dead){const ge=new T.CylinderGeometry(r,r*.93,h*.42,20,3,true),pa=ge.attributes.position;for(let k=0;k<pa.count;k++){const t=pa.getY(k)>0?1:.3;pa.setXYZ(k,pa.getX(k)+rr(-.4,.4)*t,pa.getY(k)+rr(-.2,.2)*t,pa.getZ(k)+rr(-.4,.4)*t)}ge.computeVertexNormals();
add(g,ge,'burnt',0,h*.21,0);cy(g,'burnt',r*.94,.12,0,.1,0,0,0,20);cy(g,'burnt',r*.8,.15,.8,h*.25,-.4,.3,.35,20);pl(g,'oil',r*3,r*3,0,.13,0,-P/2);gird(g,-2,2.5,1,5,.3,.8,.5);gird(g,1,1.6,-2,4,.1,2.4,-.4);rub(g,0,0,10,r,0,['burnt','rust','burnt']);return g}
cy(g,'concD',r+.15,.35,0,.17,0,0,0,28);add(g,new T.CylinderGeometry(r,r,h,28,1,dome),'tank',0,h/2,0);add(g,new T.CylinderGeometry(r+.04,r+.04,1.1,28,1,true),'band',0,h-.55,0);
pl(g,'oil',r*2.7,r*2.7,rr(-.6,.6),.12,rr(-.6,.6),-P/2,0,rnd()*3);pl(g,lab('T-'+(i+1)),1.8,.9,0,h*.5,r+.03);
if(dome){const Rs=r*1.7,th=Math.asin(r/Rs),y0=h-Rs*Math.cos(th),ry=q=>y0+Math.sqrt(Rs*Rs-q*q);add(g,new T.SphereGeometry(Rs,28,8,0,P*2,0,th),'domeO',0,y0,0);
[[1.6,.8],[2.4,3.9]].forEach(([q,a])=>{cy(g,'steel',.45,.3,q*Math.cos(a),ry(q)+.05,q*Math.sin(a),0,0,14);cy(g,'dark',.3,.1,q*Math.cos(a),ry(q)+.22,q*Math.sin(a),0,0,10)});
cy(g,'steel',.22,.8,0,ry(0)+.3,0,0,0,12);cy(g,'steel',.4,.12,0,ry(0)+.75,0,0,0,12,.05);cy(g,'steel',.15,.6,-2.6,ry(2.6)+.25,.8,0,0,10)}
else{cy(g,'band',r-.2,.15,0,h-1.4,0,0,0,28);tor(g,'steel',r-.45,.28,0,h-1.35,0);[-1.5,1.5].forEach(q=>{cy(g,'steel',.45,.3,q,h-1.2,1.8,0,0,14);cy(g,'dark',.3,.1,q,h-1.03,1.8,0,0,10)});pl(g,lab('T-'+(i+1)),3,1.5,0,h-1.24,-1,-P/2);pp(g,'steel',.05,[r-.2,h,-1],[0,h-1.2,-1]);cy(g,'steel',.2,.5,2.2,h-1.1,-2.4,0,0,10)}
add(g,new T.RingGeometry(r-.05,r+.75,28),'steel',0,h+.05,0,-P/2);tor(g,'steel',r+.75,.04,0,h+1.1,0,P/2,28);for(let k=0;k<12;k++){const a=k/12*P*2;bx(g,'steel',.05,1.05,.05,(r+.75)*Math.cos(a),h+.55,(r+.75)*Math.sin(a))}
const a1=[],a2=[];for(let k=0;k<=40;k++){const a=k/40*P*2.2+.3,y=.3+(h-.3)*k/40;a1.push(new T.Vector3((r+.55)*Math.cos(a),y,(r+.55)*Math.sin(a)));a2.push(new T.Vector3((r+.8)*Math.cos(a),y+1,(r+.8)*Math.sin(a)))}
add(g,new T.TubeGeometry(new T.CatmullRomCurve3(a1),60,.28,4),'steel');add(g,new T.TubeGeometry(new T.CatmullRomCurve3(a2),60,.04,4),'steel');
const gx=(r+.2)*Math.cos(1),gz=(r+.2)*Math.sin(1),H=h*.7,y0=.6;bx(g,'dark',.3,H,.15,gx,y0+H/2,gz);const fill=bx(g,fm,.16,H,.2,gx,y0+H*.31,gz);fill.scale.y=.62;g.userData.setFuel=f=>{f=Math.max(.02,f);fill.scale.y=f;fill.position.y=y0+H*f/2};return g}

function farm(V,R){const g=G('tankFarm',V);bx(g,'concD',40.6,.1,11.6,0,.05,10.5);for(let i=0;i<6;i++)pl(g,'oil',rr(2,5),rr(2,5),rr(-18,18),.11,rr(6,15),-P/2,0,rnd()*3);
const W=(a,b,c,d)=>{const L=Math.hypot(c-a,d-b),n=(a+c)/2,m=(b+d)/2,an=Math.atan2(-(d-b),c-a);bx(g,'conc',L,2,.6,n,1,m,an);bx(g,'concD',L,.14,.8,n,2.05,m,an)};
(R?[[-20,5,-9,5],[-2,5,20,5],[-20,16,-2,16],[2,16,20,16],[-20,5,-20,8],[20,5,20,16]]:[[-20,5,20,5],[-20,16,-2,16],[2,16,20,16],[-20,5,-20,16],[20,5,20,16]]).forEach(s=>W(...s));
if(R){bx(g,'conc',3.2,1.2,.6,-5.5,.5,5.3,.3,.1,.5);bx(g,'conc',2.6,1.4,.6,-3.2,.5,6.6,1.2,.2,-.6);bx(g,'conc',3,1.4,.6,-20.6,.4,10,1.5,.1,.4);rub(g,-5.5,5.5,10,2.5);rub(g,-20,10,8,2.5)}
const TK=[[-14.5,10.5,3.75,6.8,1],[-5,10.5,4,7.2,0],[5,10.5,4.3,7.6,1],[14.5,10.5,3.9,6.6,0]];TK.forEach(([x,z,r,h,d],i)=>tank(g,i,x,z,r,h,d,R,R&&(i==1||i==2)));
const K=G('pipeRack',g);for(let x=-16;x<=16;x+=4){if(R&&Math.abs(x)<5)continue;bx(K,'steel',.3,3.2,.3,x,1.6,3.2);bx(K,'steel',.25,.25,1.8,x,3.25,3.2)}
const run=(a,b,y,z,r,m)=>{cy(K,m,r,b-a,(a+b)/2,y,z,0,P/2,12);for(let x=a+2;x<b;x+=4)cy(K,'steel',r+.1,.12,x,y,z,0,P/2,12)};
(R?[[-16,-6],[6,16]]:[[-16,16]]).forEach(([a,b])=>{run(a,b,2.9,3.2,.25,'lag');run(a,b,2.9,3.7,.15,'pipe');run(a,b,2.9,2.7,.1,'org')});
if(R){pp(K,'lag',.25,[-6,2.9,3.2],[-2,.5,3.6]);pp(K,'lag',.25,[6,2.9,3.2],[3,.4,2.6]);pp(K,'pipe',.15,[-6,2.9,3.7],[-3,1,4.4]);gird(K,0,.6,3.5,6,.1,.3,.2)}
TK.forEach(([x,z,r],i)=>{const dd=R&&(i==1||i==2);pp(K,'lag',.18,[x,2.9,3.2],[x,1,3.2]);if(dd){pp(K,'lag',.18,[x,1,3.2],[x+1,.3,5.3]);return}pp(K,'lag',.18,[x,1,3.2],[x,1,z-r+.1]);bx(K,'steel',.5,.5,.5,x,1,4.1);bx(K,'steel',.06,.6,.06,x,1.5,4.1);tor(K,'org',.22,.03,x,1.85,4.1);cy(K,'steel',.28,.12,x,1,3.6,P/2);cy(K,'steel',.28,.12,x,1,4.7,P/2)});
pp(K,'lag',.22,[0,2.9,3.2],[0,1,3.2]);pp(K,'lag',.22,[0,1,3.2],[0,1,15]);for(let z=5;z<15;z+=3)cy(K,'steel',.3,.12,0,1,z,P/2);pp(K,'lag',.22,[0,1,15],[-.9,2,15.6]);
const H=G('pumpHouse',g,-14,0,1);bx(H,'conc',4.4,.4,3.4,0,.2,0);bx(H,R?'wallB':'wall',4,3.2,3,0,2,0);bx(H,'roof',4.4,.25,3.4,0,3.72,0,0,0,R?.25:0);if(!R)[-1,1].forEach(s=>cy(H,'pipe',.25,.5,s*1.2,4.1,.6,0,0,12,.12));
bx(H,'dark',1,2.2,.1,-1,1.5,1.55);pl(H,lab('P-1'),1.4,.7,1,2.6,1.56,0,0);bx(H,'haz',4,.5,.05,0,.65,1.53);cy(H,'steel',.45,1.1,2.9,.9,.5,0,P/2);
const F=G('heatedFuelLine',g),zl=-1.65,fb=(a,b)=>{pp(F,'lag',.2,[a,2.5,zl],[b,2.5,zl],12);for(let x=a+1;x<b;x+=1.6)cy(F,'org',.23,.16,x,2.5,zl,0,P/2,12)};
pp(F,'lag',.2,[-14,2.5,-.5],[-14,2.5,zl],12);if(R){fb(-14,-2);pp(F,'lag',.2,[-2,2.5,zl],[0,.5,-.5],12);fb(4,10)}else fb(-14,10);
for(let x=-12;x<=8;x+=4)bx(F,'steel',.2,2.4,.2,x,1.2,zl);[-10,-4,4,10].forEach((x,i)=>{if(R&&i==0)return;pp(F,'lag',.18,[x,2.5,zl],[x,6.2,zl]);bx(F,'steel',1.2,.7,.5,x,6.2,-2.2)})}

function pier(V,R){const g=G('fuelPier',V);const dz=R?9:18,zc=15+dz/2;bx(g,'conc',4,.5,dz,0,1.15,zc);[-1.9,1.9].forEach(x=>bx(g,'concD',.25,.3,dz,x,1.55,zc));
for(let z=16;z<=(R?24:32);z+=4)[-1.6,1.6].forEach(x=>cy(g,'concD',.28,5,x,-1.2,z,0,0,12));pl(g,lab('B-1','#e8e0c0'),2,1,.2,1.42,R?21:30,-P/2);bx(g,'haz',4,.02,.8,0,1.42,R?24:33.5);
const lim=R?24:33;for(let z=R?19:19;z<=(R?23:31);z+=6)[-1.65,1.65].forEach(x=>{cy(g,'steel',.22,.45,x,1.65,z,0,0,12,.16);cy(g,'steel',.28,.12,x,1.95,z,0,0,12)});
rail(g,-1.95,16,-1.95,lim,1.4);if(R)rail(g,1.95,16,1.95,24,1.4);else{rail(g,1.95,16,1.95,24.8,1.4);rail(g,1.95,27.2,1.95,33,1.4)}
const pe=R?24:31;for(let z=16;z<pe;z+=3)bx(g,'steel',.2,.6,.2,-.9,1.7,z);
if(!R){pp(g,'lag',.22,[-.9,2,15.6],[-.9,2,21],12);pp(g,'lag',.22,[-.9,2,21],[-.9,3.2,21],12);pp(g,'lag',.22,[-.9,3.2,21],[-.9,3.2,23],12);pp(g,'lag',.22,[-.9,3.2,23],[-.9,2,23],12);pp(g,'lag',.22,[-.9,2,23],[-.9,2,31],12);
for(let z=17;z<31;z+=3)cy(g,'steel',.3,.12,-.9,2,z,P/2);[-1.9,1.9].forEach(x=>[28,30,32].forEach(z=>cy(g,'dark',.22,1,x*1.1,.9,z,0,0,10)));
pp(g,'org',.2,[-.9,2,31],[-.9,3.4,31]);pp(g,'org',.2,[-.9,3.4,31],[-.9,4.8,33.6]);sph(g,'steel',.28,-.9,4.8,33.6);pp(g,'org',.16,[-.9,4.8,33.6],[-.9,3.1,35.8]);cy(g,'steel',.25,.15,-.9,3,35.9,P/2);bx(g,'rust',.8,.8,.8,-.9,4,29.8);cy(g,'steel',.3,2,-.5,2.4,31.4,0,0,12);
bx(g,'wall',2,2.4,2.2,1,2.6,26);bx(g,'roof',2.4,.2,2.6,1,3.9,26);bx(g,'dark',.1,1.6,.8,-.02,2.2,26);bx(g,'glass',.1,.6,1,2.02,3,26);pl(g,lab('CTRL'),1.2,.5,1,3.3,24.88,0,P);cy(g,'steel',.15,.4,1.5,4.2,26.5,0,0,8);sph(g,'red',.12,.4,4.15,24.8)}
else{pp(g,'lag',.22,[-.9,2,15.6],[-.9,2,24],12);pp(g,'lag',.22,[-.9,2,24],[-.5,.4,27.5],12);pp(g,'lag',.22,[-.5,.4,27.5],[.5,-.2,29.5],12);
bx(g,'conc',4,.5,5,.5,.5,27,0,.35,.15);bx(g,'conc',2,.5,3,-1,-.5,31,0,.5,-.4);[-1.6,1.6].forEach((x,i)=>cy(g,'concD',.28,rr(2,3.5),x,-.4,28+i*2,rr(-.3,.3),rr(-.3,.3),12));
bx(g,'wallB',2,2.4,2.2,1,.3,29,.4,.1,.5);pp(g,'org',.2,[0,.2,27.5],[-1.5,-.4,31]);pp(g,'org',.16,[-1.5,-.4,31],[-3,-.1,33]);rub(g,0,29,8,3,-.2)}}

function variant(R){const V=G(R?'ruin':'intact');hall(V,R);boiler(V,R);chim(V,R,-7,'chimneyL');chim(V,R,7,'chimneyR');yard(V,R);mast(V,R);intake(V,R);farm(V,R);pier(V,R);return V}
const root=new T.Group();root.name='powerStation';const a=variant(false),b=variant(true);b.visible=false;root.add(a,b);return root}
