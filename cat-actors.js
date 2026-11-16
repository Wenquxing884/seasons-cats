import {drawCatModel} from './cat-model.js';
import {CAT_SHAPES} from './cat-shapes.js';
// Contact-driven actors for the plush cat model. Every pose is a pure function of film time.
// Root motion exists only inside explicit locomotion events. Holds never interpolate.
const TAU = Math.PI * 2;
const clamp = (x, a=0, b=1) => Math.max(a,Math.min(b,x));
const ease = x => {x=clamp(x); return x*x*(3-2*x)};
const mix = (a,b,q) => a+(b-a)*q;
const lerp2 = (a,b,q) => [mix(a[0],b[0],q),mix(a[1],b[1],q)];
const fraction = x => x-Math.floor(x);
const INITIAL = {black:[604,417,-1],white:[562,442,-1]};
// start,end,destination x/y, jump intent. Duration sets a ballistic apex.
// Short meadow relocations use clear crouch/takeoff/landing beats: with the
// paws below the canopy, a nearly level walk otherwise reads as skating.
const MOTION = {
 black:[
  [2.06,2.65,558,423,12],[5.16,5.76,588,419,20],
  [8.82,9.28,604,423,12],[11.27,11.9,598,420,15],
  [13,13.57,606,420,12],[17.27,18.03,555,422,22],
  [21.08,21.73,582,421,27],[23.16,23.8,578,423,37]
 ],
 white:[
  [2,2.68,518,443,23],[5.05,5.72,550,441,17],
  [6.24,6.76,574,441,16],[8.87,9.5,614,443,24],
  [13.03,13.67,590,441,15],[14.05,14.7,557,442,12],
  [17.65,18.25,510,443,13],[21.12,21.84,538,442,25],
  [22.06,22.64,554,442,10]
 ]
};
const MODES = {
 black:[[0,0],[1.88,1],[3.26,2],[4.98,1],[6.29,0],[8.42,1],
  [10.30,2],[10.92,1],[14.48,0],[17.09,1],[18.59,2],[20.38,1]],
 white:[[0,2],[1.82,1],[3.20,0],[4.87,1],[8.35,2],[8.69,1],
  [9.76,0],[11.77,1],[15.22,2],[17.47,1],[18.53,0],[20.27,1]]
};
// Local x faces left; y=0 is the ground plane. One rig is continuously reshaped,
// rather than dissolving two incompatible silhouettes at a pose change.
const RIGS = [
 {shoulder:[-10,-7.1],hip:[12,-6.0],head:[-21,-11.1],headTilt:-.05,
  back:5.7,belly:4.5,haunch:6.6,front:[...CAT_SHAPES.lie.front],hind:[...CAT_SHAPES.lie.hind],tail:[24,-2],tailTip:[32,-8],sit:0,lie:1},
 {shoulder:[-10,-18.0],hip:[12,-16.0],head:[-20,-24.0],headTilt:.04,
  back:7.6,belly:7.8,haunch:7.3,front:[...CAT_SHAPES.stand.front],hind:[...CAT_SHAPES.stand.hind],tail:[26,-18],tailTip:[26,-30],sit:0,lie:0},
 {shoulder:[-6,-20.0],hip:[7,-8.7],head:[-7.6,-27.5],headTilt:.025,
  back:6.5,belly:9.3,haunch:8.6,front:[...CAT_SHAPES.sit.front],hind:[...CAT_SHAPES.sit.hind],tail:[25,0],tailTip:[27,-5],sit:1,lie:0}
];
function blendRig(a,b,q){const out={};for(const key of Object.keys(a))out[key]=Array.isArray(a[key])?lerp2(a[key],b[key],q):mix(a[key],b[key],q);return out}
function modeAt(name,t){
 const keys=MODES[name];let prev=keys[0][1];
 for(let i=1;i<keys.length;i++){
  const [at,next]=keys[i];if(t>=at){prev=next;continue}
  const q=prev===next?0:ease((t-(at-.24))/.24);
  return {from:prev,to:next,blend:q,rig:blendRig(RIGS[prev],RIGS[next],q)};
 }
 return{from:prev,to:prev,blend:0,rig:blendRig(RIGS[prev],RIGS[prev],0)};
}
// Nearby destinations get a playful run of 3–4 small hops. The retimed groups
// borrow resting time rather than squeezing several takeoffs into half a second.
const SHORT_WINDOWS={
 black:{2:[8.60,9.75],3:[11.10,12.25],4:[12.77,13.92],6:[20.56,22.12],7:[22.65,23.69]},
 white:{2:[6.24,7.80],4:[11.95,13.51],7:[20.45,22.01],8:[22.52,23.67]}
};
// Compile every individual flight, plus frozen group metadata for inspection.
const EVENTS={},MOTION_GROUPS=[];
for(const name of ['black','white']){
 let [x,y,facing]=INITIAL[name];
 EVENTS[name]=[];
 MOTION[name].forEach(([originalStart,originalEnd,toX,toY,height],index)=>{
  const dx=toX-x,dy=toY-y,dist=Math.hypot(dx,dy),dir=dx<0?-1:dx>0?1:facing;
  const count=dist>=30?1:dist>=22?4:3,groupId=name+'-'+index;
  const [start,end]=count===1?[originalStart,originalEnd]:SHORT_WINDOWS[name][index];
  const gap=count===1?0:count===4?.12:.11,flight=((end-start)-gap*(count-1))/count;
  const group=Object.freeze({name,id:groupId,groupId,start,end,distance:dist,count,fromX:x,fromY:y,toX,toY,gap,flight,settleEnd:end+.28});
  MOTION_GROUPS.push(group);
  for(let hopIndex=0;hopIndex<count;hopIndex++){
   const a=hopIndex/count,b=(hopIndex+1)/count,s=start+hopIndex*(flight+gap),e=s+flight;
   const hx=x+dx*a,hy=y+dy*a,tx=x+dx*b,ty=y+dy*b;
   const calculatedApex=height?(name==='white'?480:450)*(count===1?originalEnd-originalStart:flight)**2/8*1.16:0;
   // Even the final tiny hops must lift visibly above the shorter meadow; keep
   // their arc gentle, but never let a 4px relocation read as a ground twitch.
   const apex=height?(count===1?calculatedApex:Math.max(6.4,calculatedApex)):0;
   const amplitude=count===1?1:.58+.12*clamp((dist/count-1)/8);
   EVENTS[name].push({id:groupId+'-hop-'+hopIndex,groupId,hopIndex,hopCount:count,
    start:s,end:e,x:hx,y:hy,toX:tx,toY:ty,dx:tx-hx,dy:ty-hy,dist:dist/count,height:apex,
    facing:dir,priorFacing:hopIndex?dir:facing,duration:flight,action:height?'jump':'walk',amplitude,
    takeoffCrouch:count===1?.55:.41,landingCrouch:count===1?.12:.11});
  }
  x=toX;y=toY;facing=dir;
 });
}
Object.freeze(MOTION_GROUPS);
function rootAt(name,t){
 let [x,y,facing]=INITIAL[name];let active=null,prepare=null,land=null,rebound=null;
 for(const e of EVENTS[name]){
  if(t<e.start){
   if(e.hopIndex>0){const previous=EVENTS[name].find(p=>p.groupId===e.groupId&&p.hopIndex===e.hopIndex-1);if(previous&&t>previous.end){rebound={previous,next:e};land=null}}
   else if(t>=e.start-.18)prepare=e;
   break;
  }
  if(t<=e.end){active=e;const q=clamp((t-e.start)/e.duration),f=e.height?q:ease(q);x=e.x+e.dx*f;y=e.y+e.dy*f;facing=e.facing;break}
  x=e.toX;y=e.toY;facing=e.facing;if(e.height&&t<e.end+.28)land=e;
 }
 return{x,y,facing,active,prepare,land,rebound};
}
// Compile a few irregular gestures inside fully settled sitting/lying windows.
// Fixed seeds choose each gesture once, never on a playback frame. A guard gap
// keeps every gesture clear of takeoff preparation, landing and pose changes.
function idleRandom(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let n=Math.imul(seed^seed>>>15,1|seed);n=(n+Math.imul(n^n>>>7,61|n))^n;return((n^n>>>14)>>>0)/4294967296}}
function stableIdleType(name,t){
 const root=rootAt(name,t),mode=modeAt(name,t);
 if(root.active||root.prepare||root.land||root.rebound||mode.blend!==0)return null;
 return mode.rig.sit===1?'paw':mode.rig.lie===1?'tail':null;
}
const IDLE_EVENTS=[],STABLE_IDLE_WINDOWS=[];
for(const name of ['black','white']){
 const random=idleRandom(name==='black'?0xCA721:0xCA937),windows=[];
 let start=0,type=stableIdleType(name,0);
 for(let i=1;i<=Math.ceil(22.85*240);i++){
  const t=Math.min(22.85,i/240),next=t>=22.85?null:stableIdleType(name,t);
  if(next!==type){if(type)windows.push({type,start,end:t});start=t;type=next}
 }
 for(const window of windows)STABLE_IDLE_WINDOWS.push({...window,name});
 for(const window of windows){
  const a=window.start+.16,b=window.end-.16;
  const requested=window.type==='paw'?.84+random()*.16:1.05+random()*.38;
  const duration=Math.min(requested,b-a-.08);
  if(duration<(window.type==='paw'?.76:.90))continue;
  const start=a+(b-a-duration)*(.20+random()*.65),end=start+duration;
  IDLE_EVENTS.push(Object.freeze({name,type:window.type,start,end,
   amplitude:window.type==='paw'?12:3.8+random()*.6,
   cycles:window.type==='tail'?1.08+random()*.28:1}));
 }
}
IDLE_EVENTS.sort((a,b)=>a.start-b.start);Object.freeze(IDLE_EVENTS);
// Ear twitches use their own seeded schedule so adding them never changes the
// existing paw lifts, tail movements, contacts or jump timing. The brief flick
// has a soft counter-flick and settles fully before any pose change or takeoff.
const EAR_EVENTS=[];
for(const name of ['black','white']){
 const random=idleRandom(name==='black'?0xEA731:0xEA947);
 for(const window of STABLE_IDLE_WINDOWS.filter(w=>w.name===name)){
  const duration=.46+random()*.14,a=Math.max(.45,window.start+.22),b=window.end-.20;
  if(b-a<duration+.12)continue;
  const skip=random();if(skip>.84&&b-a<1.45)continue;
  let start=a+(b-a-duration)*(.12+random()*.76);
  const separation=at=>Math.min(Infinity,...EAR_EVENTS.filter(e=>e.name!==name).map(e=>Math.abs(at+duration*.22-(e.start+e.duration*.22))));
  if(separation(start)<.30){
   // Independent ears should not flick in lockstep when both cats are resting.
   const choices=[start-.38,start+.38,a,b-duration].filter(at=>at>=a&&at+duration<=b);
   choices.sort((x,y)=>separation(y)-separation(x));if(choices.length)start=choices[0];
  }
  const primary=random()<.5?'left':'right';
  const amplitude=.18+random()*.06,secondary=random()<.68?.30+random()*.22:0,lag=.045+random()*.035;
  EAR_EVENTS.push(Object.freeze({name,posture:window.type==='paw'?'sit':'lie',start,end:start+duration,duration,primary,amplitude,secondary,lag}));
 }
}
EAR_EVENTS.sort((a,b)=>a.start-b.start);Object.freeze(EAR_EVENTS);
function earFlick(q){
 if(q<=0||q>=1)return 0;
 if(q<.22)return ease(q/.22);
 if(q<.52)return mix(1,-.32,ease((q-.22)/.30));
 if(q<.78)return mix(-.32,.10,ease((q-.52)/.26));
 return .10*(1-ease((q-.78)/.22));
}
function earsAt(name,t,allowed){
 const out={earLeft:0,earRight:0,active:false};if(!allowed)return out;
 const event=EAR_EVENTS.find(e=>e.name===name&&t>e.start&&t<e.end);if(!event)return out;
 const age=t-event.start,main=earFlick(age/event.duration)*event.amplitude;
 const secondary=earFlick((age-event.lag)/(event.duration-event.lag))*event.amplitude*event.secondary;
 // Positive local rotation opens the left ear; the right ear mirrors it.
 out.earLeft=event.primary==='left'?main:secondary;
 out.earRight=-(event.primary==='right'?main:secondary);out.active=true;
 return out;
}
const JUMP_EVENTS=Object.freeze(Object.entries(EVENTS).flatMap(([name,events])=>events.filter(e=>e.action==='jump').map(e=>Object.freeze({name,id:e.id,groupId:e.groupId,hopIndex:e.hopIndex,hopCount:e.hopCount,start:e.start,end:e.end,apex:e.height,amplitude:e.amplitude,fromX:e.x,fromY:e.y,toX:e.toX,toY:e.toY}))));
function idleAt(name,t,allowed){
 const out={pawLift:0,pawId:'front-near',tailSway:0,tailLift:0,active:false,pawSupport:1};
 if(!allowed)return out;
 const event=IDLE_EVENTS.find(e=>e.name===name&&t>e.start&&t<e.end);if(!event)return out;
 const q=(t-event.start)/(event.end-event.start);out.active=true;
 if(event.type==='paw'){
  // Unweight before lifting and only reload after the paw is back on the floor.
  out.pawSupport=q<.10?1-ease(q/.10):q>.90?ease((q-.90)/.10):0;
  const lift=clamp((q-.12)/.76);
  out.pawLift=lift<.42?ease(lift/.42):lift<=.58?1:1-ease((lift-.58)/.42);
 }else{
  const envelope=ease(q/.22)*ease((1-q)/.22);
  out.tailSway=event.amplitude*envelope*Math.sin(TAU*q*event.cycles);
  out.tailLift=1.5*envelope*(.45+.55*Math.sin(Math.PI*q)**2);
 }
 return out;
}
// Stance lasts 62% of each step: the paw stays at one world coordinate while the
// body advances. Swing travels to the next foothold and lifts from the surface.
function pawTravel(distance,stride,offset){
 const at=d=>{const q=d/stride+offset,cycle=Math.floor(q),ph=fraction(q);return (cycle+(ph>.62?ease((ph-.62)/.38):0))*stride};
 const phase=fraction(distance/stride+offset);
 return{advance:at(distance)-at(0),phase,lift:phase>.62?Math.sin(Math.PI*(phase-.62)/.38):0,planted:phase<=.62};
}
function sampleOne(name,time){
 const t=clamp(time,0,721/30),root=rootAt(name,t),mode=modeAt(name,t);
 let {x,y,facing}=root,rig=mode.rig,orientation=-root.facing,footTransition=null,action='hold',state=rig.sit>.6?'sit':rig.lie>.6?'lie':'stand';
 let air=0,jump=0,pitch=0,crouch=0,landingImpulse=0,contactWeight=1,vx=0,vy=0,phase=0,q=0;
 const active=root.active,prep=root.prepare,land=root.land,rebound=root.rebound;
 if(mode.blend>0&&mode.blend<1){footTransition={a:RIGS[mode.from],b:RIGS[mode.to],fromFacing:facing,toFacing:facing,q:mode.blend};}
 if(prep){
  action=prep.action;state='crouch';const a=ease((t-(prep.start-.18))/.18);
  const before=modeAt(name,prep.start-.18).rig;
  orientation=-mix(root.facing,prep.facing,a);facing=a>.5?prep.facing:root.facing;
  footTransition={a:before,b:RIGS[1],fromFacing:root.facing,toFacing:prep.facing,q:a};
  rig=blendRig(before,RIGS[1],a);crouch=prep.height?prep.takeoffCrouch*a:.08*a;
  contactWeight=1+.35*a;
 }
 if(active){
  action=active.action;facing=active.facing;orientation=-facing;footTransition=null;q=clamp((t-active.start)/active.duration);
  const travel=active.height?q:ease(q);const speed=active.height?1:6*q*(1-q);
  vx=active.dx*speed/active.duration;vy=active.dy*speed/active.duration;
  rig=blendRig(RIGS[1],RIGS[1],0);
  if(active.height){
   jump=4*q*(1-q);air=active.height*jump;phase=q;state=air>.03?'air':'crouch';
   // Ballistic rise/fall; body extends after takeoff, then the feet reach down.
   crouch=active.takeoffCrouch*(1-ease(q/.16))+active.landingCrouch*ease((q-.8)/.2);
   pitch=-.16*active.amplitude*Math.cos(Math.PI*q)*Math.sin(Math.PI*Math.min(1,q/.11));
   const stretch=Math.sin(Math.PI*q)*active.amplitude;
   rig.shoulder[0]-=1.7*stretch;rig.hip[0]+=2.2*stretch;
   rig.shoulder[1]+=2.7*stretch;rig.hip[1]+=2.3*stretch;
   rig.head[0]-=1.4*stretch;rig.head[1]+=2.3*stretch;
   contactWeight=q>1e-8&&q<1-1e-8?0:1;
  }else{
   state='walk';const stride=active.dist/Math.max(1,Math.ceil(active.dist/15));
   phase=travel*active.dist/stride*TAU;
   crouch=.055*(.5+.5*Math.cos(phase*2));
  }
 }else if(rebound){
  action='jump';state='rebound';footTransition=null;rig=blendRig(RIGS[1],RIGS[1],0);
  const r=clamp((t-rebound.previous.end)/(rebound.next.start-rebound.previous.end));
  crouch=mix(rebound.previous.landingCrouch,rebound.next.takeoffCrouch,ease(r))+.11*Math.sin(Math.PI*r)**2;
  landingImpulse=.58*Math.sin(Math.PI*r)**2;contactWeight=1+.55*Math.sin(Math.PI*r)**2;
 }else if(land&&!prep){
  action='jump';state='land';const p=clamp((t-land.end)/.28);
  const landingTarget=modeAt(name,land.end+.28).rig;
  footTransition={a:RIGS[1],b:landingTarget,fromFacing:facing,toFacing:facing,q:ease(p)};
  rig=blendRig(RIGS[1],landingTarget,ease(p));
  landingImpulse=Math.sin(Math.PI*clamp(p/.70))*(1-p);
  crouch=land.landingCrouch*(1-p)+.46*land.amplitude*landingImpulse;
  contactWeight=1+.7*landingImpulse;
 }
 // Shift the ribcage and shoulders for compression, leaving paw coordinates fixed.
 const compression=5.8*crouch;
 rig.shoulder[1]+=compression;rig.hip[1]+=compression*.78;rig.head[1]+=compression;
 rig.back+=crouch*.55;rig.belly*=1-crouch*.08;
 const inFlight=active?.action==='jump'&&q>1e-8&&q<1-1e-8;
 const grounded=!inFlight;
 if(inFlight)contactWeight=0;
 const scale=name==='white'?.95:1;
 const paws=[];
 const offsets=[0,.5,.25,.75];
 for(let i=0;i<4;i++){
  const front=i<2,far=i%2===0,base=front?rig.front:rig.hind;
  const localX=base[0]+(far?2.8:0),groundY=far?-2.3:1.6;
  let px=x+orientation*localX*scale,py=y+groundY*scale,z=0,load=contactWeight/4,planted=true;
  if(footTransition){
   const ft=footTransition,src=front?ft.a.front:ft.a.hind,dst=front?ft.b.front:ft.b.hind;
   const fromX=x-ft.fromFacing*(src[0]+(far?2.8:0))*scale,toX=x-ft.toFacing*(dst[0]+(far?2.8:0))*scale;
   const step=clamp((ft.q-[0,.30,.15,.45][i])/.55),f=ease(step);
   px=mix(fromX,toX,f);
   if(Math.abs(toX-fromX)>.01&&step>0&&step<1){z=4.8*Math.sin(Math.PI*step);load=0;planted=false;}
  }
  if(active?.action==='walk'){
   const D=active.dist,stride=D/Math.max(1,Math.ceil(D/15)),travel=ease(q)*D,step=pawTravel(travel,stride,offsets[i]);
   const startOffset=front?RIGS[1].front[0]:RIGS[1].hind[0];
   px=active.x+(-facing)*(startOffset+(far?2.8:0))*scale+active.dx/D*step.advance;
   py=active.y+groundY*scale+active.dy/D*step.advance;
   const envelope=smoothEdge(q/.08)*smoothEdge((1-q)/.08);
   z=step.lift*5.6*envelope;planted=step.planted||z<.025;load=planted?contactWeight*.37:0;
  }else if(active?.action==='jump'){
   // Plush proportions: the short rounded paws reach from the chest and hips
   // without stretching into the long limbs of the previous slender model.
   const flight=Math.sin(Math.PI*q),bump=(a,b)=>q>a&&q<b?Math.sin(Math.PI*(q-a)/(b-a))**2:0;
   const kick=bump(0,.40),tuck=bump(.28,.73),reachDown=bump(.67,1);
   // Let the hind paws trail against the direction of travel through the rise
   // and crest. The extra backward sweep holds through 62% of flight, then
   // returns continuously before impact while the hock still folds vertically.
   // Root x remains linear and air=4*h*q*(1-q): the body follows a true parabola.
   const trailing=5.5*ease(q/.16)*(1-ease((q-.62)/.32));
   const hindReach=7.2*flight-1.1*Math.sin(TAU*q)+2.0*kick-2.4*tuck+.8*reachDown+trailing;
   const reach=(front?-(5.8*flight+Math.sin(TAU*q)):hindReach)*active.amplitude;
   px+=(-facing)*reach*scale;
   z=air+(front?flight*2.8:flight*3.5+3.0*tuck-1.4*kick-2.1*reachDown)*active.amplitude;
   py+=front?0:.7*flight*active.amplitude;planted=grounded;load=grounded?.25:0;
  }
  paws.push({id:(front?'front':'hind')+(far?'-far':'-near'),front,far,x:px,y:py,z,load,planted});
 }
 const gesture=idleAt(name,t,action==='hold'&&grounded&&mode.blend===0&&(rig.sit===1||rig.lie===1));
 if(gesture.active&&rig.sit===1){
  const paw=paws.find(p=>p.id===gesture.pawId),transfer=(1-gesture.pawSupport)*contactWeight/4;
  paw.x+=facing*5*scale*gesture.pawLift;paw.z=12*scale*gesture.pawLift;
  paw.load=contactWeight/4-transfer;paw.planted=gesture.pawLift===0;
  for(const support of paws)if(support!==paw)support.load+=transfer/3;
 }
 const ear=earsAt(name,t,action==='hold'&&grounded&&mode.blend===0&&(rig.sit===1||rig.lie===1));
 const idle={pawLift:gesture.pawLift,pawId:gesture.pawId,tailSway:gesture.tailSway,tailLift:gesture.tailLift,earLeft:ear.earLeft,earRight:ear.earRight},idleActive=gesture.active||ear.active;
 const bodyLoad=grounded?(rig.lie*.95+rig.sit*.72+(1-Math.max(rig.lie,rig.sit))*.10)*contactWeight:0;
 const shapeWeight={stand:Math.max(0,1-rig.sit-rig.lie),lie:rig.lie,sit:rig.sit};
 const shapeBlend=(field,key)=>Object.entries(shapeWeight).reduce((sum,[name,w])=>sum+(key?CAT_SHAPES[name][field][key]:CAT_SHAPES[name][field])*w,0);
 const bodyContact={x:x+orientation*shapeBlend('body','x')*scale,y:y-1.5,
  rx:shapeBlend('body','rx')*(.70+.30*rig.lie)*scale,ry:(6.7+2.3*Math.max(rig.sit,rig.lie))*scale,load:bodyLoad};
 const contacts=paws.filter(p=>p.load>.001);
 return{name,t,x,y,facing,orientation,air,jump,pitch,crouch,vx,vy,phase,action,state,
  grounded,contactWeight,landingImpulse,paws,contacts,bodyContact,idle,idleActive,
  moving:Math.hypot(vx,vy)>.01,from:mode.from,to:mode.to,blend:mode.blend,
  rig,h:shapeBlend('height')*scale,w:shapeBlend('width')*scale,scale,
  grassOcclusion:t<17.9?6:t<18.8?3:0};
}
function smoothEdge(x){return ease(x)}

