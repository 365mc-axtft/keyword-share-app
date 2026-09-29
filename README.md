# 365mc 검색 점유율 분석

Naver 검색결과 캡처를 업로드하면 브라우저에서 직접 OCR로 게시물을 인식하고,
TOP10과 365mc 관련 검색 점유율을 계산해 팀 간 공유 DB에 저장하는 사내 도구입니다.

**독립형 애플리케이션입니다.** 특정 회사의 기존 사이트나 서비스에 의존하지 않으며,
Postgres를 지원하는 어떤 Node.js 호스팅에도 배포할 수 있습니다. 유료 API나 외부
클라우드 서비스 없이도 100% 동작합니다 (OCR도 브라우저에서 무료로 처리됩니다).

## 구성

npm workspaces 모노레포입니다.

```
server/   Express + TypeScript API 서버, PostgreSQL(Knex), JWT 인증, Excel/PDF 리포트
web/      React + Vite + TypeScript 프런트엔드, 브라우저 OCR(Tesseract.js)
```

## 로컬 실행

### 1. 준비물

- Node.js 20 이상
- PostgreSQL 14 이상 (로컬 설치 또는 `docker-compose up -d`로 실행)

### 2. 설치

```bash
npm install
```

### 3. 환경변수 설정

```bash
cp .env.example server/.env      # 서버용 값 채우기 (DATABASE_URL, JWT_SECRET 등)
cp web/.env.example web/.env     # 프런트엔드 API 주소
```

`server/.env`에서 **반드시 바꿔야 하는 값**:

- `DATABASE_URL` — 실제 Postgres 접속 정보
- `JWT_SECRET` — `openssl rand -hex 32` 등으로 생성한 32자 이상 무작위 문자열

### 4. DB 마이그레이션 + 샘플 데이터

```bash
cd server
npm run migrate:latest   # 스키마 생성
npm run seed              # 2팀 x 2개월 샘플 데이터 (전부 "(샘플)" 표시, 실제 데이터와 격리)
```

시드가 만드는 로그인 계정: `demo@365mc-sample.local` / `Demo1234!`
(이 계정과 데이터는 전부 샘플이며, `company_id`가 달라 실제 회사 데이터와 절대 섞이지 않습니다.)

### 5. 개발 서버 실행

```bash
# 터미널 1
cd server && npm run dev     # http://localhost:4000

# 터미널 2
cd web && npm run dev        # http://localhost:5173
```

`http://localhost:5173/demo` 에서 로그인 없이 공개 시연 모드를 바로 확인할 수 있습니다.

### 6. 테스트

```bash
cd server && npm test    # 단위 테스트 + DB 통합 테스트 (Postgres 필요)
cd web && npm test       # OCR 세그멘테이션 단위 테스트
```

## 배포 (일반 Node 호스팅 공통)

이 앱은 특정 PaaS에 종속되지 않습니다. Node.js 20+와 아웃바운드 Postgres 연결이
가능한 곳이면 어디든 배포 가능합니다 (예: 자체 VM, Railway, Render, Fly.io, EC2 등 —
특정 업체를 전제하지 않았습니다).

### 서버 (`server/`)

```bash
cd server
npm run build        # dist/ 로 컴파일
npm run migrate:latest   # 배포 환경 DB에 대해 1회 실행
npm start             # node dist/index.js
```

필요한 환경변수는 `server/.env.example` 참고. 프로덕션에서는:

- `JWT_SECRET`을 새로 생성한 값으로 반드시 교체
- `WEB_ORIGIN`을 실제 프런트엔드 배포 도메인으로 설정 (CORS)
- `UPLOAD_DIR`은 재시작/재배포 후에도 유지되는 디스크 경로로 지정
  (컨테이너 환경이라면 영속 볼륨을 마운트하거나, `server/src/lib/storage.ts`의
  `LocalDiskStorage`를 S3 등 다른 어댑터로 교체 — 인터페이스가 이미 분리되어 있습니다)
- `PUBLIC_DEMO_ENABLED`를 조직 정책에 맞게 설정 (공개 인터넷에 시연을 노출하고
  싶지 않다면 `false`)

### 프런트엔드 (`web/`)

```bash
cd web
npm run build   # dist/ 에 정적 파일 생성 (Tesseract.js 워커/wasm/언어데이터 포함)
```

`dist/` 폴더를 정적 호스팅(Nginx, S3+CloudFront, Vercel/Netlify의 정적 사이트 등
무엇이든)에 올리면 됩니다. `web/.env`의 `VITE_API_BASE_URL`을 서버 배포 주소로
설정한 뒤 빌드하세요. **주의**: `web/dist/tesseract/` 안의 워커·wasm·언어데이터
파일이 반드시 함께 배포되어야 OCR이 동작합니다 (외부 CDN에 의존하지 않도록
일부러 자체 호스팅하는 파일들입니다).

### 데이터 소유권

DB 접속 정보(`DATABASE_URL`)만 바꾸면 어느 Postgres로든 옮길 수 있습니다.
서버 코드나 특정 벤더에 데이터가 잠기지 않습니다.

## 백업 / 복원

이 앱의 모든 상태는 PostgreSQL DB와 업로드 이미지 디렉터리(`UPLOAD_DIR`) 두 곳에만 있습니다.

**백업**

```bash
pg_dump "$DATABASE_URL" -F c -f backup.dump
tar -czf uploads-backup.tar.gz -C server ./uploads   # UPLOAD_DIR 경로에 맞게 조정
```

**복원**

```bash
pg_restore -d "$DATABASE_URL" --clean backup.dump
tar -xzf uploads-backup.tar.gz -C server
```

정기 백업은 운영 환경의 크론/관리형 DB 스냅샷 기능을 이용하세요. 이 저장소는
백업 스케줄러를 포함하지 않습니다(어떤 호스팅으로 가든 그 환경의 방식을 쓰는 것이
더 안전하기 때문입니다).

## 유료/외부 서비스 고지

- **OCR은 기본적으로 100% 무료·자체 호스팅**입니다 (브라우저에서 Tesseract.js로
  처리, 이미지가 서버 밖 외부 OCR API로 전송되지 않습니다).
- 유료 OCR 연동은 `server/.env`의 `PAID_OCR_PROVIDER`/`PAID_OCR_API_KEY`를
  **관리자가 직접 채우기 전까지 서버 코드가 강제로 비활성화**합니다. 즉, 사용자
  승인 없이 유료 API가 호출되는 경로가 없습니다.
- 무료 브라우저 OCR의 한계: 실제 인식 정확도는 캡처의 해상도·폰트·배경색에 따라
  달라지며, 검수 화면에서 사람이 확인·수정하는 것을 전제로 설계되었습니다.
  자세한 내용과 알려진 한계는 `COMPLETION_STATUS.md`를 참고하세요.
- 배포 자체의 서버/DB 호스팅 비용은 선택한 호스팅사 요금제에 따릅니다 (이 앱
  자체는 특정 유료 인프라를 요구하지 않습니다).

## 완료/미완료 현황

`COMPLETION_STATUS.md`에 무엇이 실제로 동작하고 무엇이 아직 검증되지 않았는지
정직하게 정리했습니다. 특히 **실제 Naver 캡처를 이용한 OCR 정확도 검증은 아직
수행되지 않았습니다** — 합성 테스트 통과만으로는 실제 정확도를 보장할 수 없으므로,
실사용 전에 반드시 실제 캡처로 검증해 보시길 권장합니다.
