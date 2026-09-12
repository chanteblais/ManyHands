import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
dotenv.config({ path: path.join(ROOT, '.env.local') });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const STYLE = `Mystical occult icon, dark background (#1A0A24 deep purple-black), glowing gold (#C8A848) and purple (#D239F8) colors, ornate linework, celestial/alchemical aesthetic, square format, suitable for a dark fantasy camp community website. No text. Clean symbolic illustration.`;

const departments = [
  { name: 'aesthetic-operations',    prompt: `${STYLE} Subject: an ornate hand mirror with decorative flourishes and a crescent moon, symbolizing beauty and artistic vision.` },
  { name: 'attunement-operations',   prompt: `${STYLE} Subject: a glowing tuning fork surrounded by radiating sound waves and small stars, symbolizing harmony and attunement.` },
  { name: 'ceremonial-affairs',      prompt: `${STYLE} Subject: a ritual chalice with flames rising and celestial symbols, symbolizing ceremony and sacred gatherings.` },
  { name: 'illumination-electrical', prompt: `${STYLE} Subject: a lightning bolt intertwined with an eye and radiating light rays, symbolizing illumination and electrical power.` },
  { name: 'logistics-relocation',    prompt: `${STYLE} Subject: an ornate compass overlaid with a cart wheel and rope knot, symbolizing logistics and movement.` },
  { name: 'nourishment',             prompt: `${STYLE} Subject: a decorative cauldron with herbs and steam spiraling upward into stars, symbolizing nourishment and communal cooking.` },
  { name: 'operational-continuity',  prompt: `${STYLE} Subject: an ouroboros serpent (snake eating its tail) encircling a gear, symbolizing continuity and sustained operations.` },
];

const OUT = path.join(ROOT, 'public');

for (const dept of departments) {
  process.stdout.write(`Generating: ${dept.name}... `);
  try {
    const res = await openai.images.generate({
      model: 'gpt-image-2',
      prompt: dept.prompt,
      n: 1,
      size: '1024x1024',
    });
    const item = res.data[0];
    const dest = path.join(OUT, `dept_${dept.name}.png`);
    if (item.b64_json) {
      fs.writeFileSync(dest, Buffer.from(item.b64_json, 'base64'));
    } else {
      // url response — fetch and save
      const { default: https } = await import('https');
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(item.url, r => r.pipe(file).on('finish', resolve).on('error', reject));
      });
    }
    console.log(`✓ saved dept_${dept.name}.png`);
  } catch (e) {
    console.log(`✗ ${e.message}`);
  }
}
console.log('\nDone.');
