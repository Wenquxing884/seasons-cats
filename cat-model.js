import {CAT_SHAPES,SHAPE_REGIONS} from './cat-shapes.js';
const TAU=Math.PI*2, clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)), mix=(a,b,q)=>a+(b-a)*q;
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const blend=(a,b,c,w)=>a*w.stand+b*w.lie+c*w.sit;
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=(t+Math.imul(t^t>>>7,61|t))^t;return((t^t>>>14)>>>0)/4294967296}}
const random=rng(250319),FUR=Array.from({length:23000},()=>({a:random()*TAU,r:Math.sqrt(random()),u:random(),v:random(),length:.22+random()*.78,curve:(random()-.5)*.55,shade:random()}));
const EDGE=Array.from({length:3100},()=>({u:random(),len:.13+Math.pow(random(),1.7)*.81,slant:(random()-.5)*1.6,a:.2+random()*.8}));
// Rest-coat flow is independent of film time. Reuse it for the three settled
// silhouettes; moving skin still maps these exact points at the requested t.
const restFurCache=new Map(),heldRasterCache=new Map(),MAX_HELD_RASTERS=48;
const materials={
 black:{base:'#070808',bodyLight:[23,24,24],bodyDark:[3,4,4],headLight:[43,44,42],headDark:[3,4,5],rim:[221,224,219],hair:[92,96,91],shadow:[0,0,0]},
 white:{base:'#e5e3de',bodyLight:[241,239,234],bodyDark:[201,200,196],headLight:[255,254,248],headDark:[188,188,185],rim:[255,255,252],hair:[255,254,250],shadow:[128,131,130]}
};
const rgb=(c,a=1)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
function weights(p){const sit=clamp(p.rig?.sit??(p.posture==='sit'?1:0)),lie=clamp(p.rig?.lie??(p.posture==='lie'?1:0));return{sit,lie,stand:Math.max(0,1-sit-lie)}}
function blendedMeta(w,key){const out={};for(const prop of ['x','y','rx','ry'])out[prop]=blend(CAT_SHAPES.stand[key][prop],CAT_SHAPES.lie[key][prop],CAT_SHAPES.sit[key][prop],w);return out}
function blendedPoint(w,key){return[0,1].map(k=>blend(CAT_SHAPES.stand[key][k],CAT_SHAPES.lie[key][k],CAT_SHAPES.sit[key][k],w))}
function earHinge(w,angle,outerIndex,innerIndex,tipIndex){
 if(!angle)return null;
 const point=i=>[0,1].map(k=>blend(CAT_SHAPES.stand.points[i][k],CAT_SHAPES.lie.points[i][k],CAT_SHAPES.sit.points[i][k],w));
 const a=point(outerIndex),b=point(innerIndex),tip=point(tipIndex),x=(a[0]+b[0])*.5,y=(a[1]+b[1])*.5,slope=(b[1]-a[1])/(b[0]-a[0]);
 return{x,y,slope,minX:Math.min(a[0],b[0])-.6,maxX:Math.max(a[0],b[0])+.6,invHeight:1/Math.max(3,y+slope*(tip[0]-x)-tip[1]),cos:Math.cos(angle),sin:Math.sin(angle)};
}
function ellipse(ctx,x,y,rx,ry,rotation=0){ctx.beginPath();ctx.ellipse(x,y,rx,ry,rotation,0,TAU);ctx.fill()}
function pathOf(points){const path=new Path2D(),n=points.length;path.moveTo((points[n-1][0]+points[0][0])/2,(points[n-1][1]+points[0][1])/2);for(let i=0;i<n;i++){const a=points[i],b=points[(i+1)%n];path.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2)}path.closePath();return path}
function frontOutline(w){
 const height=blend(53.058,42.063,64,w),bottomWidth=mix(11,14,w.lie),h=height;
 // A front-facing plush volume, aligned to the same semantic perimeter spans.
 // The tail tucks behind the body during the turn, rather than folding the face
 // into a zero-width line as a mirrored flat sprite would do.
 const a=[[11,-h],[12,-h+29],[11,-h+33],[12,-h+35],[12,-h+36],[12,-h+38],[bottomWidth-1,0],[2,-1.8],[-2,-1.8],[-bottomWidth,0],[-12,-h+31],[-16,-h+19],[-11,-h],[0,-h+5]];
 const custom={
  0:[[15,-h+4],[20,-h+23]],
  1:[[13,-h+29],[11,-h+32]],
  5:[[13,-14],[bottomWidth+3,-2]],
  6:[[bottomWidth-3,1],[3,1]],
  8:[[-4,1],[-bottomWidth+1,1]],
  9:[[-bottomWidth-2,-7],[-10,-h+26]],
  10:[[-18,-h+29],[-19,-h+24]],
  11:[[-16,-h+13],[-15,-h-2]],
  12:[[-9,-h-2],[-6,-h+6]],
  13:[[5,-h+6],[9,-h-2]]
 };
 return Array.from({length:280},(_,i)=>{
  const j=Math.floor(i/20),t=(i%20)/20,s=1-t,p=a[j],q=a[(j+1)%14];
  const [b,c]=custom[j]||[[mix(p[0],q[0],1/3),mix(p[1],q[1],1/3)],[mix(p[0],q[0],2/3),mix(p[1],q[1],2/3)]];
  return[0,1].map(k=>s*s*s*p[k]+3*s*s*t*b[k]+3*s*t*t*c[k]+t*t*t*q[k]);
 });
}
function geometry(pose){
 const w=weights(pose),head=blendedMeta(w,'head'),body=blendedMeta(w,'body'),d=clamp(pose.orientation??(pose.facing!==undefined?-pose.facing:1),-1,1),turn=Math.pow(1-d*d,2),scale=pose.scale||1;
 const flight=pose.grounded===false?Math.sin(Math.PI*clamp(pose.phase||0)):0,compression=(pose.crouch||0)*4.0;
 const front=blendedPoint(w,'front'),hind=blendedPoint(w,'hind');
 const actual=kind=>{const paw=pose.paws?.find(p=>p.front===(kind==='front')&&!p.far);if(!paw)return null;return[(paw.x-pose.x)/scale,(paw.y-pose.y+(pose.air||0)-paw.z)/scale]};
 const actualFront=actual('front'),actualHind=actual('hind');
 const sign=d<0?-1:1,ad=Math.abs(d),frontPoints=turn>.00001?frontOutline(w):null;
 const df=actualFront?[actualFront[0]-front[0]*d,actualFront[1]]:[0,0],dh=actualHind?[actualHind[0]-hind[0]*d,actualHind[1]]:[0,0];
 const pawLift=clamp(pose.idle?.pawLift||0)*w.sit,localPaw=pawLift>0&&actualFront?[df[0],df[1]-1.6]:null;
 // Idle lifts affect a single forearm. Remove that displacement from the
 // broad front/hind skin blend so the belly and supporting legs stay planted.
 if(localPaw){df[0]=0;df[1]=1.6}
 const tailSway=(pose.idle?.tailSway||0)*w.lie,tailLift=(pose.idle?.tailLift||0)*w.lie;
 const tailBaseY=Math.min(blend(CAT_SHAPES.stand.points[40][1],CAT_SHAPES.lie.points[40][1],CAT_SHAPES.sit.points[40][1],w),blend(CAT_SHAPES.stand.points[100][1],CAT_SHAPES.lie.points[100][1],CAT_SHAPES.sit.points[100][1],w));
 const tailTipY=blend(CAT_SHAPES.stand.tail.tip[1],CAT_SHAPES.lie.tail.tip[1],CAT_SHAPES.sit.tail.tip[1],w);
 // Ear bases come from the outer/inner shoulder of each actual silhouette,
 // rather than moving the whole head oval. Left/right are model-local and are
 // reflected together with the cat, so turning does not swap the ear event.
 const earLeft=earHinge(w,pose.idle?.earLeft||0,228,256,240),earRight=earHinge(w,pose.idle?.earRight||0,8,264,0);
 const walkTail=pose.action==='walk'&&pose.moving,tailRoot=walkTail?blend(CAT_SHAPES.stand.tail.root[1],CAT_SHAPES.lie.tail.root[1],CAT_SHAPES.sit.tail.root[1],w):0,tailBend=walkTail?Math.sin(pose.phase*.5)*.55:0;
 function map(x,y,region='body',index=-1){
  const isHead=region==='head';
  let outX=x*d,outY=y;
  if(turn>.00001){
   const fp=index>=0?frontPoints[index]:[isHead?x-head.x:(x-body.x)*.65,y];
   outX=sign*mix(x*ad,fp[0],turn);outY=mix(y,fp[1],turn);
  }
  if(isHead&&(earLeft||earRight)){
   const ear=earLeft&&x>=earLeft.minX&&x<=earLeft.maxX?earLeft:earRight&&x>=earRight.minX&&x<=earRight.maxX?earRight:null;
   if(ear){
    const height=ear.y+ear.slope*(x-ear.x)-y;
    if(height>0){
     const influence=smooth(height*ear.invHeight)*smooth((x-ear.minX)/1.2)*smooth((ear.maxX-x)/1.2),dx=x-ear.x,dy=y-ear.y;
     outX+=((ear.cos-1)*dx-ear.sin*dy)*influence*d;
     outY+=(ear.sin*dx+(ear.cos-1)*dy)*influence;
    }
   }
  }
  outY+=compression*smooth(-y/19);
  if(!isHead){outX+=(x-body.x)*flight*.085;outY+=(body.y-y)*flight*.05}
  else outY+=flight*.6;
  // Continuous skin weights across the whole lower body, not per contour span:
  // a semantic boundary must never tear a tail root or the underside of a paw.
  if(!isHead&&(actualFront||actualHind)){
   const k=smooth(1-Math.max(0,-y)/21)*(1-turn*.30),between=smooth((x-front[0])/(hind[0]-front[0]||1));
   outX+=mix(df[0],dh[0],between)*k;outY+=mix(df[1],dh[1],between)*k;
  }
  if(localPaw&&!isHead){
   const arm=smooth((front[0]+5-x)/6)*smooth((y+30)/22);
   outX+=localPaw[0]*arm;outY+=localPaw[1]*arm;
  }
  // Keep the plush tail connected throughout flight; only walk adds a tiny bend.
  if(region==='tail'&&walkTail)outX+=tailBend*smooth((tailRoot-y)/25);
  if(region==='tail'&&(tailSway||tailLift)){
   const tip=smooth((tailBaseY-y)/Math.max(6,tailBaseY-tailTipY));
   outX+=tailSway*d*tip;outY-=tailLift*tip;
  }
  return[outX,outY];
 }
 const points=CAT_SHAPES.stand.points.map((a,i)=>map(blend(a[0],CAT_SHAPES.lie.points[i][0],CAT_SHAPES.sit.points[i][0],w),blend(a[1],CAT_SHAPES.lie.points[i][1],CAT_SHAPES.sit.points[i][1],w),SHAPE_REGIONS[i],i));
 const path=pathOf(points);
 const farPaw=localPaw?pose.paws?.find(p=>p.front&&p.far):null;
 const support=farPaw?{x:(farPaw.x-pose.x)/scale,y:(farPaw.y-pose.y-farPaw.z)/scale,shoulderX:(front[0]+3.0)*d,shoulderY:-23}:null;
 return{w,head,body,d,turn,scale,compression,flight,map,points,path,pawLift,support};
}
function supportForeleg(ctx,g,mat){
 if(!g.support)return;
 ctx.save();ctx.globalAlpha*=smooth(g.pawLift/.18);
 const p=g.support,x=p.x,y=p.y,sx=p.shoulderX,sy=p.shoulderY;
 // The far front paw is already behind the resting silhouette. It becomes
 // visible naturally as the near paw rises; its contact point never moves.
 const path=new Path2D();path.moveTo(sx-3.0,sy);path.quadraticCurveTo(sx-3.4,sy+9,x-3.4,y-1.1);path.quadraticCurveTo(x-3.3,y+.65,x,y+.65);path.quadraticCurveTo(x+3.2,y+.65,x+3.5,y-1.1);path.quadraticCurveTo(sx+3.5,sy+9,sx+3.0,sy);path.closePath();
 const gr=ctx.createLinearGradient(x-4,0,x+4,0);gr.addColorStop(0,rgb(mat.bodyDark));gr.addColorStop(.65,rgb(mat.bodyLight.map((v,i)=>Math.round(mix(v,mat.bodyDark[i],.37)))));gr.addColorStop(1,rgb(mat.bodyDark));ctx.fillStyle=gr;ctx.fill(path);ctx.restore();
}
function volume(ctx,shape,material){
 ctx.fillStyle=material.base;ctx.fill(shape.path);ctx.save();ctx.clip(shape.path);
 const {map,head,body,w,d}=shape,b=map(body.x,body.y),h=map(head.x,head.y,'head');
 let g=ctx.createRadialGradient(b[0]-7,b[1]-9,0,b[0]+4,b[1]+3,29);
 g.addColorStop(0,rgb(material.bodyLight));g.addColorStop(.53,rgb(material.bodyLight.map((v,k)=>Math.round(mix(v,material.bodyDark[k],.4)))));g.addColorStop(1,rgb(material.bodyDark));ctx.fillStyle=g;ctx.fillRect(-60,-76,120,85);
 // Soft ambient shading beneath the head. Gradients fade to transparent before
 // their drawing box ends, so there are no hard oval seams through the coat.
 g=ctx.createRadialGradient(h[0]+1,h[1]+head.ry*.81,1,h[0]+1,h[1]+head.ry*.81,17);
 g.addColorStop(0,rgb(material.shadow,.22));g.addColorStop(.4,rgb(material.shadow,.13));g.addColorStop(1,rgb(material.shadow,0));ctx.fillStyle=g;ctx.fillRect(h[0]-20,h[1]-4,43,44);
 // The oversized head retains the original rounded cheek and tall ears.
 g=ctx.createRadialGradient(h[0]-head.rx*.35,h[1]-head.ry*.45,1,h[0]-head.rx*.10,h[1]-head.ry*.10,head.rx*1.47);
 g.addColorStop(0,rgb(material.headLight,.83));g.addColorStop(.45,rgb(material.headLight,.48));g.addColorStop(.8,rgb(material.headLight,.13));g.addColorStop(1,rgb(material.headLight,0));
 ctx.fillStyle=g;ctx.fillRect(h[0]-head.rx*1.8,h[1]-head.ry*1.9,head.rx*3.6,head.ry*3.8);
 // Short plush feet, with only soft fur folds at the knee and shoulder.
 const fronts=[map(...blendedPoint(w,'front'),'legFront'),map(...blendedPoint(w,'hind'),'legHind')];
 for(const [i,f] of fronts.entries()){
  g=ctx.createRadialGradient(f[0]-2,f[1]-5,0,f[0]+2,f[1]-2,i?9:8);g.addColorStop(0,rgb(material.bodyLight,.33));g.addColorStop(1,rgb(material.bodyLight,0));ctx.fillStyle=g;ellipse(ctx,f[0],f[1]-6,8,10);
 }
 // Gentle crease where folded front paws lie next to one another in the sit.
 if(w.sit>.001){ctx.lineWidth=.45;ctx.strokeStyle=rgb(material.shadow,.12*w.sit);ctx.beginPath();ctx.moveTo(-4*d,-20);ctx.bezierCurveTo(-6*d,-12,-5*d,-5,-7*d,-1);ctx.stroke()}
 ctx.restore();
}
function restFur(g,count){
 const {w,head,body}=g,canonical=w.stand===1?'stand':w.lie===1?'lie':w.sit===1?'sit':null,key=canonical?canonical+':'+count:null;
 if(key&&restFurCache.has(key))return restFurCache.get(key);
 const flowPoints=[],tail={};for(const k of ['root','control','tip'])tail[k]=[0,1].map(n=>blend(CAT_SHAPES.stand.tail[k][n],CAT_SHAPES.lie.tail[k][n],CAT_SHAPES.sit.tail[k][n],w));
 for(let i=0;i<count;i++){
  const f=FUR[i];let x,y,vx,vy,region;
  if(i%10<5){
   x=head.x+Math.cos(f.a)*f.r*head.rx*1.1;y=head.y+Math.sin(f.a)*f.r*head.ry*1.25;region='head';
   const ax=(x-head.x)/head.rx,ay=(y-head.y)/head.ry;
   vx=ax*.75-.12;vy=ay*.78+.30; if(y<head.y-head.ry*.6){vx=ax*.22;vy=-1}
  }else if(i%10<9){
   x=body.x+Math.cos(f.a)*f.r*(body.rx+7);y=body.y+Math.sin(f.a)*f.r*(body.ry+8);region=y>-17?(x<-3?'legFront':'legHind'):'body';
   vx=.44+Math.sin((x-body.x)/19)*.33;vy=.45+(y-body.y)/17*.35;
  }else{
   const t=f.u;
   const s=1-t,dx=2*s*(tail.control[0]-tail.root[0])+2*t*(tail.tip[0]-tail.control[0]),dy=2*s*(tail.control[1]-tail.root[1])+2*t*(tail.tip[1]-tail.control[1]),len=Math.hypot(dx,dy)||1;
   const off=(f.v-.5)*7;x=s*s*tail.root[0]+2*s*t*tail.control[0]+t*t*tail.tip[0]-dy/len*off;y=s*s*tail.root[1]+2*s*t*tail.control[1]+t*t*tail.tip[1]+dx/len*off;
   vx=dx/len;vy=dy/len;region='tail';
  }
  const flow=.15*Math.sin(x*2.2+y*.37)+.12*Math.cos(y*1.7-x*.25),cx=vx*Math.cos(flow)-vy*Math.sin(flow),cy=vx*Math.sin(flow)+vy*Math.cos(flow);
  const len=Math.hypot(cx,cy)||1,L=f.length;vx=cx/len*L;vy=cy/len*L;
  flowPoints.push({x,y,bx:x+vx*.5-vy*f.curve,by:y+vy*.5+vx*f.curve,cx:x+vx,cy:y+vy,region,bucket:Math.min(13,Math.floor(f.shade*14))});
 }
 if(key)restFurCache.set(key,flowPoints);return flowPoints;
}
function furField(ctx,g,p,mat,budget){
 const {map,path}=g,white=p.name==='white',buckets=Array.from({length:14},()=>new Path2D());
 for(const f of restFur(g,budget.fur)){
  const a=map(f.x,f.y,f.region),b=map(f.bx,f.by,f.region),c=map(f.cx,f.cy,f.region),pa=buckets[f.bucket];pa.moveTo(a[0],a[1]);pa.quadraticCurveTo(b[0],b[1],c[0],c[1]);
 }
 ctx.save();ctx.clip(path);ctx.lineCap='round';ctx.lineWidth=(white?.047:.060)*budget.width;
 for(let i=0;i<buckets.length;i++){
  const high=i>=7,alpha=(white?(.10+Math.abs(i-6.5)*.028):(.13+Math.abs(i-6.5)*.043))*budget.alpha;
  ctx.strokeStyle=rgb(high?mat.hair:mat.shadow,alpha);ctx.stroke(buckets[i]);
 }
 ctx.restore();
}
function edgeFur(ctx,g,p,mat,budget){
 const n=g.points.length,paths=Array.from({length:8},()=>new Path2D()),lengths=[0];
 for(let i=0;i<n;i++){const a=g.points[i],b=g.points[(i+1)%n];lengths.push(lengths[i]+Math.hypot(b[0]-a[0],b[1]-a[1]))}
 const perimeter=lengths[n];
 // Counter-clockwise normals point out of the clockwise outline.
 for(let i=0;i<budget.edge;i++){
  const f=EDGE[i],at=f.u*perimeter;let lo=0,hi=n-1;while(lo<hi){const mid=(lo+hi)>>1;if(lengths[mid+1]<at)lo=mid+1;else hi=mid}
  const index=lo,q=(at-lengths[index])/(lengths[index+1]-lengths[index]||1),a=g.points[index],b=g.points[(index+1)%n],prev=g.points[(index+n-1)%n],next=g.points[(index+2)%n];
  const x=mix(a[0],b[0],q),y=mix(a[1],b[1],q),dx=next[0]-prev[0],dy=next[1]-prev[1],len=Math.hypot(dx,dy)||1;
  // Flipping orientation reverses winding; turn always uses the reflected body.
  const sign=g.d<-.02?-1:1,nx=dy/len*sign,ny=-dx/len*sign,L=f.len;
  const key=Math.min(7,Math.floor(clamp((.45-.25*nx-.25*ny)*(.45+.65*f.a))*8)),path=paths[key];
  const tang=f.slant*L*.75;
  path.moveTo(x-nx*(.35+f.a*.6)-dx/len*tang*.45,y-ny*(.35+f.a*.6)-dy/len*tang*.45);path.quadraticCurveTo(x+nx*L*.22+dx/len*tang*.18,y+ny*L*.22+dy/len*tang*.18,x+nx*L+dx/len*tang,y+ny*L+dy/len*tang);
 }
 ctx.lineCap='round';ctx.lineWidth=.055*budget.edgeWidth;
 for(let i=0;i<paths.length;i++){ctx.strokeStyle=rgb(mat.rim,(p.name==='white'?.17:.07)+i*.039);ctx.stroke(paths[i])}
 // Low-opacity boundary fuzz beneath the individual wisps, never a hard outline.
 ctx.save();ctx.strokeStyle=rgb(mat.rim,p.name==='white'?.065:.025);ctx.lineWidth=.18;ctx.stroke(g.path);ctx.restore();
}
function collar(ctx,g,p){
 if(p.name!=='black')return;
 const w=g.w,visible=clamp(w.sit+w.lie),h=g.map(g.head.x,g.head.y,'head'),d=g.d;
 if(visible<.001)return;
 const x=h[0]+2*d,y=h[1]+g.head.ry*.91;
 ctx.save();ctx.globalAlpha*=visible;ctx.save();ctx.clip(g.path);ctx.strokeStyle='rgba(3,4,4,.72)';ctx.lineWidth=.66;ctx.beginPath();ctx.ellipse(x,y-1.9,9.1,1.65,0,.27,Math.PI-.29);ctx.stroke();ctx.restore();
 // Metal loop, polished silver body, dark split and tiny reflection.
 ctx.strokeStyle='#6b6d68';ctx.lineWidth=.32;ctx.beginPath();ctx.ellipse(x+.4*d,y+.4,.65,.95,0,0,TAU);ctx.stroke();
 const cx=x+.4*d,cy=y+2.8,r=1.8,gr=ctx.createRadialGradient(cx-r*.4,cy-r*.45,.05,cx+r*.25,cy+r*.30,r*1.4);
 gr.addColorStop(0,'#ffffff');gr.addColorStop(.22,'#dfe4e3');gr.addColorStop(.47,'#9b9f9c');gr.addColorStop(.67,'#eef0e9');gr.addColorStop(1,'#3c423f');ctx.fillStyle=gr;ellipse(ctx,cx,cy,r,r*1.05);
 ctx.strokeStyle='#161b19';ctx.lineWidth=.30;ctx.beginPath();ctx.moveTo(cx-.85,cy+.2);ctx.quadraticCurveTo(cx,cy+.7,cx+.8,cy+.15);ctx.moveTo(cx,cy+.4);ctx.lineTo(cx,cy+1.55);ctx.stroke();ctx.fillStyle='#f9ffff';ellipse(ctx,cx-.55,cy-.7,.44,.31);ctx.restore();
}
export function createDisplayPose(name,posture='stand'){
 const s=CAT_SHAPES[posture];return{name,posture,state:posture,x:0,y:0,air:0,scale:1,orientation:1,facing:-1,action:'hold',moving:false,grounded:true,contactWeight:1,crouch:0,phase:0,pitch:0,rig:{sit:posture==='sit'?1:0,lie:posture==='lie'?1:0},paws:[],h:s.height,w:s.width};
}
function coatBudget(ctx,pose,detail){
 const transform=typeof ctx.getTransform==='function'?ctx.getTransform():null;
 const magnification=(pose.scale||1)*(transform&&Number.isFinite(transform.a)?Math.max(Math.hypot(transform.a,transform.b),Math.hypot(transform.c,transform.d)):1);
 // In the film a cat is only 60px wide: tens of thousands of 0.05px hairs add
 // CPU cost but no readable strands. Close-up cards retain every original hair.
 if(detail>1||magnification>2)return{fur:23000,edge:3100,width:1,alpha:1,edgeWidth:1,transform};
 if(magnification>1.25)return{fur:6200,edge:1200,width:1.45,alpha:1.13,edgeWidth:1.35,transform};
 return{fur:2600,edge:650,width:1.9,alpha:1.35,edgeWidth:1.6,transform};
}
function paintModel(ctx,g,pose,mat,fur,budget){
 supportForeleg(ctx,g,mat);volume(ctx,g,mat);if(fur)furField(ctx,g,pose,mat,budget);edgeFur(ctx,g,pose,mat,budget);collar(ctx,g,pose);
}
function heldKey(pose,fur,budget){
 const m=budget.transform;
 if(typeof document==='undefined'||!m||m.a!==1||m.b!==0||m.c!==0||m.d!==1||m.e!==0||m.f!==0||pose.action!=='hold'||pose.idleActive||pose.idle?.pawLift||pose.idle?.tailSway||pose.idle?.tailLift||pose.idle?.earLeft||pose.idle?.earRight||pose.moving||pose.grounded===false||(pose.air||0)!==0||(pose.crouch||0)!==0||(pose.blend||0)!==0)return null;
 const x=pose.x||0,y=pose.y||0,scale=pose.scale||1,w=weights(pose);
 const paws=(pose.paws||[]).filter(p=>!p.far).map(p=>[p.front,(p.x-x)/scale,(p.y-y-p.z)/scale]);
 // Exact local coordinates, never rounded time, position, orientation or pose.
 // Subpixel screen origin is included so cached and uncached rasterization agree.
 return JSON.stringify([pose.name,w.stand,w.lie,w.sit,pose.orientation??-pose.facing,scale,x-Math.floor(x),y-Math.floor(y),pose.phase||0,paws,fur,budget.fur,budget.edge]);
}
export function drawCatModel(ctx,pose,{fur=true,detail=1}={}){
 const budget=coatBudget(ctx,pose,detail),key=heldKey(pose,fur,budget);
 if(key){
  let cached=heldRasterCache.get(key);
  if(!cached){
   const g=geometry(pose),mat=materials[pose.name==='white'?'white':'black'],scale=g.scale,x=pose.x||0,y=pose.y||0;
   const x0=Math.floor(Math.min(...g.points.map(p=>p[0]))*scale+(x-Math.floor(x))-3),y0=Math.floor(Math.min(...g.points.map(p=>p[1]))*scale+(y-Math.floor(y))-3);
   const x1=Math.ceil(Math.max(...g.points.map(p=>p[0]))*scale+(x-Math.floor(x))+3),y1=Math.ceil(Math.max(...g.points.map(p=>p[1]))*scale+(y-Math.floor(y))+3);
   const canvas=document.createElement('canvas');canvas.width=x1-x0;canvas.height=y1-y0;
   const off=canvas.getContext('2d');off.translate(x-Math.floor(x)-x0,y-Math.floor(y)-y0);off.scale(scale,scale);paintModel(off,g,pose,mat,fur,budget);
   cached={canvas,x0,y0};heldRasterCache.set(key,cached);if(heldRasterCache.size>MAX_HELD_RASTERS)heldRasterCache.delete(heldRasterCache.keys().next().value);
  }
  ctx.drawImage(cached.canvas,Math.floor(pose.x||0)+cached.x0,Math.floor(pose.y||0)+cached.y0);return;
 }
 const g=geometry(pose),mat=materials[pose.name==='white'?'white':'black'];
 ctx.save();ctx.translate(pose.x||0,(pose.y||0)-(pose.air||0));ctx.scale(g.scale,g.scale);
 paintModel(ctx,g,pose,mat,fur,budget);ctx.restore();
}
