import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');

    const pkgRaw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgRaw || '{}');
    const version = String(pkg?.version || '0.0.0');

    let changelog = '';
    try {
      changelog = await fs.readFile(changelogPath, 'utf8');
    } catch {
      changelog = '';
    }

    return NextResponse.json(
      {
        ok: true,
        version,
        copyright: 'mbs2026',
        changelog,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
