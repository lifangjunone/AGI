import assert from "node:assert/strict";
import {bindVoiceInput} from "./voice-input.js";
function fixture({blocked=false,supported=true,confirm=true}={}){
 const attributes={},classes=new Set(),button={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},setAttribute:(k,v)=>attributes[k]=v};
 const input={value:"原有草稿",disabled:false},status={},instances=[],listening=[];
 class Recognition{
  constructor(){instances.push(this)}
  start(){this.started=true;this.onstart()}
  stop(){this.onend()}
  abort(){this.aborted=true;this.onend?.()}
 }
 const host={isSecureContext:true,confirm:()=>confirm,document:{permissionsPolicy:{allowsFeature:()=>!blocked}}};
 if(supported)host.SpeechRecognition=Recognition;
 const dispose=bindVoiceInput({button,input,status,locale:"zh-CN",onListening:x=>listening.push(x),host});
 return {button,input,status,instances,listening,attributes,dispose};
}
for(const options of [{blocked:true},{supported:false}]){
 const f=fixture(options);assert.equal(f.button.disabled,true);f.button.onclick();assert.equal(f.instances.length,0);f.dispose();
}
const cancelled=fixture({confirm:false});cancelled.button.onclick();assert.equal(cancelled.instances.length,0);cancelled.dispose();
const f=fixture();f.button.onclick();const r=f.instances[0];
assert.equal(f.attributes["aria-pressed"],"true");assert.equal(f.input.readOnly,true);
const interim=[{transcript:"口述文本"}];interim.isFinal=false;r.onresult({resultIndex:0,results:[interim]});
assert.equal(f.input.value,"原有草稿 口述文本");
const final=[{transcript:"确认文本"}];final.isFinal=true;r.onresult({resultIndex:0,results:[final]});
r.onend();assert.equal(f.input.value,"原有草稿 确认文本");assert.equal(f.input.readOnly,false);assert.match(f.status.textContent,/确认文字/);
f.button.onclick();f.instances[1].onerror({error:"not-allowed"});assert.match(f.status.textContent,/权限被拒绝/);assert.equal(f.input.readOnly,false);
f.button.onclick();const active=f.instances[2];f.dispose();assert.equal(active.aborted,true);active.onresult({resultIndex:0,results:[final]});assert.equal(f.input.value,"原有草稿 确认文本");
console.log("PASS unsupported/policy/consent/interim/final/errors/disposal; no sending side effect");
