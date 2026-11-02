import assert from "node:assert/strict";
import {bindChatKeyboard} from "./chat-keyboard.js";
const input=new EventTarget();let sends=0;
bindChatKeyboard(input,()=>sends++);
const key=extra=>({key:"Enter",preventDefault(){this.prevented=true},...extra});
input.dispatchEvent(new Event("compositionstart"));
input.onkeydown(key({}));assert.equal(sends,0);
input.dispatchEvent(new Event("compositionend"));
input.onkeydown(key({}));assert.equal(sends,0);
await new Promise(resolve=>setTimeout(resolve,100));
for(const extra of [{isComposing:true},{keyCode:229},{shiftKey:true},{ctrlKey:true},{repeat:true}]){
 input.onkeydown(key(extra));assert.equal(sends,0);
}
const enter=key({});input.onkeydown(enter);
assert.equal(sends,1);assert.equal(enter.prevented,true);
console.log("PASS composition/commit/legacy229/modifiers/repeat/normal Enter");
