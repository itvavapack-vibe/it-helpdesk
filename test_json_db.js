import dotenv from 'dotenv';
import { getPool } from './lib/db.js';

dotenv.config();

async function run() {
  const pool = getPool();
  try {
    const systemsObj = {
      userComputer: true,
      email: false
    };

    console.log('Attempting insert with raw object...');
    const [res1] = await pool.query(
      'INSERT INTO access_requests (ticket_number, name_th, department, position, systems) VALUES (?, ?, ?, ?, ?)',
      ['TEST-1001', 'ทดสอบ วัตถุ', 'IT', 'Staff', systemsObj]
    );
    console.log('Insert with raw object succeeded:', res1);
  } catch (err) {
    console.error('Insert with raw object FAILED:', err.message);
  }

  try {
    const systemsStr = JSON.stringify({
      userComputer: true,
      email: false
    });

    console.log('Attempting insert with stringified JSON...');
    const [res2] = await pool.query(
      'INSERT INTO access_requests (ticket_number, name_th, department, position, systems) VALUES (?, ?, ?, ?, ?)',
      ['TEST-1002', 'ทดสอบ ข้อความ', 'IT', 'Staff', systemsStr]
    );
    console.log('Insert with stringified JSON succeeded:', res2);
  } catch (err) {
    console.error('Insert with stringified JSON FAILED:', err.message);
  }

  process.exit(0);
}

run();
