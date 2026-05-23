import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ForgotPasswordForm } from '@/components/ForgotPasswordForm';

export default async function ForgotPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return <ForgotPasswordForm />;
}
