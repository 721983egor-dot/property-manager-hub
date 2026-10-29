import assert from 'node:assert/strict';import test from 'node:test';
import {futureRunAt,scheduledTime,assertScheduledOperation} from '../../src/lib/scheduled-actions/model';
import {sealAction,unsealAction,unsealForActor} from '../../src/lib/scheduled-actions/seal.server';
import {actionScheduler} from '../../src/lib/scheduled-actions/context.server';
import {performScheduledAction} from '../../src/lib/scheduled-actions/runner';
import type {AssistantAction} from '../../src/lib/ai/types';
process.env['SUPABASE_SERVICE_ROLE_KEY']='isolated-test-signing-key';
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const at=new Date(Date.now()+86400000).toISOString();
const operation=()=>({id:crypto.randomUUID(),actorId:actor,runAt:at,tool:'updateProperty' as const,summary:'Цена объекта: 300000',input:{propertyId:other,fields:{priceMonth:300000}},issuedAt:Date.now()});
test('time is future, explicitly zoned, and displayed in Moscow',()=>{
 assert.equal(futureRunAt('2030-01-01T10:00:00+03:00',Date.parse('2029-12-31T12:00:00Z')),'2030-01-01T07:00:00.000Z');assert.match(scheduledTime('2030-01-01T07:00:00Z'),/10:00/);
 assert.throws(()=>futureRunAt('2030-01-01T10:00:00',0));assert.throws(()=>futureRunAt('2020-01-01T10:00:00Z'));assert.throws(()=>futureRunAt(at,Date.parse(at)));
});
test('sealed parameters, time, destination and author cannot be changed',()=>{
 const op=operation(),sealed=sealAction(op);assert.deepEqual(unsealForActor(sealed,actor),op);
 assert.throws(()=>unsealForActor(sealed,other),/автор/);
 for(const change of [{...op,runAt:'2030-01-01T07:00:00Z'},{...op,input:{fields:{priceMonth:1}}},{...op,actorId:other},{...op,tool:'sendChatMessage'}])assert.throws(()=>unsealAction({...sealed,payload:JSON.stringify(change)}),/изменились/);
 assert.throws(()=>unsealAction(sealed,op.issuedAt+86400001),/устарело/);
});
test('same scheduling adapter wraps different supported domains, never invokes executors',()=>{
 const proposals:AssistantAction[]=[],scheduler=actionScheduler(proposals);scheduler.prepare(at,actor);
 for(const tool of ['updateProperty','upsertTask','upsertClient','addDealComment','createSocialPost','sendChatMessage']){
  const raw={id:tool,tool,summary:tool,input:JSON.stringify({title:'test'})};const wrapped=scheduler.wrap(raw);assert.equal(wrapped.tool,'scheduleAssistantAction');assert.match(wrapped.summary,/Москва/);assert.equal(unsealAction(JSON.parse(wrapped.input)).tool,tool);
 }
});
test('requesting a future time after proposals removes immediate execution cards',()=>{
 const raw={id:'first',tool:'updateProperty',summary:'Change only description',input:JSON.stringify({fields:{description:'new'}})},proposals=[raw];
 const scheduler=actionScheduler(proposals);scheduler.prepare(at,actor);assert.equal(proposals.length,1);assert.equal(proposals[0]!.tool,'scheduleAssistantAction');
 assert.deepEqual(unsealAction(JSON.parse(proposals[0]!.input)).input,{fields:{description:'new'}});
});
test('future physical completions, money receipts, deletion and nested queues are rejected',()=>{
 for(const [tool,input] of [['createPayment',{status:'paid'}],['createPayment',{status:'expected',paidAmount:1}],['upsertTask',{status:'done'}],['deleteTask',{}],['scheduleAssistantAction',{}],['changePropertyKeys',{}]] as const)assert.throws(()=>assertScheduledOperation(tool,input));
 assert.doesNotThrow(()=>assertScheduledOperation('createPayment',{status:'expected'}));
});
test('failed preparation cannot leave a dangerous immediate proposal behind',()=>{
 const proposals=[{id:'x',tool:'createPayment',summary:'paid',input:'{"status":"paid"}'}],scheduler=actionScheduler(proposals);
 assert.throws(()=>scheduler.prepare(at,actor));assert.equal(proposals.length,0);
});
test('revoked actor is rejected before any business effect',async()=>{
 let writes=0;const results:string[]=[];await performScheduledAction({actor_id:actor,tool_name:'updateProperty',summary:'test',input:{}},{assertActor:async()=>{throw Error('role revoked')},execute:async()=>{writes++;return 'ok'},finish:async(state)=>{results.push(state)}});assert.equal(writes,0);assert.deepEqual(results,['failed']);
});
test('ambiguous side effect never retries and is marked for review',async()=>{
 let writes=0;const results:string[]=[];await performScheduledAction({actor_id:actor,tool_name:'sendChatMessage',summary:'test',input:{}},{assertActor:async()=>{},execute:async()=>{writes++;throw Error('lost network response')},finish:async(state)=>{results.push(state)}});assert.equal(writes,1);assert.deepEqual(results,['needs_review']);
});
test('a failed completion write never retries an already committed operation',async()=>{
 let writes=0;await assert.rejects(performScheduledAction({actor_id:actor,tool_name:'updateProperty',summary:'test',input:{}},{assertActor:async()=>{},execute:async()=>{writes++;return 'ok'},finish:async()=>{throw Error('audit unavailable')}}),/audit unavailable/);assert.equal(writes,1);
});

