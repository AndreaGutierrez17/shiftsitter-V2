import { NextResponse } from 'next/server';
import { aiIcebreakerSuggestion } from '@/ai/flows/ia-icebreaker-suggestion-flow';

type IcebreakerProfile = {
  id: string;
  name: string;
  location: string;
  childAge?: number;
  availability: string;
  needs: string;
  interests: string[];
  workplace: string;
};

type IcebreakerRequest = {
  currentUserProfile?: IcebreakerProfile;
  matchedUserProfile?: IcebreakerProfile;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IcebreakerRequest;
    if (!body?.currentUserProfile || !body?.matchedUserProfile) {
      return NextResponse.json(
        { error: 'Missing user profiles.' },
        { status: 400 }
      );
    }

    const response = await aiIcebreakerSuggestion({
      currentUserProfile: body.currentUserProfile,
      matchedUserProfile: body.matchedUserProfile,
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('Icebreakers API error:', error);
    const safeFallback = {
      icebreakerMessages: [
        `Hi ${bodySafeName(error)}. Would you like to compare availability for this week?`,
        'Before we plan a shift, would it help to confirm routines, care notes, and preferred timing?',
        'I can share my preferred times and handoff details first so we can see what fits best.',
      ],
      tips: [
        'Start with schedule overlap and the child’s routine instead of general small talk.',
        'Clarify pickup, drop-off, timing, and care notes before confirming a shift.',
        'Keep the first exchange focused on availability and expectations.',
      ],
    };
    return NextResponse.json(
      {
        ...safeFallback,
        warning: 'AI unavailable, fallback suggestions returned.',
      },
      { status: 200 }
    );
  }
}

function bodySafeName(_error: unknown): string {
  return 'there';
}
