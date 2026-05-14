# 밸런스 게임 Live

진행자가 방을 만들고 참여 링크 또는 QR 코드를 공유하면, 참여자들이 익명 닉네임으로 A/B 밸런스 게임 문항에 응답하는 실시간 웹앱입니다.

## 배포 구조

- GitHub Pages: `public/` 폴더의 정적 웹페이지 배포
- Supabase: 방, 질문, 참여자, 응답 저장
- Supabase Realtime: 방별 Broadcast/Presence 채널로 실시간 갱신

## Supabase 설정

현재 배포용 Supabase 프로젝트에는 필요한 SQL 설정이 적용되어 있습니다. 새 프로젝트로 옮길 때는 이 작업 폴더의 `supabase/schema.sql`을 SQL Editor에서 실행한 뒤 [public/config.js](public/config.js)에 값을 넣습니다.

```js
window.BALANCE_GAME_CONFIG = {
  SUPABASE_URL: "https://your-project.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-or-publishable-key",
  PUBLIC_URL: "https://your-github-username.github.io/your-repo",
};
```

`PUBLIC_URL`은 참여 링크와 QR 코드에 들어가는 공개 주소입니다.

## GitHub Pages 배포

이 저장소에는 GitHub Actions 워크플로가 포함되어 있습니다.

- 워크플로: [.github/workflows/pages.yml](.github/workflows/pages.yml)
- 배포 대상: `public/`

GitHub 저장소에 푸시한 뒤 Settings > Pages에서 Source를 GitHub Actions로 설정하면 자동 배포됩니다.

## 기능

- 진행자 방 생성, 참여 링크, QR 코드 표시
- 참여자 익명 닉네임 입장
- A/B 선택과 선택 이유 제출
- 응답 중 인원, 제출 인원, 작성 중 인원 실시간 표시
- 마감 후 결과 비율 그래프 표시
- 참여자도 결과와 닉네임/선택 이유 세부 현황 확인
- 다음 질문 준비 대기 화면과 직전 결과 표시
