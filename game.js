(() => {
  'use strict';
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;
  const keys = new Set();
  const pressed = new Set();
  let muted = false, audio;

  const C = { ink:'#14201b', cream:'#f1e5b9', gold:'#e8bd62', red:'#c9534b', green:'#5e9b62', pale:'#a9cf79', water:'#37767b' };
  const rooms = [
    { name:'WHISPERING GROVE', floor:'#48704e', edge:'#263e32', exits:['r'], deco:'forest', enemies:3 },
    { name:'MOSS-COVERED RUINS', floor:'#667159', edge:'#343d32', exits:['l','r'], deco:'ruins', enemies:4, key:true },
    { name:'MOONLIT CROSSING', floor:'#41666a', edge:'#243d42', exits:['l','r'], deco:'water', enemies:3 },
    { name:'THE HOLLOW KEEP', floor:'#55515a', edge:'#2c2931', exits:['l'], deco:'keep', enemies:1, boss:true }
  ];
  const state = { mode:'title', room:0, transition:0, message:'', messageTime:0, shake:0, time:0, kills:0, roomClear:false };
  const hero = { x:150,y:300,r:15,speed:190,dir:'down',hp:6,maxHp:6,inv:0,attack:0,attackCd:0,key:false };
  let enemies=[], particles=[], projectiles=[], pickups=[];

  function rnd(a,b){ return a + Math.random()*(b-a); }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function tone(freq,duration=.08,type='square',vol=.035){
    if(muted) return;
    try { audio ||= new (window.AudioContext||window.webkitAudioContext)(); const o=audio.createOscillator(), g=audio.createGain(); o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration); } catch(e){}
  }
  function sfx(name){
    if(name==='sword'){tone(180,.08,'sawtooth',.035);setTimeout(()=>tone(100,.05,'square',.02),35);}
    if(name==='hurt') tone(75,.18,'sawtooth',.06);
    if(name==='coin') {tone(660,.1);setTimeout(()=>tone(880,.16),80);}
    if(name==='win') [392,523,659,784].forEach((f,i)=>setTimeout(()=>tone(f,.28,'triangle',.05),i*130));
  }
  function circleHit(a,b,pad=0){ return Math.hypot(a.x-b.x,a.y-b.y) < a.r+b.r+pad; }
  function walls(){ return { left:48,right:912,top:72,bottom:552 }; }

  function enterRoom(i, fromRight=false){
    state.room=i; state.roomClear=false; state.message=rooms[i].name; state.messageTime=2.1;
    hero.x=fromRight?865:95; hero.y=310; hero.inv=.7; enemies=[]; projectiles=[]; pickups=[];
    const r=rooms[i];
    for(let n=0;n<r.enemies;n++){
      const boss=r.boss;
      enemies.push({x: boss?650:rnd(280,780), y:rnd(150,470), r:boss?34:16, hp:boss?10:(i+2), max:boss?10:(i+2), speed:boss?62:rnd(48,78), hit:0, attack:rnd(.5,2), boss, angle:rnd(0,6.2)});
    }
  }
  function start(){ Object.assign(hero,{x:150,y:300,hp:6,inv:0,attack:0,attackCd:0,key:false}); state.mode='play';state.kills=0;enterRoom(0);tone(440,.12); }
  function attack(){
    if(state.mode==='title'||state.mode==='dead'||state.mode==='win'){start();return;}
    if(state.mode!=='play'||hero.attackCd>0) return;
    hero.attack=.18;hero.attackCd=.32;sfx('sword');
  }
  function swordPos(){ const d={up:[0,-30],down:[0,30],left:[-30,0],right:[30,0]}[hero.dir]; return {x:hero.x+d[0],y:hero.y+d[1],r:19}; }
  function burst(x,y,color,count=8){ for(let i=0;i<count;i++)particles.push({x,y,vx:rnd(-110,110),vy:rnd(-110,110),life:rnd(.25,.65),color,size:rnd(2,6)}); }

  function update(dt){
    state.time+=dt; state.messageTime-=dt; state.shake=Math.max(0,state.shake-dt*20);
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy*=.95;p.life-=dt;}); particles=particles.filter(p=>p.life>0);
    if(state.mode!=='play') return;
    hero.inv-=dt;hero.attack-=dt;hero.attackCd-=dt;
    let dx=0,dy=0;
    if(keys.has('ArrowLeft')||keys.has('KeyA')){dx--;hero.dir='left';}
    if(keys.has('ArrowRight')||keys.has('KeyD')){dx++;hero.dir='right';}
    if(keys.has('ArrowUp')||keys.has('KeyW')){dy--;hero.dir='up';}
    if(keys.has('ArrowDown')||keys.has('KeyS')){dy++;hero.dir='down';}
    if(dx&&dy){dx*=.707;dy*=.707;}
    hero.x+=dx*hero.speed*dt;hero.y+=dy*hero.speed*dt;
    const b=walls(); hero.y=clamp(hero.y,b.top+hero.r,b.bottom-hero.r);
    const room=rooms[state.room], clear=enemies.length===0;
    const canLeft=room.exits.includes('l'), canRight=room.exits.includes('r');
    hero.x=clamp(hero.x,(canLeft&&clear)?20:b.left+hero.r,(canRight&&clear)?W-20:b.right-hero.r);
    if(hero.x>W-28 && canRight && clear){ if(state.room===1&&!hero.key){hero.x=W-55;state.message='THE WAY IS SEALED';state.messageTime=1.5;} else enterRoom(state.room+1); }
    if(hero.x<28 && canLeft && clear) enterRoom(state.room-1,true);

    if(hero.attack>0){ const sw=swordPos(); enemies.forEach(e=>{if(e.hit<=0&&circleHit(sw,e,4)){e.hp--;e.hit=.22;e.x+=(e.x-hero.x)*.12;e.y+=(e.y-hero.y)*.12;burst(e.x,e.y,C.gold,5);tone(e.boss?110:150,.06);}}); }
    enemies.forEach(e=>{
      e.hit-=dt;e.attack-=dt; const ax=hero.x-e.x,ay=hero.y-e.y,dist=Math.hypot(ax,ay)||1;
      if(e.boss){
        e.angle+=dt; if(e.attack<=0){ for(let k=0;k<8;k++){const a=k*Math.PI/4+e.angle;projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*120,vy:Math.sin(a)*120,r:7,life:4});} e.attack=2.2; tone(90,.18,'sawtooth'); }
        e.x+=ax/dist*e.speed*dt;e.y+=ay/dist*e.speed*dt;
      } else { e.x+=ax/dist*e.speed*dt;e.y+=ay/dist*e.speed*dt; }
      e.x=clamp(e.x,b.left+e.r,b.right-e.r);e.y=clamp(e.y,b.top+e.r,b.bottom-e.r);
      if(circleHit(hero,e)&&hero.inv<=0) hurtHero(e.x,e.y);
    });
    const dead=enemies.filter(e=>e.hp<=0); dead.forEach(e=>{burst(e.x,e.y,e.boss?'#b974d1':C.pale,e.boss?28:12);state.kills++; if(e.boss){state.mode='win';sfx('win');} }); enemies=enemies.filter(e=>e.hp>0);
    if(!enemies.length&&!state.roomClear){state.roomClear=true;tone(523,.08);setTimeout(()=>tone(659,.12),90);if(room.key&&!hero.key)pickups.push({x:480,y:300,r:14,type:'key',bob:0});}
    pickups.forEach(p=>{p.bob+=dt;if(circleHit(hero,p)){hero.key=true;p.got=true;sfx('coin');state.message='RUIN KEY FOUND';state.messageTime=2;burst(p.x,p.y,C.gold,14);}});pickups=pickups.filter(p=>!p.got);
    projectiles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(circleHit(hero,p)&&hero.inv<=0){hurtHero(p.x,p.y);p.life=0;}});projectiles=projectiles.filter(p=>p.life>0&&p.x>40&&p.x<W-40&&p.y>65&&p.y<H-40);
    pressed.clear();
  }
  function hurtHero(x,y){ hero.hp--;hero.inv=1;state.shake=7;hero.x+=(hero.x-x)*.25;hero.y+=(hero.y-y)*.25;sfx('hurt');burst(hero.x,hero.y,C.red,9);if(hero.hp<=0)state.mode='dead'; }

  function pxRect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
  function text(t,x,y,size=18,color=C.cream,align='center'){ctx.font=`bold ${size}px ui-monospace, monospace`;ctx.textAlign=align;ctx.fillStyle='#101814';ctx.fillText(t,x+2,y+2);ctx.fillStyle=color;ctx.fillText(t,x,y);}
  function drawHeart(x,y,full){ctx.fillStyle=full?C.red:'#4c413b';ctx.beginPath();ctx.moveTo(x,y+5);ctx.arc(x-5,y,6,Math.PI,0);ctx.arc(x+5,y,6,Math.PI,0);ctx.lineTo(x,y+14);ctx.closePath();ctx.fill();}
  function drawWorld(){
    const r=rooms[state.room];ctx.fillStyle=r.edge;ctx.fillRect(0,0,W,H);ctx.fillStyle=r.floor;ctx.fillRect(48,72,864,480);
    // tile texture
    ctx.globalAlpha=.13;ctx.fillStyle='#f5edc7';for(let y=88;y<550;y+=32)for(let x=64;x<910;x+=32)if((x/32+y/32)%3===0)ctx.fillRect(x,y,3,3);ctx.globalAlpha=1;
    if(r.deco==='forest') drawForest(); if(r.deco==='ruins') drawRuins(); if(r.deco==='water') drawWater(); if(r.deco==='keep') drawKeep();
    // walls and doors
    ctx.fillStyle='#17261f';ctx.fillRect(0,40,W,32);ctx.fillRect(0,552,W,48);ctx.fillRect(0,72,48,480);ctx.fillRect(912,72,48,480);
    const clear=enemies.length===0;
    if(r.exits.includes('l')) drawDoor(0,clear, state.room===2&&!hero.key); if(r.exits.includes('r')) drawDoor(912,clear,state.room===1&&!hero.key);
    pickups.forEach(drawPickup);projectiles.forEach(drawProjectile);enemies.forEach(drawEnemy);drawHero();particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life*2);pxRect(p.x,p.y,p.size,p.size,p.color);});ctx.globalAlpha=1;
    drawHUD();
  }
  function drawForest(){for(const [x,y] of [[95,120],[190,500],[835,130],[730,515],[370,115]]){ctx.fillStyle='#203e30';ctx.beginPath();ctx.arc(x,y,27,0,7);ctx.fill();ctx.fillStyle='#6d934f';ctx.beginPath();ctx.arc(x,y-9,20,0,7);ctx.fill();pxRect(x-5,y+10,10,19,'#594633');}}
  function drawRuins(){ctx.fillStyle='#8a886c';[[130,120],[720,120],[260,500],[830,460]].forEach(([x,y])=>{ctx.fillRect(x,y,65,13);ctx.fillRect(x+8,y-18,12,18);ctx.fillRect(x+43,y-28,12,28);});}
  function drawWater(){ctx.fillStyle='#2f555b';ctx.fillRect(250,72,460,480);ctx.fillStyle='#8d8c6e';ctx.fillRect(420,72,120,480);ctx.fillStyle='#6fc0b5';ctx.globalAlpha=.3;for(let y=100;y<540;y+=45){ctx.fillRect(270,y,90,3);ctx.fillRect(580,y+15,105,3);}ctx.globalAlpha=1;}
  function drawKeep(){ctx.fillStyle='#37323d';for(let y=100;y<540;y+=70)for(let x=80;x<900;x+=90)ctx.fillRect(x,y,55,18);ctx.fillStyle='#8f4e51';ctx.fillRect(448,72,64,105);ctx.fillStyle='#cfa85d';ctx.fillRect(458,72,8,105);ctx.fillRect(494,72,8,105);}
  function drawDoor(x,open,locked){ctx.fillStyle=open?'#8b7652':'#352b27';ctx.fillRect(x,255,48,110);if(x>0)ctx.fillRect(x,255,48,110);if(locked){text('◆',x+(x?23:25),317,25,C.gold);}}
  function drawHero(){
    const blink=hero.inv>0&&Math.floor(hero.inv*12)%2===0;if(blink)return;
    ctx.save();ctx.translate(Math.round(hero.x),Math.round(hero.y));
    ctx.fillStyle='#253528';ctx.beginPath();ctx.ellipse(0,15,17,7,0,0,7);ctx.fill();
    ctx.fillStyle='#3e8151';ctx.beginPath();ctx.moveTo(-14,-12);ctx.lineTo(0,-27);ctx.lineTo(15,-10);ctx.lineTo(10,16);ctx.lineTo(-11,16);ctx.closePath();ctx.fill();
    ctx.fillStyle='#efd09a';ctx.fillRect(-9,-13,18,17);ctx.fillStyle='#754b32';ctx.fillRect(-11,-16,22,7);ctx.fillStyle='#16201b';ctx.fillRect(hero.dir==='left'?-7:hero.dir==='right'?5:-6,-7,3,3);if(hero.dir==='up')ctx.fillRect(-6,-11,12,4);
    ctx.fillStyle='#c9a952';ctx.fillRect(-12,4,24,5);ctx.fillStyle='#352b24';ctx.fillRect(-11,15,8,5);ctx.fillRect(4,15,8,5);ctx.restore();
    if(hero.attack>0){const s=swordPos();ctx.save();ctx.translate(s.x,s.y);const ang={right:0,down:Math.PI/2,left:Math.PI,up:-Math.PI/2}[hero.dir];ctx.rotate(ang);ctx.fillStyle='#f5efcf';ctx.fillRect(-4,-3,37,6);ctx.fillStyle=C.gold;ctx.fillRect(-7,-8,6,16);ctx.restore();}
  }
  function drawEnemy(e){ctx.save();ctx.translate(e.x,e.y);if(e.hit>0)ctx.globalAlpha=.45;ctx.fillStyle='#19261f';ctx.beginPath();ctx.ellipse(0,e.r*.75,e.r,6,0,0,7);ctx.fill();ctx.fillStyle=e.boss?'#734477':'#9abf62';ctx.beginPath();ctx.arc(0,0,e.r,0,7);ctx.fill();if(!e.boss){ctx.beginPath();ctx.moveTo(-13,-9);ctx.lineTo(-7,-25);ctx.lineTo(-2,-11);ctx.moveTo(13,-9);ctx.lineTo(7,-25);ctx.lineTo(2,-11);ctx.fill();}else{ctx.fillStyle='#b77eb7';for(let i=0;i<6;i++){ctx.rotate(Math.PI/3);ctx.fillRect(25,-5,16,10);}ctx.fillStyle='#e5c368';ctx.beginPath();ctx.arc(0,0,14,0,7);ctx.fill();}ctx.fillStyle='#341e22';ctx.fillRect(-8,-4,5,5);ctx.fillRect(4,-4,5,5);ctx.restore();if(e.boss){ctx.fillStyle='#261d27';ctx.fillRect(e.x-50,e.y-e.r-18,100,7);ctx.fillStyle='#b76a91';ctx.fillRect(e.x-50,e.y-e.r-18,100*(e.hp/e.max),7);}}
  function drawProjectile(p){ctx.fillStyle='#d194dd';ctx.beginPath();ctx.arc(p.x,p.y,p.r+Math.sin(state.time*12)*2,0,7);ctx.fill();}
  function drawPickup(p){const y=p.y+Math.sin(p.bob*5)*6;ctx.fillStyle='#f2d36e';ctx.beginPath();ctx.arc(p.x,y,10,0,7);ctx.fill();ctx.fillRect(p.x+7,y-3,19,7);ctx.fillRect(p.x+19,y-3,5,14);text('◆',p.x,y-20,15,'#fff0a1');}
  function drawHUD(){ctx.fillStyle='#111b18e8';ctx.fillRect(0,0,W,48);text('LIFE',28,29,14,C.gold,'left');for(let i=0;i<hero.maxHp;i++)drawHeart(92+i*26,19,i<hero.hp);text(rooms[state.room].name,W/2,29,15,C.cream);text(hero.key?'◆ KEY':'◇ KEY',W-35,29,14,hero.key?C.gold:'#70736a','right');if(state.messageTime>0){ctx.fillStyle='#101814dc';ctx.fillRect(W/2-190,500,380,38);text(state.message,W/2,526,16,C.cream);}}
  function overlay(title,sub,small){ctx.fillStyle='#08100dcf';ctx.fillRect(0,0,W,H);text(title,W/2,230,46,C.gold);text(sub,W/2,280,19,C.cream);text(small,W/2,350,15,'#abc49c');}
  function draw(){ctx.save();if(state.shake)ctx.translate(rnd(-state.shake,state.shake),rnd(-state.shake,state.shake));if(state.mode==='title'){drawTitle();}else{drawWorld();if(state.mode==='pause')overlay('PAUSED','The grove waits...','PRESS P TO CONTINUE');if(state.mode==='dead')overlay('THE LIGHT FADES','The Hollow claims another wanderer.','PRESS SPACE TO TRY AGAIN');if(state.mode==='win')overlay('THE GROVE AWAKENS','You restored the Heart of the Wild.','PRESS SPACE TO PLAY AGAIN');}ctx.restore();}
  function drawTitle(){ctx.fillStyle='#10231d';ctx.fillRect(0,0,W,H);for(let i=0;i<80;i++){const x=(i*137)%W,y=(i*83)%H;ctx.fillStyle=i%4?'#1c3b2c':'#d8c97c';ctx.fillRect(x,y,i%4?3:2,i%4?8:2);}ctx.fillStyle='#182a21';ctx.beginPath();ctx.moveTo(0,500);for(let x=0;x<=W;x+=80)ctx.lineTo(x,390-Math.sin(x*.02)*40);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();text('ECHOES',W/2,190,66,'#f1e2a7');text('OF THE GROVE',W/2,246,38,C.gold);text('A tiny sword-and-secret adventure',W/2,305,17,'#9fc18a');ctx.fillStyle='#d4b55f';ctx.beginPath();ctx.moveTo(W/2,342);ctx.lineTo(W/2+30,392);ctx.lineTo(W/2,424);ctx.lineTo(W/2-30,392);ctx.closePath();ctx.fill();ctx.fillStyle='#203e32';ctx.beginPath();ctx.moveTo(W/2,353);ctx.lineTo(W/2+18,390);ctx.lineTo(W/2,408);ctx.lineTo(W/2-18,390);ctx.closePath();ctx.fill();text('PRESS SPACE TO BEGIN',W/2,490,18,Math.sin(state.time*4)>-.1?C.cream:'#697466');text('Original game · inspired by classic top-down adventures',W/2,555,12,'#667a6d');}

  addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(!keys.has(e.code))pressed.add(e.code);keys.add(e.code);if(e.code==='Space')attack();if(e.code==='KeyP'){if(state.mode==='play')state.mode='pause';else if(state.mode==='pause')state.mode='play';}});
  addEventListener('keyup',e=>keys.delete(e.code));
  document.querySelectorAll('[data-key]').forEach(btn=>{const code=btn.dataset.key;const down=e=>{e.preventDefault();keys.add(code);if(code==='Space')attack();};const up=e=>{e.preventDefault();keys.delete(code);};btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);});
  document.querySelector('#soundButton').onclick=()=>{muted=!muted;document.querySelector('#soundButton').textContent=muted?'♪ OFF':'♪ ON';};
  let last=performance.now();function loop(now){const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(loop);}requestAnimationFrame(loop);
})();
