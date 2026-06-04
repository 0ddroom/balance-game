# 밸런스 게임 Live

진행자가 방을 만들고 참여 링크나 QR 코드를 공유하면, 참여자들이 익명 닉네임으로 A/B 밸런스 게임에 응답하는 실시간 웹 앱입니다.

## 배포 구조

- Vercel: 정적 화면(`public/`)과 서버리스 API(`api/`) 배포
- Redis/Upstash: 방, 질문, 참여자, 응답, 누적 현황 저장
- 프론트엔드: Supabase 없이 Vercel API를 폴링해서 실시간에 가깝게 갱신

## Vercel 배포

1. Vercel에서 GitHub 저장소 `0ddroom/balance-game`를 Import합니다.
2. 프로젝트의 Storage 또는 Marketplace에서 Upstash Redis를 연결합니다.
3. Vercel 환경변수에 아래 값이 들어있는지 확인합니다.

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

Upstash에서 직접 Redis를 만들었다면 아래 이름도 사용할 수 있습니다.

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

4. Deploy를 실행합니다.

## 로컬 실행

Vercel CLI를 사용할 때는 `.env.local`에 Redis REST URL과 토큰을 넣고 실행합니다.

```powershell
npm test
vercel dev
```

일반 정적 서버로만 열면 화면은 보이지만 `/api/rpc/...`가 없어서 방 만들기는 동작하지 않습니다.

## 설정

[public/config.js](public/config.js)는 Vercel API 모드로 설정되어 있습니다.

```js
window.BALANCE_GAME_CONFIG = {
  USE_VERCEL_API: true,
  PUBLIC_URL: "",
};
```

`PUBLIC_URL`을 비워두면 현재 접속한 Vercel 주소로 참여 링크와 QR 코드가 만들어집니다.

## 주요 기능

- 진행자 방 생성, 참여 링크, QR 코드 표시
- 참여자 익명 닉네임 입장
- A/B 선택과 선택 이유 제출
- 응답 중 인원, 제출 인원 표시
- 결과 파이 차트와 세부 현황 팝업
- 참여자 대기 화면에서 직전 질문 결과 확인
- 게임 종료 후 참여자 종료 화면 표시
- 진행자는 같은 링크에서 게임 재개 가능
- 진행자 누적 질문 현황 확인 및 이미지 다운로드
- 상황별 BGM과 버튼 효과음
