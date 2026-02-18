'use client';

import { useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Bot, Send, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { faqAssistant } from '@/ai/flows/faq-assistant-flow';
import type { UserProfile } from '@/lib/types';
import { AuthGuard } from '@/components/AuthGuard';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function profileToText(data: Partial<UserProfile>): string {
  if (!data) return "No profile data available.";
  const name = data.name || "User";
  const location = data.location || "Unknown location";
  const role = data.role || "Not specified";
  const availability = data.availability || "Not specified";
  const needs = data.needs || "Not specified";

  return `Role: ${role}\nName: ${name}\nLocation: ${location}\nAvailability: ${availability}\nNeeds or Offers: ${needs}`;
}

export default function AssistantPage() {
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const quickPrompts = useMemo(
    () => [
      "How does reciprocal care work?",
      "Is it safe to leave my kids with someone from the app?",
      "What happens if the other parent cancels last minute?",
      "Can I use ShiftSitter if I work nights and weekends?",
    ],
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user?.uid || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const myProfileSnap = await getDoc(doc(db, "users", user.uid));
      const myProfile = myProfileSnap.exists() ? myProfileSnap.data() as UserProfile : {};

      const response = await faqAssistant({
          userProfile: profileToText(myProfile),
          query: userMessage.content,
      });

      if (!response.advice) {
        throw new Error("Assistant did not provide a response.");
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: response.advice }]);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "I could not process that right now. Please try again in a moment.";
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, there was an error. ${message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthGuard>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <main className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl w-full mx-auto">
            {messages.length === 0 && (
              <Card className="bg-transparent border-none shadow-none">
                <CardHeader className="text-center">
                  <CardTitle className="font-headline text-3xl">ShiftSitter Assistant</CardTitle>
                  <CardDescription>
                    Your AI guide for safety, matching, and childcare exchange best practices.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    {quickPrompts.map((prompt) => (
                      <Button
                        key={prompt}
                        variant="outline"
                        className="h-auto whitespace-normal text-left justify-start p-4"
                        onClick={() => setInput(prompt)}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-start gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <Avatar className="w-8 h-8 bg-primary text-primary-foreground flex-shrink-0">
                    <AvatarFallback>
                      <Bot className="w-5 h-5" />
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className={cn("max-w-xl rounded-2xl px-4 py-2", message.role === "user" ? 'bg-accent text-accent-foreground rounded-br-none' : 'bg-primary text-primary-foreground rounded-bl-none')}>
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                </div>

                {message.role === "user" && user && (
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={user.photoURL || ''} />
                    <AvatarFallback>
                      <User className="w-5 h-5" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-start gap-3 justify-start">
                <Avatar className="w-8 h-8 bg-primary text-primary-foreground flex-shrink-0">
                  <AvatarFallback>
                    <Bot className="w-5 h-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="max-w-md rounded-2xl p-3 bg-primary/80 flex items-center gap-2">
                  <span className="h-2 w-2 bg-primary-foreground rounded-full animate-pulse [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 bg-primary-foreground rounded-full animate-pulse [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 bg-primary-foreground rounded-full animate-pulse" />
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t bg-background max-w-3xl w-full mx-auto">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about matching, safety, or schedules..."
                className="flex-grow"
                disabled={isLoading || authLoading}
              />
              <Button type="submit" size="icon" disabled={isLoading || authLoading || !input.trim()}>
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

