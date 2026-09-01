import { isAuthenticated } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect('/admin/login');
  return <AdminShell>{children}</AdminShell>;
}
