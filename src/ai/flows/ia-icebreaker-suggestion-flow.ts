'use server';
/**
 * @fileOverview A Genkit flow for generating personalized icebreaker messages and tips for newly matched users.
 *
 * - aiIcebreakerSuggestion - A function that handles the generation of icebreaker suggestions.
 * - AiIcebreakerSuggestionInput - The input type for the aiIcebreakerSuggestion function.
 * - AiIcebreakerSuggestionOutput - The return type for the aiIcebreakerSuggestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const UserProfileSchema = z.object({
  id: z.string().describe('The unique identifier of the user.'),
  name: z.string().describe('The name of the user.'),
  location: z.string().describe('The general location of the user (e.g., "Baltimore, MD").'),
  childAge: z
    .number()
    .optional()
    .describe('The age of the child if the user is a parent.'),
  availability: z.string().describe('User\'s availability for shifts.'),
  needs: z.string().describe('Specific childcare needs if the user is a parent.'),
  interests: z.array(z.string()).describe('A list of user interests or hobbies.'),
  workplace: z.string().describe('The user\'s workplace or profession.'),
});

const AiIcebreakerSuggestionInputSchema = z.object({
  currentUserProfile: UserProfileSchema.describe(
    'The profile of the current user who needs icebreaker suggestions.'
  ),
  matchedUserProfile: UserProfileSchema.describe(
    'The profile of the user the current user has just matched with.'
  ),
});
export type AiIcebreakerSuggestionInput = z.infer<
  typeof AiIcebreakerSuggestionInputSchema
>;

const AiIcebreakerSuggestionOutputSchema = z.object({
  icebreakerMessages:
    z.array(z.string()).describe('A list of personalized icebreaker messages for the matched user.'),
  tips: z.array(z.string()).describe('A list of helpful tips for starting a conversation.'),
});
export type AiIcebreakerSuggestionOutput = z.infer<
  typeof AiIcebreakerSuggestionOutputSchema
>;

export async function aiIcebreakerSuggestion(
  input: AiIcebreakerSuggestionInput
): Promise<AiIcebreakerSuggestionOutput> {
  return aiIcebreakerSuggestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'aiIcebreakerSuggestionPrompt',
  input: {schema: AiIcebreakerSuggestionInputSchema},
  output: {schema: AiIcebreakerSuggestionOutputSchema},
  prompt: `You are an AI assistant designed to help users start conversations after a new match on ShiftSitter Pro.
Your goal is to generate personalized icebreaker messages and helpful tips based on the profiles of the two matched users.

Here is the current user's profile (the one who needs the suggestions):
Name: {{{currentUserProfile.name}}}
Location: {{{currentUserProfile.location}}}
Availability: {{{currentUserProfile.availability}}}
Interests: {{#each currentUserProfile.interests}}- {{{this}}}
{{/each}}
{{#if currentUserProfile.childAge}}Child's Age: {{{currentUserProfile.childAge}}}
{{/if}}
{{#if currentUserProfile.needs}}Needs: {{{currentUserProfile.needs}}}
{{/if}}
Workplace: {{{currentUserProfile.workplace}}}

Here is the profile of the user they just matched with:
Name: {{{matchedUserProfile.name}}}
Location: {{{matchedUserProfile.location}}}
Availability: {{{matchedUserProfile.availability}}}
Interests: {{#each matchedUserProfile.interests}}- {{{this}}}
{{/each}}
{{#if matchedUserProfile.childAge}}Child's Age: {{{matchedUserProfile.childAge}}}
{{/if}}
{{#if matchedUserProfile.needs}}Needs: {{{matchedUserProfile.needs}}}
{{/if}}
Workplace: {{{matchedUserProfile.workplace}}}

Based on these profiles, generate:
1.  Three personalized icebreaker messages that the current user can send to their match. They should be friendly, engaging, and make specific references to shared interests, complementary availability, or specific needs/offers mentioned in their profiles.
2.  Three helpful tips for breaking the ice and maintaining a good conversation, keeping in mind the context of a childcare matching app.

Ensure the messages are respectful and appropriate for a professional yet friendly context.`,
});

const aiIcebreakerSuggestionFlow = ai.defineFlow(
  {
    name: 'aiIcebreakerSuggestionFlow',
    inputSchema: AiIcebreakerSuggestionInputSchema,
    outputSchema: AiIcebreakerSuggestionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
