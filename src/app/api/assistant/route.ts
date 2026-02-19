import { NextResponse } from 'next/server';
import { faqAssistant } from '@/ai/flows/faq-assistant-flow';

export const runtime = 'nodejs';

type AssistantRequest = {
  userProfile?: string;
  query?: string;
};

export async function POST(request: Request) {
  try {
    const hasGenAiKey = Boolean(process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
    if (!hasGenAiKey) {
      return NextResponse.json(
        {
          advice:
            'Assistant is temporarily unavailable. Please try again shortly, or continue with matching and scheduling in the app.',
        },
        { status: 200 }
      );
    }

    const body = (await request.json()) as AssistantRequest;

    if (!body?.query || !body?.userProfile) {
      return NextResponse.json(
        { error: 'Missing query or userProfile.' },
        { status: 400 }
      );
    }

    const safeQuery = body.query.trim().slice(0, 1200);
    const safeProfile = body.userProfile.trim().slice(0, 4000);
    const response = await faqAssistant({
      userProfile: safeProfile,
      query: safeQuery,
    });

    if (!response?.advice) {
      return NextResponse.json(
        {
          advice:
            'I could not generate a response right now. Please retry in a moment.',
        },
        { status: 200 }
      );
    }
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Assistant API error:', error);
    return NextResponse.json(
      {
        advice:
          'I could not process that right now. Please try again in a moment.',
      },
      { status: 200 }
    );
  }
}
