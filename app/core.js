export function shuffle(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
const IMG = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
export const fillModel = item => item.model.replace(/\[\[(\d+)\]\]/g, (_, n) => item.blanks[n - 1].a);
export function validateChapter(data) {
  const fail = text => { throw new Error(text); };
  const short = x => typeof x === 'string' && x.trim() && [...x.trim()].length <= 12;
  const choiceSet = (label, a, wrong) => {
    if (!short(a)) fail(label + '정답은 12자 이내여야 합니다.');
    if (!Array.isArray(wrong) || wrong.length !== 3 || !wrong.every(short)) fail(label + '12자 이내 오답 보기 3개가 필요합니다.');
    const w = wrong.map(x => x.trim());
    if (new Set([a.trim(), ...w]).size !== 4) fail(label + '정답과 오답 보기 4개가 모두 달라야 합니다.');
    return {a:a.trim(), wrong:w};
  };
  if (!data || typeof data.chapter !== 'string' || !data.chapter.trim() || data.chapter.length > 160) fail('chapter는 160자 이내 챕터 이름이어야 합니다.');
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 2000) fail('items는 1~2000문제 배열이어야 합니다.');
  const ids = new Set();
  const items = data.items.map((item, n) => {
    const label = `${n + 1}번 문제: `, essay = item.type === 'essay';
    if (item.type !== undefined && !essay) fail(label + 'type은 "essay"만 쓸 수 있습니다.');
    for (const field of ['id', 'q', essay ? 'model' : 'a', 'explain']) if (typeof item[field] !== 'string' || !item[field].trim() || item[field].length > 3000) fail(label + field + ' 값이 필요합니다(3000자 이내).');
    if (ids.has(item.id.trim())) fail(label + 'id가 중복되었습니다.');
    ids.add(item.id.trim());
    if (!Number.isInteger(item.page) || item.page < 1) fail(label + 'page는 1 이상의 PDF 쪽 번호여야 합니다.');
    if (item.source !== undefined && item.source !== '' && (typeof item.source !== 'string' || !item.source.trim() || item.source.length > 5000)) fail(label + 'source는 5000자 이내 근거 문자열이어야 합니다.');
    if (item.img !== undefined && (typeof item.img !== 'string' || item.img.length > 2000000 || !IMG.test(item.img))) fail(label + 'img는 data:image/jpeg 또는 png base64 문자열(2MB 이내)이어야 합니다.');
    const out = {id:item.id.trim(), q:item.q.trim(), explain:item.explain.trim(), page:item.page, source:item.source?.trim() || ''};
    if (item.img) out.img = item.img;
    if (!essay) return {...out, ...choiceSet(label, item.a, item.wrong)};
    const model = item.model.trim(), marks = [...model.matchAll(/\[\[(\d+)\]\]/g)].map(m => Number(m[1]));
    if (!Array.isArray(item.blanks) || !item.blanks.length || item.blanks.length > 10) fail(label + 'blanks는 1~10개 배열이어야 합니다.');
    if (marks.length !== item.blanks.length || marks.some((m, k) => m !== k + 1)) fail(label + `모범답안의 빈칸 [[1]]~[[${item.blanks.length}]]이 blanks 개수와 맞아야 합니다.`);
    const blanks = item.blanks.map((b, k) => choiceSet(`${label}빈칸 ${k + 1}: `, b?.a, b?.wrong));
    const essayItem = {...out, type:'essay', model, blanks};
    return {...essayItem, a:fillModel(essayItem)};
  });
  return {chapter:data.chapter.trim(), items};
}
export const makeChoices = item => shuffle([item.a, ...item.wrong]);
export const questionKey = item => JSON.stringify([item.chapter, item.id]);
export function drawQuestions(chapters, selected) {
  return shuffle(chapters.filter(c => selected.includes(c.key)).flatMap(c => c.items.map(item => ({...item, chapter:c.chapter}))));
}
export function takeMatchingRound(pool, max = 6) {
  const round = [], remaining = [], answers = new Set();
  for (const item of pool) { if (round.length < max && !answers.has(item.a)) {round.push(item); answers.add(item.a);} else remaining.push(item); }
  return {round, remaining};
}
