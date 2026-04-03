import { redirect } from 'next/navigation';

export default function EmployersOnboardingRedirectPage() {
  redirect('/employers/settings');
}
