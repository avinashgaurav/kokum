import type Anthropic from '@anthropic-ai/sdk';

import { INGREDIENTS } from '../data/ingredients';
import type { Unit } from '../engine/types';
import { MODEL, getClient, noKey, toFailure, type AiResult } from './client';

/**
 * Turns a grocery list into structured pantry lines, from a photo, a voice transcript, or
 * typed text. Three sources, one parser: a bill, a handwritten list and a spoken list are
 * the same extraction problem wearing different clothes.
 *
 * Nothing here writes to the pantry. Every parse lands on a confirmation screen first,
 * because a silently-wrong quantity corrupts the depletion model in a way the user cannot
 * see. See AGENTS.md.
 */

export type ParseSource = 'bill' | 'list-photo' | 'shelf-photo' | 'voice' | 'manual';

export interface ParsedLine {
  /** Canonical id from the dictionary, or null when the parser could not match one. */
  ingredientId: string | null;
  /** Exactly as written or spoken, so the confirm screen can show the user their own words. */
  rawText: string;
  quantity: number;
  unit: Unit;
  /** Parser's own confidence, 0..1. Anything below 0.7 gets flagged on the confirm screen. */
  confidence: number;
  pricePaise?: number;
}

export interface ParseResult {
  lines: ParsedLine[];
  totalPaise?: number;
  /** Anything the model saw but could not turn into a line. Shown so nothing vanishes silently. */
  unparsed: string[];
}

/**
 * The closed vocabulary. Passing the dictionary in means the model resolves "kothmir",
 * "dhaniya" and "coriander" to one id rather than inventing three.
 */
function vocabulary(): string {
  return INGREDIENTS.map(
    (i) => `${i.id} (${i.unit}): ${[i.name, ...i.aliases].join(', ')}`,
  ).join('\n');
}

const LINE_SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ingredientId: {
            type: ['string', 'null'],
            description: 'Exact id from the vocabulary, or null if nothing matches.',
          },
          rawText: { type: 'string', description: 'The item exactly as it appeared.' },
          quantity: { type: 'number' },
          unit: { type: 'string', enum: ['g', 'ml', 'piece', 'bunch'] },
          confidence: { type: 'number' },
          pricePaise: { type: ['integer', 'null'] },
        },
        required: ['ingredientId', 'rawText', 'quantity', 'unit', 'confidence', 'pricePaise'],
        additionalProperties: false,
      },
    },
    totalPaise: { type: ['integer', 'null'] },
    unparsed: { type: 'array', items: { type: 'string' } },
  },
  required: ['lines', 'totalPaise', 'unparsed'],
  additionalProperties: false,
} as const;

function systemPrompt(source: ParseSource): string {
  const shared = `You extract grocery items into structured data for an Indian household pantry app.

Resolve every item to an id from this closed vocabulary. The id must be copied exactly; never invent one.

<vocabulary>
${vocabulary()}
</vocabulary>

Rules:
- Convert to the unit the vocabulary gives for that ingredient. 2 kg atta is 2000 g. 1 litre milk is 1000 ml. Half a kilo is 500 g.
- Indian quantity words: pav = 250 g, adha/aadha = half, dedh = 1.5, sawa = 1.25, paune = 0.75, ek = 1, do = 2, teen = 3, char = 4, paanch = 5.
- A "packet" or "pouch" with no weight: use the most common retail size for that item and set confidence to 0.5 so the user is asked.
- If an item is not in the vocabulary, put the original text in "unparsed". Do not force a bad match.
- Set ingredientId to null when you recognise a quantity but not the ingredient.
- confidence reflects how sure you are of the item AND its quantity together. Be honest; a low score costs one tap, a wrong quantity corrupts the pantry silently.`;

  switch (source) {
    case 'bill':
      return `${shared}
- This is a delivery invoice. It has exact quantities and prices, so confidence should be high.
- Record prices in paise as integers: Rs 45.50 is 4550.
- Ignore delivery fees, handling charges, taxes and discounts. Only real grocery items.
- Put the order total in totalPaise if you can see it.`;
    case 'list-photo':
      return `${shared}
- This is a handwritten or typed shopping list, possibly in Hindi, Marathi or Hinglish.
- Handwriting is often ambiguous. Lower confidence rather than guessing.
- Many list items have no quantity. Use a sensible weekly household amount and set confidence to 0.5.`;
    case 'shelf-photo':
      return `${shared}
- This is a photo of a shelf, counter or fridge. Identify what is visible.
- You cannot see inside containers and cannot judge weight reliably. Keep confidence at or below 0.6 for everything.
- Only list what you can actually see. Do not infer a stocked kitchen.`;
    case 'voice':
      return `${shared}
- This is a speech transcript, most likely Hinglish, and it may be garbled.
- Speech-to-text mangles ingredient names. Use the alias list generously: "dhaniya", "daniya", "dhania" are all coriander.
- Numbers may be spoken as words. "do kilo aata" is 2000 g of atta.`;
    case 'manual':
      return shared;
  }
}

async function run(
  client: Anthropic,
  source: ParseSource,
  content: Anthropic.MessageParam['content'],
): Promise<AiResult<ParseResult>> {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt(source),
      output_config: { format: { type: 'json_schema', schema: LINE_SCHEMA } },
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      return { ok: false, reason: 'refused', message: 'Claude declined to read that image.' };
    }

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      return { ok: false, reason: 'bad-output', message: 'Nothing came back from that.' };
    }

    return { ok: true, value: normalise(JSON.parse(text.text) as ParseResult) };
  } catch (err) {
    return toFailure<ParseResult>(err);
  }
}

/**
 * Belt and braces over the schema. Structured outputs guarantee the shape, not the meaning:
 * a hallucinated ingredient id would still be a valid string. Drop anything that does not
 * resolve against the real dictionary rather than writing a dangling reference into the pantry.
 */
function normalise(raw: ParseResult): ParseResult {
  const valid = new Set(INGREDIENTS.map((i) => i.id));
  const lines: ParsedLine[] = [];
  const unparsed = [...(raw.unparsed ?? [])];

  for (const line of raw.lines ?? []) {
    if (line.ingredientId && !valid.has(line.ingredientId)) {
      unparsed.push(line.rawText);
      continue;
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      unparsed.push(line.rawText);
      continue;
    }
    lines.push({
      ...line,
      confidence: Math.max(0, Math.min(1, line.confidence ?? 0.5)),
      pricePaise: line.pricePaise ?? undefined,
    });
  }

  return { lines, unparsed, totalPaise: raw.totalPaise ?? undefined };
}

/** Photo of a bill, a handwritten list, or a shelf. `base64` must be raw, no data: prefix. */
export async function parseImage(
  base64: string,
  mediaType: 'image/jpeg' | 'image/png',
  source: Extract<ParseSource, 'bill' | 'list-photo' | 'shelf-photo'>,
): Promise<AiResult<ParseResult>> {
  const client = await getClient();
  if (!client) return noKey();

  return run(client, source, [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
    { type: 'text', text: 'Extract every grocery item you can see.' },
  ]);
}

/** Voice transcript or typed text. */
export async function parseText(
  text: string,
  source: Extract<ParseSource, 'voice' | 'manual'> = 'voice',
): Promise<AiResult<ParseResult>> {
  const client = await getClient();
  if (!client) return noKey();
  return run(client, source, [{ type: 'text', text }]);
}
