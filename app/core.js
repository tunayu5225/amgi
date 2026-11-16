export function shuffle(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export function validateChapter(data) {
  const fail = text => { throw new Error(text); };
  if (!data || typeof data.chapter !== 'string' || !data.chapter.trim() || data.chapter.length > 160) fail('chapter는 160자 이내 챕터 이름이어야 합니다.');
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 2000) fail('items는 1~2000문제 배열이어야 합니다.');
  const ids = new Set();
  const items = data.items.map((item, n) => {
    const label = `${n + 1}번 문제: `;
    for (const field of ['id', 'q', 'a', 'explain']) if (typeof item[field] !== 'string' || !item[field].trim() || item[field].length > 3000) fail(label + field + ' 값이 필요합니다(3000자 이내).');
    if (ids.has(item.id.trim())) fail(label + 'id가 중복되었습니다.');
    ids.add(item.id.trim());
    if ([...item.a.trim()].length > 12) fail(label + '정답은 12자 이내여야 합니다.');
    if (!Array.isArray(item.wrong) || item.wrong.length !== 3 || item.wrong.some(x => typeof x !== 'string' || !x.trim() || [...x.trim()].length > 12)) fail(label + '12자 이내 오답 보기 3개가 필요합니다.');
    const wrong = item.wrong.map(x => x.trim());
    if (new Set([item.a.trim(), ...wrong]).size !== 4) fail(label + '정답과 오답 보기 4개가 모두 달라야 합니다.');
    if (!Number.isInteger(item.page) || item.page < 1) fail(label + 'page는 1 이상의 PDF 쪽 번호여야 합니다.');
    if (item.source !== undefined && (typeof item.source !== 'string' || !item.source.trim() || item.source.length > 5000)) fail(label + 'source는 5000자 이내 근거 문자열이어야 합니다.');
    return {id:item.id.trim(), q:item.q.trim(), a:item.a.trim(), wrong, explain:item.explain.trim(), page:item.page, source:item.source?.trim() || ''};
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