function ellipse(ctx,x,y,rx,ry,rotation=0){ctx.beginPath();ctx.ellipse(x,y,rx,ry,rotation,0,TAU);ctx.fill()}
function drawOne(ctx,pose){
 ctx.save();
 const high=clamp(pose.air/35),r=pose.rig,rx=mix(25,18,r.sit)*(1+.16*high),ry=mix(4.2,5.7,r.sit)*(1+.25*high),alpha=(.30-.17*high)*Math.min(1,pose.contactWeight||.9);
 const g=ctx.createRadialGradient(pose.x,pose.y+1,0,pose.x,pose.y+1,rx);
 g.addColorStop(0,`rgba(14,23,30,${alpha})`);g.addColorStop(1,'rgba(14,23,30,0)');ctx.fillStyle=g;ellipse(ctx,pose.x,pose.y+1,rx,ry);
 if(pose.grounded){for(const p of pose.contacts){ctx.fillStyle=`rgba(8,14,20,${.15*clamp(p.load*4)})`;ellipse(ctx,p.x,p.y+1,3.1,1.5)}}
 drawCatModel(ctx,pose);ctx.restore();
}
export async function createCatActors(){
 return{
  idleEvents:IDLE_EVENTS,earEvents:EAR_EVENTS,jumpEvents:JUMP_EVENTS,motionGroups:MOTION_GROUPS,
  sample(t){return['black','white'].map(name=>sampleOne(name,t))},
  drawCat(ctx,t,name){drawOne(ctx,sampleOne(name,t))},
  drawOne(ctx,t,name){drawOne(ctx,sampleOne(name,t))},
  draw(ctx,t){for(const pose of ['black','white'].map(name=>sampleOne(name,t)).sort((a,b)=>a.y-b.y))drawOne(ctx,pose)}
 };
}
