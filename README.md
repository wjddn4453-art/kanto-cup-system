# 고추밭 경매 시스템 v2.3 — TOURNAMENT FINAL

대회 실사용용 최종 안정화 버전입니다.

## 최종 수정

- 룰렛 결과 이름이 두 겹으로 보이는 현상 제거
- 룰렛 버튼 글자가 두 겹으로 보이는 현상 제거
- 룰렛 진행 중에는 흐르는 이름만 표시
- 룰렛 종료 후에는 최종 결과 이름 하나만 표시
- 기존 v2.2.1 카드·제목·낙찰 배지 수정 유지

## 적용

1. 압축 해제
2. GitHub 저장소에서 Add file → Upload files
3. 압축을 푼 폴더 내부 파일 전체 업로드
4. Commit changes
5. Vercel Ready 확인
6. Ctrl + Shift + R

## v2.9 온라인 운영 방

1. Supabase SQL Editor에서 `supabase/final-schema.sql` 전체를 실행합니다.
2. Vercel 환경 변수에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 설정합니다.
3. 사이트 상단의 **온라인 방 연결**에서 방 코드와 운영 비밀번호로 새 방을 만듭니다.
4. **관전자 링크 복사**는 보기 전용 주소입니다.
5. **운영자 링크 복사** 주소와 운영 비밀번호를 함께 받은 사람은 다른 PC에서 같은 방에 접속해 조작할 수 있습니다.

운영 비밀번호는 URL에 포함되지 않으며 따로 전달해야 합니다. 여러 운영자가 정확히 동시에 버튼을 누르지 않도록 한 명씩 조작하는 것을 권장합니다.
