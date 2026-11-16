/* MIT, adapted 2026-11-16 from mumuy/pacman movement/tracking code.
 * Copyright (c) 2016-present HaoLe Zheng. See LICENSE and NOTICE.md.
 * New board, neutral shapes, study states/controls and Amgi result integration.
 */
import { Game } from './engine.js';
import { MAZE, SIZE, TILE, TARGETS, DIRECTIONS } from './layout.js';
export function mountMaze ({questions, recordAnswer, finish, makeChoices, root}) {
  if(!questions.length){finish();return;}
  root.innerHTML=`<section class="maze" data-phase="ready" aria-label="미로 학습 게임"><div class="maze-top"><div class="maze-toolbar"><strong>미로 · <span id="maze-progress"></span></strong><span id="maze-lives" class="maze-lives"></span><button id="maze-pause">일시정지</button><button id="maze-end">마치기</button></div><small id="maze-chapter"></small><h1 id="maze-question"></h1></div><div class="maze-play"><p class="maze-hint" role="status"></p><div class="maze-answers" id="maze-upper"></div><div class="maze-board"><canvas id="maze-canvas" tabindex="0" aria-label="미로. 초록 동그라미는 나, 빨간 네모는 추적자. 방향키 또는 스와이프로 이동."></canvas></div><div class="maze-answers" id="maze-lower"></div><div class="maze-overlay"><strong>정답 구역을 찾아가요</strong><p>동그라미를 움직여 정답 번호 칸에 닿으세요.<br>스와이프·방향 버튼·PC 방향키로 이동.<br>네모 추적자와 오답 칸은 피하세요.</p><button id="maze-start" class="primary">시작 · 하트 3개</button></div></div><div class="maze-bottom"><p class="maze-feedback" role="status">문제마다 읽기 3초 · 추적자는 느리게</p><div class="maze-buttons"><button data-direction="3" aria-label="위로">↑</button><button data-direction="2" aria-label="왼쪽으로">←</button><button data-direction="1" aria-label="아래로">↓</button><button data-direction="0" aria-label="오른쪽으로">→</button></div><p class="maze-credit">이동·추적 코드 <a href="https://github.com/mumuy/pacman" target="_blank" rel="noopener">mumuy</a> · <a href="games/maze/LICENSE" target="_blank">MIT</a> · 그림은 도형 자리표시</p></div></section>`;
  document.body.classList.add('maze-active');
  const shell=root.querySelector('.maze'), play=root.querySelector('.maze-play'), canvas=root.querySelector('canvas'), board=root.querySelector('.maze-board');
  const overlay=root.querySelector('.maze-overlay'), hint=root.querySelector('.maze-hint'), feedback=root.querySelector('.maze-feedback'),pauseButton=root.querySelector('#maze-pause');
  const engine=new Game('maze-canvas',{width:SIZE*TILE,height:SIZE*TILE});
  let index=0,lives=3,phase='ready',resumePhase='reading',phaseTime=0,previous=0,delta=0,closed=false,choices=[];
  let playerClock=0,chaserClock=0,swipe=null;
  const off=[];
  function on(target,event,fn,options){target.addEventListener(event,fn,options);off.push(()=>target.removeEventListener(event,fn,options));}
  function setPhase(value){phase=value;shell.dataset.phase=value;stage.status=phase==='playing'?1:2;}
  const stage=engine.createStage({status:2,update(){
    const now=performance.now();delta=previous?Math.min(.1,(now-previous)/1000):0;previous=now;
    if(phase==='reading'||phase==='recovery'){
      phaseTime-=delta;
      if(phase==='reading')hint.textContent=`출발까지 ${Math.max(1,Math.ceil(phaseTime))}초 · 번호와 정답을 기억해요`;
      if(phaseTime<=0){if(phase==='recovery'){index++;nextQuestion();}else{setPhase('playing');hint.textContent='방향키 · 스와이프 · 방향 버튼';}}
    }
    return !closed;
  }});
  const map=stage.createMap({size:TILE,data:MAZE,draw(context){
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(this.get(x,y)){context.fillStyle='#dae5d6';context.fillRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2);}
    TARGETS.forEach((point,n)=>{context.fillStyle='#e6eddc';context.fillRect(point.x*TILE,point.y*TILE,TILE,TILE);context.fillStyle='#233b35';context.font='bold 16px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(String(n+1),point.x*TILE+TILE/2,point.y*TILE+TILE/2);});
  }});
  function move(item,point){const pos=map.coord2position(point.x,point.y);item.x=pos.x;item.y=pos.y;item.coord={...point,offset:0};}
  function same(a,b){return a.coord.x===b.coord.x&&a.coord.y===b.coord.y;}
  function publishPosition(){board.dataset.playerX=player.coord.x;board.dataset.playerY=player.coord.y;board.dataset.chaserX=chaser.coord.x;board.dataset.chaserY=chaser.coord.y;}
  const player=stage.createItem({type:1,location:map,coord:{x:6,y:6},orientation:null,control:{},update(){
    if(phase!=='playing')return;
    playerClock+=delta;if(playerClock<.15)return;playerClock-=.15;
    // Upstream control cache: change direction at grid centers only when open.
    if(this.control.orientation!==undefined){const next=DIRECTIONS[this.control.orientation];if(map.get(this.coord.x+next.x,this.coord.y+next.y)===0)this.orientation=this.control.orientation;}
    if(this.orientation===null)return;
    const direction=DIRECTIONS[this.orientation],point={x:this.coord.x+direction.x,y:this.coord.y+direction.y};
    if(map.get(point.x,point.y)!==0)return;
    move(this,point);publishPosition();
    if(same(this,chaser)){resolve(false,'추적자 충돌');return;}
    const target=TARGETS.findIndex(p=>p.x===point.x&&p.y===point.y);
    if(target>=0)resolve(choices[target]===questions[index].a,choices[target]);
  },draw(context){context.fillStyle='#22664e';context.beginPath();context.arc(this.x,this.y,8,0,Math.PI*2);context.fill();}});
  const chaser=stage.createItem({type:2,location:map,coord:{x:6,y:1},update(){
    if(phase!=='playing')return;
    chaserClock+=delta;if(chaserClock<.65)return;chaserClock-=.65;
    // Use upstream breadth-first finder and chase its first vector.
    this.path=map.finder({map:map.data,start:{x:this.coord.x,y:this.coord.y},end:{x:player.coord.x,y:player.coord.y}});
    if(this.path.length){this.vector=this.path[0];move(this,this.vector);publishPosition();}
    if(same(this,player))resolve(false,'추적자 충돌');
  },draw(context){if(phase==='recovery'&&Math.floor(performance.now()/120)%2)return;context.fillStyle='#a74d42';context.fillRect(this.x-7,this.y-7,14,14);}});
  function labels(){root.querySelector('#maze-progress').textContent=`${index+1}/${questions.length}`;root.querySelector('#maze-lives').textContent='♥'.repeat(lives)+'♡'.repeat(3-lives);root.querySelector('#maze-chapter').textContent=questions[index].chapter;root.querySelector('#maze-question').textContent=questions[index].q;}
  function nextQuestion(){
    const old=choices.join('\0');choices=makeChoices(questions[index]);if(choices.join('\0')===old)choices.push(choices.shift());
    for(const [id,start] of [['maze-upper',0],['maze-lower',2]]){const row=root.querySelector('#'+id);row.replaceChildren();for(let n=start;n<start+2;n++){const label=document.createElement('div');label.className='maze-answer';label.dataset.target=String(n);const location=document.createElement('small');location.textContent=`${n+1} · ${n<2?'위':'아래'} ${n%2?'오른쪽':'왼쪽'}`;const text=document.createElement('strong');text.textContent=choices[n];label.append(location,text);row.append(label);}}
    move(player,{x:6,y:6});move(chaser,{x:6,y:1});player.orientation=null;player.control={};playerClock=0;chaserClock=0;publishPosition();labels();
    phaseTime=3;setPhase('reading');feedback.textContent='초록 동그라미 → 정답 번호 칸 · 빨간 네모는 피해요';
  }
  function resolve(correct,answer){
    if(phase!=='playing'||closed)return;
    if(!correct)lives--;recordAnswer(questions[index],answer,correct);labels();
    if(!lives||index+1===questions.length){cleanup();finish();return;}
    setPhase('recovery');phaseTime=correct?.6:1.2;feedback.textContent=correct?'정답! 다음 문제 준비':`정답: ${questions[index].a} · 하트 −1 · 잠깐 무적`;hint.textContent='다음 문제 준비';
    move(player,{x:6,y:6});move(chaser,{x:6,y:1});publishPosition();
  }
  function steer(direction){if(phase==='playing')player.control={orientation:direction};}
  function resize(){const viewport=window.visualViewport;shell.style.height=`${viewport?viewport.height:innerHeight}px`;shell.style.top=`${viewport?viewport.offsetTop:0}px`;const rows=[...play.querySelectorAll('.maze-answers')].reduce((sum,node)=>sum+node.getBoundingClientRect().height,0);const size=Math.max(80,Math.min(420,play.clientWidth-24,play.clientHeight-rows-44));board.style.width=`${size}px`;board.style.height=`${size}px`;}
  function togglePause(){if(phase==='ready')return;if(phase==='paused'){setPhase(resumePhase);previous=performance.now();overlay.hidden=true;pauseButton.textContent='일시정지';canvas.focus({preventScroll:true});}else{resumePhase=phase;setPhase('paused');overlay.hidden=false;pauseButton.textContent='계속하기';overlay.innerHTML='<strong>일시정지</strong><button id="maze-resume" class="primary">계속하기</button>';root.querySelector('#maze-resume').addEventListener('click',togglePause);}}
  function cleanup(){closed=true;engine.stop();off.forEach(remove=>remove());document.body.classList.remove('maze-active');}
  root.querySelectorAll('[data-direction]').forEach(button=>on(button,'click',()=>{steer(Number(button.dataset.direction));canvas.focus({preventScroll:true});}));
  on(window,'keydown',event=>{const direction=DIRECTIONS.findIndex(d=>d.key===event.key);if(direction>=0){event.preventDefault();steer(direction);}if(event.key==='Escape')togglePause();});
  on(canvas,'pointerdown',event=>{swipe={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);event.preventDefault();});
  on(canvas,'pointerup',event=>{if(!swipe)return;const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;swipe=null;if(Math.hypot(dx,dy)<12)return;steer(Math.abs(dx)>Math.abs(dy)?(dx>0?0:2):(dy>0?1:3));event.preventDefault();});
  on(canvas,'pointercancel',()=>{swipe=null;});
  on(root.querySelector('#maze-start'),'click',()=>{overlay.hidden=true;nextQuestion();resize();canvas.focus({preventScroll:true});previous=performance.now();engine.start();});
  on(pauseButton,'click',togglePause);on(root.querySelector('#maze-end'),'click',()=>{if(confirm('미로를 마치고 지금까지 푼 결과를 볼까요?')){cleanup();finish();}});
  on(document,'visibilitychange',()=>{if(document.hidden&&phase!=='ready'&&phase!=='paused')togglePause();});on(window,'resize',resize);if(window.visualViewport){on(window.visualViewport,'resize',resize);on(window.visualViewport,'scroll',resize);}
  labels();resize();
}
