# 대화 저장과 복구

2026-10-22 도입. R2는 `azitchat-private/v1` 전용 접두사를 사용한다. 헤이즈 객체는 변경하지 않는다.

- 대화는 SQLite에 우선 원자적으로 기록한다. 5분마다 미보관 메시지를 방·사용자 구분 없이 새 메시지를 최대 500개씩 하나의 파일로 묶어 R2에 압축·AES-256-GCM 암호화하여 저장한다. 업로드 뒤 다운로드·복호화·SHA-256 검증에 성공해야 보관 참조를 확정한다. 실패하면 다음 실행에서 재시도한다.
- 통합 파일은 서버 전용 비공개 암호화 객체이며 클라이언트에 직접 전달하지 않는다. 메시지별 사용자·방·객체 내 위치 참조로 해당 방의 기록만 반환한다. 기존 방별 파일과 신규 통합 파일을 모두 조회할 수 있다. 방 100개에서 각 1개씩 쌓여도 배치 1개면 PUT 1회 + 검증 GET 1회다. 500개 초과 시 여러 배치로 나눈다.
- 운영 계정 JSON은 방당 최근 120개, 계정 조회 응답은 최근 40개만 포함한다. 과거 대화는 인증된 `/api/account/rooms/:id/messages?before=...`에서 40개씩 조회한다. 최근 기록은 운영 DB, 과거 보관분은 R2를 사용하며 R2 장애 시 검증된 운영 DB 원문 사본으로 조회한다.
- 원문 운영 DB 사본·검색/관리자 기능은 유지한다. 현재 단계에서 SQLite 원문을 삭제하거나 저장 공간이 무한히 확장된다고 보장하지 않는다. 대화 기록과 LLM에 제공할 최근 문맥·기억은 구분한다.
- `seollem-archive.timer`: 5분마다. `seollem-backup.timer`: KST 03/09/15/21:30 이후 5분 내.
- DB는 SQLite backup API로 일관된 사본을 만들고 integrity_check를 확인한다. 8MiB 단위로 암호화하여 R2에 업로드하고 각 부분을 다시 읽어 확인한다. 마지막에 검증 manifest를 기록한다.
- 로컬 3일, R2 6시간 간격본 7일, KST 03시 생성 일일본 30일. 원문 보관과 백업 보존 기간은 다르다. 삭제 요청은 R2 원문과 복원 후 재삭제에도 적용해야 한다.
- 비밀 설정 `/etc/seollem-ai-lounge/storage.env`는 저장소에 커밋하지 않는다. R2 객체만으로 복호화할 수 없다. 복구 키는 별도로 관리한다.

복구는 운영 DB에 덮어쓰지 말고 새 경로로 내려받은 후 점검한다:

```
node server/scripts/backup-store.cjs restore <manifest-object-key> /secure/path/restore.sqlite
python3 -c "import sqlite3; c=sqlite3.connect('/secure/path/restore.sqlite'); print(c.execute('pragma integrity_check').fetchone())"
```

복구 검증 후 점검 시간에 앱을 중지하고 DB/WAL 처리·권한·삭제 요청 재적용을 확인한 후 교체한다. 실행 실패는 systemd 실패 상태 및 journal에 기록된다. 상태: `systemctl status seollem-archive.service seollem-backup.service`.
