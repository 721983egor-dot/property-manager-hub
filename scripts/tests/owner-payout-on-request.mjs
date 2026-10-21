import fs from 'node:fs/promises';
process.env.PGLITE_MODULE=import.meta.resolve(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const source=await fs.readFile('scripts/tests/finance-task-receipt.mjs','utf8');
const cases=await fs.readFile('scripts/tests/owner-payout-on-request-cases.txt','utf8');
const marker="console.log('PASS: task receipt";
if(!source.includes(marker))throw new Error('Fixture insertion point missing');
const code=source.replace("process.env.PGLITE_MODULE=import.meta.resolve(process.env.PGLITE_MODULE||'@electric-sql/pglite');",'').replace(marker,cases+'\n'+marker);
await import('data:text/javascript,'+encodeURIComponent(code));
