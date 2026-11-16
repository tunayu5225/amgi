/* Adapted 2026-11-16 from nebez/floppybird/js/main.js, Apache-2.0.
 * Upstream efd2c7f740299688e524e57bfa3f635c9b857f82.
 * Changes: native module/RAF lifecycle, 2–3 answer gaps, slow study physics,
 * reading phase, three lives/recovery, Amgi results. Original in upstream/.
 */
export function answerChoices (item, makeChoices, count) {
  const choices = makeChoices(item);
  const wrong = choices.filter(text => text !== item.a).slice(0, count - 1);
  // Keep the randomized ordering returned by the common helper.
  return choices.filter(text => text === item.a || wrong.includes(text));
}
export function gapLayout (height, count) {
  const margin = 22, separator = 22;
  const size = (height - 2 * margin - separator * (count - 1)) / count;
  return Array.from({ length: count }, (_, n) => ({ top: margin + n * (size + separator), height: size }));
}
export function mountFlappy ({ questions, recordAnswer, finish, makeChoices, root }) {
  if (!questions.length) { finish(); return; }
  root.innerHTML = `<section class="flappy" data-phase="ready" aria-label="Flappy 학습 게임"><div class="flappy-top"><div class="flappy-toolbar"><strong>Flappy · <span id="flappy-progress"></span></strong><span class="flappy-lives" id="flappy-lives"></span><button id="flappy-pause">일시정지</button><button id="flappy-end">마치기</button></div><small id="flappy-chapter"></small><h1 id="flappy-question"></h1></div><div class="flappy-field" tabindex="0" role="application" aria-label="터치 또는 스페이스로 날아 정답 틈 통과"><div class="flappy-bird" aria-label="새"></div><div class="flappy-land"></div><div class="flappy-hint" role="status"></div><div class="flappy-overlay"><strong>정답이 있는 틈으로 날아가요</strong><p>터치·마우스·스페이스로 날갯짓.<br>문제마다 3초 동안 읽고 출발해요.<br>오답 틈·기둥·바닥은 하트 −1.</p><button id="flappy-start" class="primary">시작 · 하트 3개</button></div></div><div class="flappy-bottom"><p class="flappy-feedback" role="status">느린 속도 · 넓은 틈 · 하트 3개</p><p class="flappy-credit">원작 <a href="https://github.com/nebez/floppybird" target="_blank" rel="noopener">nebez/floppybird</a> · 코드 Apache-2.0<br>동그라미·단색 도형 · <a href="games/flappy/NOTICE.md" target="_blank">수정 내용·NOTICE</a></p></div></section>`;
  document.body.classList.add('flappy-active');
  const shell = root.querySelector('.flappy'), field = root.querySelector('.flappy-field');
  const player = root.querySelector('.flappy-bird'), overlay = root.querySelector('.flappy-overlay');
  const hint = root.querySelector('.flappy-hint'), feedback = root.querySelector('.flappy-feedback');
  const pauseButton = root.querySelector('#flappy-pause');
  // Retains upstream gravity/velocity/position/jump and updatePlayer/gameloop/
  // playerJump/playerDead/playerScore/updatePipes roles, using elapsed seconds.
  const gravity = 110, jump = -105, pipewidth = 52, birdwidth = 34, birdheight = 24;
  let velocity = 0, position = 180, rotation = 0, score = 0, lives = 3, index = 0;
  let width = 360, flyArea = 420, birdX = 60, pipes = [], choices = [];
  let phase = 'ready', resumePhase = 'reading', phaseTime = 0, invincible = false;
  let previous = 0, animation, closed = false;
  const listeners = [];
  const on = (target, event, handler, options) => { target.addEventListener(event, handler, options); listeners.push(() => target.removeEventListener(event, handler, options)); };
  function setPhase (next) { phase = next; shell.dataset.phase = next; }
  function setLabels () {
    root.querySelector('#flappy-progress').textContent = `${index + 1}/${questions.length}`;
    root.querySelector('#flappy-lives').textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
    root.querySelector('#flappy-question').textContent = questions[index].q;
    root.querySelector('#flappy-chapter').textContent = questions[index].chapter;
  }
  function updatePlayer () {
    rotation = Math.max(-20, Math.min((velocity / 140) * 65, 65));
    player.style.top = `${position}px`; player.style.left = `${birdX}px`;
    player.style.transform = `rotate(${rotation}deg)`;
  }
  function updatePipes (reset = true) {
    if (reset) field.querySelectorAll('.flappy-pipe').forEach(node => node.remove());
    const count = flyArea >= 380 ? 3 : 2;
    if (reset || choices.length !== count) choices = answerChoices(questions[index], makeChoices, count);
    const gaps = gapLayout(flyArea, choices.length);
    const node = document.createElement('div'); node.className = 'flappy-pipe';
    let top = 0;
    gaps.forEach((gap, n) => {
      const segment = document.createElement('div'); segment.className = 'flappy-segment'; segment.style.top = `${top}px`; segment.style.height = `${gap.top - top}px`; node.append(segment);
      const label = document.createElement('div'); label.className = 'flappy-gap'; label.style.top = `${gap.top}px`; label.style.height = `${gap.height}px`;
      const text = document.createElement('span'); text.textContent = choices[n]; label.append(text); node.append(label);
      top = gap.top + gap.height;
    });
    const last = document.createElement('div'); last.className = 'flappy-segment'; last.style.top = `${top}px`; last.style.height = `${flyArea - top}px`; node.append(last);
    const oldX = pipes[0]?.x;
    field.querySelectorAll('.flappy-pipe').forEach(element => element.remove());field.append(node);
    const pipe = { node, x: reset ? width - pipewidth - 12 : Math.max(birdX + 90, oldX || width - pipewidth - 12), gaps };
    pipes = [pipe]; node.style.transform = `translateX(${pipe.x}px)`;
  }
  function resizeHandler () {
    const viewport = window.visualViewport;
    shell.style.height = `${viewport ? viewport.height : window.innerHeight}px`;
    shell.style.top = `${viewport ? viewport.offsetTop : 0}px`;
    const oldHeight = flyArea;
    const nextWidth = field.clientWidth, nextHeight = Math.max(140, field.clientHeight - 24);
    if (nextWidth === width && nextHeight === flyArea) return;
    width = nextWidth; flyArea = nextHeight; birdX = Math.min(60, width * 0.17);
    position = Math.max(1, Math.min(flyArea - birdheight - 1, position / oldHeight * flyArea));
    if (phase === 'reading' || phase === 'playing' || (phase === 'paused' && resumePhase !== 'recovery')) {
      updatePipes(false); phaseTime = 3;
      if (phase === 'paused') resumePhase = 'reading'; else setPhase('reading');
      hint.textContent = '화면 크기가 바뀌었어요 · 다시 3초';
    }
    updatePlayer();
  }
  function nextQuestion () {
    position = flyArea / 2 - birdheight / 2; velocity = 0;
    setLabels(); updatePipes(); updatePlayer();
    phaseTime = 3; setPhase('reading');
    feedback.textContent = '문제를 읽고 정답 틈을 골라요.';
    hint.textContent = '출발까지 3초 · 지금은 떨어지지 않아요';
  }
  function resolve (correct, answer) {
    if (phase !== 'playing' || invincible || closed) return;
    if (correct) score++; else lives--;
    recordAnswer(questions[index], answer, correct);
    setLabels(); feedback.textContent = correct ? `정답! ${score}문제 맞힘` : `정답: ${questions[index].a} · 하트 −1`;
    if (!lives || index + 1 === questions.length) { cleanup(); finish(); return; }
    setPhase('recovery'); phaseTime = correct ? 0.7 : 1.2; invincible = true;
    player.classList.add('invincible'); pipes.forEach(pipe => pipe.node.remove()); pipes = [];
    position = flyArea / 2 - birdheight / 2; velocity = 0; updatePlayer();
    hint.textContent = correct ? '다음 문제 준비' : '잠깐 무적 · 다음 문제 준비';
  }
  function playerDead (cause) { resolve(false, cause); }
  function playerScore (gap) { const answer = choices[gap]; resolve(answer === questions[index].a, answer); }
  function playerJump () { if (phase === 'playing') velocity = jump; }
  function screenClick () { playerJump(); }
  function gameloop (seconds) {
    velocity = Math.min(140, velocity + gravity * seconds);position += velocity * seconds;
    if (position < 0) { position = 0; velocity = 0; }
    updatePlayer();
    if (position + birdheight >= flyArea) { playerDead('바닥 충돌'); return; }
    const pipe = pipes[0]; if (!pipe) return;
    pipe.x -= Math.max(45, (width - birdX - pipewidth) / 6) * seconds;
    pipe.node.style.transform = `translateX(${pipe.x}px)`;
    if (birdX + birdwidth > pipe.x && birdX < pipe.x + pipewidth) {
      const gap = pipe.gaps.findIndex(window => position >= window.top + 2 && position + birdheight <= window.top + window.height - 2);
      if (gap < 0) { playerDead('기둥 충돌'); return; }
    }
    if (birdX > pipe.x + pipewidth) {
      const gap = pipe.gaps.findIndex(window => position + birdheight / 2 >= window.top && position + birdheight / 2 <= window.top + window.height);
      if (gap < 0) playerDead('기둥 충돌'); else playerScore(gap);
    }
  }
  function loop (time) {
    if (closed) return;
    const seconds = previous ? Math.min(0.05, (time - previous) / 1000) : 0; previous = time;
    if (phase === 'playing') gameloop(seconds);
    else if (phase === 'reading' || phase === 'recovery') {
      phaseTime -= seconds;
      if (phase === 'reading') hint.textContent = `출발까지 ${Math.max(1, Math.ceil(phaseTime))}초 · 정답 틈을 기억해요`;
      if (phaseTime <= 0) {
        if (phase === 'recovery') {index++; invincible = false;player.classList.remove('invincible');nextQuestion();}
        else {setPhase('playing'); hint.textContent = '터치 · 스페이스로 날갯짓';}
      }
    }
    if (!closed) animation = requestAnimationFrame(loop);
  }
  function togglePause () {
    if (phase === 'ready') return;
    if (phase === 'paused') {setPhase(resumePhase);overlay.hidden = true;previous = performance.now();pauseButton.textContent = '일시정지';field.focus({preventScroll:true});}
    else {resumePhase = phase;setPhase('paused');pauseButton.textContent = '계속하기';overlay.hidden = false;overlay.innerHTML = '<strong>일시정지</strong><button class="primary" id="flappy-resume">계속하기</button>';root.querySelector('#flappy-resume').addEventListener('click',togglePause);}
  }
  function cleanup () { closed = true;cancelAnimationFrame(animation);listeners.forEach(off => off());document.body.classList.remove('flappy-active'); }
  on(field, 'pointerdown', event => {if (event.target.closest('button,a') || phase === 'ready' || phase === 'paused') return;event.preventDefault();screenClick();});
  on(window, 'keydown', event => {if (event.code === 'Space' && !(event.target instanceof Element && event.target.closest('button,a'))) {event.preventDefault();if(!event.repeat) screenClick();}if(event.key === 'Escape')togglePause();});
  on(root.querySelector('#flappy-start'), 'click', () => {overlay.hidden = true;resizeHandler();nextQuestion();field.focus({preventScroll:true});previous = performance.now();animation = requestAnimationFrame(loop);});
  on(pauseButton, 'click', togglePause);
  on(root.querySelector('#flappy-end'), 'click', () => {if(confirm('Flappy를 마치고 지금까지 푼 결과를 볼까요?')){cleanup();finish();}});
  on(document,'visibilitychange',()=>{if(document.hidden && phase!=='ready' && phase!=='paused')togglePause();});
  on(window,'resize',resizeHandler);
  if(window.visualViewport){on(window.visualViewport,'resize',resizeHandler);on(window.visualViewport,'scroll',resizeHandler);}
  setLabels();resizeHandler();
}
