# Instant On-Demand Preview Environments — MVP

MVP นี้ใช้ **Cloudflare Workers Previews + GitHub Actions** เป็นแกนกลาง

## ทำอะไรได้แล้ว

1. เปิด PR → สร้าง Preview ชื่อ `pr-<PR_NUMBER>`
2. ได้ Preview URL สำหรับ PR
3. Push commit ใหม่ → อัปเดต Preview เดิม
4. PR ปิด → ลบ Preview ด้วย `wrangler preview delete`
5. ถ้า workflow ล้มเหลว → ให้ Gemini ช่วยวิเคราะห์ log (optional)

Cloudflare Workers Previews ปัจจุบันสร้าง environment แยกต่อ branch/PR, มี Preview URL ที่ชี้ไป deployment ล่าสุด และมีคำสั่งลบ Preview โดยตรง

## ก่อนใช้งาน

ต้องมี:
- GitHub repository
- Cloudflare account ที่เปิด Workers
- Node.js 22+ สำหรับ local development

สร้าง GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

สำหรับ AI เพิ่ม:
- `GEMINI_API_KEY`

> MVP นี้ตั้งใจไม่แจก Cloudflare secrets ให้ fork PR โดย workflow จะทำงานเฉพาะ PR ที่มาจาก repository เดียวกัน เพื่อหลีกเลี่ยงการเอา secret ไปอยู่ใน untrusted code path

## Local

```bash
npm install
npm run typecheck
npm run dev
```

สร้าง Preview local/remote:

```bash
npx wrangler preview --name demo-preview
```

ลบ:

```bash
npx wrangler preview delete --name demo-preview --skip-confirmation
```

## ขั้นต่อไป

- Dashboard แสดง PR / Environment / Status
- เก็บ state ลง D1 หรือ Postgres
- TTL เช่น auto-delete หลังไม่มี activity
- Preview-safe database branching ด้วย Neon
- AI วิเคราะห์ build/runtime error แบบอัตโนมัติ
- Access control สำหรับ Preview ที่ไม่ควรเปิดสาธารณะ
- รองรับหลาย provider ในอนาคต
