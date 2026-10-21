import fs from 'node:fs/promises';
process.env.PGLITE_MODULE=import.meta.resolve(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const source=await fs.readFile('scripts/tests/finance-task-installments.mjs','utf8');
const cases=await fs.readFile('scripts/tests/finance-recurring-series-cases.txt','utf8');
const code=source.replace("process.env.PGLITE_MODULE=import.meta.resolve(process.env.PGLITE_MODULE||'@electric-sql/pglite');",'').replace('await db.close();',()=>cases+'\nawait db.close();');
await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
