import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('StudyMind uses Careerquis-compatible Next.js and Prisma foundation',()=>{const pkg=JSON.parse(read('package.json'));assert.ok(pkg.dependencies.next);assert.ok(pkg.dependencies['@prisma/client']);assert.ok(pkg.dependencies.stripe)});
test('AI platform key is server-side only',()=>{const client=read('src/lib/studymind-ai.ts');assert.match(client,/server-only/);assert.doesNotMatch(client,/NEXT_PUBLIC_STUDYMIND_AI_PLATFORM_API_KEY/)});
test('registration role is limited to student or lecturer',()=>{const route=read('src/app/api/auth/register/route.ts');assert.match(route,/\['STUDENT','LECTURER'\]/)});
