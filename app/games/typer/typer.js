/*
 * Adapted 2026-11-16 from berkerol/typer (GPL-3.0).
 * Upstream commit: 19ddc6035d695c089fc834bff2fea0605e30c39f
 * https://github.com/berkerol/typer
 * Upstream reference: the source repository above. Full license: ./LICENSE.
 * Changes: chapter questions, falling words in left/right lanes, IME input,
 * mobile viewport, three lives, score/combo, review card, per-question
 * backgrounds, local animation lifecycle and Amgi result integration.
 * 2026-11-17: picture questions (img) and essay questions (blanks in order).
 */

export const normalizeAnswer = text => text.normalize('NFC').trim().replace(/\s+/g, ' ');

const BEST = 'amgi.typer.best.v1';
const TOTAL = 'amgi.typer.total.v1';
const BACKGROUNDS = 6;
const GAP = 14; // min vertical gap between two words in the same lane
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 4.4 2.5.8-1.3 2.3-2.5 4.4-2.5 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg>';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const readNumber = key => { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } };
const writeNumber = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* storage full: score still shown */ } };

// Points for one correct answer: 100 + up to 50 for answering early + combo bonus.
export function scoreFor (combo, heightRatio) {
  const speed = Math.round(50 * Math.min(1, Math.max(0, 1 - heightRatio)));
  return 100 + speed + Math.min(Math.max(combo - 1, 0), 5) * 50;
}

