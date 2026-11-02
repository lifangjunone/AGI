import assert from "node:assert/strict";
import {initializeIdentityState, activeIdentity, selectIdentity, workspaceSummary,identityPersona,setIdentityPersona,identityMemories,setIdentityMemories} from "./workspace.js";

const workspace = initializeIdentityState({
  avatars: [{id: "mira"}, {id: "second"}],
  conversations: [{role: "user", text: "旧记录"}],
});
assert.equal(activeIdentity(workspace).id, "mira");
assert.equal(selectIdentity(workspace, "second"), true);
assert.equal(workspace.conversations.some(m => m.text === "旧记录"), false);
workspace.conversations.push({role: "user", text: "第二个分身的记录"});
selectIdentity(workspace, "mira");
assert.equal(workspace.conversations[0].text, "旧记录");
selectIdentity(workspace, "second");
const restored = initializeIdentityState(JSON.parse(JSON.stringify(workspace)));
assert.equal(activeIdentity(restored).id, "second");
assert.equal(restored.conversations.at(-1).text, "第二个分身的记录");
assert.equal(selectIdentity(restored, "missing"), false);
restored.avatars = restored.avatars.filter(a => a.id !== "second");
initializeIdentityState(restored);
assert.equal(activeIdentity(restored).id, "mira");
console.log("Identity selection, legacy migration, history isolation and reload passed");
const summaryWorkspace = initializeIdentityState({
  avatars: [{id:"one"}, {id:"two"}], activeAvatarId:"two",
  memories:[{},{}], conversations:[],
  conversationsByAvatar:{
    one:[{role:"avatar",text:"Greeting"},{role:"user",text:"Question"},{role:"avatar",text:"Answer"}],
    two:[{role:"user",text:"Unanswered question"}],
    deleted:[{role:"user"},{role:"avatar"}],
  },
});
assert.deepEqual(workspaceSummary(summaryWorkspace),{
  selves:2, memories:2, completedReplies:1, latestQuestion:"Unanswered question",
});
assert.equal(workspaceSummary({avatars:[],memories:[]}).completedReplies,0);
console.log("Overview counts exclude greetings, pending questions and deleted identities");
const personas=initializeIdentityState({avatars:[{id:"original"},{id:"new"}],persona:{instructions:"原始指令",warmth:81}});
assert.equal(identityPersona(personas,"original").instructions,"原始指令");
assert.notEqual(identityPersona(personas,"new").instructions,"原始指令");
selectIdentity(personas,"new");
setIdentityPersona(personas,"new",{...personas.persona,instructions:"第二人格"});
selectIdentity(personas,"original");
assert.equal(personas.persona.instructions,"原始指令");
const reloaded=initializeIdentityState(JSON.parse(JSON.stringify(personas)));
selectIdentity(reloaded,"new");
assert.equal(reloaded.persona.instructions,"第二人格");
console.log("PASS independent personas, legacy assignment, selection and reload");
const staleAlias=JSON.parse(JSON.stringify(personas));
staleAlias.persona={instructions:"旧兼容字段不应覆盖独立配置"};
const authoritative=initializeIdentityState(staleAlias);
assert.equal(authoritative.persona.instructions,"原始指令");
console.log("PASS independent persona map is authoritative over stale legacy alias");
const memoryScopes=initializeIdentityState({avatars:[{id:"one"},{id:"two"}],memories:[{id:1},{id:2}],selectedMemories:[1]});
assert.deepEqual(identityMemories(memoryScopes,"one"),[1]);
assert.deepEqual(identityMemories(memoryScopes,"two"),[]);
selectIdentity(memoryScopes,"two");
setIdentityMemories(memoryScopes,"two",[2]);
selectIdentity(memoryScopes,"one");
assert.deepEqual(memoryScopes.selectedMemories,[1]);
const memoryReload=initializeIdentityState(JSON.parse(JSON.stringify(memoryScopes)));
selectIdentity(memoryReload,"two");
assert.deepEqual(memoryReload.selectedMemories,[2]);
memoryReload.memories=memoryReload.memories.filter(m=>m.id!==2);
initializeIdentityState(memoryReload);
assert.deepEqual(memoryReload.selectedMemories,[]);
console.log("PASS per-identity memory selections, legacy migration, reload and deleted memory cleanup");
