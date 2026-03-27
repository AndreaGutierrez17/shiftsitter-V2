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

  if (/^(hola|hi|hello|hey|buenas)/.test(compact)) {
    return '¡Hola! Soy tu asistente de ShiftSitter 💙. Estoy aquí para ayudarte a organizar turnos, mejorar tu perfil o resolver dudas de cuidado. ¿En qué te ayudo hoy?';
  }

  if (compact.includes('confirm') || compact.includes('siguiente') || compact.includes('next')) {
    return '¡Perfecto! El siguiente paso es ponernos de acuerdo en los detalles prácticos: fecha, hora, rutinas del niño y el momento de entrega. Así todos estarán en la misma página.';
  }

  if (compact.includes('match') || compact.includes('perfil')) {
    return 'Revisar los perfiles es clave. Fíjate bien en la compatibilidad de horarios, distancias y rutinas de cuidado. ¡Recuerda que la confianza es lo más importante en ShiftSitter!';
  }

  if (compact.length <= 6) {
    return '¡Por supuesto! Si estás empezando, te sugiero que vayas al calendario o chatees con una familia para coordinar. ¿Quieres que te ayude a redactar un mensaje inicial?';
  }

  return '¡Claro que sí! Puedo ayudarte con consejos sobre horarios, perfiles, comunicación y cómo usar ShiftSitter de la mejor forma. Cuéntame un poco más de lo que necesitas y lo resolvemos.';
}

async function callGeminiAssistant(userProfile: string, query: string, apiKey: string): Promise<string | null> {
  const prompt = [
    'You are the ShiftSitter Assistant, an incredibly warm, friendly, and expert nanny/caregiver AI guide.',
    'IMPORTANT: Always answer politely in the EXACT same language the user writes in (e.g. if they say "hola", reply in natural conversational Spanish).',
    'Provide highly practical but very warm guidance for childcare coordination, schedules, trust, profile setup, messaging, and in-app workflow.',
    'If the user sends a short greeting like hello or hola, respond warmly first, then invite a relevant question.',
    'NEVER use cliché introductory phrases like "romper el hielo", "icebreaker", or "to break the ice". Speak naturally and softly.',
    'Keep the conversation open, empathetic, and helpful, but always anchor the answer to ShiftSitter matching, expectations, scheduling, or safe communication.',
    'If the question is completely outside scope, DO NOT shut the user down coldly. Briefly and politely redirect them to the closest useful ShiftSitter topic in a very warm, human way.',
    'Avoid flirting, dating language, or broad off-topic life advice.',
    'Do not sound defensive, robotic, or restrictive.',
    '',
    'User context:',
    userProfile,
    '',
    'Question:',
    query,
    '',
    'Answer in short friendly paragraphs, including emojis where suitable.',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\${encodeURIComponent(apiKey)}`,
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
