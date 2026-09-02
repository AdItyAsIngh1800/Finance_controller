/**
 * Proxy — what Next.js called Middleware before 16.
 *
 * Lives at `src/proxy.ts`, beside `app`, which is where Next looks when the
 * application is inside `src`. It was previously `middleware.ts` at the repo
 * root: `next build` still honoured that, but `next dev` did not, so local
 * development ran with no gate at all while production had one. A control that
 * is absent in exactly the environment where it is written is worse than no
 * control, because it is never noticed.
 *
 * Delegates to the Supabase session helper; see `src/lib/supabase/middleware.ts`
 * for what it does and why the redirect is not the security boundary. Next's own
 * documentation is explicit that proxy "should not be used as a full session
 * management or authorization solution" — it is an optimistic check that keeps
 * signed-out visitors off signed-in screens. The real controls are the
 * `getCurrentUser()` call on each protected page and, beneath that, row-level
 * security.
 */

import type { NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export async function proxy(request: NextRequest) {
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
