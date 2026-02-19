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
        `Hi ${bodySafeName(error)}! I saw we matched. Would you like to coordinate availability this week?`,
        'Would you like to start with a quick intro about schedules and childcare needs?',
        'I can share my preferred times first if that helps us plan faster.',
      ],
      tips: [
        'Keep the first message short and friendly.',
        'Propose one concrete time option to make planning easy.',
        'Confirm expectations (drop-off, pick-up, and timing) early.',
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
