'use client';

import { useMemo, useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Send, Loader2 } from 'lucide-react';

type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: 'ai' | 'fallback';
};

const QUICK_PROMPTS = [
  'How should I introduce myself after a new match?',
  'What should I confirm before accepting a shift?',
  'How do I handle a last-minute cancellation fairly?',
  'What should I include in my profile to build trust?',
];

export default function AssistantPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const createMessage = (
    role: 'user' | 'assistant',
    content: string,
    source?: 'ai' | 'fallback'
  ): AssistantMessage => ({
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    source,
  });

  const userProfileSummary = useMemo(() => {
    if (!user) return 'Authenticated ShiftSitter user. Profile details unavailable in this view.';
    return `Signed-in ShiftSitter user. UID: ${user.uid}. Email: ${user.email || 'not available'}.`;
  }, [user]);

  const askAssistant = async (rawQuery?: string) => {
    const nextQuery = (rawQuery ?? query).trim();
    if (!nextQuery || isLoading) return;

    setIsLoading(true);
    if (!rawQuery) setQuery('');
    setMessages((prev) => [...prev, createMessage('user', nextQuery)]);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: nextQuery,
          userProfile: userProfileSummary,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { advice?: string; source?: 'ai' | 'fallback' };
      const advice =
        typeof payload.advice === 'string' && payload.advice.trim()
          ? payload.advice.trim()
          : 'I could not answer that right now. Please try again in a moment.';

      setMessages((prev) => [
        ...prev,
        createMessage('assistant', advice, payload.source === 'ai' ? 'ai' : 'fallback'),
      ]);
    } catch (error) {
      console.error('Assistant page request failed:', error);
      setMessages((prev) => [
        ...prev,
        createMessage('assistant', 'I could not answer that right now. Please try again in a moment.', 'fallback'),
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthGuard>
      <div className="ss-page-shell" lang="en" translate="no">
        <div className="ss-page-inner max-w-4xl">
          <Card className="ss-soft-card">
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2 text-3xl">
                <Sparkles className="h-7 w-7 text-primary" />
                ShiftSitter Assistant
              </CardTitle>
              <CardDescription>
                A quick place to get practical guidance on scheduling, communication, profile setup, and care coordination.
              </CardDescription>
              <p className="text-sm leading-6 text-muted-foreground">
                I can help you think through schedules, communication, care expectations, trust, profile details, cancellations, and reviews.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-2 sm:grid-cols-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    className="justify-start whitespace-normal text-left"
                    onClick={() => askAssistant(prompt)}
                    disabled={isLoading}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>

              {messages.length > 0 || isLoading ? (
                <div className="rounded-2xl border bg-white p-4">
                  <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={message.role === 'assistant' ? 'rounded-2xl bg-slate-50 p-3 text-sm text-slate-700' : 'rounded-2xl bg-primary/10 p-3 text-sm text-foreground'}
                      >
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {message.role === 'assistant' ? 'Assistant' : 'You'}
                      </p>
                        <p className="whitespace-pre-wrap leading-6">{message.content}</p>
                      </div>
                    ))}
                    {isLoading ? (
                      <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Thinking...
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void askAssistant();
                }}
                className="space-y-3"
              >
                <Textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ask about planning schedules, handling care requests, setting expectations, or keeping communication clear..."
                  rows={4}
                  maxLength={600}
                  disabled={isLoading}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{query.length}/600</p>
                  <Button type="submit" disabled={isLoading || !query.trim()}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Ask Assistant
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  );
}
