# Sunday Maple Notifier

넥슨 Open API로 "썬데이 메이플" 공지를 감지해서, 공지 이미지를 디스코드 채널에 자동으로 올려주는 봇. GitHub Actions로 돌아가서 서버/폰이 필요 없다.

## 동작 방식

- 매주 금요일 10:00~23:55(KST) 5분 간격으로 GitHub Actions가 `src/index.js`를 실행
- `GET /maplestory/v1/notice-event`(이벤트 공지)에서 제목에 "썬데이 메이플"이 포함되고 등록일이 오늘 날짜인 이벤트를 찾음
  - "썬데이 메이플"은 일반 공지사항이 아니라 이벤트 게시판에 등록되는 콘텐츠라 `v1/notice`가 아닌 `v1/notice-event`를 사용한다
- 찾으면 목록 응답에 포함된 `thumbnail_url`을 이미지로 바로 사용 (상세 API/HTML 파싱 불필요)
- 디스코드 웹훅으로 이미지 전송
- `state.json`에 오늘 날짜를 기록하고 커밋 → 같은 주에는 더 이상 전송하지 않음 (다음 금요일이 되면 날짜가 바뀌므로 자동으로 다시 동작)

## 설정

1. GitHub에 이 프로젝트로 새 저장소를 만들고 push
2. 디스코드 채널 > 설정 > 연동 > 웹후크 > 새 웹후크 생성 후 URL 복사
3. 저장소 Settings > Secrets and variables > Actions 에 다음 두 개 추가
   - `NEXON_API_KEY`: 발급받은 넥슨 Open API 키
   - `DISCORD_WEBHOOK_URL`: 위에서 만든 디스코드 웹훅 URL
4. Actions 탭에서 워크플로우가 활성화되어 있는지 확인 (기본적으로 자동 활성화됨)

## 로컬 테스트

```bash
cp .env.example .env   # 값 채워넣기
export $(cat .env | xargs)
npm run start
```

날짜 조건 때문에 평소엔 대부분 "공지 없음"으로 끝난다. 전체 플로우(이미지 다운로드~디스코드 전송)를 테스트하려면 `src/index.js`의 `n.date.startsWith(today)` 조건을 잠시 지우고 아무 최근 공지로 테스트한 뒤 원복한다.

## 수동 실행

GitHub Actions 탭 > Sunday Maple Notifier > Run workflow 로 언제든 수동 실행 가능.
