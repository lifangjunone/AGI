import assert from "node:assert/strict";
import {bindPersonaDraft} from "./persona-draft.js";
const values=new Map();
const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const fields=(text="saved")=>{const input=new EventTarget();input.value=text;return {instructions:input}};
let a=fields(),status;
const draft=bindPersonaDraft({fields:a,scope:"one",id:"a",storage,onStatus:s=>status=s});
a.instructions.value="unsaved";a.instructions.dispatchEvent(new Event("input"));
assert.equal(status,"local");draft.dispose();
const b=fields();bindPersonaDraft({fields:b,scope:"one",id:"a",storage});assert.equal(b.instructions.value,"unsaved");
for(const [scope,id] of [["two","a"],["one","b"]]){
 const isolated=fields();bindPersonaDraft({fields:isolated,scope,id,storage});assert.equal(isolated.instructions.value,"saved");
}
const changed=fields("server changed");bindPersonaDraft({fields:changed,scope:"one",id:"a",storage});assert.equal(changed.instructions.value,"server changed");
const restored=fields(),saved=bindPersonaDraft({fields:restored,scope:"one",id:"a",storage});saved.saved();saved.dispose();
const clean=fields();bindPersonaDraft({fields:clean,scope:"one",id:"a",storage});assert.equal(clean.instructions.value,"saved");
const broken={getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}};
const offline=fields();bindPersonaDraft({fields:offline,scope:"offline",id:"a",storage:broken,onStatus:s=>status=s});
offline.instructions.value="retained";offline.instructions.dispatchEvent(new Event("input"));assert.equal(status,"unavailable");
console.log("PASS persona draft restore/isolation/stale-base/success cleanup/storage failure");
