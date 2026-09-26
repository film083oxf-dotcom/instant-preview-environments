# Instant On-Demand Preview Environments — MVP

ระบบนี้ใช้ **Cloudflare Workers Previews + GitHub Actions + D1 + Gemini** เป็นแกนกลาง

## ทำอะไรได้แล้ว

1. เปิด PR → สร้าง Preview ชื่อ `pr-<PR_NUMBER>`
2. ได้ Preview URL สำหรับ PR
3. Push commit ใหม่ → อัปเดต Preview เดิม
4. แต่ละ PR มี D1 database แยกชื่อ `instant-preview-pr-<PR_NUMBER>`
5. PR ปิด → ลบ Preview และ D1 อัตโนมัติ
6. Preview fail → Gemini วิเคราะห์ workflow log และคอมเมนต์กลับเข้า PR
7. มี **Instant Preview Dashboard** สำหรับดูสถานะ Preview, D1 และ AI diagnosis
8. Dashboard ใช้ **central D1 control plane** ไม่พึ่ง GitHub API ใน runtime

## Architecture

```
Pull Request
    |
    v
GitHub Actions
    |
    +--> Central D1 control plane
    |      |
    |      +--> BUILDING / READY / FAILED
    |      +--> DELETING / DELETED
    |      +--> AI diagnosis state
    |
    +--> Preview Worker: pr-<PR>
    |      |
    |      +--> Isolated D1: instant-preview-pr-<PR>
    |      +--> Preview URL
    |
    +--> Gemini diagnosis on failure
    |
    v
Instant Preview Dashboard
```

## GitHub Secrets

Required:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

AI:
- `GEMINI_API_KEY`

Token ของ Cloudflare ต้องมีสิทธิ์ Workers ที่ใช้อยู่เดิม และ **D1 Edit** สำหรับจัดการฐานข้อมูล Preview/control plane

## Phase 6 — Multi-user authentication

ต้องตั้งค่า GitHub App และเพิ่ม GitHub Actions secrets ต่อไปนี้:

- `AUTH_GITHUB_CLIENT_ID`
- `AUTH_GITHUB_CLIENT_SECRET`
- `SESSION_SIGNING_KEY`

อย่าใส่ค่า secret เหล่านี้ลงใน repository. Cloudflare Wrangler รองรับ secrets แยกจาก vars และ Preview Base configuration สามารถแชร์ secret ไปยัง Preview ใหม่แต่ละตัวได้

Phase 6A ตอนนี้ทำหน้าที่เป็น **identity authentication**: ผู้ที่ล็อกอินด้วย GitHub จะผ่านการยืนยันตัวตนได้ก่อน

## Phase 6B — Authorization / RBAC

Phase 6B เพิ่ม platform membership:
- admin สามารถจัดการสิทธิ์จากหน้า /access
- member ใช้งาน Dashboard และ Preview ได้
- ผู้ใช้ที่ล็อกอินครั้งแรกจะถูกบันทึกใน central D1 แต่ยังไม่มีสิทธิ์จนกว่า admin จะ grant access
- เจ้าของ repository จะ bootstrap เป็น admin อัตโนมัติจาก GITHUB_REPO
- การ revoke จะมีผลกับ request ถัดไปทันที เพราะระบบตรวจ membership จาก central D1
- /db, Dashboard และ Preview ใช้ authorization เดียวกัน

## Phase 7 — Project-scoped authorization

Phase 7 เพิ่ม project layer เหนือ platform membership:
- central D1 มี `projects` และ `project_memberships`
- platform member ต้องมี project membership จึงใช้ project นั้นได้
- platform admin bypass project membership เพื่อการจัดการระบบ
- admin สามารถ Grant/Revoke project access จากหน้า `/access`
- การ revoke platform access จะ revoke project access ของ account นั้นด้วย
- repository ปัจจุบันถูก bootstrap เป็น project แรก โดยใช้ repo นี้เป็น project identity
- session/authentication เดิมยังใช้ร่วมกันได้ และ data model พร้อมต่อยอด multi-project

## Phase 8 — Runtime observability and readiness

Phase 8 adds lightweight operational visibility:
- every request gets an X-Request-Id
- structured request completion/failure logs include method, path, status, duration and environment
- /health remains a public liveness endpoint
- /ready checks the central control-plane D1, and Preview also checks its isolated D1
- Production and Preview workflows smoke-test /ready after deployment
## Phase 9 — Multi-project dashboard

Phase 9 makes the dashboard project-aware:
- each project has its own environment state in central D1
- dashboard lists only projects the signed-in user can access
- the project selector switches dashboard data without changing GitHub identity
- Preview lifecycle, cleanup, GC and AI diagnosis write state with a project key
- the legacy `environments` table remains mirrored for backward compatibility while `project_environments` is the multi-project source of truth
## Phase 10 — Resource Management

Phase 10 adds project-level capacity controls:
- `project_quotas` stores maximum active environments, maximum active databases, and maximum concurrent builds
- Preview provisioning acquires a short-lived D1 resource reservation before creating/updating infrastructure
- reservations expire after 30 minutes and are also purged by the garbage collector
- existing Preview Environments stay usable when a new deployment is blocked by quota
- admins can view and update quotas from `/access`
- the dashboard shows current resource usage and capacity

## Phase 11 — Provider Abstraction

Phase 11 isolates infrastructure-provider logic behind a small adapter interface:
- workflows call `scripts/provider-cli.mjs` for database provisioning/deletion and production deployment
- `scripts/provider.mjs` selects the configured provider (`cloudflare` by default)
- Cloudflare-specific API and Wrangler operations live in `scripts/providers/cloudflare.mjs`
- the control-plane, authorization, dashboard, and project resource model stay provider-neutral
- adding another provider becomes an adapter task instead of rewriting the control-plane authorization model

## Local

```bash
npm install
npm run typecheck
npm run dev
```

## Dashboard

Production Worker:
`https://instant-preview-environments.film083oxf.workers.dev`

Dashboard state เก็บใน central D1 ชื่อ `instant-preview-control-plane`

## Phase 5 — TTL / Garbage Collection

A scheduled GitHub Actions job runs every 30 minutes. Default policy is 24h for READY/FAILED environments and 6h for BUILDING/DELETING/DELETE FAILED states. Stale open PR environments are preserved by default; set `delete_stale_open` to `true` for an explicit cleanup run. Closed or missing PRs are eligible for direct reclamation.


- TTL / garbage collection engine (Phase 5)
- Multi-user authentication / access control สำหรับ Platform + Preview (Phase 6A/6B)
- Runtime logs และ health checks
- Multi-project dashboard
- Database branching สำหรับ Postgres/Neon
- Resource quotas และ provider abstraction
