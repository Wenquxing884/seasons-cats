import {createSnowContacts} from './snow-contacts.js';
import {sampleAutumnWind,createAutumnAir} from './autumn-wind.js';
import {CAT_SHAPES} from './cat-shapes.js';
import {createPointerMotion} from './pointer-motion.js';
// Deterministic seasonal scene. Contact dynamics are baked once at a fixed step,
// then sampled by t, so scrubbing backward produces exactly the same deformation.
const W=1020,H=576,CX=504,CY=286,RX=356,RY=179,P=.35,TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const mix=(a,b,q)=>a+(b-a)*q;
const mod=(x,m)=>((x%m)+m)%m;
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let q=Math.imul(a^a>>>15,1|a);q=(q+Math.imul(q^q>>>7,61|q))^q;return((q^q>>>14)>>>0)/4294967296}}
function hash(x,y){let q=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);q=Math.imul(q^(q>>>13),1274126177);return((q^(q>>>16))>>>0)/4294967296}
function noise(x,y){const ax=Math.floor(x),ay=Math.floor(y),fx=smooth(x-ax),fy=smooth(y-ay),a=hash(ax,ay),b=hash(ax+1,ay),c=hash(ax,ay+1),d=hash(ax+1,ay+1);return mix(mix(a,b,fx),mix(c,d,fx),fy)}
function fractal(x,y){return noise(x,y)*.58+noise(x*2.07+17,y*2.07+41)*.28+noise(x*4.27,y*4.27)*.14}
function project(u,v,z=0){const q=1/(1-P*v);return{x:CX+RX*u*q,y:CY+RY*v*q-z*q,q}}
function inverse(x,y){const v=(y-CY)/(RY+P*(y-CY));return{u:(x-CX)*(1-P*v)/RX,v}}
function ellipsePath(r=1,shift=0){const p=new Path2D();for(let i=0;i<=240;i++){const a=i/240*TAU,q=project(Math.cos(a)*r,Math.sin(a)*r);i?p.lineTo(q.x,q.y+shift):p.moveTo(q.x,q.y+shift)}p.closePath();return p}
const RIM=ellipsePath(),BASE_RIM=ellipsePath(1.008,16);
const DEPTH_BANDS=32,SHADES=12,SEASON_BUCKETS=5*SHADES,BUCKETS=SEASON_BUCKETS*DEPTH_BANDS;
function sector(a){const p=new Path2D();p.moveTo(CX,CY);for(let i=0;i<=Math.ceil(a/.016);i++){const q=project(Math.cos(Math.min(a,i*.016))*1.025,Math.sin(Math.min(a,i*.016))*1.025);p.lineTo(q.x,q.y)}p.closePath();return p}
function oldStage(deg){return clamp(Math.floor(deg/360)+1,0,4)}
function stageAt(ang,deg,t){if(t>=22.90)return 4;const old=oldStage(deg),phase=mod(deg*Math.PI/180,TAU);return mod(ang,TAU)<=phase?Math.min(4,old+1):old}
function makeTextures(){
 const cs=Array.from({length:5},()=>{const c=document.createElement('canvas');c.width=W;c.height=H;return c});
 const ims=cs.map(c=>c.getContext('2d').createImageData(W,H));
 const base=[[1,2,1],[73,111,53],[35,75,28],[155,104,38],[185,204,225]];
 const snowHeight=(u,v)=>fractal(u*5.3+31,v*6.8+19)*.86+noise(u*13.8+7,v*17.1)*.14;
 for(let y=142;y<565;y++)for(let x=119;x<891;x++){
  const z=inverse(x,y),rad=z.u*z.u+z.v*z.v;if(rad>1.002)continue;
  const n=fractal(z.u*6.5,z.v*6.5),n2=noise(z.u*35,z.v*35),fine=hash(x,y)-.5;
  const light=1+.12*Math.sin(z.u*5.5+z.v*3)+.09*Math.cos(z.v*10-z.u*2)-.10*z.u,idx=(y*W+x)*4;
  const drift=snowHeight(z.u,z.v),slope=(snowHeight(z.u-.018,z.v-.012)-snowHeight(z.u+.018,z.v+.012));
  for(let s=0;s<5;s++){
   const lum=s===4?(drift-.5)*21+slope*45+(n2-.5)*1.8+fine*1.4:(n-.5)*32+(n2-.5)*10+fine*4;
   for(let k=0;k<3;k++)ims[s].data[idx+k]=clamp(base[s][k]*(s===4?1:light)+lum,0,255);
   ims[s].data[idx+3]=255;
  }
 }
 cs.forEach((c,i)=>c.getContext('2d').putImageData(ims[i],0,0));return cs;
}
function makeGrass(pointer){
 const r=rng(86431),g=[];
 for(let i=0;i<18000;i++){
  let u,v;do{u=r()*2-1;v=r()*2-1}while(u*u+v*v>1);if(u*u+v*v<.031)continue;
  const q=project(u,v),angle=mod(Math.atan2(v,u),TAU),depth=(v+1)/2;
  const clump=fractal(u*5.1+9,v*6.2+3),height=(23+r()*18)*(.64+depth*1.35)*(.88+.24*clump);
  const phase=r()*TAU,shade=r(),tilt=(r()-.5)*.20,flower=r()<.013,size=.72+r()*.68,visibility=r();
  const band=clamp(Math.floor((q.y-148)/420*DEPTH_BANDS+(visibility-.5)*.70),0,DEPTH_BANDS-1);
  g.push({u,v,x:q.x,y:q.y,angle,depth,h:height*(.90+.10*Math.sin(phase)),shade,tilt,flower,size,clump,visibility,band,
   bendPhase:u*7.2+v*5.5,ripplePhase:u*16-v*7,lightPhase:u*5.3+v*9.1,angleCos:Math.cos(angle),winterAt:pointer.timeAtAngle(720+angle*180/Math.PI)});
 }
 g.sort((a,b)=>a.y-b.y);return g;
}

