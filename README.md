# 🌶️ 고추밭 실시간 경매 시스템

관동지방컵 및 고추밭 롤 대회에서 사용할 실시간 경매 시스템입니다.

## 현재 v0.1 기능

- 운영자 / 팀장 / 관전자 입장 화면
- 경매 메인 UI
- 선수 관리 UI
- 랜덤 룰렛 UI
- 팀 설정 UI
- 방송용 다크 블루 게임 UI
- Supabase 연결 준비

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`

## 환경 변수

`.env.example` 파일을 복사해 `.env.local`로 만들고 아래 값을 입력합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

## 다음 버전

- Supabase 테이블 연결
- 실시간 입찰
- 방 코드
- 팀별 비밀번호
- 낙찰 / 유찰
- 포인트 자동 차감
- 관전자 실시간 동기화
