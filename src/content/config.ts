import { defineCollection, reference, z } from 'astro:content';

const saisons = defineCollection({
  type: 'content',
  schema: z.object({
    number: z.number(),
    years: z.string(),
    ongoing: z.boolean().default(false),
  }),
});

const emissions = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    number: z.number().optional(),
    season: reference('saisons'),
    pubDate: z.date(),
    diffusion: z.string().optional(),
    audioUrl: z.string().url().optional(),
    rssPlayerId: z.string().optional(),
    excerpt: z.string(),
    draft: z.boolean().default(true),
  }),
});

export const collections = { saisons, emissions };