// Screen-space projected contact field. Each cell is a critically damped spring.
// It keeps a physically useful short memory after a paw lifts, without needing
// the frames to be rendered in chronological order.
function bakeContacts(cats){
 const STEP=4.5,FPS=60,DT=1/120,DURATION=24.05;
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(let t=0;t<=24.05;t+=.1)for(const c of cats.sample(t)){minX=Math.min(minX,c.x-64);maxX=Math.max(maxX,c.x+64);minY=Math.min(minY,c.y-36);maxY=Math.max(maxY,c.y+110)}
 minX=Math.floor(minX/STEP)*STEP;minY=Math.floor(minY/STEP)*STEP;
 const nx=Math.ceil((maxX-minX)/STEP)+1,ny=Math.ceil((maxY-minY)/STEP)+1,N=nx*ny,frames=Math.ceil(DURATION*FPS)+1;
 const strength=new Float32Array(N),dirX=new Float32Array(N),dirY=new Float32Array(N);
 const compress=new Float32Array(N),bendX=new Float32Array(N),bendY=new Float32Array(N);
 const vel=new Float32Array(N),velX=new Float32Array(N),velY=new Float32Array(N);
 const baked=new Float32Array(frames*N*3);
 function stamp(x,y,rx,ry,load,vx=0,vy=0){
  if(!(load>.002))return;
  const x0=clamp(Math.floor((x-rx-minX)/STEP),0,nx-1),x1=clamp(Math.ceil((x+rx-minX)/STEP),0,nx-1);
  const y0=clamp(Math.floor((y-ry-minY)/STEP),0,ny-1),y1=clamp(Math.ceil((y+ry-minY)/STEP),0,ny-1);
  const motion=clamp(Math.hypot(vx,vy)/38);
  for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++){
   const dx=(minX+gx*STEP-x)/rx,dy=(minY+gy*STEP-y)/ry,rr=dx*dx+dy*dy;if(rr>=1)continue;
   const index=gy*nx+gx,fall=(1-rr)*(1-rr),pressure=load*fall;
   let bx=dx*.8+clamp(vx/38,-1,1)*motion*.45,by=dy*.7+clamp(vy/18,-1,1)*motion*.3;
   if(Math.abs(bx)+Math.abs(by)<.06){bx=(hash(gx,gy)-.5)*.4;by=.18}
   const length=Math.max(.30,Math.hypot(bx,by));
   strength[index]+=pressure;dirX[index]+=pressure*bx/length;dirY[index]+=pressure*by/length;
  }
 }
 function integrate(time){
  strength.fill(0);dirX.fill(0);dirY.fill(0);
  for(const c of cats.sample(Math.max(0,time))){
   const contactWeight=c.contactWeight??clamp(1-(c.air||0)/3),vx=c.vx||0,vy=c.vy||0;
   const contacts=c.contacts||c.paws?.filter(p=>p.load>0)||[];
   if(contacts.length){for(const p of contacts)stamp(p.x,p.y,12,7.2,(p.load||0)*1.5,vx,vy)}
   else if(contactWeight>.01)stamp(c.x,c.y,22,11,contactWeight*.75,vx,vy);
   const body=c.bodyContact;
   if(body)stamp(body.x,body.y,body.rx+9,body.ry+5,(body.load||0)*1.5,vx,vy);
   else if(contactWeight>.01&&(['sit','lie'].includes(c.state)||c.from===0||c.from===2))stamp(c.x,c.y-3,c.state==='sit'?21:32,15,.85*contactWeight,vx,vy);
   // A tall canopy parts around the chest/flanks as well as under the paws.
   // This broad shallow pocket keeps stalks tall but bent around the actor.
   if(contactWeight>.01)stamp(c.x,c.y+28,42,49,.34*clamp(contactWeight,0,1.3),vx,vy);
   const impact=c.landingImpulse||0;
   if(impact>.005){const spread=1-impact;stamp(c.x,c.y,25+spread*22,12+spread*13,impact*.90,vx,vy)}
  }
  for(let i=0;i<N;i++){
   const pressure=strength[i],target=1-Math.exp(-pressure*1.6),tx=pressure>0?target*dirX[i]/pressure:0,ty=pressure>0?target*dirY[i]/pressure:0;
   const omega=target>compress[i]?19:3.5,damping=omega*1.95;
   vel[i]+=(omega*omega*(target-compress[i])-damping*vel[i])*DT;
   compress[i]=clamp(compress[i]+vel[i]*DT,0,.985);
   const bendOmega=pressure>.005?15:4.2,bendDamping=bendOmega*1.9;
   velX[i]+=(bendOmega*bendOmega*(tx-bendX[i])-bendDamping*velX[i])*DT;
   velY[i]+=(bendOmega*bendOmega*(ty-bendY[i])-bendDamping*velY[i])*DT;
   bendX[i]+=velX[i]*DT;bendY[i]+=velY[i]*DT;
  }
 }
 // Pre-roll lets a cat already sitting at t=0 have settled grass underneath it.
 for(let i=-240;i<0;i++)integrate(i*DT);
 for(let f=0;f<frames;f++){
  if(f){integrate((f-.5)/FPS);integrate(f/FPS)}
  const start=f*N*3;for(let i=0;i<N;i++){baked[start+i*3]=compress[i];baked[start+i*3+1]=bendX[i];baked[start+i*3+2]=bendY[i]}
 }
 function binding(x,y){const fx=(x-minX)/STEP,fy=(y-minY)/STEP,ix=Math.floor(fx),iy=Math.floor(fy);if(ix<0||iy<0||ix>=nx-1||iy>=ny-1)return null;return{i:(iy*nx+ix)*3,fx:fx-ix,fy:fy-iy}}
 let frame0=0,frame1=0,alpha=0;
 const out={compression:0,x:0,y:0};
 return{
  binding,
  setTime(t){const f=clamp(t*FPS,0,frames-1);frame0=Math.floor(f)*N*3;frame1=Math.min(frames-1,Math.floor(f)+1)*N*3;alpha=f-Math.floor(f)},
  at(b){
   if(!b){out.compression=out.x=out.y=0;return out}
   for(let k=0;k<3;k++){
    const i=b.i+k,interp=start=>mix(mix(baked[start+i],baked[start+i+3],b.fx),mix(baked[start+i+nx*3],baked[start+i+nx*3+3],b.fx),b.fy);
    const value=mix(interp(frame0),interp(frame1),alpha);if(k===0)out.compression=value;else if(k===1)out.x=value;else out.y=value;
   }
   return out;
  },
  info:{fps:FPS,step:STEP,frames,cells:N},
 };
}

