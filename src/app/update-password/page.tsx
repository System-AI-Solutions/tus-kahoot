import { Suspense } from 'react';
import { UpdatePasswordForm } from '@/components/UpdatePasswordForm';

export default function UpdatePasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[var(--radius-card)] bg-[var(--color-card)] p-8 text-sm text-[var(--color-muted)] shadow-lg">
            Checking your password update link...
          </div>
        </div>
      }
    >
      <UpdatePasswordForm />
    </Suspense>
  );
}
