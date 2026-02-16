import { NextResponse } from 'next/server';

type VerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};

export async function POST(req: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'missing_secret' }, { status: 500 });
  }

  const body = await req.json().catch(() => null) as { token?: string } | null;
  const token = body?.token || '';
  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 });
  }

  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);

  const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });

  if (!verifyRes.ok) {
    return NextResponse.json({ ok: false, error: 'verify_failed' }, { status: 502 });
  }

  const result = (await verifyRes.json().catch(() => null)) as VerifyResponse | null;
  if (!result?.success) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
