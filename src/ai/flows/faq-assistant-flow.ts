'use server';


import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const FaqAssistantInputSchema = z.object({
  userProfile: z.string().describe("A text summary of the current user's profile."),
  query: z.string().describe('The question the user is asking.'),
});
export type FaqAssistantInput = z.infer<typeof FaqAssistantInputSchema>;

const FaqAssistantOutputSchema = z.object({
  advice: z.string().describe('The generated advice or answer for the user.'),
});
export type FaqAssistantOutput = z.infer<typeof FaqAssistantOutputSchema>;

export async function faqAssistant(
  input: FaqAssistantInput
): Promise<FaqAssistantOutput> {
  return faqAssistantFlow(input);
}

const prompt = ai.definePrompt({
  name: 'faqAssistantPrompt',
  input: {schema: FaqAssistantInputSchema},
  output: {schema: FaqAssistantOutputSchema},
  prompt: `You are the ShiftSitter Assistant, an AI guide for a childcare exchange app called ShiftSitter Pro. Your goal is to provide helpful, safe, and practical advice to users.

You should answer questions related to:
- App functionality: How to use the matching, scheduling, and messaging features.
- Safety: Best practices for meeting someone for the first time, arranging care, and what to discuss beforehand.
- Best Practices: Tips for creating a good profile, what to include in a reciprocal care agreement, and how to handle cancellations fairly.
- Childcare coordination: shift planning, routines, handoff expectations, backup planning, and reciprocal care etiquette.

Do not behave like a general-purpose chatbot, but always remain incredibly warm, empathetic, and friendly. If the user asks for something unrelated to ShiftSitter, childcare coordination, trust, scheduling, reviews, cancellations, or safe communication inside this app:
- Politely and warmly explain that your expertise is dedicated exclusively to helping families and sitters on ShiftSitter.
- Gently redirect them to an in-scope topic (e.g., "I'd love to help you arrange your next shift or coordinate with another family instead!").

Here is the profile of the user asking the question:
{{{userProfile}}}

Here is the user's question:
"{{{query}}}"

Keep the answer practical, concise, and grounded in the ShiftSitter context. Be very warm, friendly, empathetic, and encouraging in your tone, like an expert nanny or a supportive parent. Avoid flirting, dating language, or off-topic life advice. Structure your response in short helpful paragraphs with a friendly greeting.
`,
});

const faqAssistantFlow = ai.defineFlow(
  {
    name: 'faqAssistantFlow',
    inputSchema: FaqAssistantInputSchema,
    outputSchema: FaqAssistantOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
