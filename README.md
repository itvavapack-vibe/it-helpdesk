# IT Helpdesk

ระบบแจ้งซ่อม IT + Admin panel (React + Vite) และ API เชื่อม MySQL

## Deploy บน Vercel (แทนเซิร์ฟเวอร์เก่า)

### สิ่งที่เปลี่ยน

- Frontend: build เป็น static ที่ `dist/`
- API: Vercel Serverless Functions ในโฟลเดอร์ `api/` (แทน `server.js` แบบพอร์ต 4000)
- GLPI: ใช้ `/glpi-proxy` ผ่าน `api/glpi/[...path].js` (ไม่ต้องตั้ง CORS ที่ Apache)

### ข้อกำหนด MySQL

ฐานข้อมูลต้อง **เข้าถึงได้จากอินเทอร์เน็ต** (Vercel รันบน cloud ไม่ต่อ LAN `192.168.x.x` โดยตรง)

ตัวเลือก:

1. ใช้ MySQL บน Ubuntu เดิม แต่เปิดพอร์ต + firewall ให้เฉพาะ IP ที่จำเป็น หรือ VPN
2. ย้ายไป cloud MySQL (Railway, Aiven, ฯลฯ) แล้ว import `schema_mysql.sql`

### ขั้นตอนใน Vercel Dashboard

1. Import โปรเจกต์จาก GitHub: `itvavapack-vibe/it-helpdesk`
2. ถ้า repo อยู่ในโฟลเดอร์ย่อย ให้ตั้ง **Root Directory** = `it-helpdesk`
3. Framework Preset: **Other** (ใช้ `vercel.json` ที่มีอยู่แล้ว)
4. ตั้ง **Environment Variables** (Production + Preview):

| ตัวแปร | ค่าตัวอย่าง |
|--------|------------|
| `DB_HOST` | host ของ MySQL |
| `DB_PORT` | `3306` |
| `DB_NAME` | `helpdsk_db` |
| `DB_USER` | user สำหรับแอป |
| `DB_PASSWORD` | รหัสผ่าน |
| `DB_SSL` | `true` ถ้า provider บังคับ SSL |
| `VITE_GLPI_URL` | `https://.../glpi` |
| `VITE_GLPI_APP_TOKEN` | token จาก GLPI |
| `VITE_GLPI_USER_TOKEN` | user token |
| `VITE_USE_GLPI_PROXY` | `true` |
| `VITE_API_URL` | *(เว้นว่าง)* |

5. Deploy — หลังสำเร็จทดสอบ:
   - `https://<your-app>.vercel.app/api/health`
   - เปิดหน้าเว็บ → แท็บ Admin → ล็อกอิน

### แทนที่ deployment เก่า

ใน Vercel → Project → **Settings → Domains** ผูกโดเมนเดิมกับ deployment ใหม่ หรือลบโปรเจกต์เก่าแล้วชี้ DNS มาที่โปรเจกต์นี้

### Deploy จากเครื่อง (CLI)

```bash
cd it-helpdesk
npm install
npx vercel login
npx vercel --prod
```

---

## รันบน Ubuntu / Docker (เดิม)

### โครงสร้างหลัก

- `server.js` — API สำหรับ dev/local (พอร์ต 4000)
- `api/` + `lib/` — logic เดียวกันสำหรับ Vercel
- `src/supabaseClient.js` — client เรียก `/api`
- `docker-compose.yml` — frontend + API + MySQL

### Ubuntu

```bash
git clone <repository-url>
cd it-helpdesk
cp .env.example .env
# แก้ DB_*, VITE_API_URL=http://<server-ip>:4000
docker-compose up --build -d
```

- Frontend: `http://<server-ip>:5173`
- API health: `http://<server-ip>:4000/api/health`

### Local Windows

```bash
npm install
npm run start:api   # terminal 1
npm run dev         # terminal 2
```

---

## หมายเหตุ

- อย่า commit `.env` (อยู่ใน `.gitignore`)
- รหัส admin เก็บใน MySQL แบบ plain text — ควร hash ใน production จริงจัง
