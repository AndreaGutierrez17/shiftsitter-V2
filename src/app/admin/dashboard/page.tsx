import { requireAdminSession } from '@/lib/admin/server';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSession();

  return <>{children}</>;
}
