/**
 * Next.js middleware entry point.
 *
 * Delegates to the Supabase session helper; see `src/lib/supabase/middleware.ts`
 * for what it does and why the redirect is not the security boundary.
 */

import type { NextRequest } from 'next/server';
import { updateSession } from './src/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image files. Auth cookies are
     * irrelevant to those, and running middleware on them wastes a request.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
