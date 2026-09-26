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

## Security boundary

Preview workflow ทำงานเฉพาะ PR ที่มาจาก repository เดียวกัน เพื่อไม่ให้ fork PR เข้าถึง Cloudflare secrets

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

## Next phases

- TTL / garbage collection engine
- Authentication / access control สำหรับ Preview
- Runtime logs และ health checks
- Multi-project dashboard
- Database branching สำหรับ Postgres/Neon
- Resource quotas และ provider abstraction