test('invalid schedule cannot retain or create immediate confirmations',()=>{
 const proposals=[{id:'x',tool:'deleteTask',summary:'delete',input:'{}'}],scheduler=actionScheduler(proposals);
 assert.throws(()=>scheduler.prepare(at,actor));assert.equal(proposals.length,0);assert.throws(()=>scheduler.wrap({id:'y',tool:'updateProperty',summary:'change',input:'{}'}),/уточните/);
 scheduler.prepare(at,actor);assert.equal(scheduler.wrap({id:'y',tool:'updateProperty',summary:'change',input:'{}'}).tool,'scheduleAssistantAction');
});

test('real mutation registry exposes queue management and ordinary proposals are wrapped',async()=>{
 const {createMutateTools}=await import('../../src/lib/ai/tools/mutate.server');
 const {createToolContext}=await import('../../src/lib/ai/context.server');
 const actions:AssistantAction[]=[],ctx=createToolContext(actions);ctx.findProperty=async()=>({id:other,ref_id:1802,title:'Карат 1802',price_month:200000});
 const tools=createMutateTools(ctx);
 assert.ok(tools.proposeManageScheduledAction);assert.ok(tools.proposePropertyKeyChange);
 ctx.scheduleActions(at,actor);
 await tools.proposePropertyUpdate.execute!({ref:'Карат 1802',priceMonth:300000},{toolCallId:'isolated',messages:[]});
 assert.equal(actions.length,1);assert.equal(actions[0]!.tool,'scheduleAssistantAction');assert.equal(unsealAction(JSON.parse(actions[0]!.input)).input.fields.priceMonth,300000);
});

test('scheduled reports validate the original read-tool parameters without reading or mutating now',async()=>{
 const {validatedReport}=await import('../../src/lib/scheduled-actions/report.server');
 await assert.rejects(validatedReport({report:'getFinanceSummary',title:'Сводка',parameters:{}}));
 await assert.rejects(validatedReport({report:'deleteTask',title:'Удалить',parameters:{}}));
 const report=await validatedReport({report:'getFinanceSummary',title:'Финансы за месяц',parameters:{month:'2030-01'}});
 assert.deepEqual(report.input.parameters,{month:'2030-01'});assert.equal(typeof report.read,'function');
 const proposals:AssistantAction[]=[],scheduler=actionScheduler(proposals);scheduler.prepare(at,actor);
 const wrapped=scheduler.wrap({id:'report',tool:'runAssistantReport',summary:'Сводка по задачам',input:JSON.stringify({report:'getTasks',title:'Задачи',parameters:{}})});
 assert.equal(unsealAction(JSON.parse(wrapped.input)).tool,'runAssistantReport');
});
test('every schedulable operation has a registered executor',async()=>{
 const {SCHEDULABLE_TOOLS}=await import('../../src/lib/scheduled-actions/model');
 const {ASSISTANT_EXECUTORS}=await import('../../src/lib/ai/executors.server');
 for(const name of SCHEDULABLE_TOOLS) assert.equal(typeof ASSISTANT_EXECUTORS[name],'function',name);
});
