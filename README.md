# 밸런스 게임 Live

진행자가 방을 만들고 참여 링크 또는 QR 코드를 공유하면, 참여자들이 익명 닉네임으로 A/B 밸런스 게임 문항에 응답하는 실시간 웹앱입니다.

## 배포 구조

- GitHub Pages: `public/` 폴더의 정적 웹페이지 배포
- Supabase: 방, 질문, 참여자, 응답 저장
- Supabase Realtime: 방별 Broadcast/Presence 채널로 실시간 갱신

## Supabase 설정

1. Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 [supabase/schema.sql](supabase/schema.sql)을 실행합니다.
3. Project Settings > API에서 Project URL과 anon/public key를 확인합니다.
4. [public/config.js](public/config.js)에 값을 넣습니다.

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

## 로컬 실행

Supabase 없이 로컬 Node 서버로도 테스트할 수 있습니다.

```powershell
node server.js
```

진행자 화면:

```text
http://localhost:3030/?host=1
```

`public/config.js`에 Supabase 값이 비어 있으면 기존 Node 서버 방식으로 작동합니다. Supabase 값을 넣으면 정적 배포 방식으로 작동합니다.

## 기능

- 진행자 방 생성, 참여 링크, QR 코드 표시
- 참여자 익명 닉네임 입장
- A/B 선택과 선택 이유 제출
- 응답 중 인원, 제출 인원, 작성 중 인원 실시간 표시
- 마감 후 결과 비율 그래프 표시
- 참여자도 결과와 닉네임/선택 이유 세부 현황 확인
- 다음 질문 준비 대기 화면과 직전 결과 표시
