/**
 * Sign-out handler.
 *
 * A POST rather than a GET: sign-out changes state, and a GET route would let
 * any page log a user out by embedding an image tag pointing at it.
 *
 * @module
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/signin', request.url), { status: 303 });
}
