(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const canvas=$('#game'), overlay=$('#overlay'), overlayText=$('#overlayText'), startButton=$('#startButton');
  const hud=$('#hud'), hearts=$('#hearts'), roomName=$('#roomName'), keyStatus=$('#keyStatus'), message=$('#message');
  const keys=new Set(); let muted=false,audio,last=performance.now(),running=false,paused=false,roomIndex=0,enemies=[],shots=[],effects=[],roomGroup,bossSpawned=false;
  const hero={x:-7,z:0,hp:6,max:6,dir:0,inv:0,attack:0,cooldown:0,key:false,mesh:null,sword:null};
  const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x14291f,.025);
  const camera=new THREE.PerspectiveCamera(48,16/10,.1,120);camera.position.set(0,15,18);camera.lookAt(0,0,0);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
  const hemi=new THREE.HemisphereLight(0xbfe2cb,0x1d271d,2.1);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffe6ac,3.2);sun.position.set(-8,14,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;scene.add(sun);
  const mat=(color,rough=.8,metal=0)=>new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
  const geo={box:(x,y,z)=>new THREE.BoxGeometry(x,y,z),sphere:r=>new THREE.SphereGeometry(r,16,12),cyl:(a,b,h,n=10)=>new THREE.CylinderGeometry(a,b,h,n),cone:(r,h,n=8)=>new THREE.ConeGeometry(r,h,n)};
  function mesh(g,m,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;return o;}
  function tone(f,d=.08,type='square',v=.035){if(muted)return;try{audio||=new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(v,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d);}catch(e){}}
  function sound(n){if(n==='sword'){tone(180,.08,'sawtooth');setTimeout(()=>tone(100,.05),35)}if(n==='hurt')tone(75,.18,'sawtooth',.06);if(n==='coin'){tone(660,.1);setTimeout(()=>tone(880,.16),80)}if(n==='win')[392,523,659,784].forEach((f,i)=>setTimeout(()=>tone(f,.3,'triangle',.05),i*130));}
  function makeHero(){const g=new THREE.Group();const body=mesh(geo.cone(.62,1.7,8),mat(0x3c8b50),0,1,0);body.rotation.x=Math.PI;g.add(body);const head=mesh(geo.sphere(.43),mat(0xefc990),0,1.85,0);g.add(head);const cap=mesh(geo.cone(.48,1.4,8),mat(0x337846),0,2.42,.15);cap.rotation.x=-.22;g.add(cap);const shield=mesh(geo.cyl(.5,.4,.13,8),mat(0x245f65,.5,.25),-.55,1.05,.05);shield.rotation.z=Math.PI/2;g.add(shield);const sword=new THREE.Group();const blade=mesh(geo.box(.11,.12,1.5),mat(0xe8f0df,.25,.8),0,.05,-.75);const guard=mesh(geo.box(.55,.12,.12),mat(0xe6b957,.35,.65),0,.05,0);sword.add(blade,guard);sword.position.set(.6,1,.2);sword.visible=false;g.add(sword);g.scale.setScalar(.82);scene.add(g);hero.mesh=g;hero.sword=sword;}
  makeHero();
  function tree(x,z,s=1){const g=new THREE.Group();g.add(mesh(geo.cyl(.2,.28,1.7,7),mat(0x59432f),0,.85,0));for(let i=0;i<3;i++)g.add(mesh(geo.cone(1.15-i*.14,1.8,7),mat(i%2?0x3d7044:0x55844b),0,1.7+i*.65,0));g.position.set(x,0,z);g.scale.setScalar(s);roomGroup.add(g);}
  function pillar(x,z,h=2.5){const g=new THREE.Group();g.add(mesh(geo.cyl(.42,.5,h,8),mat(0x85836a),0,h/2,0));g.add(mesh(geo.box(1,.25,1),mat(0x929077),0,h,0));g.position.set(x,0,z);roomGroup.add(g);}
  function clearRoom(){if(roomGroup)scene.remove(roomGroup);shots.forEach(o=>scene.remove(o));effects.forEach(o=>scene.remove(o));enemies=[];shots=[];effects=[];roomGroup=new THREE.Group();scene.add(roomGroup);}
  function buildRoom(){clearRoom();bossSpawned=false;scene.background=new THREE.Color(0x18272d);scene.fog.color.set(0x18272d);hero.x=0;hero.z=1;hero.inv=.8;hero.mesh.visible=true;
    // Four connected quadrants: north is negative Z on the game map.
    const tiles=[[-7.5,-5,0xb9dce2], [7.5,-5,0x6d3029], [-7.5,5,0xd5ad62], [7.5,5,0x377f91]];
    tiles.forEach(([x,z,c])=>roomGroup.add(mesh(geo.box(15,.5,10),mat(c),x,-.3,z)));
    const wallMat=mat(0x27383a);for(const [x,z,sx,sz] of [[0,-10,30,.7],[0,10,30,.7],[-15,0,.7,20],[15,0,.7,20]])roomGroup.add(mesh(geo.box(sx,1.5,sz),wallMat,x,.45,z));
    // Ice: crystal spires, snow mounds, frozen blue light.
    [[-12,-7],[-8,-3],[-3,-8],[-12,-2]].forEach(([x,z],i)=>{const crystal=mesh(geo.cone(.65,2.2+i%2,6),new THREE.MeshStandardMaterial({color:0xbff5ff,emissive:0x255d75,emissiveIntensity:.5,roughness:.18,metalness:.15}),x,1,z);roomGroup.add(crystal);});
    [[-10,-5],[-5,-6],[-13,-4]].forEach(([x,z])=>{const snow=mesh(geo.sphere(1.15),mat(0xe5f4ef),x,.05,z);snow.scale.y=.24;roomGroup.add(snow);});
    // Fire: lava pools, black rocks, and a glowing volcano gate.
    [[4,-7],[10,-3],[12,-8]].forEach(([x,z])=>{const lava=mesh(geo.cyl(1.25,1.25,.08,18),new THREE.MeshStandardMaterial({color:0xff5a20,emissive:0xff2500,emissiveIntensity:2}),x,.03,z);roomGroup.add(lava);});
    [[3,-3],[8,-8],[13,-5]].forEach(([x,z])=>{const rock=mesh(geo.cone(.9,1.8,7),mat(0x252129),x,.85,z);roomGroup.add(rock);});
    const fireLight=new THREE.PointLight(0xff4a20,20,13);fireLight.position.set(8,3,-5);roomGroup.add(fireLight);
    // Sand: dunes, sandstone pillars, and an oasis marker.
    [[-12,4],[-5,7],[-10,9]].forEach(([x,z])=>{const dune=mesh(geo.sphere(2),mat(0xe4c277),x,-.05,z);dune.scale.set(1.5,.27,.75);roomGroup.add(dune);});
    [[-13,7],[-3,3]].forEach(([x,z],i)=>pillar(x,z,1.8+i));
    // Water: shallow sea with stepping islands and luminous reeds.
    const sea=mesh(geo.box(15,.12,10),new THREE.MeshPhysicalMaterial({color:0x258aa0,roughness:.12,metalness:.18,transparent:true,opacity:.82}),7.5,.04,5);roomGroup.add(sea);
    [[3,3],[7,7],[11,4],[13,8]].forEach(([x,z])=>roomGroup.add(mesh(geo.cyl(1.1,1.25,.3,10),mat(0x6d9d78),x,.16,z)));
    [[5,8],[10,8],[13,2]].forEach(([x,z])=>{const reed=mesh(geo.cyl(.08,.12,1.6,6),new THREE.MeshStandardMaterial({color:0x7ee6c1,emissive:0x286e61,emissiveIntensity:.7}),x,.8,z);roomGroup.add(reed);});
    // Two guardians patrol each region. Defeating all eight summons the boss in Fire.
    [[-10,-6],[-4,-4],[5,-7],[11,-5],[-10,4],[-4,8],[4,4],[11,7]].forEach(([x,z])=>spawnEnemy(x,z,false));
    showMessage('THE FOURFOLD REALM');updateHUD();
  }
  function spawnEnemy(x,z,boss=false){const g=new THREE.Group();const body=mesh(boss?geo.sphere(1.25):geo.sphere(.62),mat(boss?0x78467c:0x8ab85d),0,boss?1.25:.62,0);g.add(body);if(!boss){const a=mesh(geo.cone(.24,.7,5),mat(0x8ab85d),-.35,1.18,0),b=a.clone();b.position.x=.35;g.add(a,b);}else{for(let i=0;i<7;i++){const horn=mesh(geo.cone(.2,.9,6),mat(0xb977bd),0,1.2,0);horn.rotation.z=i*Math.PI*2/7;horn.position.set(Math.cos(i*Math.PI*2/7)*1.2,1.25+Math.sin(i*Math.PI*2/7)*1.2,0);g.add(horn);}}g.position.set(x,0,z);roomGroup.add(g);enemies.push({x,z,mesh:g,r:boss?1.3:.68,hp:boss?12:roomIndex+2,max:boss?12:roomIndex+2,speed:boss?1.05:1.3+Math.random()*.45,boss,fire:1.5});}
  function showMessage(t,ms=1800){message.textContent=t;message.classList.remove('hidden');clearTimeout(showMessage.t);showMessage.t=setTimeout(()=>message.classList.add('hidden'),ms);}
  function updateHUD(){hearts.textContent='♥'.repeat(Math.max(0,hero.hp))+'♡'.repeat(hero.max-hero.hp);roomName.textContent='THE FOURFOLD REALM';keyStatus.textContent=bossSpawned?'FIRE LORD':'FOES '+enemies.length;keyStatus.style.color=bossSpawned?'#ff805d':'';}
  function start(){hero.hp=6;hero.key=false;hero.inv=0;running=true;paused=false;overlay.classList.add('hidden');hud.classList.remove('hidden');buildRoom();tone(440,.12);}
  function attack(){if(!running){start();return}if(paused||hero.cooldown>0)return;hero.attack=.24;hero.cooldown=.4;hero.sword.visible=true;sound('sword');}
  function hit(a,b,r){return Math.hypot(a.x-b.x,a.z-b.z)<r;}
  function burst(x,z,color=0xe5bd61){for(let i=0;i<10;i++){const p=mesh(geo.box(.12,.12,.12),new THREE.MeshBasicMaterial({color}),x,.6,z);p.userData={vx:(Math.random()-.5)*5,vy:2+Math.random()*4,vz:(Math.random()-.5)*5,life:.6};scene.add(p);effects.push(p);}}
  function hurt(x,z){if(hero.inv>0)return;hero.hp--;hero.inv=1.1;sound('hurt');burst(hero.x,hero.z,0xc9534b);const d=Math.hypot(hero.x-x,hero.z-z)||1;hero.x+=(hero.x-x)/d;hero.z+=(hero.z-z)/d;updateHUD();if(hero.hp<=0)end(false);}
  function end(win){running=false;overlay.classList.remove('hidden');hud.classList.add('hidden');overlay.querySelector('.eyebrow').textContent=win?'THE GROVE AWAKENS':'THE LIGHT FADES';overlay.querySelector('h1').innerHTML=win?'QUEST<br><span>COMPLETE</span>':'TRY<br><span>AGAIN</span>';overlayText.innerHTML=win?'You restored the Heart of the Wild.<br>The grove sings once more.':'The Hollow claims another wanderer.<br>Rise and face the darkness again.';startButton.textContent=win?'PLAY AGAIN':'TRY AGAIN';if(win)sound('win');}
  function update(dt){
    effects.forEach(p=>{const u=p.userData;u.life-=dt;p.position.x+=u.vx*dt;p.position.y+=u.vy*dt;p.position.z+=u.vz*dt;u.vy-=9*dt;p.scale.setScalar(Math.max(0,u.life/.6));});effects.filter(p=>p.userData.life<=0).forEach(p=>scene.remove(p));effects=effects.filter(p=>p.userData.life>0);
    if(!running||paused)return;hero.inv-=dt;hero.attack-=dt;hero.cooldown-=dt;let dx=0,dz=0;if(keys.has('ArrowLeft')||keys.has('KeyA'))dx--;if(keys.has('ArrowRight')||keys.has('KeyD'))dx++;if(keys.has('ArrowUp')||keys.has('KeyW'))dz--;if(keys.has('ArrowDown')||keys.has('KeyS'))dz++;if(dx||dz){const l=Math.hypot(dx,dz);dx/=l;dz/=l;hero.dir=Math.atan2(dx,dz);hero.x+=dx*4.2*dt;hero.z+=dz*4.2*dt;hero.mesh.rotation.y=hero.dir;}hero.z=Math.max(-8.8,Math.min(8.8,hero.z));hero.x=Math.max(-13.8,Math.min(13.8,hero.x));
    hero.mesh.position.set(hero.x,0,hero.z);hero.mesh.visible=hero.inv<=0||Math.floor(hero.inv*12)%2===0;if(hero.attack>0){hero.sword.visible=true;hero.sword.rotation.y=-1.5+hero.attack*10;const sx=hero.x+Math.sin(hero.dir)*1.2,sz=hero.z+Math.cos(hero.dir)*1.2;enemies.forEach(e=>{if(!e.hit&&hit({x:sx,z:sz},e,1.25+e.r)){e.hp--;e.hit=.25;burst(e.x,e.z);e.mesh.scale.setScalar(.8);}});}else hero.sword.visible=false;
    enemies.forEach(e=>{e.hit=Math.max(0,(e.hit||0)-dt);if(!e.hit)e.mesh.scale.lerp(new THREE.Vector3(1,1,1),dt*9);const dx=hero.x-e.x,dz=hero.z-e.z,d=Math.hypot(dx,dz)||1;e.x+=dx/d*e.speed*dt;e.z+=dz/d*e.speed*dt;e.mesh.position.x=e.x;e.mesh.position.z=e.z;e.mesh.rotation.y=Math.atan2(dx,dz);if(hit(hero,e,e.r+.48))hurt(e.x,e.z);if(e.boss){e.fire-=dt;if(e.fire<0){e.fire=2.2;for(let i=0;i<8;i++){const a=i*Math.PI/4;const s=mesh(geo.sphere(.16),new THREE.MeshBasicMaterial({color:0xd285df}),e.x,1,e.z);s.userData={vx:Math.cos(a)*3.2,vz:Math.sin(a)*3.2,life:4};scene.add(s);shots.push(s);}tone(90,.18,'sawtooth');}}});
    const dead=enemies.filter(e=>e.hp<=0);dead.forEach(e=>{burst(e.x,e.z,e.boss?0xd285df:0x9bc76b);roomGroup.remove(e.mesh);if(e.boss)end(true);});enemies=enemies.filter(e=>e.hp>0);if(dead.length)updateHUD();
    shots.forEach(s=>{s.userData.life-=dt;s.position.x+=s.userData.vx*dt;s.position.z+=s.userData.vz*dt;if(hit(hero,{x:s.position.x,z:s.position.z},.55)){hurt(s.position.x,s.position.z);s.userData.life=0;}});shots.filter(s=>s.userData.life<=0).forEach(s=>scene.remove(s));shots=shots.filter(s=>s.userData.life>0);
    if(!enemies.length&&!bossSpawned&&running){bossSpawned=true;spawnEnemy(8,-5,true);showMessage('THE FIRE LORD AWAKENS',2400);tone(90,.3,'sawtooth',.06);updateHUD();}
    heroKey.visible=false;
    const target=new THREE.Vector3(hero.x*.25,0,hero.z*.2);camera.position.x+=(target.x-camera.position.x)*dt*2.5;camera.position.y+=(19-camera.position.y)*dt*2;camera.position.z+=(24+target.z-camera.position.z)*dt*2.5;camera.lookAt(target.x,0,target.z);
  }
  const heroKey=new THREE.Group();const kg=mesh(geo.box(.25,.25,1.1),mat(0xe7bd5d,.3,.7));kg.rotation.z=Math.PI/2;heroKey.add(kg,mesh(geo.cyl(.34,.34,.12,12),mat(0xe7bd5d,.3,.7),-.65,0,0));heroKey.rotation.x=Math.PI/2;scene.add(heroKey);heroKey.visible=false;
  function resize(){const r=canvas.parentElement.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
  function loop(now){const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);renderer.render(scene,camera);requestAnimationFrame(loop);}resize();addEventListener('resize',resize);requestAnimationFrame(loop);
  addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='Space')attack();if(e.code==='KeyP'&&running){paused=!paused;showMessage(paused?'PAUSED':'QUEST RESUMED')}});addEventListener('keyup',e=>keys.delete(e.code));
  document.querySelectorAll('[data-key]').forEach(b=>{const k=b.dataset.key;b.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(k);if(k==='Space')attack()});['pointerup','pointercancel','pointerleave'].forEach(n=>b.addEventListener(n,()=>keys.delete(k)));});
  startButton.onclick=start;$('#soundButton').onclick=()=>{muted=!muted;$('#soundButton').textContent=muted?'♪ OFF':'♪ ON'};
})();
