import assert from 'node:assert/strict';
import test from 'node:test';
import {applyKeyCommand as apply,emptyKeyInventory,keyReadiness, type KeyActor, type KeyBundle, type KeyInventory} from '../../src/lib/property-keys-model';
import {managerPropertyView} from '../../src/lib/manager-property-view';
const id=(n:number)=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const admin:KeyActor={id:id(1),role:'admin',name:'Администратор'},manager:KeyActor={id:id(2),role:'manager',name:'Менеджер'};
const people=[{...admin,phone:''},{...manager,phone:''}];
const bundle:KeyBundle={id:id(10),name:'Связка 1',holder:admin.name,holderId:admin.id,loose:false,items:[{id:id(11),label:'Дверь',form:'Ключ',mark:'малый',reserve:false},{id:id(12),label:'Подъезд',form:'Магнит',mark:'',reserve:false},{id:id(13),label:'Дверь',form:'Ключ',mark:'большой',reserve:true}]};
const initial=()=>apply(emptyKeyInventory(),{kind:'composition',required:['Дверь','Подъезд'],bundles:[bundle]},admin,people);
test('manager view drops owner, current tenant and management data',()=>{
 assert.deepEqual(managerPropertyView({id:'safe',commission:50,owner_phone:'private',tenant:'private',management_fee_value:10}),{id:'safe',commission:50});
});
test('readiness combines holdings but never substitutes reserve',()=>{
 const v=initial();assert.equal(keyReadiness(v,admin.id).state,'ready');
 v.bundles[0]!.items[0]!.reserve=true;assert.equal(keyReadiness(v,admin.id).state,'partial');
 v.bundles.push({...bundle,id:id(14),loose:true,items:[{...bundle.items[0]!,id:id(15)}]});assert.equal(keyReadiness(v,admin.id).state,'ready');assert.equal(keyReadiness(v,manager.id).state,'none');
});
test('composition is admin only and physical IDs must be unique',()=>{
 assert.throws(()=>apply(initial(),{kind:'composition',required:[],bundles:[]},manager,people),/администратор/);
 assert.throws(()=>apply(initial(),{kind:'composition',required:[],bundles:[bundle,{...bundle,id:id(14)}]},admin,people),/отдельный ID/);
});
const send=(v:KeyInventory,items=bundle.items.map(i=>i.id))=>apply(v,{kind:'transfer',bundleId:bundle.id,itemIds:items,recipient:manager.name,recipientId:manager.id,handed:false},admin,people);
test('staff transfer locks custody until recipient acknowledges; no duplicate receipt',()=>{
 const original=initial(),v=send(original);assert.equal(v.bundles[0]!.holderId,admin.id);assert.equal(original.transfers.length,0);
 const t=v.transfers[0]!;
 assert.throws(()=>apply(v,{kind:'receive',transferId:t.id},admin,people),/получатель/);
 assert.throws(()=>send(v),/ожидает/);
 const done=apply(v,{kind:'receive',transferId:t.id},manager,people);
 assert.equal(done.bundles.length,1);assert.equal(done.bundles[0]!.holderId,manager.id);assert.deepEqual(done.bundles[0]!.items.map(i=>i.id),bundle.items.map(i=>i.id));
 assert.throws(()=>apply(done,{kind:'receive',transferId:t.id},manager,people),/завершена/);
});
test('partial transfer moves exact physical IDs and leaves other originals',()=>{
 const v=send(initial(),[id(12)]),done=apply(v,{kind:'receive',transferId:v.transfers[0]!.id},manager,people);
 assert.deepEqual(done.bundles[0]!.items.map(i=>i.id),[id(11),id(13)]);assert.deepEqual(done.bundles[1]!.items.map(i=>i.id),[id(12)]);assert.equal(done.bundles[1]!.holderId,manager.id);assert.equal(done.bundles[1]!.loose,true);
 assert.throws(()=>send(initial(),[id(12),id(12)]),/Проверьте/);
});
test('pending transfers freeze composition and only sender cancels',()=>{
 const v=send(initial()),t=v.transfers[0]!;
 assert.throws(()=>apply(v,{kind:'composition',required:[],bundles:[]},admin,people),/завершите/);
 // An unchanged frozen bundle can coexist with a requirements update.
 assert.equal(apply(v,{kind:'composition',required:['Дверь'],bundles:v.bundles},admin,people).required.length,1);
 assert.throws(()=>apply(v,{kind:'cancel',transferId:t.id},manager,people),/отправитель/);
 assert.equal(apply(v,{kind:'cancel',transferId:t.id},admin,people).transfers[0]!.status,'cancelled');
});
test('external custody needs explicit handoff; nonholder cannot transfer',()=>{
 const command={kind:'transfer' as const,bundleId:bundle.id,itemIds:[id(11)],recipient:'Клининг Анна',recipientId:null,handed:false};
 assert.throws(()=>apply(initial(),command,admin,people),/личное вручение/);
 assert.throws(()=>apply(initial(),{...command,handed:true},manager,people),/свои/);
 const v=apply(initial(),{...command,handed:true},admin,people);assert.equal(v.transfers[0]!.status,'received');assert.equal(v.bundles[1]!.holder,'Клининг Анна');assert.equal(v.bundles[1]!.holderId,null);
});

test('unchanged pending bundle survives JSONB field ordering',()=>{
 const v=send(initial());
 // PostgreSQL JSONB does not retain the insertion order of object fields.
 const reorder=(x:unknown):unknown=>Array.isArray(x)?x.map(reorder):x && typeof x === 'object'?Object.fromEntries(Object.entries(x).reverse().map(([k,v])=>[k,reorder(v)])):x;
 const stored=reorder(v) as KeyInventory;
 assert.equal(apply(stored,{kind:'composition',required:['Дверь'],bundles:stored.bundles},admin,people).required.length,1);
});
