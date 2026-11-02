import assert from "node:assert/strict";
import {initializeIdentityState,removeIdentity} from "./workspace.js";
const workspace=initializeIdentityState({
 avatars:[{id:"one"},{id:"two"}],activeAvatarId:"two",memories:[{id:1}],
 personasByAvatar:{one:{instructions:"one"},two:{instructions:"two"}},
 memorySelectionsByAvatar:{one:[1],two:[]},
 conversationsByAvatar:{one:[{role:"user",text:"one"}],two:[{role:"user",text:"two"}]},
 contentDrafts:[{avatarId:"two",text:"keep"}]
});
assert.equal(removeIdentity(workspace,"two"),true);
assert.equal(workspace.activeAvatarId,"one");
assert.equal(workspace.persona.instructions,"one");
assert.deepEqual(workspace.selectedMemories,[1]);
for(const key of ["personasByAvatar","memorySelectionsByAvatar","conversationsByAvatar"])assert.equal(Object.hasOwn(workspace[key],"two"),false);
assert.equal(workspace.memories.length,1);
assert.equal(workspace.contentDrafts[0].text,"keep");
assert.equal(removeIdentity(workspace,"one"),false);
console.log("PASS active identity delete alias reset/scoped cleanup/shared data retained/last identity guard");
