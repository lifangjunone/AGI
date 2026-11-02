import assert from "node:assert/strict";
import {bindMemoryDraft} from "./memory-draft.js";
const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const inputs=(ids=["1","2","3"],checked=["1"])=>ids.map(value=>Object.assign(new EventTarget(),{value,checked:checked.includes(value)}));
let first=inputs(),status;
const draft=bindMemoryDraft({inputs:first,scope:"one",id:"a",storage,onStatus:s=>status=s});
first[1].checked=true;first[1].dispatchEvent(new Event("change"));assert.equal(status,"local");draft.dispose();
let restored=inputs();const active=bindMemoryDraft({inputs:restored,scope:"one",id:"a",storage,onStatus:s=>status=s});
assert.equal(status,"restored");assert.equal(restored[1].checked,true);
for(const [scope,id] of [["two","a"],["one","b"]]){
 const isolated=inputs();bindMemoryDraft({inputs:isolated,scope,id,storage});assert.equal(isolated[1].checked,false);
}
const changed=inputs(undefined,["3"]);bindMemoryDraft({inputs:changed,scope:"one",id:"a",storage,onStatus:s=>status=s});
assert.equal(status,"stale");assert.equal(changed[2].checked,true);assert.equal(changed[1].checked,false);
const deleted=inputs(["1","3"]);bindMemoryDraft({inputs:deleted,scope:"one",id:"a",storage});assert.equal(deleted[0].checked,true);
active.saved();active.dispose();
const clean=inputs();bindMemoryDraft({inputs:clean,scope:"one",id:"a",storage});assert.equal(clean[1].checked,false);
const broken={getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}};
const offline=inputs();bindMemoryDraft({inputs:offline,scope:"offline",id:"a",storage:broken,onStatus:s=>status=s});
offline[1].checked=true;offline[1].dispatchEvent(new Event("change"));assert.equal(status,"unavailable");
console.log("PASS memory draft restore/scope+identity isolation/stale-base/deleted memory/success cleanup/storage error");
