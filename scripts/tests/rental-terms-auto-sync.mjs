// Isolated PostgreSQL regression: no production connection or real client data.
import fs from 'node:fs/promises';
process.env.PGLITE_MODULE = import.meta.resolve(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const original = await fs.readFile('scripts/tests/crm-commission.mjs', 'utf8');
const setup = original.slice(0, original.indexOf('const terms='));
const financeTest = await fs.readFile('scripts/tests/booking-finance-sync.mjs', 'utf8');
// Reuse its minimal finance schema and real migrations, before any booking scenarios.
const scaffold = financeTest.slice(financeTest.indexOf('const scenarios=`') + 'const scenarios=`'.length, financeTest.indexOf('const year='));
const scenarios = String.raw`
for (const file of ['20261019120000_daily_rental_period_prices.sql','20261019140000_rental_terms_auto_sync.sql']) await db.exec(await fs.readFile('supabase/migrations/'+file,'utf8'));
const year = Number((await db.query('SELECT extract(year from now()) y')).rows[0].y)+1;
const terms = {property_id:id(20),client_id:id(30),start_date:year+'-01-19',end_date:year+'-08-22',price_type:'fixed',price_month:140000,payment_day:21,deposit:100000,source:'website',status:'active',comment:'',stay_kind:'long_term',periods:[]};
await db.query("INSERT INTO finance_counterparties(id,name,kind) VALUES($1,'Test owner','owner')",[id(800)]);
await db.query('INSERT INTO finance_object_settings(property_id,owner_counterparty_id,payout_day) VALUES($1,$2,25)',[id(20),id(800)]);
const b = (await db.query('SELECT finance_save_booking(NULL,$1,$2) id',[terms,id(90)])).rows[0].id;
const rows = async()=> (await db.query('SELECT *,planned_date::text date FROM payments WHERE booking_id=$1 AND rental_schedule ORDER BY planned_date',[b])).rows;
let payments=await rows();assert.equal(payments.length,8);assert.equal(Number(payments.at(-1).amount),13548.39);
await db.query("UPDATE payments SET status='paid',paid_at=planned_date,paid_amount=amount WHERE id=$1",[payments[0].id]);
await db.query("UPDATE payments SET status='partial',paid_at=planned_date,paid_amount=1000 WHERE id=$1",[payments[1].id]);
const history=(await rows()).slice(0,2);
await db.query('UPDATE properties SET management_fee_value=15 WHERE id=$1',[id(20)]);
payments=await rows();assert.ok(payments.slice(2).every(p=>Number(p.company_fee)===Math.round(Number(p.amount)*15)/100));assert.deepEqual(payments.slice(0,2),history);
assert.equal(Number(payments[2].amount)-Number(payments[2].company_fee),119000,'owner forecast follows changed commission');
assert.equal(Number((await db.query('SELECT o.amount FROM finance_obligations o JOIN finance_owner_settlements s ON s.obligation_id=o.id WHERE s.property_id=$1 AND s.period=$2',[id(20),year+'-01-01'])).rows[0].amount),126000,'received owner liability retains original commission');
const changed={...terms,price_month:160000,management_fee_type:'percent',management_fee_value:20};
await db.query('SELECT finance_save_booking($1,$2,$3)',[b,changed,id(90)]);
payments=await rows();assert.ok(payments.slice(2,-1).every(p=>Number(p.amount)===160000&&Number(p.company_fee)===32000));assert.equal(Number(payments.at(-1).amount),15483.87);assert.equal(Number(payments.at(-1).company_fee),3096.77);assert.deepEqual(payments.slice(0,2),history);
await db.query("UPDATE properties SET management_fee_type='amount',management_fee_value=5000 WHERE id=$1",[id(20)]);
payments=await rows();assert.equal(Number(payments.at(-1).company_fee),483.87);assert.deepEqual(payments.slice(0,2),history);
await assert.rejects(db.query('SELECT finance_save_booking($1,$2,$3)',[b,{...changed,price_month:170000,management_fee_value:101},id(90)]),/комисси/);
assert.equal(Number((await db.query('SELECT price_month FROM bookings WHERE id=$1',[b])).rows[0].price_month),160000,'invalid commission rolls price back too');
// A separate advance/balance agreement retains its explicit fee and amounts.
await db.query('SELECT finance_create_rental_installments($1,$2,$3,$4,$5,$6,$7,$8,$9)',[b,year+'-03-01',160000,5000,30000,year+'-03-14',year+'-03-21','Карта',id(700)]);
const advance=(await db.query('SELECT * FROM payments WHERE rental_installment_id=$1 ORDER BY id',[id(700)])).rows;
await db.query('SELECT finance_save_booking($1,$2,$3)',[b,{...changed,price_month:180000,management_fee_value:12},id(90)]);
assert.deepEqual((await db.query('SELECT * FROM payments WHERE rental_installment_id=$1 ORDER BY id',[id(700)])).rows,advance,'prepayment agreement preserved');
// CRM-linked booking must adopt the property rate too, rather than keep an old override.
const nextYear=year+1;
const crm={property_id:id(20),start_date:nextYear+'-01-19',end_date:nextYear+'-03-22',price_month:140000,deposit:100000,payment_day:21,closing_source:'Сайт',income_type:'percent',income_value:10,create_booking:true,account_id:id(90),one_time:0,seasons:[]};
const linked=(await db.query('SELECT crm_close_won_finance($1,$2) id',[id(40),crm])).rows[0].id;
await db.query('UPDATE properties SET management_fee_value=17 WHERE id=$1',[id(20)]);
assert.equal(Number((await db.query('SELECT income_value FROM deals WHERE id=$1',[id(40)])).rows[0].income_value),17);
assert.ok((await db.query('SELECT amount,company_fee FROM payments WHERE booking_id=$1 AND rental_schedule',[linked])).rows.every(p=>Number(p.company_fee)===Math.round(Number(p.amount)*17)/100));
await db.query("SELECT set_config('test.user',$1,false)",[id(2)]);
await assert.rejects(db.query('SELECT finance_save_booking($1,$2,$3)',[b,changed,id(90)]),/администратор/);
console.log('PASS: fee-only property edit, atomic price/fee edit, partial month, received and partial history, fixed fee, invalid rollback, advance agreement, CRM rate, admin guard');
await db.close();
`;
try {
  // The scaffold is stored as an escaped template in the original test.
  const decodedScaffold = Function('return `'+scaffold+'`')();
  await import('data:text/javascript;base64,'+Buffer.from(setup+decodedScaffold+scenarios).toString('base64'));
} catch(error) {
  console.error(error.message,error.detail??'',error.where??'');
  process.exitCode=1;
}
