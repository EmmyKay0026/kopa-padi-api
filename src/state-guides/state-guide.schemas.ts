import { z } from 'zod';

const shortText = z.string().trim().min(1).max(300);
const prose = z.string().trim().min(1).max(12000);
const httpsUrl = z.string().trim().max(2048).url().refine(value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } }, 'Use an HTTPS URL');
const optionalHttpsUrl = z.union([z.literal(''), httpsUrl]);
const photoSource = z.string().trim().max(2048).refine(value => {
  if (/^\/(?!\/)/.test(value) && !/[\\\r\n]/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'images.unsplash.com' || (url.hostname === 'picsum.photos' && url.pathname.startsWith('/seed/'))); }
  catch { return false; }
}, 'Use a local image path, images.unsplash.com URL, or picsum.photos/seed/ URL');
const reviewDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Use a valid review date');

export const stateGuideWriteSchema = z.object({
  version: z.number().int().min(0),
  secretariat: z.object({
    address: prose,
    phoneNumber: z.string().trim().min(5).max(100).regex(/^[+\d\s()\-.,/]+$/),
    email: z.string().trim().max(254).email(),
    sourceUrl: optionalHttpsUrl,
    googleMapsUrl: optionalHttpsUrl,
  }).strict(),
  information: z.object({
    capital: shortText, geopoliticalZone: shortText, overview: prose,
    spokenLanguages: prose, culturalHighlights: prose, localFood: prose, placesToVisit: prose,
    weatherAndClimate: prose, transportOptions: prose, travelSafetyNotes: prose, costOfLiving: prose, pcmTips: prose,
  }).strict(),
  research: z.object({
    reviewedOn: reviewDate,
    status: z.enum(['draft', 'researched_editorial_draft_requires_local_verification', 'verified']),
    notes: prose,
    sources: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/), z.array(httpsUrl).max(30)).refine(value => Object.keys(value).length <= 20),
    sourceCaveats: z.array(prose).max(30),
    dynamicFieldsRequireRefresh: z.array(z.enum(['travelSafetyNotes', 'costOfLiving', 'transportOptions', 'pcmTips', 'weatherAndClimate'])).max(5),
  }).strict(),
  photos: z.array(z.object({ src: photoSource, alt: shortText, caption: z.string().trim().min(1).max(2000), illustrative: z.boolean() }).strict()).max(20),
  expectations: z.array(z.object({ title: shortText, description: prose }).strict()).max(30),
}).strict();

export type StateGuideInput = z.infer<typeof stateGuideWriteSchema>;
