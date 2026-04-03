import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

const geminiApiKey =
  process.env.GOOGLE_GENAI_API_KEY ||
  process.env.GEMINI_API_KEY;

export const ai = genkit({
  plugins: [googleAI(geminiApiKey ? { apiKey: geminiApiKey } : {})],
  model: 'googleai/gemini-2.5-flash',
});
