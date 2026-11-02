export function initializeIdentityState(workspace) {
  const avatars = workspace.avatars || [];
  const selected = avatars.find(a => a.id === workspace.activeAvatarId) || avatars[0];
  workspace.activeAvatarId = selected?.id || null;
  workspace.conversationsByAvatar = workspace.conversationsByAvatar &&
    typeof workspace.conversationsByAvatar === "object" && !Array.isArray(workspace.conversationsByAvatar)
    ? workspace.conversationsByAvatar : {};
  // Legacy shared history belongs to the original first identity, not every identity.
  if (avatars[0] && !Object.hasOwn(workspace.conversationsByAvatar, avatars[0].id)) {
    Object.defineProperty(workspace.conversationsByAvatar, avatars[0].id, {
      value: Array.isArray(workspace.conversations) ? workspace.conversations : [],
      configurable: true, writable: true, enumerable: true,
    });
  }
  workspace.conversations = identityHistory(workspace, selected?.id);
  initializePersonas(workspace);
  initializeMemorySelections(workspace);
  return workspace;
}

function initializeMemorySelections(workspace){
  const existing=workspace.memorySelectionsByAvatar;
  workspace.memorySelectionsByAvatar=existing&&typeof existing==="object"&&!Array.isArray(existing)?existing:{};
  const first=workspace.avatars?.[0];
  if(first&&!Object.hasOwn(workspace.memorySelectionsByAvatar,first.id)){
    setIdentityMemories(workspace,first.id,Array.isArray(workspace.selectedMemories)?workspace.selectedMemories:[]);
  }
  const valid=new Set((workspace.memories||[]).map(m=>String(m.id)));
  for(const avatar of workspace.avatars||[]){
    setIdentityMemories(workspace,avatar.id,identityMemories(workspace,avatar.id).filter(id=>valid.has(String(id))));
  }
  workspace.selectedMemories=identityMemories(workspace,workspace.activeAvatarId);
}
export function identityMemories(workspace,id){
  const map=workspace.memorySelectionsByAvatar;
  if(!id)return [];
  if(!Object.hasOwn(map,id)||!Array.isArray(map[id])){
    Object.defineProperty(map,id,{value:[],enumerable:true,writable:true,configurable:true});
  }
  return map[id];
}
export function setIdentityMemories(workspace,id,ids){
  Object.defineProperty(workspace.memorySelectionsByAvatar,id,{value:[...ids],enumerable:true,writable:true,configurable:true});
  if(workspace.activeAvatarId===id)workspace.selectedMemories=workspace.memorySelectionsByAvatar[id];
}

const defaultPersona={warmth:62,directness:72,creativity:58,traits:["冷静","敏锐","真诚"],instructions:"先直接回应问题，再补充真正有帮助的细节。"};
function initializePersonas(workspace){
  const existing=workspace.personasByAvatar;
  workspace.personasByAvatar=existing&&typeof existing==="object"&&!Array.isArray(existing)?existing:{};
  const first=workspace.avatars?.[0];
  if(first&&!Object.hasOwn(workspace.personasByAvatar,first.id)){
    Object.defineProperty(workspace.personasByAvatar,first.id,{value:structuredClone(workspace.persona||defaultPersona),enumerable:true,writable:true,configurable:true});
  }
  workspace.persona=identityPersona(workspace,workspace.activeAvatarId);
}
export function identityPersona(workspace,id){
  const map=workspace.personasByAvatar;
  if(!id)return structuredClone(defaultPersona);
  if(!Object.hasOwn(map,id)||!map[id]||typeof map[id]!=="object"){
    Object.defineProperty(map,id,{value:structuredClone(defaultPersona),enumerable:true,writable:true,configurable:true});
  }
  return map[id];
}
export function setIdentityPersona(workspace,id,persona){
  Object.defineProperty(workspace.personasByAvatar,id,{value:persona,enumerable:true,writable:true,configurable:true});
  if(workspace.activeAvatarId===id)workspace.persona=persona;
}

export function identityHistory(workspace, id) {
  const histories = workspace.conversationsByAvatar;
  if (!id) return [];
  if (!Object.hasOwn(histories, id) || !Array.isArray(histories[id])) {
    Object.defineProperty(histories, id, {
      value: [{role: "avatar", text: "我已经准备好了。今天想一起完成什么？"}],
      configurable: true, writable: true, enumerable: true,
    });
  }
  return histories[id];
}

export function activeIdentity(workspace) {
  return workspace.avatars.find(a => a.id === workspace.activeAvatarId) || workspace.avatars[0];
}

export function upsertIdentity(workspace,avatar) {
  const exists=workspace.avatars.some(a=>a.id===avatar.id);
  workspace.avatars=exists?workspace.avatars.map(a=>a.id===avatar.id?avatar:a):[...workspace.avatars,avatar];
  const persona=identityPersona(workspace,avatar.id);
  setIdentityPersona(workspace,avatar.id,{...persona,mood:avatar.mood});
  if(!exists)selectIdentity(workspace,avatar.id);
  return !exists;
}

export function removeIdentity(workspace,id) {
  if(workspace.avatars.length<=1||!workspace.avatars.some(a=>a.id===id))return false;
  workspace.avatars=workspace.avatars.filter(a=>a.id!==id);
  for(const key of ["personasByAvatar","memorySelectionsByAvatar","conversationsByAvatar"]){
    if(workspace[key])delete workspace[key][id];
  }
  // Reset aliases from the surviving identity, never copy the deleted persona.
  initializeIdentityState(workspace);
  return true;
}

export function selectIdentity(workspace, id) {
  if (!workspace.avatars.some(a => a.id === id)) return false;
  if(workspace.personasByAvatar&&workspace.activeAvatarId&&workspace.persona){
    setIdentityPersona(workspace,workspace.activeAvatarId,workspace.persona);
  }
  if(workspace.memorySelectionsByAvatar&&workspace.activeAvatarId){
    setIdentityMemories(workspace,workspace.activeAvatarId,workspace.selectedMemories||[]);
  }
  workspace.activeAvatarId = id;
  workspace.conversations = identityHistory(workspace, id);
  workspace.persona=identityPersona(workspace,id);
  workspace.selectedMemories=identityMemories(workspace,id);
  return true;
}

export function workspaceSummary(workspace) {
  const histories = workspace.conversationsByAvatar || {};
  let completedReplies = 0;
  for (const avatar of workspace.avatars || []) {
    const messages = Object.hasOwn(histories, avatar.id) && Array.isArray(histories[avatar.id])
      ? histories[avatar.id] : [];
    let awaitingReply = false;
    for (const message of messages) {
      if (message.role === "user") awaitingReply = true;
      else if (message.role === "avatar" && awaitingReply) {
        completedReplies++;
        awaitingReply = false;
      }
    }
  }
  const current = activeIdentity(workspace);
  const history = current && Object.hasOwn(histories, current.id) ? histories[current.id] : [];
  const latestQuestion = Array.isArray(history)
    ? [...history].reverse().find(message => message.role === "user")?.text || "" : "";
  return {
    selves: workspace.avatars?.length || 0,
    memories: workspace.memories?.length || 0,
    completedReplies,
    latestQuestion,
  };
}
