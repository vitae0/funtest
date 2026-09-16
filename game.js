(() => {
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  const ui = id => document.getElementById(id);
  let W=0,H=0,DPR=1,running=false,last=0,flash=0,shake=0;
  const keys={}; let mouseX=0,mouseDown=false;
  const FOV=Math.PI/3,RAYS=320,MAX=18;
  let map=[],enemies=[],pickups=[],particles=[],depthBuffer=[],floor=1,kills=0,level=1,xp=0,xpNeed=100;
  const p={x:1.5,y:1.5,a:0,hp:100,maxHp:100,energy:100,speed:3,damage:28,fireRate:.24,shot:0,crit:.08,lifeSteal:0,shield:0};
  const enemyTypes=[
    {name:'GOBLIN',hp:55,speed:1.05,damage:8,color:'#62d66f',size:.38,xp:28},
    {name:'GOBLIN BRUTE',hp:105,speed:.55,damage:15,color:'#b7d957',size:.48,xp:50},
    {name:'GOBLIN HUNTER',hp:75,speed:1.35,damage:11,color:'#9d7cff',size:.40,xp:38}
  ];
  const upgrades=[['Overcharge','+18 weapon damage','damage',18],['Blood Rush','+12% movement speed','speed',.36],['Titan Core','+30 max HP + heal','hp',30],['Rapid Fire','+20% fire rate','fire',.20],['Critical Matrix','+8% critical chance','crit',.08],['Void Battery','+35 energy','energy',35],['Leech','Heal 3% damage dealt','leech',.03]];
  function resize(){DPR=Math.min(2,devicePixelRatio||1);W=canvas.clientWidth;H=canvas.clientHeight;canvas.width=W*DPR;canvas.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0)}
  addEventListener('resize',resize);resize();
  function rnd(a,b){return a+Math.random()*(b-a)} function pick(a){return a[(Math.random()*a.length)|0]}
  function cell(x,y){return map[y]?.[x]??1} function solid(x,y){return cell(Math.floor(x),Math.floor(y))===1}
  function hasLOS(ax,ay,bx,by){const d=Math.hypot(bx-ax,by-ay);for(let t=.15;t<d;t+=.12)if(solid(ax+(bx-ax)*t/d,ay+(by-ay)*t/d))return false;return true}
  function makeMap(){
    const w=23,h=23;map=Array.from({length:h},()=>Array(w).fill(1));
    function carve(x,y){map[y][x]=0;const dirs=[[2,0],[-2,0],[0,2],[0,-2]].sort(()=>Math.random()-.5);for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(nx>0&&ny>0&&nx<w-1&&ny<h-1&&map[ny][nx]){map[y+dy/2][x+dx/2]=0;carve(nx,ny)}}}
    carve(1,1);for(let i=0;i<18;i++){const x=1+((Math.random()*10)|0)*2,y=1+((Math.random()*10)|0)*2;if(x<w-2&&y<h-2){map[y][x]=0;if(Math.random()<.7){map[y][x+1]=0;map[y+1][x]=0}}}
    map[1][1]=0;p.x=1.5;p.y=1.5;p.a=0;enemies=[];pickups=[];
    const count=5+floor*2;
    for(let i=0;i<count;i++){let x,y;do{x=rnd(3,w-2);y=rnd(3,h-2)}while(solid(x,y)||Math.hypot(x-p.x,y-p.y)<5);const t=pick(enemyTypes),hp=t.hp*(1+floor*.14);enemies.push({x,y,hp,maxHp:hp,speed:t.speed*(1+floor*.025),damage:t.damage*(1+floor*.1),color:t.color,size:t.size,xp:t.xp*(1+floor*.08),cd:rnd(.1,1),attack:0,hit:0,phase:rnd(0,6)})}
    for(let i=0;i<4;i++){let x,y;do{x=rnd(2,w-2);y=rnd(2,h-2)}while(solid(x,y)||Math.hypot(x-p.x,y-p.y)<4);pickups.push({x,y,type:Math.random()<.7?'heal':'energy',spin:rnd(0,6)})}
  }
  function wallColor(side,dist){const base=28+Math.max(0,42-dist*4);return side?`rgb(${base+5},${base+10},${base+24})`:`rgb(${base+8},${base+15},${base+30})`}
  function cast(){
    const strip=W/RAYS;depthBuffer=new Array(RAYS).fill(MAX);ctx.fillStyle='#070b13';ctx.fillRect(0,0,W,H/2);ctx.fillStyle='#101722';ctx.fillRect(0,H/2,W,H/2);
    for(let i=0;i<RAYS;i++){const ray=p.a-FOV/2+(i/(RAYS-1))*FOV,rx=Math.cos(ray),ry=Math.sin(ray);let d=0,side=0;while(d<MAX){d+=.025;const x=p.x+rx*d,y=p.y+ry*d;if(solid(x,y)){const fx=x-Math.floor(x),fy=y-Math.floor(y);side=Math.min(fx,1-fx)<Math.min(fy,1-fy)?0:1;break}}const corr=d*Math.cos(ray-p.a);depthBuffer[i]=corr;const wh=Math.min(H*1.7,H/corr),y=(H-wh)/2;ctx.fillStyle=wallColor(side,corr);ctx.fillRect(i*strip,y,strip+1,wh);if(corr<5){ctx.fillStyle=`rgba(30,180,255,${(5-corr)*.025})`;ctx.fillRect(i*strip,y,strip+1,wh)}}
  }
  function project(o){const dx=o.x-p.x,dy=o.y-p.y,ca=Math.cos(-p.a),sa=Math.sin(-p.a);const sx=dx*ca-dy*sa,sy=dx*sa+dy*ca;if(sx<=.05)return null;const ang=Math.atan2(sy,sx);if(Math.abs(ang)>FOV*.72)return null;const z=sx,screenX=Math.floor((ang/FOV+.5)*RAYS);return{x:W/2+(ang/FOV)*W,y:H/2,size:Math.min(H*1.2,H/z)*o.size,dist:z,ray:screenX}}
  function clipSpriteToDepth(q,halfWidth=q.size){
    const strip=W/RAYS,left=Math.max(0,q.x-halfWidth),right=Math.min(W,q.x+halfWidth);
    const first=Math.max(0,Math.floor(left/strip)),last=Math.min(RAYS-1,Math.ceil(right/strip));
    ctx.beginPath();let visible=false;
    for(let r=first;r<=last;r++){
      if(q.dist<=depthBuffer[r]+.06){ctx.rect(r*strip,0,strip+1,H);visible=true}
    }
    if(visible)ctx.clip();
    return visible;
  }
  function drawGoblin(e,q){
    const s=q.size,phase=e.attack>0?Math.sin((.22-e.attack)*28)*.32:Math.sin(performance.now()/260+e.phase)*.035;
    ctx.save();ctx.translate(q.x,H/2);ctx.globalAlpha=Math.max(.25,1-q.dist/20);ctx.shadowBlur=14;ctx.shadowColor=e.color;
    // legs
    ctx.fillStyle='#35452d';ctx.fillRect(-s*.25,s*.48,s*.16,s*.34);ctx.fillRect(s*.09,s*.48,s*.16,s*.34);
    // body/armor
    ctx.fillStyle=e.color;ctx.beginPath();ctx.ellipse(0,s*.18,s*.43,s*.50,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#76512f';ctx.fillRect(-s*.48,s*.05,s*.12,s*.48);ctx.fillRect(s*.36,s*.05,s*.12,s*.48);
    // head + ears
    ctx.fillStyle='#79b94b';ctx.beginPath();ctx.ellipse(0,-s*.34,s*.42,s*.34,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(-s*.30,-s*.43);ctx.lineTo(-s*.72,-s*.62);ctx.lineTo(-s*.34,-s*.18);ctx.fill();ctx.beginPath();ctx.moveTo(s*.30,-s*.43);ctx.lineTo(s*.72,-s*.62);ctx.lineTo(s*.34,-s*.18);ctx.fill();
    // eyes
    ctx.fillStyle='#ffd95c';ctx.fillRect(-s*.20,-s*.40,s*.12,s*.09);ctx.fillRect(s*.08,-s*.40,s*.12,s*.09);ctx.fillStyle='#1a2415';ctx.fillRect(-s*.15,-s*.39,s*.035,s*.07);ctx.fillRect(s*.13,-s*.39,s*.035,s*.07);
    // weapon swing during attack
    ctx.save();ctx.translate(s*.38,s*.05);ctx.rotate(-.9+phase*2.2);ctx.fillStyle='#7b5530';ctx.fillRect(-s*.04,-s*.08,s*.09,s*.58);ctx.fillStyle='#c9d1d8';ctx.beginPath();ctx.moveTo(-s*.16,-s*.14);ctx.lineTo(s*.02,-s*.25);ctx.lineTo(s*.18,-s*.08);ctx.lineTo(0,s*.03);ctx.fill();ctx.restore();
    if(e.attack>0){ctx.strokeStyle='rgba(255,225,120,.8)';ctx.lineWidth=Math.max(2,s*.035);ctx.beginPath();ctx.arc(s*.2,0,s*.7,-1.2+.5*phase,1.1+.5*phase);ctx.stroke()}
    ctx.restore();
  }
  function drawEnemies(){
    const list=enemies.map(e=>({e,q:project(e)})).filter(o=>o.q).sort((a,b)=>b.q.dist-a.q.dist);
    for(const {e,q} of list){
      if(q.ray<0||q.ray>=RAYS)continue;
      ctx.save();
      if(!clipSpriteToDepth(q,q.size*.95)){ctx.restore();continue}
      drawGoblin(e,q);
      const bw=q.size*1.4;ctx.fillStyle='#000b';ctx.fillRect(q.x-bw/2,H/2-q.size*.95,bw,4);ctx.fillStyle=e.color;ctx.fillRect(q.x-bw/2,H/2-q.size*.95,bw*Math.max(0,e.hp/e.maxHp),4);
      ctx.restore();
    }
  }
  function drawPickups(){for(const o of pickups){o.spin+=.03;const q=project({x:o.x,y:o.y,size:.18});if(!q||q.dist>depthBuffer[q.ray]+.1)continue;ctx.save();ctx.translate(q.x,H/2);ctx.rotate(o.spin);ctx.fillStyle=o.type==='heal'?'#5dff9b':'#54d9ff';ctx.shadowBlur=20;ctx.shadowColor=ctx.fillStyle;ctx.fillRect(-q.size/2,-q.size/2,q.size,q.size);ctx.restore()}}
  function shoot(){if(p.shot>0)return;p.shot=p.fireRate;flash=.08;shake=5;let best=null,bestD=999;for(const e of enemies){const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy);let ang=Math.atan2(dy,dx)-p.a;while(ang>Math.PI)ang-=Math.PI*2;while(ang<-Math.PI)ang+=Math.PI*2;if(Math.abs(ang)<.09&&d<bestD&&hasLOS(p.x,p.y,e.x,e.y)){best=e;bestD=d}}if(best){const dmg=p.damage*(Math.random()<p.crit?2:1);best.hp-=dmg;best.hit=.12;if(p.lifeSteal)p.hp=Math.min(p.maxHp,p.hp+dmg*p.lifeSteal);for(let i=0;i<7;i++)particles.push({x:best.x,y:best.y,vx:rnd(-1,1),vy:rnd(-1,1),life:.4,color:best.color})}for(let i=0;i<5;i++)particles.push({x:p.x+Math.cos(p.a)*.5,y:p.y+Math.sin(p.a)*.5,vx:Math.cos(p.a)*rnd(1,3),vy:Math.sin(p.a)*rnd(1,3),life:.25,color:'#54d9ff'})}
  function hurt(n){if(p.shield>0){p.shield-=n;if(p.shield<0){n=-p.shield;p.shield=0}else n=0}p.hp-=n;shake=8;if(p.hp<=0)die()}
  function move(dt){
    let forward=0,strafe=0;if(keys.KeyW)forward+=1;if(keys.KeyS)forward-=1;if(keys.KeyA)strafe-=1;if(keys.KeyD)strafe+=1;const len=Math.hypot(forward,strafe);if(len){forward/=len;strafe/=len}
    const sprint=(keys.ShiftLeft||keys.ShiftRight)&&len&&p.energy>0,sp=p.speed*dt*(sprint?1.8:1);if(sprint)p.energy=Math.max(0,p.energy-35*dt);else p.energy=Math.min(100,p.energy+15*dt);
    const ca=Math.cos(p.a),sa=Math.sin(p.a),mx=(forward*ca-strafe*sa)*sp,my=(forward*sa+strafe*ca)*sp;
    if(!solid(p.x+mx,p.y)&&!solid(p.x+mx+Math.sign(mx)*.12,p.y))p.x+=mx;if(!solid(p.x,p.y+my)&&!solid(p.x,p.y+my+Math.sign(my)*.12))p.y+=my;
    if(mouseX){p.a+=mouseX*.0025;mouseX=0}
  }
  function updateEnemies(dt){for(const e of enemies){e.cd-=dt;e.attack=Math.max(0,e.attack-dt);e.hit=Math.max(0,e.hit-dt);const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy);if(d>.72){const nx=dx/d*e.speed*dt,ny=dy/d*e.speed*dt;if(!solid(e.x+nx,e.y)&&hasLOS(e.x,e.y,p.x,p.y))e.x+=nx;if(!solid(e.x,e.y+ny)&&hasLOS(e.x,e.y,p.x,p.y))e.y+=ny}else if(e.cd<=0&&hasLOS(e.x,e.y,p.x,p.y)){e.attack=.28;e.cd=1.0;setTimeout(()=>{if(running&&e.attack>=0)hurt(e.damage)},110)}}enemies=enemies.filter(e=>{if(e.hp>0)return true;kills++;gainXp(e.xp);for(let i=0;i<10;i++)particles.push({x:e.x,y:e.y,vx:rnd(-2,2),vy:rnd(-2,2),life:.7,color:e.color});if(Math.random()<.18)pickups.push({x:e.x,y:e.y,type:Math.random()<.6?'heal':'energy',spin:0});return false})}
  function gainXp(n){xp+=n;while(xp>=xpNeed){xp-=xpNeed;level++;xpNeed=Math.floor(xpNeed*1.28);showLevelUp()}}
  function showLevelUp(){running=false;mouseDown=false;ui('levelUp').classList.remove('hidden');ui('upgrades').innerHTML='';const opts=[...upgrades].sort(()=>Math.random()-.5).slice(0,3);opts.forEach((u,i)=>{const el=document.createElement('div');el.className='upgrade';el.innerHTML=`<div><strong>${u[0]}</strong><small>${u[1]}</small></div><span class="key">[${i+1}]</span>`;el.onclick=()=>applyUpgrade(u);ui('upgrades').appendChild(el)})}
  function applyUpgrade(u){const t=u[2],v=u[3];if(t==='damage')p.damage+=v;if(t==='speed')p.speed+=v;if(t==='hp'){p.maxHp+=v;p.hp=p.maxHp}if(t==='fire')p.fireRate=Math.max(.08,p.fireRate-v);if(t==='crit')p.crit+=v;if(t==='energy')p.energy=Math.min(100,p.energy+v);if(t==='leech')p.lifeSteal+=v;ui('levelUp').classList.add('hidden');running=true;last=performance.now();requestAnimationFrame(loop)}
  function collect(){pickups=pickups.filter(o=>{if(Math.hypot(o.x-p.x,o.y-p.y)<.55){if(o.type==='heal')p.hp=Math.min(p.maxHp,p.hp+25);else p.energy=Math.min(100,p.energy+40);return false}return true})}
  function particlesStep(dt){particles=particles.filter(a=>{a.x+=a.vx*dt;a.y+=a.vy*dt;a.life-=dt;return a.life>0})}function drawParticles(){for(const a of particles){const q=project({x:a.x,y:a.y,size:.04});if(q&&q.dist<=depthBuffer[q.ray]+.1){ctx.fillStyle=a.color;ctx.globalAlpha=Math.max(0,a.life);ctx.fillRect(q.x,q.y,q.size,q.size);ctx.globalAlpha=1}}}
  function hud(){ui('level').textContent='LV '+level;ui('xpText').textContent=`${Math.floor(xp)} / ${xpNeed} XP`;ui('kills').textContent=kills;ui('floor').textContent=floor;ui('hpText').textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;ui('energyText').textContent=Math.ceil(p.energy);ui('hpFill').style.width=Math.max(0,p.hp/p.maxHp*100)+'%';ui('energyFill').style.width=p.energy+'%';const m=ui('minimap');m.innerHTML='';const scale=6;for(let y=0;y<map.length;y++)for(let x=0;x<map[y].length;x++)if(!map[y][x]){const d=document.createElement('i');d.style.cssText=`position:absolute;width:${scale}px;height:${scale}px;left:${x*scale}px;top:${y*scale}px;background:#26364d`;m.appendChild(d)}const dot=document.createElement('b');dot.style.cssText=`position:absolute;width:6px;height:6px;border-radius:50%;background:#54d9ff;left:${p.x*scale-3}px;top:${p.y*scale-3}px`;m.appendChild(dot)}
  function nextFloor(){floor++;p.hp=Math.min(p.maxHp,p.hp+30);makeMap();toast('FLOOR '+floor+' — DAHA DERİNE!')}function toast(t){const m=ui('message');m.textContent=t;m.style.opacity=1;setTimeout(()=>m.style.opacity=0,1200)}function die(){running=false;document.exitPointerLock?.();ui('death').classList.remove('hidden');ui('deathStats').textContent=`Floor ${floor} · Level ${level} · ${kills} düşman · ${Math.floor(xp)} XP`}
  function reset(){floor=1;kills=0;level=1;xp=0;xpNeed=100;Object.assign(p,{hp:100,maxHp:100,energy:100,speed:3,damage:28,fireRate:.24,crit:.08,lifeSteal:0,shield:0});makeMap();ui('death').classList.add('hidden');ui('startScreen').classList.add('hidden');running=true;canvas.requestPointerLock?.();last=performance.now();requestAnimationFrame(loop)}
  function loop(now){if(!running)return;const dt=Math.min(.05,(now-last)/1000);last=now;p.shot=Math.max(0,p.shot-dt);move(dt);if(mouseDown)shoot();updateEnemies(dt);collect();particlesStep(dt);if(enemies.length===0)nextFloor();cast();drawPickups();drawEnemies();drawParticles();if(flash>0){ctx.fillStyle=`rgba(84,217,255,${flash*1.8})`;ctx.fillRect(0,0,W,H);flash-=dt}hud();requestAnimationFrame(loop)}
  addEventListener('keydown',e=>{keys[e.code]=true;if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space'].includes(e.code))e.preventDefault();if(['1','2','3'].includes(e.key)&&!ui('levelUp').classList.contains('hidden')){const el=ui('upgrades').children[+e.key-1];if(el)el.click()}});
  addEventListener('keyup',e=>{keys[e.code]=false;if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space'].includes(e.code))e.preventDefault()});
  addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas)mouseX=e.movementX});canvas.addEventListener('mousedown',()=>{mouseDown=true;canvas.requestPointerLock?.()});addEventListener('mouseup',()=>mouseDown=false);
  ui('startBtn').onclick=reset;ui('restartBtn').onclick=reset;makeMap();hud();
})();