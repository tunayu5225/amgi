# Typer · 강의 암기용 수정판

원작: [berkerol/typer](https://github.com/berkerol/typer)

기준 커밋: `19ddc6035d695c089fc834bff2fea0605e30c39f`

원본 저장소 링크와 기준 커밋은 위 출처를 따릅니다. 보관용 파일은 공개본에 포함하지 않습니다.

수정일: 2026-11-16. 수정 구현: 지은(Buzz 에이전트).

수정 파일 `typer.js`와 `typer.css`, 연결 모듈 `register.js`는 GPL-3.0으로 제공합니다. 원본의 회색 캔버스·파란 Monospace 글자·빨간 중심 표시와 createLetters/removeLetters/type/resizeHandler 그리기 구조를 바탕으로 수정했습니다. 가운데로 다가오는 영문자 대신, 위에서 내려오는 강의 정답·오답 보기를 사용합니다.

추가한 동작: 챕터 문제, 하트 3개, 한글 composition 입력, Enter/제출, 폰 가시 영역에 맞춘 배치, 일시정지, 공통 정답/오답 기록 및 결과 화면. 외부 canvas/particle 라이브러리 대신 이 모듈 안의 RAF·원 그리기·입자 효과를 사용합니다.

공개본에는 원본 HTML·그림·보관용 파일이 없습니다. 플레이 화면은 캔버스 코드로 그립니다. GPL-3.0 전문은 LICENSE에 유지합니다.
