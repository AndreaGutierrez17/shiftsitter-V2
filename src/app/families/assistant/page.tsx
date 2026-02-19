'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AssistantPage() {
  return (
    <AuthGuard>
      <div className="ss-page-shell">
        <div className="ss-page-inner max-w-3xl">
          <Card className="ss-soft-card">
            <CardHeader>
              <CardTitle className="font-headline text-3xl">Assistant</CardTitle>
              <CardDescription>This module is temporarily disabled for MVP stabilization.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Coming soon.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  );
}
