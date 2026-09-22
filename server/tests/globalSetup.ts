import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const TMP = path.join(__dirname, '.tmp');
export const TEMPLATE_DB = path.join(TMP, 'template.db');

export default function globalSetup(): void {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.closeSync(fs.openSync(TEMPLATE_DB, 'w'));

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB}` },
    stdio: 'ignore',
  });
}
