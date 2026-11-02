import assert from "node:assert/strict";
import {bindChatDraft} from "./chat-draft.js";
const values=new Map();
const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
function field(){const input=new EventTarget();input.value="";return input}
const a=field(),first=bindChatDraft({input:a,scope:"user:one",id:"avatar-a",storage});
a.value="尚未发送";a.dispatchEvent(new Event("input"));first.dispose();
const b=field();bindChatDraft({input:b,scope:"user:one",id:"avatar-b",storage});assert.equal(b.value,"");
const other=field();bindChatDraft({input:other,scope:"user:two",id:"avatar-a",storage});assert.equal(other.value,"");
const restored=field(),draft=bindChatDraft({input:restored,scope:"user:one",id:"avatar-a",storage});
assert.equal(restored.value,"尚未发送");draft.clear();draft.dispose();
const empty=field();bindChatDraft({input:empty,scope:"user:one",id:"avatar-a",storage});assert.equal(empty.value,"");
console.log("PASS local draft restore/avatar isolation/account isolation/clear after send");
