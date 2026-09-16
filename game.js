(() => {
  const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
  const ui=id=>document.getElementById(id);
  let W=0,H=0,DPR=1,running=false,last=0,flash=0,shake=0;
  const keys={};let mouseX=0,mouseDown=false;
  const FOV=Math.PI/3,RAYS=320,MAX=18;
  let map=[],enemies=[],pickups=[],particles=[],depth=[],floor=1,kills=0,level=1,xp=0,xpNeed=100;
  const p={x:1.5,y:1.5,a:0,hp:100,maxHp:100,energy:100,speed:2.15,damage:32,rate:.34,cd:0,crit:.08,leech:0};
  const types=[
    {hp:55,speed:1.0,damage:8,color:'#72d66b',size:.38,xp:28},
    {hp:110,speed:.52,damage:15,color:'#c4d85d',size:.48,xp:52},
    {hp:78,speed:1.28,damage:11,color:'#9d7cff',size:.40,xp:40}
  ];
  const upgrades=[['Arcane Force','+18 energy damage','damage',18],['Heavy Boots','+0.28 movement speed','speed',.28],['Titan Core','+30 max HP + heal','hp',30],['Quick Cast','faster energy attack','rate',.06],['Critical Matrix','+8% critical chance','crit',.08],['Deep Battery','+35 energy capacity','energy',35],['Soul Link','heal 3% damage dealt','leech',.03]];
  function resize(){DPR=Math.min(2,devicePixelRatio||1);W=canvas.clientWidth;H=canvas.clientHeight;canvas.width=W*DPR;canvas.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0)}
  addEventListener('resize',resize);resize();
  const rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[(Math.random()*a.length)|0];
  const cell=(x,y)=>map[y]?.[x]??1,solid=(x,y)=>cell(Math.floor(x),Math.floor(y))===1;
  function los(ax,ay,bx,by){const d=Math.hypot(bx-ax,by-ay);for(let t=.12;t<d;t+=.1)if(solid(ax+(bx-ax)*t/d,ay+(by-ay)*t/d))return false;return true}
  function makeMap(){
    const w=23,h=23;map=Array.from({length:h},()=>Array(w).fill(1));
    function carve(x,y){map[y][x]=0;for(const [dx,dy] of [[2,0],[-2,0],[0,2],[0,-2]].sort(()=>Math.random()-.5)){const nx=x+dx,ny=y+dy;if(nx>0&&ny>0&&nx<w-1&&ny<h-1&&map[ny][nx]){map[y+dy/2][x+dx/2]=0;carve(nx,ny)}}}
    carve(1,1);
    for(let i=0;i<16;i++){const x=1+((Math.random()*10)|0)*2,y=1+((Math.random()*10)|0)*2;if(x<w-2&&y<h-2){map[y][x]=0;if(Math.random()<.7){map[y][x+1]=0;map[y+1][x]=0}}}
    p.x=1.5;p.y=1.5;p.a=0;enemies=[];pickups=[];
    for(let i=0;i<5+floor*2;i++){let x,y;do{x=rnd(3,w-2);y=rnd(3,h-2)}while(solid(x,y)||Math.hypot(x-p.x,y-p.y)<5);const t=pick(types),hp=t.hp*(1+floor*.14);enemies.push({x,y,hp,maxHp:hp,speed:t.speed*(1+floor*.025),damage:t.damage*(1+floor*.1),color:t.color,size:t.size,xp:t.xp*(1+floor*.08),cd:rnd(.2,1),attack:0,phase:rnd(0,6)})}
    for(let i=0;i<4;i++){let x,y;do{x=rnd(2,w-2);y=rnd(2,h-2)}while(solid(x,y)||Math.hypot(x-p.x,y-p.y)<4);pickups.push({x,y,type:Math.random()<.7?'heal':'energy',spin:rnd(0,6)})}
  }
  function stoneColor(side,d){const light=Math.max(0,46-d*3.8),base=45+light;return side?`rgb(${base+3},${base+5},${base+4})`:`rgb(${base},${base+2},${base})`}
  function cast(){
    const strip=W/RAYS;depth=new Array(RAYS).fill(MAX);
    ctx.fillStyle='#080706';ctx.fillRect(0,0,W,H/2);ctx.fillStyle='#17130f';ctx.fillRect(0,H/2,W,H/2);
    for(let i=0;i<RAYS;i++){
      const ray=p.a-FOV/2+i/(RAYS-1)*FOV,rx=Math.cos(ray),ry=Math.sin(ray);let d=0,side=0;
      while(d<MAX){d+=.025;const x=p.x+rx*d,y=p.y+ry*d;if(solid(x,y)){const fx=x-Math.floor(x),fy=y-Math.floor(y);side=Math.min(fx,1-fx)<Math.min(fy,1-fy)?0:1;break}}
      const cor=d*Math.cos(ray-p.a);depth[i]=cor;const wh=Math.min(H*1.7,H/cor),y=(H-wh)/2;ctx.fillStyle=stoneColor(side,cor);ctx.fillRect(i*strip,y,strip+1,wh);
      if(cor<7){ctx.fillStyle=`rgba(115,88,55,${Math.max(0,(7-cor))*.025})`;ctx.fillRect(i*strip,y,strip+1,wh)}
    }
  }
  function project(o){const dx=o.x-p.x,dy=o.y-p.y,ca=Math.cos(-p.a),sa=Math.sin(-p.a),sx=dx*ca-dy*sa,sy=dx*sa+dy*ca;if(sx<=.05)return null;const ang=Math.atan2(sy,sx);if(Math.abs(ang)>FOV*.72)return null;return{x:W/2+ang/FOV*W,y:H/2,size:Math.min(H*1.2,H/sx)*o.size,dist:sx,ray:Math.floor((ang/FOV+.5)*RAYS)}}
  function visibleSprite(q){const strip=W/RAYS,lo=Math.max(0,Math.floor((q.x-q.size)/strip)),hi=Math.min(RAYS-1,Math.ceil((q.x+q.size)/strip));ctx.beginPath();let ok=false;for(let r=lo;r<=hi;r++)if(q.dist<=depth[r]+.06){ctx.rect(r*strip,0,strip+1,H);ok=true}if(ok)ctx.clip();return ok}
  function drawGoblin(e,q){
    const s=q.size,anim=e.attack>0?Math.sin((.32-e.attack)*25)*.18:Math.sin(performance.now()/260+e.phase)*.025;
    ctx.save();ctx.translate(q.x,H/2);ctx.globalAlpha=Math.max(.25,1-q.dist/20);ctx.shadowBlur=12;ctx.shadowColor=e.color;
    ctx.fillStyle='#2d3028';ctx.fillRect(-s*.25,s*.48,s*.16,s*.34);ctx.fillRect(s*.09,s*.48,s*.16,s*.34);
    ctx.fillStyle=e.color;ctx.beginPath();ctx.ellipse(0,s*.18,s*.43,s*.5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#79b94b';ctx.beginPath();ctx.ellipse(0,-s*.34,s*.42,s*.34,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(-s*.3,-s*.43);ctx.lineTo(-s*.72,-s*.62);ctx.lineTo(-s*.34,-s*.18);ctx.fill();ctx.beginPath();ctx.moveTo(s*.3,-s*.43);ctx.lineTo(s*.72,-s*.62);ctx.lineTo(s*.34,-s*.18);ctx.fill();
    ctx.fillStyle='#ffe16a';ctx.fillRect(-s*.2,-s*.4,s*.12,s*.09);ctx.fillRect(s*.08,-s*.4,s*.12,s*.09);ctx.fillStyle='#182016';ctx.fillRect(-s*.15,-s*.39,s*.035,s*.07);ctx.fillRect(s*.13,-s*.39,s*.035,s*.07);
    if(e.attack>0){ctx.strokeStyle='rgba(255,190,80,.75)';ctx.lineWidth=Math.max(2,s*.04);ctx.beginPath();ctx.arc(0,s*.05,s*.7,-1.2+anim,1.1+anim);ctx.stroke();ctx.fillStyle='rgba(255,170,80,.18)';ctx.beginPath();ctx.arc(0,s*.05,s*.58,-1.1+anim,.9+anim);ctx.fill()}
    ctx.restore();
  }
  function drawEnemies(){for(const e of enemies.map(e=>({e,q:project(e)})).filter(o=>o.q).sort((a,b)=>b.q.dist-a.q.dist)){const q=e.q;if(q.ray<0||q.ray>=RAYS)continue;ctx.save();if(!visibleSprite(q)){ctx.restore();continue}drawGoblin(e.e,q);const bw=q.size*1.4;ctx.fillStyle='#000b';ctx.fillRect(q.x-bw/2,H/2-q.size*.95,bw,4);ctx.fillStyle=e.e.color;ctx.fillRect(q.x-bw/2,H/2-q.size*.95,bw*Math.max(0,e.e.hp/e.e.maxHp),4);ctx.restore()}}
  function drawPickups(){for(const o of pickups){o.spin+=.04;const q=project({x:o.x,y:o.y,size:.18});if(!q||q.dist>depth[q.ray]+.1)continue;ctx.save();ctx.translate(q.x,H/2);ctx.rotate(o.spin);ctx.fillStyle=o.type==='heal'?'#5dff9b':'#54d9ff';ctx.shadowBlur=18;ctx.shadowColor=ctx.fillStyle;ctx.fillRect(-q.size/2,-q.size/2,q.size,q.size);ctx.restore()}}
  function energyAttack(){if(p.cd>0||p.energy<12||!running)return;p.cd=p.rate;p.energy-=12;flash=.09;shake=4;let best=null,bd=2.7;for(const e of enemies){const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy);let a=Math.atan2(dy,dx)-p.a;while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;if(d<bd&&Math.abs(a)<.18&&los(p.x,p.y,e.x,e.y)){best=e;bd=d}}if(best){const dmg=p.damage*(Math.random()<p.crit?2:1);best.hp-=dmg;if(p.leech)p.hp=Math.min(p.maxHp,p.hp+dmg*p.leech);for(let i=0;i<10;i++)particles.push({x:best.x,y:best.y,vx:rnd(-1.5,1.5),vy:rnd(-1.5,1.5),life:.45,color:'#ffd45c'})}for(let i=0;i<8;i++)particles.push({x:p.x+Math.cos(p.a)*.45,y:p.y+Math.sin(p.a)*.45,vx:Math.cos(p.a)*rnd(1,2.5),vy:Math.sin(p.a)*rnd(1,2.5),life:.3,color:'#8ce8ff'})}
  function hurt(n){p.hp-=n;shake=7;if(p.hp<=0)die()}
  function move(dt){let f=(keys.KeyW?1:0)-(keys.KeyS?1:0),s=(keys.KeyD?1:0)-(keys.KeyA?1:0),len=Math.hypot(f,s);if(len){f/=len;s/=len}const dash=(keys.ShiftLeft||keys.ShiftRight)&&len&&p.energy>0,sp=p.speed*dt*(dash?1.65:1);if(dash)p.energy=Math.max(0,p.energy-30*dt);else p.energy=Math.min(100,p.energy+16*dt);const ca=Math.cos(p.a),sa=Math.sin(p.a),mx=(f*ca-s*sa)*sp,my=(f*sa+s*ca)*sp;if(!solid(p.x+mx,p.y)&&!solid(p.x+mx+Math.sign(mx)*.1,p.y))p.x+=mx;if(!solid(p.x,p.y+my)&&!solid(p.x,p.y+my+Math.sign(my)*.1))p.y+=my;if(mouseX){p.a+=mouseX*.0025;mouseX=0}}
  function updateEnemies(dt){for(const e of enemies){e.cd-=dt;e.attack=Math.max(0,e.attack-dt);const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy);if(d>.75&&los(e.x,e.y,p.x,p.y)){const nx=dx/d*e.speed*dt,ny=dy/d*e.speed*dt;if(!solid(e.x+nx,e.y))e.x+=nx;if(!solid(e.x,e.y+ny))e.y+=ny}else if(d<=.75&&e.cd<=0&&los(e.x,e.y,p.x,p.y)){e.attack=.32;e.cd=1.05;hurt(e.damage)}}enemies=enemies.filter(e=>{if(e.hp>0)return true;kills++;gainXp(e.xp);for(let i=0;i<10;i++)particles.push({x:e.x,y:e.y,vx:rnd(-2,2),vy:rnd(-2,2),life:.65,color:e.color});if(Math.random()<.2)pickups.push({x:e.x,y:e.y,type:Math.random()<.6?'heal':'energy',spin:0});return false});if(!enemies.length){floor++;makeMap()}}
  function gainXp(n){xp+=n;while(xp>=xpNeed){xp-=xpNeed;level++;xpNeed=Math.floor(xpNeed*1.28);showLevelUp()}}
  function showLevelUp(){running=false;mouseDown=false;ui('levelUp').classList.remove('hidden');ui('upgrades').innerHTML='';[...upgrades].sort(()=>Math.random()-.5).slice(0,3).forEach((u,i)=>{const el=document.createElement('div');el.className='upgrade';el.innerHTML=`<div><strong>${u[0]}</strong><small>${u[1]}</small></div><span class="key">[${i+1}]</span>`;el.onclick=()=>applyUpgrade(u);ui('upgrades').appendChild(el)})}
  function applyUpgrade(u){const [n,d,t,v]=u;if(t==='damage')p.damage+=v;if(t==='speed')p.speed+=v;if(t==='hp'){p.maxHp+=v;p.hp=p.maxHp}if(t==='rate')p.rate=Math.max(.12,p.rate-v);if(t==='crit')p.crit+=v;if(t==='energy')p.energy=Math.min(100,p.energy+v);if(t==='leech')p.leech+=v;ui('levelUp').classList.add('hidden');running=true;last=performance.now();requestAnimationFrame(loop)}
  function collect(){pickups=pickups.filter(o=>{if(Math.hypot(o.x-p.x,o.y-p.y)<.55){if(o.type==='heal')p.hp=Math.min(p.maxHp,p.hp+25);else p.energy=Math.min(100,p.energy+40);return false}return true})}
  function particlesDraw(dt){for(const q of particles){q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;const z=project({x:q.x,y:q.y,size:.08});if(z&&z.dist<depth[z.ray]+.1){ctx.fillStyle=q.color;ctx.globalAlpha=Math.max(0,q.life*2);ctx.fillRect(z.x,z.y,z.size,z.size)}}ctx.globalAlpha=1;particles=particles.filter(q=>q.life>0)}
  function hud(){ui('level').textContent='LV '+level;ui('xpText').textContent=`${Math.floor(xp)} / ${xpNeed} XP`;ui('kills').textContent=kills;ui('floor').textContent=floor;ui('hpFill').style.width=Math.max(0,p.hp/p.maxHp*100)+'%';ui('hpText').textContent=`${Math.max(0,Math.ceil(p.hp))} / ${p.maxHp}`;ui('energyFill').style.width=p.energy+'%';ui('energyText').textContent=Math.floor(p.energy);ui('ammo').textContent='∞'}
  function minimap(){const el=ui('minimap'),scale=5;let out='';for(let y=0;y<23;y++){for(let x=0;x<23;x++)out+=map[y][x]?'█':' ';out+='\n'}el.textContent=out}
  function die(){running=false;mouseDown=false;ui('deathStats').textContent=`Level ${level} · Floor ${floor} · ${kills} düşman`;ui('death').classList.remove('hidden')}
  function render(dt){cast();drawEnemies();drawPickups();particlesDraw(dt);ctx.save();if(shake>0){ctx.translate(rnd(-shake,shake),rnd(-shake,shake));shake*=.82}ctx.restore();if(flash>0){ctx.fillStyle=`rgba(120,220,255,${flash*2})`;ctx.fillRect(0,0,W,H);flash-=dt}hud();minimap()}
  function loop(t){if(!running)return;const dt=Math.min(.033,(t-last)/1000||0);last=t;p.cd=Math.max(0,p.cd-dt);move(dt);updateEnemies(dt);collect();render(dt);requestAnimationFrame(loop)}
  addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Digit1'||e.code==='Digit2'||e.code==='Digit3'){const cards=[...ui('upgrades').children];cards[+e.code.slice(-1)-1]?.click()}if(e.code==='Space')energyAttack()});
  addEventListener('keyup',e=>keys[e.code]=false);
  canvas.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas)mouseX+=e.movementX});
  canvas.addEventListener('mousedown',()=>{canvas.requestPointerLock?.();mouseDown=true;energyAttack()});
  canvas.addEventListener('mouseup',()=>mouseDown=false);
  ui('startBtn').onclick=()=>{ui('startScreen').classList.add('hidden');makeMap();running=true;last=performance.now();canvas.requestPointerLock?.();requestAnimationFrame(loop)};
  ui('restartBtn').onclick=()=>{ui('death').classList.add('hidden');floor=1;kills=0;level=1;xp=0;xpNeed=100;p.hp=100;p.maxHp=100;p.energy=100;p.speed=2.15;p.damage=32;p.rate=.34;p.crit=.08;p.leech=0;makeMap();running=true;last=performance.now();requestAnimationFrame(loop)};
  ui('levelUp').classList.add('hidden');ui('death').classList.add('hidden');hud();minimap();
})();