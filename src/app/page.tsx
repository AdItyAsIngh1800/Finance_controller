/**
 * Root route.
 *
 * Sends signed-in users to their datasets and everyone else to sign-in. There
 * is no marketing landing page: this is a working tool, and the first thing a
 * reviewer should see is either the product or the door to it.
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';

export default async function HomePage(): Promise<never> {
  const user = await getCurrentUser();
  redirect(user === null ? '/signin' : '/datasets');
}
