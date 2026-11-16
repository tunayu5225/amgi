import {shuffle, validateChapter, makeChoices, questionKey, drawQuestions, takeMatchingRound} from './core.js';
const root = document.querySelector('#app');
const CHAPTERS = 'amgi.chapters.v1', WRONG = 'amgi.wrong.v1';
const state = {chapters:[], selected:new Set(), pool:[], records:[], errors:[], mode:'', storedWrong:{}};
const modes = new Map();
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button = (id, text, cls='') => `<button id="${id}" class="${cls}">${text}</button>`;
function read(key, fallback) { try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {state.errors.push('기기에 저장된 자료를 읽지 못했습니다. 원본 JSON을 다시 추가해 주세요.'); return fallback;} }
function save(key, value) { try {localStorage.setItem(key, JSON.stringify(value)); return true;} catch {state.errors.push('기기 저장 공간에 저장하지 못했습니다. 이번 결과는 현재 화면에서만 볼 수 있습니다.'); return false;} }
function bind(id, fn) {document.getElementById(id)?.addEventListener('click', fn);}
function view(html) {root.innerHTML = html; window.scrollTo(0,0);}
function recordAnswer(item, myAnswer, correct) {
  const record = {...item, myAnswer:String(myAnswer), correct:Boolean(correct)};
  state.records.push(record);
  const key = questionKey(item);
  if (correct) delete state.storedWrong[key];
  else state.storedWrong[key] = record;
  save(WRONG, state.storedWrong);
  return record;
}
function selection() {
  view(`<div class="eyebrow">01 · 챕터 고르기</div><h1>오늘은 무엇을<br>기억해 볼까요?</h1><p class="muted">챕터를 고르고 처음 공부부터 시작해요.<br>여러 개를 고르면 문제를 섞어 드려요.</p><div class="row">${button('all','전체 섞기')}${button('none','선택 해제')}</div><div class="chapters">${state.chapters.map(c => `<label class="chapter"><input type="checkbox" value="${esc(c.key)}" ${state.selected.has(c.key)?'checked':''}><span><strong>${esc(c.chapter)}</strong><small>${c.items.length}문제 · ${c.local?'이 기기에 추가':'기본 챕터'}</small></span></label>`).join('') || '<p>챕터 JSON 파일을 추가해 주세요.</p>'}</div><p id="count" class="muted"></p>${button('choose','선택한 챕터로 공부하기','primary wide')}<div class="row"><label class="file">JSON 파일 추가<input type="file" id="import" accept=".json,application/json" multiple aria-label="JSON 파일 추가"></label></div><p class="muted">PDF + 데이터화 프롬프트를 GPT에 넣어 만든 JSON을 추가하세요. PDF 파일은 이 앱에서 변환하지 않습니다.</p>${button('retry',`틀린 것만 다시 (${Object.keys(state.storedWrong).length})`,'wide')}<p id="status" class="status" role="status">${esc(state.errors.join('\n'))}</p>`);
  function count() {const n=state.chapters.filter(c=>state.selected.has(c.key)).reduce((s,c)=>s+c.items.length,0); document.getElementById('count').textContent=`${state.selected.size}챕터 · ${n}문제 선택`; document.getElementById('choose').disabled=!n;}
  root.querySelectorAll('input[type=checkbox]').forEach(el=>el.addEventListener('change',()=>{el.checked?state.selected.add(el.value):state.selected.delete(el.value);count();}));
  bind('all',()=>{state.selected = new Set(state.chapters.map(c=>c.key)); selection();});
  bind('none',()=>{state.selected.clear();selection();});
  bind('choose',()=>{state.pool=drawQuestions(state.chapters,[...state.selected]); modeSelection();});
  bind('retry',retryWrong);document.getElementById('retry').disabled=!Object.keys(state.storedWrong).length;
  document.getElementById('import').addEventListener('change',importFiles); count();
}
async function importFiles(event) {
  const messages=[];
  let local = state.chapters.filter(c=>c.local).map(({chapter,items})=>({chapter,items}));
  for (const file of event.target.files) {
    try {
      if (file.size > 5*1024*1024) throw Error('파일은 5MB 이하로 넣어 주세요.');
      const data = validateChapter(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));
      if (state.chapters.some(c=>c.chapter===data.chapter)) throw Error('같은 이름의 챕터가 이미 있습니다. JSON의 chapter 이름을 구분해 주세요.');
      const next = [...local,data];
      if (!save(CHAPTERS,next)) throw Error('저장 공간이 부족해 파일을 추가하지 못했습니다.');
      local=next; const key=`local:${data.chapter}`;
      state.chapters.push({...data,key,local:true});state.selected.add(key);messages.push(`${file.name}: ${data.items.length}문제 추가`);
    } catch(e) {messages.push(`${file.name}: ${e.message}`);}
  }
  selection();document.getElementById('status').textContent=messages.join('\n');
}
function modeSelection() {
  view(`<div class="eyebrow">02 · 모드 고르기</div><h1>오늘의 게임을<br>골라 볼까요?</h1><p class="muted">${new Set(state.pool.map(i=>i.chapter)).size}챕터에서 ${state.pool.length}문제를 섞었어요.</p><div class="modes">${modes.has('Typer')?`<button class="mode hero" data-game="Typer"><strong>TYPER</strong><small>떨어지는 보기 중 정답을 쳐서 맞히기<br>점수 · 연속 정답 보너스 · 하트 3개</small>${typerBest()?`<span class="best">최고 ${typerBest().toLocaleString('ko-KR')}점</span>`:''}</button>`:''}<button id="cards" class="mode"><strong>카드 뒤집기</strong><small>질문 → 답과 해설<br>내 속도로 하나씩</small></button><button id="match" class="mode"><strong>짝 맞추기</strong><small>질문 ↔ 짧은 답<br>한 번에 최대 6쌍</small></button></div><p class="note">처음 공부는 순위 경쟁 없이 익히는 과정이에요. 모르는 문제는 끝난 뒤 다시 볼 수 있어요.</p>${button('back','챕터 다시 고르기','wide')}`);
  bind('cards',()=>start('cards'));bind('match',()=>start('match'));bind('back',selection);
  root.querySelectorAll('[data-game]').forEach(el=>el.addEventListener('click',()=>start(el.dataset.game)));
}
function start(mode) {state.records=[];state.mode=mode;state.pool=shuffle(state.pool);if(mode==='cards') card(0); else if(mode==='match') matching([...state.pool]); else modes.get(mode)?.({questions:[...state.pool],recordAnswer,finish:results,makeChoices,root});}
function progress(done,total) {return `<div class="progress"><span style="width:${Math.round(done/total*100)}%"></span></div>`;}
function exit() {if (confirm('학습을 마칠까요? 지금까지 푼 문제는 결과에서 볼 수 있어요.')) results();}
function card(index) {
  if(index>=state.pool.length) return results();
  const item=state.pool[index]; let flipped=false;
  view(`<div class="between"><span class="eyebrow">카드 뒤집기 · ${index+1}/${state.pool.length}</span>${button('end','마치기','back')}</div>${progress(index,state.pool.length)}<p class="tag">${esc(item.chapter)}</p><h1>답을 떠올려 보세요</h1><button class="card" id="flip" aria-label="카드 뒤집기"><span class="tag">질문</span><h2>${esc(item.q)}</h2><span class="muted">눌러서 답 확인 ↻</span></button><div class="row">${button('unknown','모르겠다')}${button('known','알았다','primary')}</div><p class="muted">답을 본 뒤 기억하는 정도를 골라 주세요.</p>`);
  document.getElementById('known').disabled=true;document.getElementById('unknown').disabled=true;
  bind('flip',()=>{flipped=!flipped;document.getElementById('flip').innerHTML=flipped?`<span class="tag">정답 · PDF ${item.page}쪽</span><div class="answer">${esc(item.a)}</div><p>${esc(item.explain)}</p><span class="muted">눌러서 질문 보기 ↻</span>`:`<span class="tag">질문</span><h2>${esc(item.q)}</h2><span class="muted">눌러서 답 확인 ↻</span>`;document.getElementById('known').disabled=false;document.getElementById('unknown').disabled=false;});
  bind('known',()=>{recordAnswer(item,'알았다 (자기평가)',true);card(index+1);});bind('unknown',()=>{recordAnswer(item,'모르겠다 (자기평가)',false);card(index+1);});bind('end',exit);
}
function matching(pool) {
  if(!pool.length) return results();
  const {round,remaining}=takeMatchingRound(pool), answers=shuffle(round), done=new Set(), failures=new Map();let selected=null;
  view(`<div class="between"><span class="eyebrow">짝 맞추기 · ${state.records.length}/${state.pool.length}</span>${button('end','마치기','back')}</div>${progress(state.records.length,state.pool.length)}<h1>질문과 답을 이어 주세요</h1><p class="muted">왼쪽 질문을 고르고 오른쪽 답을 눌러요.<br>이번 묶음 ${round.length}쌍 · 틀려도 다시 고를 수 있어요.</p><div class="pairs">${round.map((i,n)=>`<button data-q="${n}">${esc(i.q)}</button><button data-a="${n}" disabled>${esc(answers[n].a)}</button>`).join('')}</div><p id="feedback" class="status" role="status"></p>${button('next','다음 묶음','primary wide')}`);
  document.getElementById('next').hidden=true; bind('end',exit);
  root.querySelectorAll('[data-q]').forEach(el=>el.addEventListener('click',()=>{selected=Number(el.dataset.q);root.querySelectorAll('[data-q]').forEach(b=>{const active=b===el;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});root.querySelectorAll('[data-a]').forEach(b=>b.disabled=b.classList.contains('done'));}));
  root.querySelectorAll('[data-a]').forEach(el=>el.addEventListener('click',()=>{
    if(selected===null) return;
    const item=round[selected], answer=answers[Number(el.dataset.a)].a, feedback=document.getElementById('feedback');
    if(item.a!==answer) {if(!failures.has(selected)) failures.set(selected,answer);feedback.textContent='아직 짝이 아니에요. 다른 답을 골라 보세요.';return;}
    recordAnswer(item,failures.get(selected)||answer,!failures.has(selected));done.add(selected);
    const q=root.querySelector(`[data-q="${selected}"]`);q.classList.remove('selected');q.classList.add('done');q.disabled=true;el.classList.add('done');el.disabled=true;selected=null;
    root.querySelectorAll('[data-a]').forEach(b=>b.disabled=true);
    feedback.textContent=`맞았어요. ${done.size}/${round.length}쌍 연결`;
    if(done.size===round.length){document.getElementById('next').hidden=false;document.getElementById('next').textContent=remaining.length?'다음 묶음':'학습 결과 보기';}
  }));
  bind('next',()=>matching(remaining));
}
function retryWrong() {
  state.pool=shuffle(Object.values(state.storedWrong));
  if(!state.pool.length) return selection();
  modeSelection();
}
function typerBest() {return Number(read('amgi.typer.best.v1',0))||0;}
function scoreboard(g) {
  if(!g||typeof g.score!=='number') return '';
  const n=v=>Number(v||0).toLocaleString('ko-KR');
  return `<section class="scoreboard" aria-label="${esc(g.game)} 점수"><small>${esc(g.game)} SCORE</small><span class="big">${n(g.score)}</span>${g.newBest?'<span class="newbest">최고 기록!</span>':''}<dl><div><dt>최고 점수</dt><dd>${n(g.best)}</dd></div><div><dt>최대 콤보</dt><dd>${n(g.maxCombo)}</dd></div><div><dt>누적 점수</dt><dd>${n(g.total)}</dd></div></dl></section>`;
}
function results(game) {
  const wrong=state.records.filter(i=>!i.correct), correct=state.records.length-wrong.length, cards=state.mode==='cards';
  view(`<div class="eyebrow">03 · 학습 결과</div><h1>한 번 더 보면<br>더 오래 남아요.</h1>${scoreboard(game)}<div class="stat">${correct} / ${state.records.length}</div><p class="muted">${cards?'알았다 (자기평가)':'처음에 맞힌 문제'} · ${state.pool.length}문제 중 ${state.records.length}문제 학습<br>${cards?'객관식 점수 대신 기억 정도를 기록했어요.':'첫 시도에서 틀린 답을 아래에 남겼어요.'}</p><h2>${cards?'모르겠다고 한':'틀린'} 문제 ${wrong.length}개</h2>${wrong.map(item=>`<article class="review"><p class="tag">${esc(item.chapter)} · PDF ${item.page}쪽</p><h3>${esc(item.q)}</h3><p class="incorrect">내 답: ${esc(item.myAnswer)}</p><p class="correct">정답: ${esc(item.a)}</p><p>${esc(item.explain)}</p>${item.source?`<details><summary>강의자료 근거 보기</summary><p>${esc(item.source)}</p></details>`:''}</article>`).join('')||'<p>이번 학습에서 남긴 오답이 없어요.</p>'}<p class="status">${esc(state.errors.join('\n'))}</p><div class="row">${button('retry','틀린 것만 다시','primary')}${button('home','챕터 고르기')}</div><p class="muted">이 기기에 쌓인 오답 ${Object.keys(state.storedWrong).length}개. 다시 풀어 맞히면 오답 목록에서 빠져요.</p>`);
  bind('retry',retryWrong);document.getElementById('retry').disabled=!Object.keys(state.storedWrong).length;bind('home',selection);
}
async function init() {
  const stored=read(WRONG,{});
  if(stored && typeof stored==='object' && !Array.isArray(stored)) for(const record of Object.values(stored)) {try {const c=validateChapter({chapter:record.chapter,items:[record]});const item={...c.items[0],chapter:c.chapter,myAnswer:String(record.myAnswer||''),correct:false};state.storedWrong[questionKey(item)]=item;} catch {state.errors.push('형식이 잘못된 저장 오답 하나를 건너뛰었습니다.');}}
  try {
    const response=await fetch('../data/index.json');if(!response.ok) throw Error('목록 HTTP '+response.status);
    const index=await response.json();if(!Array.isArray(index.chapters)) throw Error('chapters 목록이 없습니다.');
    for(const entry of index.chapters) {try {const file=typeof entry==='string'?entry:entry.file;if(typeof file!=='string'||!/^[-\w가-힣.]+\.json$/.test(file)) throw Error('안전한 JSON 파일명만 허용합니다.');const r=await fetch('../data/'+file);if(!r.ok) throw Error('HTTP '+r.status);const data=validateChapter(await r.json());if(state.chapters.some(c=>c.chapter===data.chapter)) throw Error('챕터 이름 중복');state.chapters.push({...data,key:'public:'+file,local:false});} catch(e) {state.errors.push('기본 챕터: '+e.message);}}
  } catch(e) {state.errors.push('기본 목록을 불러오지 못했습니다. 로컬 서버로 열거나 JSON 파일을 추가해 주세요. '+e.message);}
  const local=read(CHAPTERS,[]);
  if(Array.isArray(local)) for(const data of local){try {const c=validateChapter(data);if(state.chapters.some(x=>x.chapter===c.chapter)) throw Error('기본 챕터와 이름 중복');state.chapters.push({...c,key:'local:'+c.chapter,local:true});}catch(e){state.errors.push('추가 챕터: '+e.message);}}
  state.selected=new Set(state.chapters.map(c=>c.key)); selection();
  window.dispatchEvent(new Event('amgi-ready'));
}
window.Amgi = {shuffle,validateChapter,makeChoices,drawQuestions,recordAnswer,finish:results,registerMode:(name,run)=>modes.set(name,run),getSession:()=>({questions:[...state.pool],records:[...state.records]}),home:selection};
init();
