# ใช้ Node.js version 20 (LTS) เป็น base image
FROM node:20-alpine

# กำหนด working directory ภายใน Container
WORKDIR /app

# คัดลอก package.json และ package-lock.json (ถ้ามี)
COPY package*.json ./

# ติดตั้ง dependencies
RUN npm install

# คัดลอก source code ทั้งหมดเข้า container
COPY . .

# เปิด port 5173 สำหรับการเข้าถึง Vite (port เริ่มต้นที่ 5173)
EXPOSE 5173

# สั่งรัน dev server และผูกกับทุก IP (--host) เพื่อให้เข้าถึงได้จากเครื่อง host (localhost)
CMD ["npm", "run", "dev", "--", "--host"]
