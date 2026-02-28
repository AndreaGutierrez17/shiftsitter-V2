import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type AssistantRequest = {
  userProfile?: string;
  query?: string;
};

type AssistantResponseBody = {
  advice: string;
  source: 'ai' | 'fallback';
  warning?: string;
};

function buildFallbackAdvice(query: string): string {
  const text = query.toLowerCase();
  const compact = text.replace(/\s+/g, ' ').trim();

  if (
    compact === 'hi' ||
    compact === 'hello' ||
    compact === 'hey' ||
    compact === 'hola' ||
    compact === 'hello!' ||
    compact === 'hi!'
  ) {
    return 'Hello. I can help with matching, schedules, care requests, messaging, cancellations, reviews, and the next step after any update. What would you like to work through first?';
  }

  if (
    text.includes('confirm') ||
    text.includes('confirmation') ||
    text.includes('what next') ||
    text.includes('next step') ||
    text.includes('after accepting') ||
    text.includes('after confirmation')
  ) {
    return 'After a confirmation, the next step is to align on the practical details: date, time, handoff, routines, and any care notes. Then keep the conversation focused on expectations so both sides know exactly what the shift will look like.';
  }

  if (compact.length <= 4) {
    return 'No problem. If you are just getting started, the safest next step is usually to confirm timing, routines, handoff details, and any care notes. If you want, ask me what to send next and I will help you phrase it clearly.';
  }

  if (text.includes('match') || text.includes('compatible') || text.includes('profile')) {
    return 'Use the match details to compare schedule overlap, distance, safety alignment, and childcare fit. The strongest profiles are specific about routines, care needs, child ages, and what support they can offer in return.';
  }

  if (text.includes('message') || text.includes('chat') || text.includes('intro') || text.includes('ice') || text.includes('hello')) {
    return 'Start with something practical: confirm availability, child age, routines, handoff expectations, and how you prefer to coordinate. Keep the first message short and move quickly to care details and timing.';
  }

  if (text.includes('shift') || text.includes('calendar') || text.includes('schedule')) {
    return 'Before confirming a shift, make sure both sides agree on date, start time, end time, location, handoff details, and any care notes. If plans change, use the reschedule flow so both sides have a clear record.';
  }

  if (text.includes('cancel')) {
    return 'If you need to cancel, communicate early, be direct, and offer a replacement time if possible. Keep the note factual so the other family knows whether to reschedule or make other arrangements.';
  }

  if (text.includes('review') || text.includes('star') || text.includes('rating')) {
    return 'A strong review should mention reliability, communication, punctuality, and whether the care expectations matched what was agreed. Keep it specific, fair, and centered on the care exchange.';
  }

  if (text.includes('safe') || text.includes('trust') || text.includes('verify')) {
    return 'To build trust, keep verification current, confirm key details in writing before the shift, and make sure both sides understand pickup, drop-off, emergency contacts, and cancellation expectations.';
  }

  return 'I can help with scheduling, care requests, profile setup, communication, cancellations, reviews, and planning the next step clearly. If your question is broad, I will still help by narrowing it into the most useful next action inside ShiftSitter.';
}

async function callGeminiAssistant(userProfile: string, query: string, apiKey: string): Promise<string | null> {
  const prompt = [
    'You are ShiftSitter Assistant.',
    'Provide concise, practical, friendly guidance for childcare coordination, schedules, trust, communication, profile setup, cancellations, reviews, and in-app workflow.',
    'Always respond in English, even if the user writes in another language.',
    'If the user sends a short greeting like hello or hi, respond warmly first, then invite a relevant question.',
    'Treat broad, vague, or simple questions as valid. Helpfully infer the most likely ShiftSitter context and answer in a useful way.',
    'Keep the conversation open and helpful, but always anchor the answer to ShiftSitter workflows, childcare coordination, expectations, scheduling, messaging, reviews, or trust.',
    'If the question is clearly outside scope, do not shut the user down. Briefly redirect them to the closest useful ShiftSitter topic in a natural way.',
    'Avoid flirting, dating language, or broad off-topic life advice.',
    'Do not sound defensive, robotic, or restrictive.',
    '',
    'User context:',
    userProfile,
    '',
    'Question:',
    query,
    '',
    'Answer in short helpful paragraphs.',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 400,
        },
      }),
    }
  );

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Gemini request failed: ${response.status} ${details}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const advice = payload.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();

  return advice || null;
}

export async function POST(request: Request) {
  let safeQuery = '';

  try {
    const body = (await request.json()) as AssistantRequest;

    if (!body?.query || !body?.userProfile) {
      return NextResponse.json(
        { error: 'Missing query or userProfile.' },
        { status: 400 }
      );
    }

    safeQuery = body.query.trim().slice(0, 1200);
    const safeProfile = body.userProfile.trim().slice(0, 4000);
    const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || '';

    if (!apiKey) {
      return NextResponse.json(
        {
          advice: buildFallbackAdvice(safeQuery),
          source: 'fallback',
          warning: 'No server AI key detected.',
        } satisfies AssistantResponseBody,
        { status: 200 }
      );
    }

    try {
      const advice = await callGeminiAssistant(safeProfile, safeQuery, apiKey);
      if (advice) {
        return NextResponse.json(
          {
            advice,
            source: 'ai',
          } satisfies AssistantResponseBody,
          { status: 200 }
        );
      }
    } catch (error) {
      console.error('Gemini assistant request failed:', error);
    }

    return NextResponse.json(
      {
        advice: buildFallbackAdvice(safeQuery),
        source: 'fallback',
        warning: 'AI request failed. Using backup guidance.',
      } satisfies AssistantResponseBody,
      { status: 200 }
    );
  } catch (error) {
    console.error('Assistant API error:', error);
    return NextResponse.json(
      {
        advice: buildFallbackAdvice(safeQuery),
        source: 'fallback',
        warning: 'Assistant request could not be processed.',
      } satisfies AssistantResponseBody,
      { status: 200 }
    );
  }
}
