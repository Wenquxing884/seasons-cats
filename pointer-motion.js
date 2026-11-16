// The reference tracker contains repeated frames and small centroid errors.
// Reconstruct a continuous clock motion once, rather than replaying that noise
// as visible stops, angular jolts and changes in the needle's length.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]};

function localFit(samples,t,key,sigma){
 let w0=0,w1=0,w2=0,y0=0,y1=0;
 for(const p of samples){
  const x=p.t-t;if(Math.abs(x)>sigma*3.5)continue;
  const w=Math.exp(-.5*(x/sigma)**2);
  w0+=w;w1+=w*x;w2+=w*x*x;y0+=w*p[key];y1+=w*x*p[key];
 }
 const determinant=w0*w2-w1*w1;
 if(determinant>1e-12)return(y0*w2-w1*y1)/determinant;
 return samples.reduce((a,b)=>Math.abs(a.t-t)<Math.abs(b.t-t)?a:b)[key];
}

function curve(xs,ys,{stop=false}={}){
 const n=xs.length,h=[],slope=[],m=new Float64Array(n);
 for(let i=0;i<n-1;i++){h.push(xs[i+1]-xs[i]);slope.push((ys[i+1]-ys[i])/h[i])}
 // Shape-preserving Hermite tangents keep the angle strictly increasing and
 // the radial trend free of the overshoot of unconstrained cubic splines.
 for(let i=1;i<n-1;i++){
  const a=slope[i-1],b=slope[i];
  if(a*b<=0){m[i]=0;continue}
  const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];m[i]=(w1+w2)/(w1/a+w2/b);
 }
 const endpoint=(a,b,ha,hb)=>{
  let v=((2*ha+hb)*a-ha*b)/(ha+hb);
  if(v*a<=0)v=0;else if(a*b<=0&&Math.abs(v)>Math.abs(3*a))v=3*a;
  return v;
 };
 m[0]=endpoint(slope[0],slope[1],h[0],h[1]);
 m[n-1]=stop?0:endpoint(slope[n-2],slope[n-3],h[n-2],h[n-3]);
 // A zero ending tangent plus the monotone limiter produces a quiet settle at
 // the final winter boundary. It never reverses or creeps during the fade out.
 for(let i=0;i<n-1;i++){
  const s=slope[i];if(!s){m[i]=m[i+1]=0;continue}
  const a=m[i]/s,b=m[i+1]/s,length=Math.hypot(a,b);
  if(length>3){const scale=3/length;m[i]*=scale;m[i+1]*=scale}
 }
 function at(t){
  if(t<=xs[0])return ys[0];if(t>=xs[n-1])return ys[n-1];
  let lo=0,hi=n-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(xs[mid]<=t)lo=mid;else hi=mid}
  const q=(t-xs[lo])/h[lo],q2=q*q,q3=q2*q;
  return(2*q3-3*q2+1)*ys[lo]+(q3-2*q2+q)*h[lo]*m[lo]+(-2*q3+3*q2)*ys[hi]+(q3-q2)*h[lo]*m[hi];
 }
 return{at,slopes:m};
}

export function createPointerMotion(source,{project}={}){
 const valid=source.filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.angle)&&Number.isFinite(p.rho)).sort((a,b)=>a.t-b.t);
 if(valid.length<4)throw new Error('Pointer motion needs at least four valid angle/radius samples.');
 // The broad seasonal rate remains faithful to the reference. Finer samples
 // would preserve its duplicate-frame cadence instead of removing it.
 const stopTime=22.9,settleStart=22.2,xs=[];
 for(let i=0;i<=111;i++)xs.push(i*.2);
 const angles=xs.map(t=>localFit(valid,t,'angle',.17));
 const radii=xs.map(t=>clamp(localFit(valid,t,'rho',.20),.89,1.21));
 for(let i=1;i<angles.length;i++)angles[i]=Math.max(angles[i],angles[i-1]+.001);
 const finalAngle=Math.ceil((angles.at(-1)-1e-6)/360)*360;
 const settledRadii=valid.filter(p=>p.t>=22.5&&p.t<=23.1).map(p=>p.rho);
 xs.push(stopTime);angles.push(finalAngle);radii.push(median(settledRadii.length?settledRadii:[valid.at(-1).rho]));
 const angular=curve(xs,angles,{stop:true}),radial=curve(xs,radii,{stop:true});
 function at(t){
  t=Number.isFinite(t)?clamp(t,0,stopTime):0;
  const angle=angular.at(t),rho=radial.at(t),a=angle*Math.PI/180,u=Math.cos(a)*rho,v=Math.sin(a)*rho;
  return{...(project?project(u,v):{x:u,y:v}),angle,rho};
 }
 function timeAtAngle(angle){
  if(angle<=angles[0])return 0;if(angle>=finalAngle)return stopTime;
  let a=0,b=stopTime;for(let i=0;i<35;i++){const t=(a+b)*.5;if(angular.at(t)<angle)a=t;else b=t}
  return(a+b)*.5;
 }
 // Existing deterministic baking code can use this compact, immutable table;
 // live needle/season queries should use at(t), without table quantization.
 const samples=Object.freeze(Array.from({length:Math.ceil(stopTime*60)+1},(_,i)=>{
  const t=Math.min(stopTime,i/60);return Object.freeze({t,...at(t)});
 }));
 const increments=valid.slice(1).map((p,i)=>p.angle-valid[i].angle);
 return{
  at,timeAtAngle,samples,
  stats:Object.freeze({sourceCount:valid.length,knotCount:xs.length,sampleCount:samples.length,settleStart,stopTime,finalAngle,
   sourceNearlyRepeatedSteps:increments.filter(d=>Math.abs(d)<.01).length,sourceReverseSteps:increments.filter(d=>d<-.01).length,
   sourceMaxAngleStep:Math.max(...increments)}),
 };
}
