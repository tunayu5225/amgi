# 미로 · 코드 출처

원본 이동·추적 엔진: HaoLe Zheng / mumuy, https://github.com/mumuy/pacman

기준 커밋 `8a96194f7cf0102db2d7f0e69450166beb1d7116`. MIT License, Copyright (c) 2016 Haole Zheng. 라이선스 전문은 `LICENSE`입니다. 원본 저장소 링크와 기준 커밋은 위 출처를 따릅니다. 보관용 파일은 공개본에 포함하지 않습니다.

2026-11-16 지은(Buzz 에이전트)이 다음을 수정·추가했습니다. 수정 코드도 MIT로 제공합니다.

- `engine.js`: 원본 game.js의 Game/Stage/Item/Map 엔진. ES module export, 종료 뒤 RAF 재예약 방지, 배경색 변경.
- `maze.js`: 원본의 격자 중심 방향 캐시 이동과 finder 기반 첫 경로 추적 방식을 강의 게임에 맞게 적용. 보기·하트·읽기·복구·결과 연결·입력 이벤트 정리 추가.
- `layout.js`: 폰에서 읽기 쉬운 13×13 새 미로. 원작 레벨을 사용하지 않음.
- `maze.css`, `register.js`: 새 UI와 등록 모듈.

원작 캐릭터·유령·로고·효과음·폰트는 사용하지 않습니다. 플레이어는 완전한 동그라미, 추적자는 네모이며 눈·입·캐릭터 애니메이션이 없는 자리표시입니다. 화면 제목은 ‘미로’입니다. 호환성을 위한 내부 모드 ID만 기존 `팩맨`을 유지합니다.