export function createSeasonScene(layers,sky,cats,pointerSamples){
 const pointer=createPointerMotion(pointerSamples,{project}),textures=makeTextures(),grass=makeGrass(pointer),physics=bakeContacts(cats),snowContacts=createSnowContacts(cats),r=rng(383841);
 function seasonAt(u,v,time){return stageAt(mod(Math.atan2(v,u),TAU),pointer.at(time).angle,time)}
 const autumnAir=createAutumnAir({project,seasonAt});
 function isSnow(x,y,time){const q=inverse(x,y),p=pointer.at(time),radius=q.u*q.u+q.v*q.v;return radius<=1&&radius>.035&&stageAt(mod(Math.atan2(q.v,q.u),TAU),p.angle,time)===4}
 for(const blade of grass)blade.contact=physics.binding(blade.x,blade.y);
 const particles=Array.from({length:4700},()=>{
  let u,v;do{u=r()*2-1;v=r()*2-1}while(u*u+v*v>1);const angle=mod(Math.atan2(v,u),TAU),depth=r();
  return{u,v,angle,p:r(),rad:.32+r()*.85,depth,speed:17+r()*28,winterAt:pointer.timeAtAngle(720+angle*180/Math.PI)};
 });
 const colors=[[1,1,1],[92,132,70],[48,91,29],[177,118,42],[185,204,225]],palette=[];
 for(let s=0;s<5;s++)for(let j=0;j<SHADES;j++){const l=(j/(SHADES-1)-.48)*(s===4?19:s===3?80:58);palette.push(`rgb(${colors[s].map((v,k)=>Math.round(clamp(v+l*(s===2&&k===2?.60:1),0,255))).join(',')})`)}
 // Broad wind fronts are spatially smooth. Interpolating a compact lattice
 // avoids evaluating six trigonometric waves for every individual blade.
 const WIND_N=35,WIND_STRIDE=WIND_N*4,windGrid=new Float32Array(WIND_N*WIND_N*4),windOut={lean:0,gust:0,crest:0,flutter:0};
 for(const b of grass){const x=(b.u+1)*.5*(WIND_N-1),y=(b.v+1)*.5*(WIND_N-1),ix=Math.floor(x),iy=Math.floor(y);b.windIndex=(iy*WIND_N+ix)*4;b.windX=x-ix;b.windY=y-iy}
 function windField(t){for(let y=0;y<WIND_N;y++)for(let x=0;x<WIND_N;x++){const w=sampleAutumnWind(x/(WIND_N-1)*2-1,y/(WIND_N-1)*2-1,t),i=(y*WIND_N+x)*4;windGrid[i]=w.lean;windGrid[i+1]=w.gust;windGrid[i+2]=w.crest;windGrid[i+3]=w.flutter}}
 function windAt(b){for(let k=0;k<4;k++){const i=b.windIndex+k,v=mix(mix(windGrid[i],windGrid[i+4],b.windX),mix(windGrid[i+WIND_STRIDE],windGrid[i+WIND_STRIDE+4],b.windX),b.windY);if(k===0)windOut.lean=v;else if(k===1)windOut.gust=v;else if(k===2)windOut.crest=v;else windOut.flutter=v}return windOut}
 const calmWind={lean:0,gust:0,crest:0,flutter:0};
 function stemPath(list,index){return list[index]||(list[index]=new Path2D())}
 function strokeGrass(ctx,paths){ctx.lineCap='round';for(let band=0;band<DEPTH_BANDS;band++){ctx.lineWidth=.76+band/(DEPTH_BANDS-1)*.24;for(let i=SHADES;i<SEASON_BUCKETS;i++){const path=paths[band*SEASON_BUCKETS+i];if(!path)continue;ctx.strokeStyle=palette[i];ctx.stroke(path)}}}
 let frontPaths={},frontBounds={};
 function contactShadows(ctx,t,ptr,poses){
  for(const c of poses){
   const w=c.contactWeight??clamp(1-(c.air||0)/3);if(w<.01)continue;
   const p=inverse(c.x,c.y);if(stageAt(mod(Math.atan2(p.v,p.u),TAU),ptr.angle,t)===4)continue;
   const contacts=c.contacts||[{x:c.x,y:c.y,load:.7}];
   for(const foot of contacts){if(!(foot.load>0))continue;ctx.save();ctx.translate(foot.x,foot.y+1.5);ctx.scale(1,.42);const shade=ctx.createRadialGradient(0,0,1,0,0,12);shade.addColorStop(0,`rgba(6,13,2,${clamp(foot.load*.24,0,.32)})`);shade.addColorStop(1,'rgba(6,13,2,0)');ctx.fillStyle=shade;ctx.fillRect(-12,-12,24,24);ctx.restore()}
  }
 }
 function ground(ctx,t,ptr){
  ctx.clearRect(0,0,W,H);physics.setTime(t);
  const A=ptr.angle,phase=mod(A*Math.PI/180,TAU),old=oldStage(A),next=Math.min(4,old+1),poses=cats.sample(t);
  const headMasks=Object.fromEntries(poses.map(c=>{
   const weights={stand:Math.max(0,1-c.rig.sit-c.rig.lie),sit:c.rig.sit,lie:c.rig.lie};
   const v=key=>Object.entries(weights).reduce((sum,[name,w])=>sum+CAT_SHAPES[name].head[key]*w,0),scale=c.scale||1;
   return[c.name,{x:c.x+v('x')*(c.orientation??-c.facing)*scale,y:c.y-(c.air||0)+v('y')*scale+(c.crouch||0)*4,rx:20.0*scale,ry:20.0*scale}];
  }));
  ctx.fillStyle='#020403';ctx.fill(BASE_RIM);
  // One continuous rim per seasonal interval: no antialias seams between wedges.
  let rimStart=0,rimSnow=stageAt(.0001,A,t)===4;
  function fillRim(a0,a1,snow){
   const p=new Path2D();let first=true;
   for(let a=a0;a<=a1+.00001;a+=.012){const q=project(Math.cos(Math.min(a,a1)),Math.sin(Math.min(a,a1)));first?p.moveTo(q.x,q.y):p.lineTo(q.x,q.y);first=false}
   let q=project(Math.cos(a1),Math.sin(a1));p.lineTo(q.x,q.y);p.lineTo(q.x,q.y+14);
   for(let a=a1;a>=a0-.00001;a-=.012){q=project(Math.cos(Math.max(a,a0)),Math.sin(Math.max(a,a0)));p.lineTo(q.x,q.y+14)}p.closePath();
   ctx.fillStyle=snow?'#91a5bd':'#020403';ctx.fill(p);
  }
  for(let i=1;i<=180;i++){
   const a=i/180*Math.PI,snow=stageAt(Math.min(Math.PI-.0001,a+.0001),A,t)===4;
   if(snow!==rimSnow||i===180){fillRim(rimStart,a,rimSnow);rimStart=a;rimSnow=snow}
  }
  ctx.drawImage(textures[t>=22.9?4:old],0,0);
  if(t<22.9&&next!==old){ctx.save();ctx.clip(sector(phase));ctx.drawImage(textures[next],0,0);ctx.restore()}
  contactShadows(ctx,t,ptr,poses);
  const paths=new Array(BUCKETS),flowers=[new Path2D(),new Path2D(),new Path2D()];
  frontPaths=Object.fromEntries(poses.map(c=>[c.name,new Array(BUCKETS)]));
  if(old===3||next===3)windField(t);
  const actorBounds=poses.map(c=>({c,left:c.x-(c.w||65)*.55-3,right:c.x+(c.w||65)*.55+3,top:c.y-(c.air||0)-(c.h||64)-3,bottom:c.y-(c.air||0)+3}));
  frontBounds=Object.fromEntries(actorBounds.map(b=>[b.c.name,b]));
  const masks=poses.map(c=>{const h=headMasks[c.name];return{x:h.x,y:h.y,irx:1/h.rx,iry:1/h.ry,cx:c.x,cy:c.y-(c.air||0)-23}});
  for(const b of grass){
   const s=t>=22.90?4:b.angle<=phase?next:old;if(!s)continue;
   const age=s===4?Math.max(0,t-b.winterAt):mod(A*Math.PI/180-b.angle,TAU)/(Math.PI/180*57.2);
   const frost=s===4?(t>=22.86?0:1-smooth((age-.12)/1.05)):1;if(frost<.012)continue;
   const effect=physics.at(b.contact),flatten=effect.compression;
   const autumn=s===3,wind=autumn?windAt(b):calmWind;
   const breeze=autumn?0:Math.sin(b.bendPhase-t*(s===1?.72:1.05))*(s===1?.085:.13)+Math.sin(b.ripplePhase+t*.63)*.035;
   let lean=(autumn?wind.lean+b.tilt*.35+wind.flutter*(.6+b.shade*.4):.07+b.tilt+breeze)*(1-flatten*.85);
   const h=b.h*frost*(s===1?.88:s===3?.96:1),pass=Math.exp(-age*2.5);
   lean+=pass*.20*b.angleCos*(1-flatten);
   // Fold the blade along the ground instead of merely shortening it.
   // Length flows into lateral displacement as the upright component collapses.
   const vertical=h*(1-.90*flatten)*(1-.16*pass),bendLength=h*(.16+flatten*.74);
   const tx=b.x+Math.sin(lean)*vertical+effect.x*bendLength;
   const ty=b.y-Math.cos(lean)*vertical+effect.y*bendLength*.38;
   const mx=b.x+Math.sin(lean*(autumn?.58:.48))*vertical*.55+effect.x*bendLength*.24;
   const my=b.y-Math.cos(lean*.38)*vertical*.55+effect.y*bendLength*.08;
   const lighting=autumn?(wind.crest-.5)*.36+(wind.gust-.5)*.13:(.5+.5*Math.sin(b.lightPhase-t*.85))*.10;
   const shade=clamp(.24+b.shade*.44+lighting+(b.clump-.5)*.12-b.u*.045-flatten*.12);
   const index=b.band*SEASON_BUCKETS+s*SHADES+Math.min(SHADES-1,Math.floor(shade*SHADES)),path=stemPath(paths,index);
   path.moveTo(b.x,b.y);path.quadraticCurveTo(mx,my,tx,ty);
   if(s<4)for(const bounds of actorBounds){const c=bounds.c;
    const dy=b.y-c.y;
    // Whole stems in front of each actor naturally hide feet and belly. The
    // canopy is independent of the actor, so jumps emerge between passing waves.
    if(dy>-.4&&dy<90&&Math.min(b.x,mx,tx)<bounds.right&&Math.max(b.x,mx,tx)>bounds.left&&Math.min(b.y,my,ty)<bounds.bottom&&b.y>bounds.top){
     let closestHead=64,closestChest=64;
     for(let j=1;j<=6;j++){const k=j/6,z=1-k,x=z*z*b.x+2*z*k*mx+k*k*tx,y=z*z*b.y+2*z*k*my+k*k*ty;
      // A curved foreground stalk can cross both actors. Keep the same parted
      // canopy for every depth pass so the nearer cat does not re-cover the
      // farther cat's head with a second, unrelated set of stems.
      for(const m of masks){
       const dx=(x-m.x)*m.irx,dy=(y-m.y)*m.iry,cx=(x-m.cx)/24,cy=(y-m.cy)/15;
       closestHead=Math.min(closestHead,dx*dx+dy*dy);closestChest=Math.min(closestChest,cx*cx+cy*cy);
      }
     }
     // Individual whole stems part around the oversized head. The feet remain
     // in the fully dense canopy; no rectangular or horizontal cut is painted.
     const headOpen=1-smooth((Math.sqrt(closestHead)-1.04)/.68),chestOpen=1-smooth((Math.sqrt(closestChest)-.70)/.75);
     const keep=Math.min(1-headOpen*(.993-(autumn?wind.crest*.004:0)),1-chestOpen*.84);
     if(b.visibility<keep){const p=stemPath(frontPaths[c.name],index);p.moveTo(b.x,b.y);p.quadraticCurveTo(mx,my,tx,ty)}
    }
   }
   if(s===1&&b.flower){const flower=flowers[b.shade>.86?2:b.shade>.65?1:0],size=b.size*(.7+b.depth*.6);flower.moveTo(tx+size,ty);flower.ellipse(tx,ty,size,size*.65,-.3,0,TAU)}
  }
  strokeGrass(ctx,paths);
  for(let i=0;i<flowers.length;i++){ctx.fillStyle=['rgba(244,242,208,.87)','rgba(240,211,108,.84)','rgba(237,203,204,.77)'][i];ctx.fill(flowers[i])}
  for(let i=0;i<96;i++){
   const a=i/96*TAU,p=project(Math.cos(a)*1.002,Math.sin(a)*1.002),q=project(Math.cos(a)*1.010,Math.sin(a)*1.010),front=Math.sin(a);
   if(front<.12)continue;
   ctx.strokeStyle=`rgba(225,235,224,${front>0?.45+front*.28:.16})`;ctx.lineWidth=front>0?2.2:.85;
   ctx.beginPath();ctx.moveTo(p.x,p.y+1);ctx.lineTo(q.x,q.y+(front>0?3:0));ctx.stroke();
  }
 }
 function foreground(ctx,name){
  const paths=frontPaths[name];if(!paths)return;
  const bounds=frontBounds[name];ctx.save();
  // Ground already contains the complete stems. Repaint only the small area
  // occupied by the actor, not the full length of every foreground stalk.
  ctx.beginPath();ctx.rect(bounds.left-2,bounds.top-2,bounds.right-bounds.left+4,bounds.bottom-bounds.top+4);ctx.clip();
  strokeGrass(ctx,paths);ctx.restore();
 }
 // The hub does not move. Keep its fine rings sharp without rebuilding them
 // every frame, independently of the short exposure used for the moving hand.
 const clockFace=document.createElement('canvas');clockFace.width=150;clockFace.height=88;
 const face=clockFace.getContext('2d');face.translate(75,40);
 face.fillStyle='#000301';face.beginPath();face.ellipse(0,7,70,35,0,0,TAU);face.fill();face.strokeStyle='rgba(165,158,120,.5)';face.lineWidth=1.1;face.stroke();
 face.fillStyle='#000201';face.beginPath();face.ellipse(0,0,70,35,0,0,TAU);face.fill();face.strokeStyle='#c1c5a3';face.lineWidth=2;face.stroke();
 face.beginPath();face.ellipse(0,0,39,20,0,0,TAU);face.strokeStyle='rgba(119,138,126,.56)';face.lineWidth=.8;face.stroke();
 function needle(ctx,ptr,glow){
  const dx=ptr.x-CX,dy=ptr.y-CY,dist=Math.hypot(dx,dy),vx=dx/dist,vy=dy/dist,a=ptr.angle*Math.PI/180,dep=(Math.sin(a)+1)/2,L=28+72*Math.pow(dep,1.7),lw=6+12*Math.pow(dep,1.5),ex=ptr.x+vx*L*.4,ey=ptr.y+vy*L*.4,rx=ptr.x-vx*L*.6,ry=ptr.y-vy*L*.6,entry=1/Math.sqrt((vx/70)**2+(vy/35)**2),sx=CX+vx*(entry-1),sy=CY+vy*(entry-1),curve=(1-dep)*-13;
  ctx.strokeStyle='rgba(232,233,165,.97)';ctx.lineWidth=1.35+dep*.6;ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo((sx+rx)/2-vy*curve,(sy+ry)/2+vx*curve,rx,ry);ctx.stroke();ctx.save();
  if(glow){ctx.shadowColor='rgba(239,237,161,.35)';ctx.shadowBlur=4}
  ctx.fillStyle='#eeeeb4';ctx.beginPath();ctx.moveTo(rx,ry);ctx.quadraticCurveTo(ptr.x-vy*lw*.6,ptr.y+vx*lw*.6,ex,ey);ctx.quadraticCurveTo(ptr.x+vy*lw*.47,ptr.y-vx*lw*.47,rx,ry);ctx.closePath();ctx.fill();ctx.restore();
 }
 function clock(ctx,t,ptr){
  ctx.clearRect(0,0,W,H);ctx.drawImage(clockFace,CX-75,CY-40);ctx.save();
  // Only the thin moving hand gets 12 ms of exposure; cats, grass and the hub
  // stay at the exact requested time. No playback timer or frame history.
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=.12;needle(ctx,pointer.at(Math.max(0,t-.012)),false);
  ctx.globalAlpha=.20;needle(ctx,pointer.at(Math.max(0,t-.006)),false);
  ctx.globalAlpha=1;needle(ctx,ptr,true);ctx.restore();
 }
 function weather(ctx,t,ptr){
  ctx.clearRect(0,0,W,H);const A=ptr.angle,snow=[new Path2D(),new Path2D(),new Path2D()];
  for(const p of particles){
   const s=stageAt(p.angle,A,t);if(s!==4)continue;const winter=true;
   const age=Math.max(0,t-p.winterAt);if(winter&&age<.12)continue;
   const z=winter?260-mod(p.p*260+t*p.speed,260):mod(p.p*160+t*p.speed*.7,160);
   const q=project(p.u,p.v,z*(winter?.85:.35)),x=q.x+Math.sin(t*.7+p.p*31)*13-z*(winter?.12:.18),y=q.y;
   if(y<10||y>560||x<60||x>950)continue;
   if(winter){const group=p.depth<.55?0:p.depth<.88?1:2,rad=p.rad*(.65+p.depth*.70),path=snow[group];path.moveTo(x+rad,y);path.arc(x,y,rad,0,TAU)}
  }
  autumnAir.draw(ctx,t);
  const alphas=[.34,.57,.73];for(let i=0;i<3;i++){ctx.fillStyle=`rgba(237,244,252,${alphas[i]})`;ctx.fill(snow[i])}
 }
 return{
  physicsInfo:physics.info,
  pointerInfo:pointer.stats,
  grassInfo:{count:grass.length,depthBands:DEPTH_BANDS},
  autumnInfo:t=>autumnAir.stats(t),
  isSnow,
  draw(t){
   const ptr=pointer.at(t);sky.draw(layers.galaxy,t);ground(layers.meadow,t,ptr);snowContacts.draw(layers.meadow,t,{isSnow});
   layers.cats.clearRect(0,0,W,H);
   if(cats.drawCat){for(const c of cats.sample(t).sort((a,b)=>a.y-b.y)){cats.drawCat(layers.cats,t,c.name);foreground(layers.cats,c.name)}}
   else{cats.draw(layers.cats,t);for(const c of cats.sample(t))foreground(layers.cats,c.name)}
   clock(layers.clock,t,ptr);weather(layers.weather,t,ptr);
  },
 };
}