export function mountTyper ({ questions, recordAnswer, finish, makeChoices, root }) {
  if (!questions.length) { finish(); return; }
  root.innerHTML = `<section class="typer" aria-label="Typer 학습 게임">
    <div class="typer-bg" aria-hidden="true"></div>
    <div class="typer-hud">
      <div class="typer-status"><span class="typer-lives" id="typer-lives" aria-label="하트 3개">${HEART.repeat(3)}</span><span class="typer-progress" id="typer-progress"></span></div>
      <div class="typer-score" aria-live="off"><small>점수</small><strong id="typer-score">0</strong><span class="typer-combo" id="typer-combo"></span></div>
      <div class="typer-actions"><button id="typer-pause" class="typer-icon" aria-label="일시정지"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button><button id="typer-end" class="typer-icon" aria-label="마치기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    </div>
    <div class="typer-qcard"><small id="typer-chapter"></small><div class="typer-qimg" id="typer-img"></div><h1 id="typer-question"></h1><p class="typer-model" id="typer-model" hidden></p></div>
    <div class="typer-field">
      <canvas id="typer-canvas" aria-hidden="true"></canvas>
      <div class="typer-words" id="typer-words" aria-label="떨어지는 보기"></div>
      <div class="typer-overlay" id="typer-overlay"><span class="typer-logo">TYPER</span><strong>정답 단어를 쳐서 맞히세요</strong><p>보기 4개가 왼쪽·오른쪽에서 떨어져요.<br>맞히면 점수 + 연속 정답 보너스.<br>오답 제출·정답 놓침은 하트 −1.</p><button class="primary" id="typer-start">시작 · 하트 3개</button></div>
    </div>
    <div class="typer-bottom"><p class="typer-feedback" id="typer-feedback" role="status">Enter로 제출 · 보기와 일치하면 조합 완료 때도 제출</p><form class="typer-form"><input id="typer-input" aria-label="정답 입력" placeholder="정답 입력" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" disabled><button class="primary" type="submit" disabled>제출</button></form><p class="typer-credit">원작 <a href="https://github.com/berkerol/typer" target="_blank" rel="noopener">berkerol/typer</a> · <a href="games/typer/LICENSE" target="_blank">GPL-3.0</a> · 강의용 수정 2026-11-16</p></div>
    <div class="typer-review" id="typer-review" role="dialog" aria-modal="true" aria-labelledby="typer-review-title" hidden></div>
  </section>`;
  document.body.classList.add('typer-active');
  const shell = root.querySelector('.typer');
  const bg = root.querySelector('.typer-bg');
  const field = root.querySelector('.typer-field');
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const wordsLayer = root.querySelector('#typer-words');
  const input = root.querySelector('input');
  const submit = root.querySelector('[type=submit]');
  const overlay = root.querySelector('#typer-overlay');
  const review = root.querySelector('#typer-review');
  const feedback = root.querySelector('#typer-feedback');
  const pauseButton = root.querySelector('#typer-pause');
  const scoreEl = root.querySelector('#typer-score');
  const comboEl = root.querySelector('#typer-combo');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let correctCount = 0;
  let lives = 3;
  let index = 0;
  let blank = 0; // essay: current blank
  let advanceBlank = false;
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
  let laneWidth = 100;
  const center = { x: 0, y: 0, radius: 6, color: '#141414' };
  const listeners = [];
  function on (target, event, handler) { target.addEventListener(event, handler); listeners.push(() => target.removeEventListener(event, handler)); }
  const cur = () => questions[index].type === 'essay' ? questions[index].blanks[blank] : questions[index];
  function renderModel () {
    const item = questions[index], model = root.querySelector('#typer-model');
    model.hidden = item.type !== 'essay';
    if (model.hidden) return;
    model.innerHTML = esc(item.model).replace(/\[\[(\d+)\]\]/g, (_, n) => n - 1 < blank ? `<b class="filled">${esc(item.blanks[n - 1].a)}</b>` : `<b class="${n - 1 === blank ? 'now' : 'empty'}">( ${n} )</b>`);
    model.querySelector('.now')?.scrollIntoView({ block: 'nearest' });
  }
  function setFeedback (text, tone = '') { feedback.textContent = text; feedback.dataset.tone = tone; }
  function replay (el, cls) { if (reduceMotion) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function vibrate (pattern) { if (navigator.userActivation?.hasBeenActive === false) return; try { navigator.vibrate?.(pattern); } catch { /* unsupported */ } }
  function renderLives (broken = -1) {
    const hearts = root.querySelector('#typer-lives');
    hearts.setAttribute('aria-label', `하트 ${lives}개`);
    hearts.innerHTML = [0, 1, 2].map(n => `<i class="${n >= lives ? 'lost' : ''} ${n === broken ? 'break' : ''}">${HEART}</i>`).join('');
  }
  function updateLabels () {
    root.querySelector('#typer-progress').textContent = `${index + 1} / ${questions.length}`;
    root.querySelector('#typer-chapter').textContent = `Q${index + 1} · ${questions[index].chapter}`;
    root.querySelector('#typer-question').textContent = questions[index].q;
    const img = questions[index].img;
    root.querySelector('#typer-img').innerHTML = img ? `<img class="qimg" src="${img}" alt="문제 그림 (누르면 크게)">` : '';
    renderModel();
    wordsLayer.setAttribute('aria-label', '떨어지는 보기: ' + choices.join(', '));
    bg.dataset.bg = String(index % BACKGROUNDS);
    replay(bg, 'enter');
  }
  function floorY () { return canvas.height - 10; }
  function laneLeft (word) { return 10 + word.col * (laneWidth + 10); }
  function placeWord (word) {
    const x = laneLeft(word) + word.xf * Math.max(0, laneWidth - word.w);
    word.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(word.y)}px)`;
  }
  function resizeHandler () {
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    shell.style.height = `${height}px`;
    shell.style.top = `${viewport ? viewport.offsetTop : 0}px`;
    const bounds = field.getBoundingClientRect();
    const oldHeight = canvas.height || bounds.height;
    canvas.width = Math.max(1, Math.round(bounds.width));
    canvas.height = Math.max(1, Math.round(bounds.height));
    laneWidth = Math.max(60, (canvas.width - 30) / 2);
    wordsLayer.style.setProperty('--lane', `${Math.floor(laneWidth)}px`);
    center.x = canvas.width / 2;
    center.y = floorY();
    for (const word of letters) {
      word.w = word.el.offsetWidth; word.h = word.el.offsetHeight;
      word.y = word.y / oldHeight * canvas.height;
      placeWord(word);
    }
    paint();
  }
  function baseSpeed () { return Math.max(8, (floorY() - 20) / 22); }
  // Keeps the upstream letter list, create/remove/type and paint structure.
  // Two lanes (left/right) get two words each. In a lane the upper word is never
  // faster than the lower one, so the gap between them can only grow (no overlap).
  function createLetters () {
    wordsLayer.replaceChildren();
    const lanes = [0, 0, 1, 1].sort(() => Math.random() - 0.5);
    letters = choices.map((text, n) => {
      const el = document.createElement('span');
      el.className = 'typer-word';
      el.textContent = text;
      wordsLayer.append(el);
      return { text, el, col: lanes[n], xf: Math.random(), y: 0, speed: 0 };
    });
    for (const word of letters) { word.w = word.el.offsetWidth; word.h = word.el.offsetHeight; }
    for (const col of [0, 1]) {
      const [lower, upper] = letters.filter(word => word.col === col);
      lower.y = 6 + Math.random() * 40;
      lower.speed = baseSpeed() * (0.85 + Math.random() * 0.35);
      upper.y = lower.y - upper.h - GAP - Math.random() * 50;
      upper.speed = Math.min(lower.speed, baseSpeed() * (0.8 + Math.random() * 0.35));
    }
    letters.forEach(placeWord);
  }
  function paintCircle (x, y, radius, color) { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
  function paint () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, center.y); ctx.lineTo(canvas.width, center.y); ctx.stroke();
    paintCircle(center.x, center.y, center.radius, center.color);
    for (const particle of particles) paintCircle(particle.x, particle.y, Math.max(0.5, particle.life * 4), particle.color);
  }
  function removeLetters (seconds) {
    // Distractors restart above the lane; only the correct word touching the floor is a miss.
    for (const word of letters) {
      word.y += word.speed * seconds;
      if (word.y + word.h >= floorY()) {
        if (word.text === cur().a) { resolve(false, '입력 못함 (정답 놓침)'); return; }
        const other = letters.find(item => item !== word && item.col === word.col);
        word.y = Math.min(-word.h, other.y - word.h - GAP);
        word.speed = Math.min(other.speed, baseSpeed() * (0.8 + Math.random() * 0.35));
        word.xf = Math.random();
      }
      placeWord(word);
    }
  }
  function popText (text, x, y, cls) {
    const pop = document.createElement('span');
    pop.className = `typer-pop ${cls}`;
    pop.textContent = text;
    pop.style.left = `${x}px`; pop.style.top = `${y}px`;
    field.append(pop);
    setTimeout(() => pop.remove(), 1100);
  }
  function burst (word, color) {
    const x = laneLeft(word) + word.xf * Math.max(0, laneWidth - word.w) + word.w / 2;
    const y = word.y + word.h / 2;
    for (let n = 0; n < 26; n++) particles.push({ x, y, dx: (Math.random() - 0.5) * 220, dy: (Math.random() - 0.5) * 220, life: 1, color });
    return { x, y };
  }
  function type (word) {
    combo++; correctCount++; maxCombo = Math.max(maxCombo, combo);
    const gained = scoreFor(combo, word ? Math.max(0, word.y) / floorY() : 1);
    score += gained;
    scoreEl.textContent = score.toLocaleString('ko-KR');
    replay(scoreEl, 'bump');
    comboEl.textContent = combo > 1 ? `${combo}연속` : '';
    if (word) {
      word.el.classList.add('hit');
      const at = burst(word, '#15803D');
      popText(`+${gained}`, at.x, at.y - word.h, 'good');
      if (combo > 1) popText(`${combo} 연속!`, at.x, at.y + word.h, 'combo');
    }
    popText(combo > 2 ? `${combo}연속 정답!` : '정답!', canvas.width / 2, canvas.height * 0.42, 'banner good');
    replay(shell, 'flash-good');
    vibrate(40);
    return gained;
  }
  function miss (answer) {
    combo = 0; comboEl.textContent = '';
    lives--;
    renderLives(lives);
    const typed = normalizeAnswer(answer);
    for (const word of letters) {
      if (word.text === cur().a) word.el.classList.add('answer');
      else if (normalizeAnswer(word.text) === typed) { word.el.classList.add('wrong'); burst(word, '#DC2626'); }
    }
    popText(typed ? '오답' : '놓쳤어요', canvas.width / 2, canvas.height * 0.42, 'banner bad');
    replay(shell, 'shake');
    vibrate([80, 60, 80]);
  }
  function showReview (item, answer, missed) {
    const over = !lives || index + 1 === questions.length;
    const essay = item.type === 'essay';
    review.innerHTML = `<div class="typer-review-card">
      <span class="typer-badge">${missed ? '놓쳤어요' : '오답'}</span>
      ${item.img ? `<img class="qimg" src="${item.img}" alt="문제 그림 (누르면 크게)">` : ''}
      <h2 id="typer-review-title">${esc(item.q)}</h2>
      ${missed ? '' : `<p class="typer-mine"><small>내 답</small><s>${esc(answer)}</s></p>`}
      <p class="typer-right"><small>${essay ? `빈칸 ${blank + 1} 정답` : '정답'}</small><strong>${esc(cur().a)}</strong></p>
      ${essay ? `<p class="typer-model-full"><small>모범답안</small>${esc(item.a)}</p>` : ''}
      <p class="typer-explain">${esc(item.explain)}</p>
      <p class="typer-page">${esc(item.chapter)} · PDF ${item.page}쪽</p>
      <button class="primary wide" id="typer-continue">${over ? '결과 보기' : '계속'}</button>
    </div>`;
    review.hidden = false;
    replay(review, 'enter');
    const next = review.querySelector('#typer-continue');
    next.addEventListener('click', () => { review.hidden = true; if (over) endGame(); else { index++; blank = 0; nextQuestion(); } });
    next.focus({ preventScroll: true });
  }
  function resolve (correct, answer) {
    if (phase !== 'playing' || closed) return;
    phase = 'feedback'; submit.disabled = true;
    clearTimeout(judgeTimer); composing = false;
    const item = questions[index], target = cur(), essay = item.type === 'essay';
    input.value = '';
    if (correct) {
      const gained = type(letters.find(word => word.text === target.a));
      if (essay && blank + 1 < item.blanks.length) { setFeedback(`빈칸 ${blank + 1} 정답! +${gained}점`, 'good'); advanceBlank = true; nextAt = performance.now() + 700; return; }
      recordAnswer(item, answer, true);
      if (essay) { blank = item.blanks.length; renderModel(); } // show the completed model answer
      setFeedback(essay ? `모범답안 완성! +${gained}점` : `정답! +${gained}점`, 'good');
      const hold = essay ? 2200 : 850;
      if (index + 1 === questions.length) { nextAt = Infinity; setTimeout(endGame, hold + 50); return; }
      nextAt = performance.now() + hold;
      return;
    }
    const missed = answer === '입력 못함 (정답 놓침)';
    recordAnswer(item, essay && !missed ? `빈칸 ${blank + 1}: ${answer}` : answer, false);
    miss(missed ? '' : answer);
    setFeedback(missed ? `놓쳤어요 · 정답 ${target.a}` : `오답 · 정답 ${target.a}`, 'bad');
    input.disabled = true;
    phase = 'review';
    setTimeout(() => { if (!closed) showReview(item, answer, missed); }, reduceMotion ? 0 : 650);
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
    resolve(normalized === normalizeAnswer(cur().a), answer);
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
    overlay.innerHTML = '<span class="typer-logo">PAUSE</span><strong>잠깐 쉬는 중</strong><p>계속하면 입력창으로 돌아가요.</p><button class="primary" id="typer-resume">계속하기</button>';
    root.querySelector('#typer-resume').addEventListener('click', togglePause);
  }
  function togglePause () {
    if (phase === 'playing') { phase = 'paused'; input.disabled = true; submit.disabled = true; pauseButton.setAttribute('aria-label', '계속하기'); showPause(); } else if (phase === 'paused') { phase = 'playing'; previous = performance.now(); overlay.hidden = true; input.disabled = false; submit.disabled = false; pauseButton.setAttribute('aria-label', '일시정지'); input.focus({ preventScroll: true }); }
  }
  function nextQuestion () {
    choices = makeChoices(cur());
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
    else if (phase === 'feedback' && time >= nextAt) { if (advanceBlank) { advanceBlank = false; blank++; } else { index++; blank = 0; } nextQuestion(); }
    for (const particle of particles) { particle.x += particle.dx * seconds; particle.y += particle.dy * seconds; particle.dy += 260 * seconds; particle.life -= seconds * 1.6; }
    particles = particles.filter(particle => particle.life > 0);
    paint();
    if (!closed) animation = window.requestAnimationFrame(gameLoop);
  }
  function cleanup () {
    closed = true; window.cancelAnimationFrame(animation); clearTimeout(judgeTimer);
    listeners.forEach(off => off()); document.body.classList.remove('typer-active');
  }
  function endGame () {
    if (closed) return;
    const best = readNumber(BEST);
    const total = readNumber(TOTAL) + score;
    writeNumber(TOTAL, total);
    if (score > best) writeNumber(BEST, score);
    cleanup();
    finish({ game: 'Typer', score, best: Math.max(best, score), newBest: score > best && score > 0, maxCombo, correct: correctCount, total });
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
  on(root.querySelector('.typer-qcard'), 'click', event => { if (event.target.closest('.qimg') && phase === 'playing') togglePause(); });
  on(root.querySelector('#typer-end'), 'click', () => { if (confirm('Typer를 마치고 지금까지 푼 결과를 볼까요?')) endGame(); });
  on(root.querySelector('#typer-start'), 'click', () => { overlay.hidden = true; nextQuestion(); previous = performance.now(); animation = window.requestAnimationFrame(gameLoop); });
  choices = makeChoices(cur()); updateLabels(); renderLives(); resizeHandler(); createLetters(); paint();
}
