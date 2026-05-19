# IT Helpdesk Deployment

## เป้าหมาย

ให้ระบบนี้รันบน Ubuntu เป็น backend/app จบในเครื่องเดียว และใช้ Git ในการแก้ไขจากอีกเครื่องแล้ว Push ขึ้นมาได้

## โครงสร้างหลัก

- `server.js` - Backend API ที่เชื่อม MySQL
- `src/supabaseClient.js` - Proxy client สำหรับเรียก API แทน Supabase โดยตรง
- `docker-compose.yml` - รันทั้ง frontend และ backend ใน container เดียวกัน
- `.env` - ตั้งค่า environment สำหรับ MySQL, GLPI และ API

## เรียกใช้งานบน Ubuntu

1. Clone repository บน Ubuntu

```bash
git clone <repository-url>
cd it-helpdesk
```

2. สร้างไฟล์ `.env` โดยคัดลอกจาก `.env.example`

```bash
cp .env.example .env
```

3. แก้ค่าตามเครื่องของคุณ

- `DB_HOST` = `192.168.40.130`
- `DB_PORT` = `3306`
- `DB_NAME` = `helpdsk_db`
- `DB_USER` = `fight`
- `DB_PASSWORD` = `vava1234`
- `VITE_API_URL` = `http://<ubuntu-server-ip>:4000` (ถ้าเข้าจากเครื่องอื่น)

4. สั่งรัน Docker Compose

```bash
docker-compose up --build -d
```

5. เปิดหน้าเว็บจากเครื่องอื่น

- Frontend: `http://<ubuntu-server-ip>:5173`
- Backend health: `http://<ubuntu-server-ip>:4000/api/health`

> ถ้าเข้าจากเครื่องอื่น ให้เปิด port 5173 และ 4000 ใน firewall ของ Ubuntu

## ถ้าอยากแก้โค้ดจากอีกเครื่อง

1. แก้ในเครื่องพัฒนา
2. `git add .`
3. `git commit -m "แก้ไข..."`
4. `git push`

## รีเฟรชบน Ubuntu

บน Ubuntu server:

```bash
git pull

docker-compose up --build -d
```

หรือถ้าไม่ใช้ Docker:

```bash
npm install
npm run start:api
npm run dev
```

## หมายเหตุ

- `.env` อยู่ใน `.gitignore` อยู่แล้ว ดังนั้นไม่ควร commit ข้อมูลความลับ
- ควรใช้ `.env.example` เป็น template ของไฟล์ environment
- ระบบนี้ยังเป็นแบบใช้งานได้ผ่าน Vite (สำหรับ dev) ถ้าต้องการ production แบบจริงจัง อาจต้องเพิ่ม web server สำหรับ static build ต่อไป
