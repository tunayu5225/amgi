/*
 * Adapted 2026-11-16 from berkerol/typer (GPL-3.0).
 * Upstream commit: 19ddc6035d695c089fc834bff2fea0605e30c39f
 * https://github.com/berkerol/typer
 * Upstream reference: the source repository above. Full license: ./LICENSE.
 * Changes: chapter questions, falling words, IME input, mobile viewport,
 * three lives, local animation lifecycle and Amgi result integration.
 */

export const normalizeAnswer = text => text.normalize('NFC').trim().replace(/\s+/g, ' ');

export function mountTyper ({ questions, recordAnswer, finish, makeChoices, root }) {
  if (!questions.length) { finish(); return; }
  root.innerHTML = `<section class="typer" aria-label="Typer 학습 게임">
    <div class="typer-top"><div class="typer-toolbar"><strong>Typer · <span id="typer-progress"></span></strong><span class="typer-lives" id="typer-lives"></span><button id="typer-pause">일시정지</button><button id="typer-end">마치기</button></div><small id="typer-chapter"></small><h1 id="typer-question"></h1></div>
    <div class="typer-field"><canvas id="typer-canvas" aria-label="떨어지는 정답과 오답 보기"></canvas><div class="typer-overlay" id="typer-overlay"><strong>정답을 쳐서 지켜 주세요</strong><p>파란 보기 4개 중 정답을 입력하세요.<br>오답 제출·정답 놓침은 하트 −1.<br>한글은 조합이 끝나야 판정해요.</p><button class="primary" id="typer-start">시작 · 하트 3개</button></div></div>
    <div class="typer-bottom"><p class="typer-feedback" id="typer-feedback" role="status">Enter로 제출 · 보기와 일치하면 조합 완료 때도 제출</p><form class="typer-form"><input id="typer-input" aria-label="정답 입력" placeholder="정답 입력" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" disabled><button class="primary" type="submit" disabled>제출</button></form><p class="typer-credit">원작 <a href="https://github.com/berkerol/typer" target="_blank" rel="noopener">berkerol/typer</a> · <a href="games/typer/LICENSE" target="_blank">GPL-3.0</a> · 강의용 수정 2026-11-16</p></div>
  </section>`;
  document.body.classList.add('typer-active');
  const shell = root.querySelector('.typer');
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const input = root.querySelector('input');
  const submit = root.querySelector('[type=submit]');
  const overlay = root.querySelector('#typer-overlay');
  const feedback = root.querySelector('#typer-feedback');
  const pauseButton = root.querySelector('#typer-pause');
  let score = 0;
  let lives = 3;
  let index = 0;
  let animation;
  let previous = 0;
  let phase = 'ready';
  let composing = false;
  let closed = false;
  let nextAt = 0;
  let judgeTimer;
  let choices = [];
  let letters = [];
  let particles = [];
  const center = { x: 0, y: 0, radius: 7, color: '#FF0000' };
  const letter = { font: '18px Monospace', color: '#0095DD', height: 21 };
  const listeners = [];
  function on (target, event, handler) { target.addEventListener(event, handler); listeners.push(() => target.removeEventListener(event, handler)); }
  function setFeedback (text) { feedback.textContent = text; }
  function updateLabels () {
    root.querySelector('#typer-progress').textContent = `${index + 1}/${questions.length}`;
    root.querySelector('#typer-lives').textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
    root.querySelector('#typer-chapter').textContent = questions[index].chapter;
    root.querySelector('#typer-question').textContent = questions[index].q;
    canvas.setAttribute('aria-label', '떨어지는 보기: ' + choices.join(', '));
  }
  function resizeHandler () {
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    shell.style.height = `${height}px`;
    shell.style.top = `${viewport ? viewport.offsetTop : 0}px`;
    const bounds = canvas.getBoundingClientRect();
    const oldHeight = canvas.height || bounds.height;
    const oldWidth = canvas.width || bounds.width;
    canvas.width = Math.max(1, Math.round(bounds.width));
    canvas.height = Math.max(1, Math.round(bounds.height));
    center.x = canvas.width / 2;
    center.y = canvas.height - 8;
    for (const word of letters) {
      word.y = Math.min(canvas.height - 20, Math.max(22, word.y / oldHeight * canvas.height));
      word.x = word.x / oldWidth * canvas.width;
    }
    paint();
  }
  // Retains the upstream letter list, create/remove/type and canvas paint structure.
  // The original moving single ASCII letters become four falling choice words.
  function createLetters () {
    ctx.font = letter.font;
    letters = choices.map((text, n) => {
      const width = ctx.measureText(text).width;
      return { text, x: Math.max(10, (canvas.width - width) * (n % 2 ? 0.92 : 0.08)), y: 20 + n * Math.max(4, Math.min(30, (canvas.height - 55) / 4)), width };
    });
  }
  function paintCircle (x, y, radius, color) { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
  function paint () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintCircle(center.x, center.y, center.radius, center.color);
    ctx.strokeStyle = '#bbcdc1'; ctx.beginPath(); ctx.moveTo(0, center.y - 2); ctx.lineTo(canvas.width, center.y - 2); ctx.stroke();
    ctx.font = letter.font;
    ctx.fillStyle = letter.color;
    for (const word of letters) ctx.fillText(word.text, Math.min(word.x, Math.max(6, canvas.width - word.width - 6)), word.y);
    for (const particle of particles) paintCircle(particle.x, particle.y, Math.max(0.5, particle.life * 3), '#0095DD');
  }
  function removeLetters (seconds) {
    // Roughly 24 seconds to the floor at every viewport height. Distractors reset;
    // only the correct word touching the bottom counts as a missed question.
    const speed = Math.max(2, (canvas.height - 45) / 24);
    for (const word of letters) {
      word.y += speed * seconds;
      if (word.y >= center.y - 3) {
        if (word.text === questions[index].a) { resolve(false, '입력 못함 (정답 놓침)'); return; }
        word.y = 22;
      }
    }
  }
  function type (word) {
    score++;
    if (word) for (let n = 0; n < 14; n++) particles.push({ x: word.x, y: word.y, dx: (Math.random() - 0.5) * 70, dy: (Math.random() - 0.5) * 70, life: 1 });
  }
  function resolve (correct, answer) {
    if (phase !== 'playing' || closed) return;
    phase = 'feedback'; submit.disabled = true;
    clearTimeout(judgeTimer); composing = false;
    if (correct) type(letters.find(word => word.text === questions[index].a));
    else lives--;
    recordAnswer(questions[index], answer, correct);
    setFeedback(correct ? `정답! ${score}문제 맞힘` : `정답: ${questions[index].a} · 하트 −1`);
    root.querySelector('#typer-lives').textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
    input.value = '';
    if (!lives || index + 1 === questions.length) { cleanup(); finish(); return; }
    nextAt = performance.now() + 650;
  }
  function judge (explicit = false) {
    if (phase !== 'playing' || composing || closed) return;
    const answer = input.value.trim();
    if (!answer) return;
    const normalized = normalizeAnswer(answer);
    const matching = choices.filter(choice => normalizeAnswer(choice) === normalized);
    // Partial IME syllables and prefixes must not spend a life. Unknown words
    // are submitted only with Enter/button; exact choices may auto-submit.
    if (!explicit && matching.length !== 1) return;
    resolve(normalized === normalizeAnswer(questions[index].a), answer);
  }
  function keyDownHandler (event) {
    if (event.key === 'Enter') {
      if (composing || event.isComposing || event.keyCode === 229) return;
      event.preventDefault(); judge(true);
    }
  }
  function keyUpHandler (event) { if (event.key === 'Escape') togglePause(); }
  function showPause () {
    overlay.hidden = false;
    overlay.innerHTML = '<strong>일시정지</strong><p>계속하면 입력창으로 돌아가요.</p><button class="primary" id="typer-resume">계속하기</button>';
    root.querySelector('#typer-resume').addEventListener('click', togglePause);
  }
  function togglePause () {
    if (phase === 'playing') {phase = 'paused'; input.disabled = true; submit.disabled = true; pauseButton.textContent = '계속하기'; showPause();}
    else if (phase === 'paused') {phase = 'playing'; previous = performance.now(); overlay.hidden = true; input.disabled = false; submit.disabled = false; pauseButton.textContent = '일시정지'; input.focus({ preventScroll: true });}
  }
  function nextQuestion () {
    choices = makeChoices(questions[index]);
    input.value = ''; composing = false; particles = [];
    setFeedback('정답을 입력하세요 · Enter로 제출');
    updateLabels(); createLetters(); phase = 'playing';
    input.disabled = false; submit.disabled = false; input.focus({ preventScroll: true });
  }
  function gameLoop (time) {
    if (closed) return;
    const seconds = previous ? Math.min((time - previous) / 1000, 0.1) : 0;
    previous = time;
    if (phase === 'playing') removeLetters(seconds);
    else if (phase === 'feedback' && time >= nextAt) { index++; nextQuestion(); }
    for (const particle of particles) { particle.x += particle.dx * seconds; particle.y += particle.dy * seconds; particle.life -= seconds * 2; }
    particles = particles.filter(particle => particle.life > 0);
    paint();
    if (!closed) animation = window.requestAnimationFrame(gameLoop);
  }
  function cleanup () {
    closed = true; window.cancelAnimationFrame(animation); clearTimeout(judgeTimer);
    listeners.forEach(off => off()); document.body.classList.remove('typer-active');
  }
  on(input, 'keydown', keyDownHandler);
  on(input, 'compositionstart', () => { composing = true; clearTimeout(judgeTimer); });
  on(input, 'compositionend', () => { composing = false; judgeTimer = setTimeout(() => judge(), 0); });
  on(input, 'input', event => { if (!composing && !event.isComposing) judge(); });
  on(root.querySelector('form'), 'submit', event => { event.preventDefault(); judge(true); });
  on(window, 'keyup', keyUpHandler);
  on(window, 'resize', resizeHandler);
  if (window.visualViewport) { on(window.visualViewport, 'resize', resizeHandler); on(window.visualViewport, 'scroll', resizeHandler); }
  on(document, 'visibilitychange', () => { if (document.hidden && phase === 'playing') togglePause(); });
  on(pauseButton, 'click', togglePause);
  on(root.querySelector('#typer-end'), 'click', () => { if (confirm('Typer를 마치고 지금까지 푼 결과를 볼까요?')) { cleanup(); finish(); } });
  on(root.querySelector('#typer-start'), 'click', () => { overlay.hidden = true; nextQuestion(); previous = performance.now(); animation = window.requestAnimationFrame(gameLoop); });
  choices = makeChoices(questions[index]); updateLabels(); resizeHandler(); createLetters(); paint();
}
