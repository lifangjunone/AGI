import { applyI18n, translate } from "./i18n.js";
import { initializeIdentityState, activeIdentity, selectIdentity, identityHistory, workspaceSummary, setIdentityPersona, setIdentityMemories, removeIdentity, upsertIdentity } from "./workspace.js";
import { bindVoiceInput } from "./voice-input.js";
import { contentView, bindContentStudio } from "./content-studio.js";
import { bindChatDraft } from "./chat-draft.js";
import { bindChatKeyboard } from "./chat-keyboard.js";
import { conflictBackup } from "./conflict-backup.js";
import { bindPersonaDraft } from "./persona-draft.js";
import { bindMemoryDraft } from "./memory-draft.js";
import { bindAvatarDraft } from "./avatar-draft.js";
import { bindKeyboardViewport } from "./keyboard-viewport.js";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
bindKeyboardViewport();
const seed={
 avatars:[{id:"mira",name:"Mira",role:"体验示例分身",bio:"预设体验角色，不代表你的个人资料。可以直接对话，也可以上传照片创建自己的分身。",image:"reference/post-image.jpg",status:"在线",voice:"voice-1",created:"体验示例",visualStyle:"glow",mood:"curious",energy:72,spark:"先聊一段真实对话，再决定你希望第二人格如何表达。"}],
 memories:[],
 conversations:[{role:"avatar",text:"我已经准备好了。今天想一起完成什么？"}],
 generations:0,
 persona:{warmth:62,directness:72,creativity:58,mood:"curious",traits:["冷静","敏锐","真诚"],instructions:"先直接回应问题，再补充真正有帮助的细节。"},
 selectedMemories:[],
 settings:{autoSpeak:true,remember:true,locale:"zh-CN",quality:"高质量"}
};
let state=structuredClone(seed),pendingImage="",toastTimer,manualPayTimer,avatarPreviewRefresh=null,access={authenticated:false,trialRemaining:3,subscriptionActive:false,payment:{enabled:false,amount:"0.90",days:7,autoRenew:false}},speechPlayback={generation:0,controller:null,audio:null,url:null};
const aliveMoods=[
 {id:"curious",name:"好奇",tag:"想探索",tone:"主动追问、有发现感",color:"#7c3aed",hint:"适合第一次唤醒，让分身看起来有灵气。"},
 {id:"sweet",name:"甜美",tag:"更好看",tone:"温柔、轻盈、有陪伴感",color:"#ec4899",hint:"适合自拍头像和偏生活方式的数字人。"},
 {id:"confident",name:"自信",tag:"有气场",tone:"笃定、直接、给结论",color:"#f59e0b",hint:"适合商业表达、口播和个人品牌。"},
 {id:"calm",name:"清冷",tag:"高级感",tone:"克制、干净、少废话",color:"#6ce5e3",hint:"适合专业顾问、创作搭档和夜间模式。"},
 {id:"healing",name:"治愈",tag:"被理解",tone:"慢一点、安抚、先接住情绪",color:"#22c55e",hint:"适合情绪陪伴和低压力对话。"}
];
const aliveStyles=[
 {id:"glow",name:"霓光胶片",desc:"照片边缘会有呼吸光、胶片颗粒和轻微扫描感。"},
 {id:"beauty",name:"柔光美颜",desc:"肤色更柔、背景更梦幻，重点抓住爱美冲动。"},
 {id:"cyber",name:"赛博分身",desc:"更像被 AI 唤醒的数字身份，科技感强。"},
 {id:"minimal",name:"高级清冷",desc:"减少装饰，突出脸和人格文字。"}
];
const voiceCatalog=[
 {id:"voice-0",name:"清悦",gender:"female",genderLabel:"女声",tone:"明亮 · 有亲和力",mark:"01"},
 {id:"voice-2",name:"柔和",gender:"female",genderLabel:"女声",tone:"温柔 · 陪伴感",mark:"02"},
 {id:"voice-1",name:"沉稳",gender:"male",genderLabel:"男声",tone:"低沉 · 可信赖",mark:"03"},
 {id:"voice-4",name:"清朗",gender:"male",genderLabel:"男声",tone:"利落 · 年轻感",mark:"04"},
 {id:"voice-3",name:"知性旁白",gender:"neutral",genderLabel:"中性",tone:"克制 · 叙事感",mark:"05"}
];
const legacyVoices={Yunxi:"voice-1",Xiaoxiao:"voice-0",Narrator:"voice-3"};
function normalizeVoice(id){const mapped=legacyVoices[id]||id;return voiceCatalog.some(v=>v.id===mapped)?mapped:"voice-1"}
function voiceById(id){return voiceCatalog.find(v=>v.id===normalizeVoice(id))||voiceCatalog[2]}
function localizedVoice(id){const voice=voiceById(id);return `${translate(voice.name,state.settings.locale)} · ${translate(voice.genderLabel,state.settings.locale)}`}
function normalizeAvatar(a={},i=0){return {...seed.avatars[0],...a,id:a.id||`a${Date.now()}${i}`,visualStyle:a.visualStyle||"glow",mood:a.mood||state?.persona?.mood||"curious",energy:Number.isFinite(+a.energy)?+a.energy:72,spark:a.spark||"照片已完成数字人格唤醒，情绪、审美与表达会一起进入对话。"}}
function normalizeWorkspace(saved={}){const source=saved&&typeof saved==="object"?saved:{},merged={...structuredClone(seed),...source};merged.settings={...seed.settings,...(source.settings||{})};merged.persona={...seed.persona,...(source.persona||{})};merged.memories=Array.isArray(source.memories)?source.memories:seed.memories;merged.conversations=Array.isArray(source.conversations)&&source.conversations.length?source.conversations:seed.conversations;merged.selectedMemories=Array.isArray(source.selectedMemories)?source.selectedMemories:seed.selectedMemories;merged.avatars=(Array.isArray(merged.avatars)&&merged.avatars.length?merged.avatars:seed.avatars).map((a,i)=>({...seed.avatars[0],...a,voice:normalizeVoice(a.voice),visualStyle:a.visualStyle||"glow",mood:a.mood||merged.persona.mood||"curious",energy:Number.isFinite(+a.energy)?+a.energy:72,spark:a.spark||"照片已完成数字人格唤醒，情绪、审美与表达会一起进入对话。"}));return merged}
function localWorkspace(){try{return JSON.parse(localStorage.getItem("second-me-product")||"null")}catch{return null}}
function load(){return normalizeWorkspace(localWorkspace()||{})}
state=initializeIdentityState(load());
let workspaceSaveChain=Promise.resolve();
let pendingWorkspaceSaves=0;
let workspaceReady=false,workspaceScope=null;
let workspaceVersion="new",workspaceConflict=false,conflictSnapshot=null;
function saveLocal(snapshot){try{localStorage.setItem("second-me-product",JSON.stringify(snapshot));return true}catch{return false}}
async function saveRemote(snapshot){
 if(!workspaceReady||workspaceConflict)throw new Error("workspace_not_ready");
 const signal=AbortSignal.timeout(20000);
 const response=await fetch("./api/workspace",{method:"POST",credentials:"same-origin",signal,headers:{"content-type":"application/json","x-workspace-version":workspaceVersion,...(workspaceScope?{"x-workspace-scope":workspaceScope}:{})},body:JSON.stringify(snapshot)});
 const data=await response.json();
 if(!response.ok){
  if(response.status===409||response.status===428){workspaceConflict=true;conflictSnapshot=snapshot;try{localStorage.setItem(`second-me-conflict:${workspaceScope}`,JSON.stringify(snapshot))}catch{}showWorkspaceConflict()}
  throw new Error(data.error||`workspace_${response.status}`);
 }
 if(!data.updatedAt)throw new Error("workspace_confirmation_missing");
 workspaceVersion=data.updatedAt;return true;
}
let lastWorkspaceSaveError=null;
function workspaceSaveFeedback(){
 return lastWorkspaceSaveError?.name==="TimeoutError"||lastWorkspaceSaveError?.message==="workspace_confirmation_missing"
  ?(state.settings.locale==="en-US"?"No save confirmation received. Your input is retained. Retry; if a version conflict appears, load the server's latest settings.":"未收到保存确认，输入仍保留。可重试；若提示版本冲突，请加载服务器最新配置。")
  :translate("未同步到服务器，请检查网络后重试",state.settings.locale);
}
function queueRemoteSave(snapshot){pendingWorkspaceSaves++;workspaceSaveChain=workspaceSaveChain.catch(()=>false).then(()=>saveRemote(snapshot)).finally(()=>pendingWorkspaceSaves--);return workspaceSaveChain}
function save(){setIdentityPersona(state,state.activeAvatarId,state.persona);setIdentityMemories(state,state.activeAvatarId,state.selectedMemories);const snapshot=structuredClone(state),localSaved=saveLocal(snapshot);counts();queueRemoteSave(snapshot).catch(()=>toast(translate("未同步到服务器，请检查网络后重试",state.settings.locale)));return localSaved}
async function persistState(){setIdentityPersona(state,state.activeAvatarId,state.persona);setIdentityMemories(state,state.activeAvatarId,state.selectedMemories);const snapshot=structuredClone(state);counts();try{await queueRemoteSave(snapshot);lastWorkspaceSaveError=null;saveLocal(snapshot);return true}catch(error){lastWorkspaceSaveError=error;toast(workspaceSaveFeedback());return false}}
async function restoreWorkspace(){
 const local=localWorkspace();workspaceReady=false;
 try{
  const response=await fetch("./api/workspace",{credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`workspace_${response.status}`);
  const data=await response.json();workspaceScope=data.scope||null;workspaceVersion=data.updatedAt||"new";workspaceConflict=false;
  let cachedScope=null;try{cachedScope=localStorage.getItem("second-me-workspace-scope")}catch{}
  if(local&&cachedScope&&workspaceScope&&cachedScope!==workspaceScope){try{localStorage.setItem(`second-me-cache:${cachedScope}`,JSON.stringify(local))}catch{}}
  workspaceReady=true;
  if(data.workspace){state=initializeIdentityState(normalizeWorkspace(data.workspace));saveLocal(state)}
  else if(local&&((workspaceScope&&cachedScope===workspaceScope)||(!data.authenticated&&!cachedScope))){
   state=initializeIdentityState(normalizeWorkspace(local));await queueRemoteSave(structuredClone(state));
  }else{state=initializeIdentityState(normalizeWorkspace({}));saveLocal(state)}
  try{if(workspaceScope)localStorage.setItem("second-me-workspace-scope",workspaceScope)}catch{}
  return true;
 }catch{workspaceReady=false;return false}
}
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function toast(t){$("#toast").textContent=t;$("#toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").classList.remove("show"),2100)}
function speechState(active){
 speechPlayback.active=active;
 $$(".stop-reading").forEach(button=>button.hidden=!active);
}
function stopSpeech(){
 speechPlayback.generation++;speechPlayback.controller?.abort();speechPlayback.cancel?.();speechPlayback.audio?.pause();if(speechPlayback.url)URL.revokeObjectURL(speechPlayback.url);
 speechPlayback={generation:speechPlayback.generation,controller:null,audio:null,url:null};
 speechState(false);
 if("speechSynthesis" in window)speechSynthesis.cancel()
}
function browserSpeak(text){
 if(!text||!("speechSynthesis" in window))return;
 const generation=speechPlayback.generation,utterance=new SpeechSynthesisUtterance(text);
 utterance.lang=state.settings.locale;
 speechState(true);
 const finish=()=>{if(generation===speechPlayback.generation)speechState(false)};
 utterance.onend=finish;utterance.onerror=finish;
 try{speechSynthesis.speak(utterance)}catch{finish()}
}
async function previewVoice(voice,button){
 const en=state.settings.locale==="en-US",status=button.closest(".voice-option")?.querySelector(".voice-preview-status");
 const wasActive=button.classList.contains("is-playing")||button.classList.contains("is-loading");
 stopSpeech();$$("[data-voice-preview]").forEach(x=>{x.classList.remove("is-playing","is-loading");x.removeAttribute("aria-busy");x.querySelector("span").textContent=en?"Preview":"试听";const message=x.closest(".voice-option")?.querySelector(".voice-preview-status");if(message){message.textContent="";message.classList.remove("is-error")}});
 if(wasActive){if(status)status.textContent=en?"Preview stopped":"试听已停止";return}
 const generation=speechPlayback.generation,controller=new AbortController();speechPlayback.controller=controller;
 let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;controller.abort()},20000);
 const current=()=>generation===speechPlayback.generation&&button.isConnected;
 const feedback=(text,error=false)=>{if(current()&&status){status.textContent=text;status.classList.toggle("is-error",error)}};
 button.classList.add("is-loading");button.setAttribute("aria-busy","true");button.querySelector("span").textContent=en?"Cancel":"取消";
 feedback(en?"Preparing preview… select again to cancel":"正在生成试听，再次点击可取消");
 try{
  const response=await fetch("./api/speech/preview",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({voice}),signal:controller.signal});
  if(generation!==speechPlayback.generation)throw new DOMException("Cancelled","AbortError");
  if(!response.ok)throw new Error(`speech_${response.status}`);
  const blob=await response.blob();
  clearTimeout(timer);
  if(!current())throw new DOMException("Cancelled","AbortError");
  button.classList.remove("is-loading");button.classList.add("is-playing");button.removeAttribute("aria-busy");button.querySelector("span").textContent=en?"Stop":"停止";
  feedback(en?"Playing preview…":"正在播放试听…");
  await playSpeechBlob(blob,generation);
  feedback(en?"Preview finished · save changes to apply your selection":"试听结束 · 音色选择需保存后生效");
 }catch(error){
  if(timedOut)feedback(en?"Preview timed out. Tap Preview to retry. Your selection is retained.":"试听等待超时，点击试听重试；音色选择仍保留。",true);
  else if(error?.name!=="AbortError")feedback(en?"Preview could not play. Tap Preview to retry. Your selection is retained.":"试听暂时无法播放，点击试听重试；音色选择仍保留。",true);
 }
 finally{clearTimeout(timer);if(current()){button.classList.remove("is-loading","is-playing");button.removeAttribute("aria-busy");button.querySelector("span").textContent=en?"Preview":"试听"}}
}
function voicePicker(selected,gender="all"){
 const visible=voiceCatalog.filter(v=>gender==="all"||v.gender===gender);
 const en=state.settings.locale==="en-US";
 const text=value=>esc(translate(value,state.settings.locale)),current=voiceById(selected);
 return `<div class="voice-picker">
  <div class="voice-picker-head"><div><b>${text("选择声音")}</b><small>${text("切换音色会自动播放固定试听句")}</small></div><div class="voice-gender-tabs" role="group" aria-label="${en?"Voice type":"声音类型"}">${[["all","全部"],["female","女声"],["male","男声"],["neutral","中性"]].map(([id,label])=>`<button type="button" data-voice-gender="${id}" class="${gender===id?"active":""}" aria-pressed="${gender===id}">${text(label)}</button>`).join("")}</div></div>
  <p class="voice-current-selection">${en?"Current selection":"当前选择"}：${text(current.name)} · ${text(current.genderLabel)}</p>
  <p class="voice-save-hint">${en?"Preview does not save your voice. Save changes to apply it to conversations.":"试听不会自动保存音色，请点击「保存更改」后用于对话。"}</p>
  <div class="voice-options">${visible.map(v=>`<div class="voice-option ${selected===v.id?"active":""}" data-voice-card="${v.id}"><button type="button" class="voice-select" data-voice-select="${v.id}" aria-pressed="${selected===v.id}"><i aria-hidden="true">${v.mark}</i><span><b>${text(v.name)}</b><small>${text(v.genderLabel)} · ${text(v.tone)}</small></span><em>${text(selected===v.id?"已选择":"选择")}</em></button><button type="button" class="voice-preview" data-voice-preview="${v.id}" aria-label="${en?"Preview ":"试听"}${text(v.name)}" aria-describedby="voice-preview-status-${v.id}"><i aria-hidden="true"></i><span>${en?"Preview":"试听"}</span></button><p id="voice-preview-status-${v.id}" class="voice-preview-status" role="status" aria-live="polite"></p></div>`).join("")}</div>
 </div>`
}
async function fetchSpeechSegment(planId,index,generation){
 const controller=new AbortController();speechPlayback.controller=controller;
 const response=await fetch("./api/speech",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({planId,index}),signal:controller.signal});
 if(generation!==speechPlayback.generation)throw new DOMException("Cancelled","AbortError");
 if(!response.ok)throw new Error(`speech_${response.status}`);
 return response.blob()
}
function playSpeechBlob(blob,generation){
 return new Promise((resolve,reject)=>{
  if(generation!==speechPlayback.generation)return reject(new DOMException("Cancelled","AbortError"));
  const url=URL.createObjectURL(blob),audio=new Audio(url);speechPlayback.audio=audio;speechPlayback.url=url;
  let settled=false;
  const finish=error=>{if(settled)return;settled=true;audio.onended=null;audio.onerror=null;URL.revokeObjectURL(url);if(speechPlayback.url===url){speechPlayback.url=null;speechPlayback.audio=null;speechPlayback.cancel=null}if(error)reject(error);else resolve()};
  speechPlayback.cancel=()=>{audio.pause();finish(new DOMException("Cancelled","AbortError"))};
  audio.onended=()=>finish();audio.onerror=()=>finish(new Error("audio_playback_failed"));audio.play().catch(finish)
 })
}
async function speakReply(speech,reply){
 stopSpeech();if(!state.settings.autoSpeak)return;
 const generation=speechPlayback.generation,segments=Array.isArray(speech?.segments)?speech.segments.filter(Boolean):[];
 if(!speech?.planId||!segments.length){browserSpeak(reply);return}
 speechState(true);
 // Prefetch can fail while another segment is still playing. Attach the
 // rejection handler immediately, and surface it only when consuming it.
 const preload=index=>fetchSpeechSegment(speech.planId,index,generation).then(
  blob=>({blob}),error=>({error})
 );
 let next=preload(0);
 let index=0;
 try{
  for(;index<segments.length;index++){
   const result=await next;
   if(result.error)throw result.error;
   if(generation!==speechPlayback.generation)throw new DOMException("Cancelled","AbortError");
   next=index+1<segments.length?preload(index+1):null;
   await playSpeechBlob(result.blob,generation)
  }
  if(generation===speechPlayback.generation)speechState(false);
 }catch(error){
  if(error?.name!=="AbortError"&&generation===speechPlayback.generation)browserSpeak(segments.slice(index).join("")||reply)
 }
}
function moodById(id){return aliveMoods.find(m=>m.id===id)||aliveMoods[0]}
function styleById(id){return aliveStyles.find(s=>s.id===id)||aliveStyles[0]}
function moodClass(id){return `mood-${(id||"curious").replace(/[^a-z0-9_-]/gi,"")}`}
function aliveAvatar(a,variant="stage"){const mood=moodById(a?.mood),style=styleById(a?.visualStyle);return `<div class="alive-avatar ${variant} style-${esc(a?.visualStyle||"glow")} ${moodClass(a?.mood)}" style="--mood:${esc(mood.color)}"><img src="${esc(a?.image||"reference/post-image.jpg")}" alt="${esc(a?.name||"Second Me")}"><span class="alive-aura"></span><span class="alive-ring"></span><span class="alive-scan"></span><div class="alive-tags"><b>${esc(mood.name)}</b><small>${esc(style.name)}</small></div></div>`}
function aliveSpark(a){const mood=moodById(a?.mood),style=styleById(a?.visualStyle);return `${mood.name}人格 · ${style.name} · 能量 ${a?.energy||72}%`}
function studioIdentity(a){const mood=moodById(a?.mood),style=styleById(a?.visualStyle);return `<div class="identity-stage-core style-${esc(a?.visualStyle||"glow")}" style="--mood:${esc(mood.color)}">
 <div class="identity-orbit orbit-one"></div><div class="identity-orbit orbit-two"></div><div class="identity-orbit orbit-three"></div>
 <div class="identity-stage-portrait"><img src="${esc(a?.image||"reference/post-image.jpg")}" alt="${esc(a?.name||"Second Me")}"><span></span></div>
 <div class="identity-stage-copy"><span>DIGITAL PERSONA ONLINE</span><h2>${esc(a?.name||"Second Me")}</h2><p>${esc(a?.spark||mood.hint)}</p></div>
 <div class="identity-stage-metrics"><div><b>${esc(mood.name)}</b><small>当前情绪</small></div><div><b>${a?.energy||72}%</b><small>人格能量</small></div><div><b>${esc(style.name)}</b><small>视觉身份</small></div></div>
 </div>`}
function counts(){$("#avatarCount").textContent=state.avatars.length;$("#memoryCount").textContent=state.memories.length;renderAccess()}
function renderAccess(){
 const user=access.user,remaining=access.trialRemaining??3,expiry=access.subscriptionExpiresAt?new Date(access.subscriptionExpiresAt):null,name=user?.displayName||user?.email||translate("游客",state.settings.locale);
 $("#profileName").textContent=name;$("#profileAvatar").textContent=name.slice(0,1).toUpperCase();
 if(access.subscriptionActive){
  $("#accessLabel").textContent=translate("使用权有效",state.settings.locale);$("#usageText").textContent=expiry?.toLocaleDateString(state.settings.locale)||"";
  $("#accessHint").textContent=translate("到期后手动续费，不会自动扣款",state.settings.locale);$("#usageBar").style.width="100%";$("#profileHint").textContent=translate("Second Me 已开通",state.settings.locale)
 }else{
  $("#accessLabel").textContent=translate("免费体验",state.settings.locale);$("#usageText").textContent=translate(`剩余 ${remaining} 次`,state.settings.locale);
  $("#accessHint").textContent=remaining?translate("真实模型对话额度",state.settings.locale):translate("体验已用完",state.settings.locale);$("#usageBar").style.width=`${Math.max(0,remaining)/3*100}%`;
  $("#profileHint").textContent=access.authenticated?translate("0.9 元开通 7 天",state.settings.locale):translate("登录后开通使用权",state.settings.locale)
 }
}
async function refreshAccess(){try{const r=await fetch("./api/access-status",{credentials:"same-origin"});if(r.ok){access=await r.json();renderAccess()}}catch{}return access}
const labels={overview:"总览",avatars:"我的分身",studio:"实时工作室",memory:"记忆库",content:"内容创作",settings:"设置"};
function head(k,title,sub,actions=""){return `<div class="page-head"><div><p class="eyebrow">${k}</p><h1>${title}</h1><p>${sub}</p></div><div class="head-actions">${actions}</div></div>`}
function overview(){
 const a=activeIdentity(state),summary=workspaceSummary(state),voice=voiceById(a.voice),en=state.settings.locale==="en-US";
 return `${head("YOUR SECOND SELF","你的第二人格","从一段对话开始，慢慢建立更懂你的数字分身。")}
 <section class="overview-current" aria-label="${en?"Current self":"当前分身"}">
  <div class="overview-portrait">${aliveAvatar(a,"card")}</div>
  <div class="overview-current-copy"><p class="eyebrow">当前分身</p><h2>${esc(a.name)}</h2><p class="overview-role">${esc(a.role)}</p><p class="overview-bio">${esc(a.bio)}</p>
   <div class="overview-config"><span>${esc(moodById(a.mood).name)}</span><span>${esc(styleById(a.visualStyle).name)}</span><span>${esc(localizedVoice(a.voice))}</span></div>
   <div class="overview-main-actions"><button class="primary" data-go="studio">继续对话</button><button class="secondary" data-edit="${esc(a.id)}">配置分身</button></div>
   <button class="text-btn overview-manage" data-go="avatars">查看全部分身</button>
  </div>
 </section>
 <div class="overview-records" aria-label="${en?"Workspace records":"工作区记录"}">
  <div><span>数字分身</span><b data-overview-count="selves">${summary.selves}</b></div>
  <div><span>已保存记忆</span><b data-overview-count="memories">${summary.memories}</b></div>
  <div><span>已完成回复</span><b data-overview-count="replies">${summary.completedReplies}</b></div>
 </div><p class="overview-record-note">统计来自当前保留的工作区记录，不代表模型训练进度。</p>
 <div class="overview-next-grid">
  <section class="overview-next"><p class="eyebrow">接着聊</p><h3>上次聊到这里</h3><p class="overview-last-question">${summary.latestQuestion?esc(summary.latestQuestion):translate("还没有对话记录。试着聊聊今天的想法。",state.settings.locale)}</p><button class="secondary" data-go="studio">打开对话</button></section>
  <section class="overview-next"><p class="eyebrow">让 TA 更懂你</p><h3>添加一条你的记忆</h3><p>告诉分身你的经历、习惯或表达偏好，由你选择在对话中引用。</p><button class="secondary" data-go="memory">管理记忆</button></section>
 </div>`;
}
function avatars(){return `${head("IDENTITY LIBRARY / 01","我的分身","创建不同角色，让每个分身拥有独立人格、声音与记忆。",`<button class="primary" data-new-avatar>＋ 创建新分身</button>`)}
<div class="grid avatar-grid">${state.avatars.map((a,i)=>{const voice=voiceById(a.voice);return `<article class="avatar-card ${moodClass(a.mood)}" style="--mood:${esc(moodById(a.mood).color)}"><div class="visual">${aliveAvatar(a,"card")}<span class="avatar-status">● ${esc(translate(a.status,state.settings.locale))}</span></div><div class="avatar-info"><div class="avatar-title-row"><h3>${esc(a.name)}</h3><span>${esc(moodById(a.mood).name)}</span></div><p>${esc(a.bio)}</p><div class="avatar-spark">${esc(a.spark||aliveSpark(a))}</div><div class="avatar-voice-control"><div><small>当前声音</small><b>${esc(localizedVoice(a.voice))}</b></div><button type="button" data-voice-settings="${a.id}">声音设置</button></div><div class="avatar-meta"><span>VOICE / ${esc(voice.id.toUpperCase())}</span><span>${a.created}</span></div><div class="head-actions" style="margin-top:13px"><button class="secondary small" data-edit="${a.id}">编辑形象</button><button class="primary small" data-go="studio">开始对话</button>${i?`<button class="danger small" data-delete-avatar="${a.id}">删除</button>`:""}</div></div></article>`}).join("")}<button class="new-card" data-new-avatar><div><i>＋</i><b>唤醒新分身</b><small>照片、情绪、美化风格，约 2 分钟</small></div></button></div>`}
function studio(){const a=activeIdentity(state);return `${head("LIVE SESSION / 02","实时工作室",`正在与 ${esc(a.name)} 对话 · 人格与长期记忆已接入`,`<span class="model-state" id="modelState">● 正在连接模型</span><button class="secondary" id="clearChat">清空对话</button>`)}
<div class="studio-identity-bar"><div class="studio-identity-select"><img src="${esc(a.image)}" alt=""><label for="studioAvatar">当前分身</label><select id="studioAvatar">${state.avatars.map(avatar=>`<option value="${esc(avatar.id)}" ${avatar.id===a.id?"selected":""}>${esc(avatar.name)} · ${esc(avatar.role)}</option>`).join("")}</select></div><div class="studio-identity-voice"><span>${esc(localizedVoice(a.voice))}</span><button class="secondary small" data-voice-settings="${esc(a.id)}">声音设置</button></div></div>
<div class="studio-layout"><section class="stage identity-stage ${moodClass(a.mood)} is-idle" id="liveStage" style="--mood:${esc(moodById(a.mood).color)}"><span class="stage-label">● ALIVE AVATAR / MOOD SYNC</span><div class="mood-strip">${aliveMoods.map(m=>`<button data-stage-mood="${m.id}" class="${a.mood===m.id?"active":""}" style="--mood:${m.color}">${m.name}</button>`).join("")}</div>${studioIdentity(a)}<div class="stage-state"><i></i><span id="stageStatus">等待你的输入</span></div><div class="stage-controls"><div><p>ACTIVE IDENTITY / A–01</p><small id="stageSpark">${esc(aliveSpark(a))}</small></div></div></section>
<section class="studio-side"><div class="tabs"><button class="active" data-studio-tab="chat">对话</button><button data-studio-tab="persona">人格参数</button><button data-studio-tab="memory">引用记忆 <b>${state.selectedMemories.length}</b></button></div><div class="studio-panel" id="studioPanel"></div><form class="composer" id="chatForm"><textarea id="chatInput" aria-label="${state.settings.locale==="en-US"?"Message":"消息"}" aria-describedby="voiceInputStatus" placeholder="输入消息，按 Enter 发送…"></textarea><button type="submit" aria-label="发送消息">➤</button><div class="voice-input-row"><button type="button" id="voiceBtn" aria-describedby="voiceInputStatus"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></button><p id="voiceInputStatus" role="status"></p></div></form></section></div>`}
function memory(){return `${head("MEMORY VAULT / 03","记忆库","保存真实经历与偏好，在对话中由你选择引用。")}
<div class="memory-toolbar"><label for="memorySearch">搜索记忆<input type="search" id="memorySearch" placeholder="搜索标题或内容"></label><label for="memoryFilter">分类<select id="memoryFilter"><option value="">全部</option><option value="偏好">偏好</option><option value="背景">背景</option><option value="表达">表达</option><option value="知识">知识</option></select></label><button class="primary" id="addMemory">添加记忆</button></div>
<div class="memory-library-note"><span id="memoryResults" role="status" aria-live="polite"></span><button class="text-btn" id="exportMemory">导出记忆</button></div>
<div class="memory-library" id="memoryLibrary"></div>`}
function content(){return contentView(state)}
function settings(){
 const en=state.settings.locale==="en-US",remaining=Math.max(0,access.trialRemaining??3),expiry=access.subscriptionExpiresAt?new Date(access.subscriptionExpiresAt).toLocaleDateString(state.settings.locale):"";
 const accessTitle=access.subscriptionActive?(en?"Access active":"使用权有效"):(access.authenticated?(en?"Unlock Second Me":"开通 Second Me"):(en?"Sign in to keep your work":"登录保存并继续"));
 const accessDetail=access.subscriptionActive
  ?(en?`Valid until ${expiry}. Renewal is manual; you will never be charged automatically.`:`有效期至 ${expiry}。到期后手动续费，不会自动扣款。`)
  :(access.authenticated?(en?`${remaining} free turns left · ¥0.9 for 7 days · manual renewal`:`剩余 ${remaining} 次免费体验 · ¥0.9 使用 7 天 · 手动续费`):(en?"This guest workspace belongs to this browser. Sign in before changing devices.":"游客工作区仅绑定此浏览器，换设备前请先登录。"));
 return `${head("SYSTEM / 05","设置","调整对话体验，管理你的工作区数据。")}
<div class="settings-status" id="settingsFeedback" role="status" aria-live="polite">更改会在服务器确认后保存。</div>
<div class="grid settings-grid"><section class="setting access-setting"><div><p class="eyebrow">ACCOUNT & ACCESS</p><h3>${accessTitle}</h3><p>${accessDetail}</p></div>${access.subscriptionActive?"":`<button class="primary" id="manageAccess">${access.authenticated?(en?"View plan":"查看开通方案"):(en?"Sign in / create account":"登录 / 注册")}</button>`}</section>
<section class="setting"><h3>对话与声音</h3>${settingToggle("自动朗读回复","优先使用 Second Me 实时语音，失败时回退系统声音","autoSpeak")}<div class="setting-row"><div><label for="settingsLocale">界面语言</label><small>影响系统文案和生成语言</small></div><select id="settingsLocale"><option value="zh-CN">简体中文</option><option value="en-US">English</option></select></div><div class="setting-row"><div><b>记忆使用方式</b><small>记忆由你手动添加，并在工作室选择引用；不会自动提取对话。</small></div><button class="secondary" data-go="memory">管理记忆</button></div></section>
<section class="setting"><h3>隐私与数据</h3><div class="setting-row"><div><b>工作区保存范围</b><small>${translate(access.authenticated?"当前工作区按统一账号保存。":"当前工作区按此浏览器的匿名身份保存；换设备前请先登录。",state.settings.locale)}</small><small>头像、分身、记忆与对话会保存到服务器；浏览器保留缓存。</small></div></div><div class="setting-row"><div><b>导出工作区</b><small>下载包含头像、配置和对话的 JSON 文件，请妥善保管。</small></div><button class="secondary" id="exportAll">导出</button></div><details class="settings-danger"><summary>高级数据操作</summary><div class="setting-row"><div><b>重置工作区</b><small>${state.settings.locale==="en-US"?"Restore the example self with an empty memory library. This clears workspace conversations and custom settings, not your account or paid access.":"恢复体验示例分身和空记忆库，清除当前工作区的对话与自定义配置；不影响账号或付费权益。"}</small></div><button class="danger" id="resetAll">重置工作区</button></div></details></section></div>`}
function settingToggle(title,sub,key){return `<div class="setting-row"><div><b>${title}</b><small>${sub}</small></div><button role="switch" aria-checked="${Boolean(state.settings[key])}" aria-label="${translate(title,state.settings.locale)}" class="switch ${state.settings[key]?"on":""}" data-setting="${key}"><i></i></button></div>`}
const views={overview,avatars,studio,memory,content,settings};
let disposeVoiceInput=null;
let chatDraft=null;
let personaDraft=null;
let memoryDraft=null;
function route(){personaDraft?.dispose();personaDraft=null;memoryDraft?.dispose();memoryDraft=null;if(!workspaceReady){renderWorkspaceRecovery();return}disposeVoiceInput?.();disposeVoiceInput=null;initializeIdentityState(state);const requested=location.hash.slice(1).split("?",1)[0]||"overview",r=views[requested]?requested:"overview";$("#crumb").textContent=labels[r];$$("[data-route]").forEach(a=>{const current=a.dataset.route===r;a.classList.toggle("active",current);if(current)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});$("#page").classList.toggle("studio-page",r==="studio");$("#page").innerHTML=views[r]();bind(r);$(".sidebar").classList.remove("open");localize()}
function renderWorkspaceRecovery(){
 const en=state.settings.locale==="en-US";
 $("#page").classList.remove("studio-page");
 $("#page").innerHTML=`<section class="workspace-recovery"><p class="eyebrow">WORKSPACE CONNECTION</p><h1>${en?"Your workspace could not be restored":"暂时无法恢复你的工作区"}</h1><p role="alert">${en?"We could not confirm your identity or reach saved data. Editing is paused to avoid overwriting your configuration. Your browser cache has not been cleared.":"身份确认或已保存数据读取失败。为避免覆盖配置，暂时停止编辑；浏览器缓存没有被清除。"}</p><button class="primary" id="retryWorkspace">${en?"Retry restore":"重试恢复"}</button><span id="workspaceRetryStatus" role="status"></span></section>`;
 $("#retryWorkspace").onclick=async event=>{event.currentTarget.disabled=true;$("#workspaceRetryStatus").textContent=en?"Restoring…":"正在恢复…";await refreshAccess();await restoreWorkspace();route()};
}
function go(r){location.hash=r}
function showWorkspaceConflict(){
 if($("#workspaceConflict"))return;
 const en=state.settings.locale==="en-US",banner=document.createElement("section");
 banner.id="workspaceConflict";banner.setAttribute("role","alert");
 banner.innerHTML=`<p>${en?"Saved data changed in another page. This page cannot overwrite it. Export your changes before loading the latest version.":"另一页面已更新配置，本页不能覆盖。请先导出本页修改，再加载最新配置。"}</p><button class="secondary" id="exportConflict">${en?"Export this page":"导出本页修改"}</button><button class="secondary" id="reloadConflict">${en?"Load latest":"加载最新配置"}</button>`;
 const modalOpen=!$("#backdrop").classList.contains("hidden");
 (modalOpen?$("#modalBody"):document.body).append(banner);
 banner.tabIndex=-1;banner.focus();
 const backup=()=>conflictBackup(conflictSnapshot||state,document,pendingImage);
 $("#exportConflict").onclick=()=>download("second-me-conflict-backup.json",backup());
 $("#reloadConflict").onclick=async()=>{
  if(!confirm(en?"This replaces this page with server data. Export your changes first. Continue?":"将用服务器数据替换本页，请先导出需要保留的修改。继续吗？"))return;
  try{localStorage.setItem(`second-me-conflict:${workspaceScope}`,JSON.stringify(backup()))}
  catch{toast(en?"Backup failed. Export your changes before continuing.":"本地备份失败，请先导出修改再继续。");return}
  await workspaceSaveChain.catch(()=>false);
  if(await restoreWorkspace()){avatarIsSaving=false;closeModal(true);banner.remove();route()}else{banner.remove();route()}
 };
}
let modalReturnFocus=null,avatarIsDirty=null,avatarIsSaving=false,builderDraft=null,avatarPhotoReading=false,discardPrompt=null;
function openModal(html){if(!workspaceReady)return;hideDiscardPrompt(false);modalReturnFocus=document.activeElement;$("#modalBody").innerHTML=html;$("#backdrop").classList.remove("hidden");$(".shell").inert=true;localize();$("#modalClose").focus()}
function hideDiscardPrompt(restoreFocus=true){
 if(!discardPrompt)return;
 const returnFocus=discardPrompt.returnFocus;
 discardPrompt.element.remove();discardPrompt=null;
 $("#modalBody").inert=false;$("#modalClose").disabled=false;
 if(restoreFocus)returnFocus?.focus({preventScroll:true});
}
function showDiscardPrompt(){
 if(discardPrompt)return;
 const returnFocus=document.activeElement,element=document.createElement("div");
 element.className="discard-prompt";
 element.innerHTML=`<section class="discard-card" role="alertdialog" aria-modal="true" aria-labelledby="discardTitle" aria-describedby="discardDescription"><span aria-hidden="true">!</span><div><p class="eyebrow">UNSAVED CHANGES</p><h3 id="discardTitle">保留这次修改吗？</h3><p id="discardDescription">这些修改还没有保存。继续编辑不会丢失内容；放弃后无法恢复本次修改。</p></div><div class="discard-actions"><button class="secondary" id="keepEditing">继续编辑</button><button class="danger" id="discardChanges">放弃修改</button></div></section>`;
 $(".modal").append(element);discardPrompt={element,returnFocus};
 $("#modalBody").inert=true;$("#modalClose").disabled=true;localize();
 $("#keepEditing").onclick=()=>hideDiscardPrompt();
 $("#discardChanges").onclick=()=>closeModal(true);
 $("#keepEditing").focus();
}
function closeModal(force=false){if(avatarIsSaving)return;if(!force&&avatarIsDirty?.()){showDiscardPrompt();return}hideDiscardPrompt(false);builderDraft?.clear();builderDraft=null;clearTimeout(manualPayTimer);activePaymentOrder=null;stopSpeech();$("#backdrop").classList.add("hidden");$(".shell").inert=false;pendingImage="";avatarPreviewRefresh=null;avatarIsDirty=null;modalReturnFocus?.focus()}
function authUrl(mode){return `https://auth.lifeyoume.icu/${mode}?return_to=${encodeURIComponent("https://lifeyoume.icu/second-me/#studio")}`}
function accessModal(){
 clearTimeout(manualPayTimer);
 activePaymentOrder=null;
 const en=state.settings.locale==="en-US",logged=access.authenticated,isManual=access.payment?.mode==="manual-mobile",remaining=Math.max(0,access.trialRemaining??3),exhausted=remaining===0;
 openModal(`<div class="access-modal"><p class="eyebrow">SECOND ME ACCESS</p><span class="access-mark">${remaining} / 3</span><h2>${exhausted?(en?"Your free experience is complete":"3 次免费体验已用完"):(en?"Choose how to continue":"选择如何继续")}</h2><p>${exhausted?(en?"Unlock seven days of chat and content creation.":"开通后即可使用 7 天对话与内容创作。"):(en?`You still have ${remaining} free turns. Keep trying at no cost, or unlock seven days.`:`你还有 ${remaining} 次免费体验；可继续免费试用，也可开通 7 天使用权。`)}</p>
 <div class="price-card"><div><b>¥0.9</b><span>/ ${en?"7 days":"7 天"}</span></div><strong>${en?"One-time purchase":"单次购买"}</strong><p>${en?"No automatic renewal. When access expires, you decide whether to renew manually.":"不会自动续费。到期后由你决定是否手动续费，不会自动扣款。"}</p></div>
 ${logged?`<button class="primary access-primary" id="buyAccess">${access.payment?.enabled?(isManual?(en?"Pay by QR · phone confirmation":"扫码付款 · 手机确认"):(en?"Pay ¥0.9 with Alipay":"支付宝支付 ¥0.9")):(en?"Payment setup in progress":"支付配置中")}</button><button class="secondary access-secondary" id="refreshEntitlement">${en?"I have paid — refresh status":"我已付款，刷新确认状态"}</button>`:`<a class="primary access-primary" href="${authUrl("login")}">${en?"Sign in and continue":"登录并继续"}</a><a class="secondary access-secondary" href="${authUrl("register")}">${en?"Create a LifeYouMe account":"创建统一账号"}</a>`}
 ${remaining?`<button class="secondary access-secondary" id="continueTrial">${en?"Keep trying for free":"继续免费体验"}</button>`:""}<p id="accessFeedback" role="status" aria-live="polite"></p>
 <small>${en?"LifeYouMe unified account · Second Me branded access":"LifeYouMe 统一账号 · Second Me 独立体验入口"}</small></div>`);
 $("#continueTrial")?.addEventListener("click",()=>closeModal());
 if(logged){$("#buyAccess").disabled=!access.payment?.enabled;$("#buyAccess").onclick=isManual?startManualPayment:startPayment;$("#refreshEntitlement").onclick=async()=>{await refreshAccess();if(access.subscriptionActive){closeModal();toast(en?"Access activated":"7 天使用权已生效")}else toast(en?"Payment is not confirmed yet":"暂未确认到账，请稍后再试")}}
}
async function startPayment(){
 const popup=window.open("about:blank","second_me_alipay");if(popup)popup.document.write(`<body style="background:#070a0f;color:#edf3f4;font:16px sans-serif;display:grid;place-items:center;height:100vh">正在连接支付宝…</body>`);
 try{const response=await fetch("./api/payment/create",{method:"POST",credentials:"same-origin"}),data=await response.json();if(!response.ok)throw new Error(data.message||data.error);if(!popup)throw new Error("popup_blocked");popup.document.open();popup.document.write(data.paymentHtml);popup.document.close();toast(state.settings.locale==="en-US"?"Alipay opened in a new window":"已打开支付宝支付页面")}catch(error){popup?.close();toast(error.message==="支付配置中"?error.message:translate("暂时无法发起支付",state.settings.locale))}
}
async function startManualPayment(){
 const en=state.settings.locale==="en-US",button=$("#buyAccess"),feedback=$("#accessFeedback");if(button?.disabled)return;if(button)button.disabled=true;if(feedback)feedback.textContent=en?"Creating order…":"正在创建订单…";
 try{
  const response=await fetch("./api/payment/manual/create",{method:"POST",credentials:"same-origin"}),data=await response.json();
  if(!response.ok)throw new Error(data.error||"manual_payment_failed");
  if(button?.isConnected)showManualPayment(data.order);
 }catch(error){if(feedback?.isConnected)feedback.textContent=en?"Order creation failed. Please try again.":"订单创建失败，请重试。"}
 finally{if(button?.isConnected)button.disabled=false}
}
let activePaymentOrder=null;
function showManualPayment(order){
 clearTimeout(manualPayTimer);
 activePaymentOrder=order.outTradeNo;
 const en=state.settings.locale==="en-US";
 openModal(`<div class="manual-pay-modal"><p class="eyebrow">MANUAL MOBILE PAYMENT</p><h2>${en?"Scan to pay ¥0.90":"扫码支付 ¥0.90"}</h2><p>${en?"After payment, I will confirm receipt on my phone. This page will unlock automatically.":"付款后我会在手机上核对到账并确认，本页会自动开通 7 天使用权。"}</p>
 <div class="manual-pay-card"><div class="manual-qr"><img src="${esc(order.qrUrl||"./manual-pay-qr.png")}" alt="${en?"Payment QR code":"收款二维码"}" onerror="this.closest('.manual-qr').classList.add('missing');this.remove()"><span>${en?"QR code not configured yet":"收款码配置中"}</span></div><div class="manual-pay-steps"><div><b>${en?"1. Pay exact amount":"1. 精确付款"}</b><p>¥${esc(order.amount||"0.90")}</p></div><div><b>${en?"2. Add note / message":"2. 备注/留言填写"}</b><p class="payment-code">${esc(order.remark||order.outTradeNo)}</p></div><div><b>${en?"3. Wait for phone confirmation":"3. 等待手机确认"}</b><p>${en?"No auto-renewal. No automatic charge.":"不会自动续费，也不会自动扣款。"}</p></div></div></div>
 <div class="payment-status" id="manualPayStatus"><i></i><span>${en?"Waiting for confirmation…":"等待手机确认到账…"}</span></div>
 <button class="secondary access-secondary" id="manualRefresh">${en?"Refresh status":"刷新确认状态"}</button>
 <small>${en?"Order":"订单号"}：${esc(order.outTradeNo)}</small></div>`);
 $("#manualRefresh").onclick=()=>pollManualPayment(order.outTradeNo,true);
 pollManualPayment(order.outTradeNo,false);
}
async function pollManualPayment(outTradeNo,manual=false){
 if(activePaymentOrder!==outTradeNo||$("#backdrop").classList.contains("hidden"))return;
 const en=state.settings.locale==="en-US";
 try{
  const response=await fetch(`./api/payment/manual/status?out_trade_no=${encodeURIComponent(outTradeNo)}`,{credentials:"same-origin",cache:"no-store"}),data=await response.json();
  if(activePaymentOrder!==outTradeNo||$("#backdrop").classList.contains("hidden"))return;
  if(!response.ok)throw new Error(data.error||"status_failed");
  if(data.subscriptionActive||data.order?.status==="PAID"){
   access={...access,subscriptionActive:true,subscriptionExpiresAt:data.subscriptionExpiresAt};
   renderAccess();closeModal();toast(en?"Access activated":"7 天使用权已生效");return;
  }
  const el=$("#manualPayStatus");if(el)el.querySelector("span").textContent=manual?(en?"Not confirmed yet. I will confirm on phone after receipt.":"暂未确认到账；手机确认后会自动开通。"):(en?"Waiting for phone confirmation…":"等待手机确认到账…");
 }catch{const el=$("#manualPayStatus");if(activePaymentOrder===outTradeNo&&el)el.querySelector("span").textContent=en?"Status connection failed. Refresh to retry; do not pay again.":"确认状态连接失败，可刷新重试，请勿重复付款。"}
 if(activePaymentOrder===outTradeNo&&!$("#backdrop").classList.contains("hidden")){clearTimeout(manualPayTimer);manualPayTimer=setTimeout(()=>pollManualPayment(outTradeNo,false),3500)}
}
function avatarModal(id,focusVoice=false){
 if(!workspaceReady)return;
 builderDraft=null;
 avatarPhotoReading=false;
 const a=id?state.avatars.find(x=>x.id===id):null,draft={...normalizeAvatar(a||{},0),name:a?.name||"",role:a?.role||"",bio:a?.bio||"",image:a?.image||"",voice:normalizeVoice(a?.voice),voiceGender:"all",mood:a?.mood||state.persona.mood||"curious",visualStyle:a?.visualStyle||"glow",energy:a?.energy||72,spark:a?.spark||""};pendingImage=draft.image||"";
 openModal(`<div class="alive-builder"><p class="eyebrow">ALIVE IDENTITY BUILDER</p><h2>${a?"编辑生动分身":"唤醒一个更生动的第二人格"}</h2><p>不是展示原始证件照，而是把照片当作身份素材：选择吸引力、情绪和审美风格，生成更适合对话的数字人格。</p><form id="avatarForm"><div class="builder-savebar"><div><small>当前配置</small><b id="saveSummary">${esc(moodById(draft.mood).name)} · ${esc(styleById(draft.visualStyle).name)} · ${esc(voiceById(draft.voice).name)}</b></div><button class="primary">${a?"保存更改":"唤醒数字人"}</button></div><div class="create-grid alive-create-grid"><div class="alive-preview-wrap"><section class="source-photo-panel"><div><span>源照片</span><p>仅作为身份素材，不作为最终展示效果。</p></div><button type="button" class="photo-drop alive-photo ${a?"has-image":""}" id="photoDrop">${a?`<img src="${esc(a.image)}" alt="">`:""}<span class="drop-copy"><b>＋ 更换照片</b><small>正面清晰即可，系统会弱化证件照感</small></span><span class="beauty-badge">素材</span></button></section><div id="alivePreview" class="alive-preview-note"></div></div><div class="create-form alive-form">
  <section class="essential-fields"><div><span>基础身份</span><small>始终显示，可随时修改</small></div><label>分身名字<input id="avName" required maxlength="18" value="${esc(draft.name)}" placeholder="例如：Mira"></label><label>角色定位<input id="avRole" required value="${esc(draft.role)}" placeholder="例如：创作搭档 / 情绪陪伴 / 商业表达"></label></section>
  <div class="config-stack">
   <details class="config-section" data-config-section="mood"><summary><span><small>情绪气质</small><b id="moodSummary">${esc(moodById(draft.mood).name)} · ${esc(moodById(draft.mood).tag)}</b></span><em>更改</em></summary><div class="config-panel"><div class="choice-block"><span>今天想让 TA 怎么吸引人？</span><div class="mood-choices">${aliveMoods.map(m=>`<button type="button" data-mood-choice="${m.id}" class="${draft.mood===m.id?"active":""}" style="--mood:${m.color}"><b>${m.name}</b><small>${m.tag}</small></button>`).join("")}</div><small id="moodHint">${esc(moodById(draft.mood).hint)}</small></div></div></details>
   <details class="config-section" data-config-section="style"><summary><span><small>视觉风格</small><b id="styleSummary">${esc(styleById(draft.visualStyle).name)}</b></span><em>更改</em></summary><div class="config-panel"><div class="choice-block"><span>照片美化方向</span><div class="style-choices">${aliveStyles.map(s=>`<button type="button" data-style-choice="${s.id}" class="${draft.visualStyle===s.id?"active":""}"><b>${s.name}</b><small>${s.desc}</small></button>`).join("")}</div></div></div></details>
   <details class="config-section" data-config-section="voice" ${focusVoice?"open":""}><summary><span><small>声音</small><b id="voiceSummary">${esc(voiceById(draft.voice).name)} · ${esc(voiceById(draft.voice).genderLabel)}</b></span><em>更改与试听</em></summary><div class="config-panel"><div id="voicePicker">${voicePicker(draft.voice,draft.voiceGender)}</div></div></details>
   <details class="config-section" data-config-section="advanced"><summary><span><small>人格细节</small><b id="advancedSummary">表达方式与能量 ${draft.energy}%</b></span><em>高级配置</em></summary><div class="config-panel advanced-fields"><label>人格火花<textarea id="avSpark" maxlength="120" placeholder="一句让人想和 TA 聊下去的话">${esc(draft.spark||"")}</textarea></label><label>人格描述<textarea id="avBio" required placeholder="它如何思考与表达？">${esc(draft.bio)}</textarea></label><label>能量值 <b id="energyValue">${draft.energy}%</b><input id="avEnergy" type="range" min="20" max="100" value="${draft.energy}"></label></div></details>
  </div>
 </div></div></form></div>`);
 const builder=$(".alive-builder"),header=document.createElement("header");
 const en=state.settings.locale==="en-US";
 builder.querySelector("h2").textContent=en?(a?"Edit your second self":"Create your second self"):(a?"编辑分身":"创建你的第二人格");
 builder.querySelector(".eyebrow").textContent="SECOND SELF BUILDER";
 builder.querySelector("p:not(.eyebrow)").textContent=en?"Set a photo, personality and voice for conversations. This is a styled photo preview, not an animated or lip-synced digital human.":"设置照片、人格与声音，开始与你的分身对话。当前展示为照片风格预览，尚不支持数字人表情、口型或视频生成。";
 builder.querySelector(".builder-savebar .primary").textContent=en?(a?"Save changes":"Create self"):(a?"保存更改":"创建分身");
 builder.querySelector(".source-photo-panel p").textContent=en?"Your photo is displayed with the selected visual effects.":"使用你的原照片，叠加所选界面视觉效果。";
 builder.querySelector(".drop-copy small").textContent=en?"Choose a clear portrait; no AI face editing is applied.":"选择清晰正面照片；当前不会进行 AI 修脸或图像生成。";
 const capabilityNote=document.createElement("p");
 capabilityNote.className="builder-capability-note";
 capabilityNote.textContent=en?"Styled photo preview only. Facial animation, lip sync and video generation are not available yet.":"当前为照片风格预览，尚不支持表情、口型或视频生成。";
 builder.querySelector(".essential-fields").prepend(capabilityNote);
 header.className="builder-header";
 [...builder.children].filter(x=>x.tagName!=="FORM").forEach(x=>header.append(x));
 builder.prepend(header);
 const form=$("#avatarForm"),savebar=$(".builder-savebar"),feedback=document.createElement("p");
 feedback.id="builderFeedback";feedback.setAttribute("role","status");feedback.setAttribute("aria-live","polite");feedback.hidden=true;
 savebar.append(feedback);
 form.querySelector(".primary").type="submit";
 const beforeEdit=()=>JSON.stringify({name:$("#avName").value,role:$("#avRole").value,bio:$("#avBio").value,spark:$("#avSpark").value,energy:$("#avEnergy").value,image:pendingImage,voice:draft.voice,mood:draft.mood,visualStyle:draft.visualStyle});
 $("#avBio").required=false;
 $("#avBio").value=draft.bio||seed.avatars[0].bio;
 const initialEdit=beforeEdit();avatarIsDirty=()=>beforeEdit()!==initialEdit;
 $("#photoDrop .drop-copy b").textContent=translate("换照片",state.settings.locale);
 $$("[data-config-section]").forEach(section=>{const hint=section.querySelector("summary em"),closedLabel=hint.textContent;section.addEventListener("toggle",()=>{hint.textContent=section.open?translate("收起",state.settings.locale):closedLabel})});
 const refreshConfigSummaries=(capture=true)=>{
  const mood=moodById(draft.mood),style=styleById(draft.visualStyle),voice=voiceById(draft.voice),energy=+($("#avEnergy")?.value||draft.energy);
  if($("#moodSummary"))$("#moodSummary").textContent=`${translate(mood.name,state.settings.locale)} · ${translate(mood.tag,state.settings.locale)}`;
  if($("#styleSummary"))$("#styleSummary").textContent=translate(style.name,state.settings.locale);
  if($("#voiceSummary"))$("#voiceSummary").textContent=`${translate(voice.name,state.settings.locale)} · ${translate(voice.genderLabel,state.settings.locale)}`;
  if($("#advancedSummary"))$("#advancedSummary").textContent=`${translate("表达方式与能量",state.settings.locale)} ${energy}%`;
  if($("#energyValue"))$("#energyValue").textContent=`${energy}%`;
  if($("#saveSummary"))$("#saveSummary").textContent=`${translate(mood.name,state.settings.locale)} · ${translate(style.name,state.settings.locale)} · ${translate(voice.name,state.settings.locale)}`;
  if(capture)builderDraft?.capture();
 };
 $$("[data-config-section]").forEach(section=>section.querySelector("summary").addEventListener("click",()=>{if(section.open)return;$$("[data-config-section]").forEach(other=>{if(other!==section)other.open=false})}));
 const bindVoicePicker=()=>{
  $$("[data-voice-gender]").forEach(x=>x.onclick=()=>{stopSpeech();draft.voiceGender=x.dataset.voiceGender;$("#voicePicker").innerHTML=voicePicker(draft.voice,draft.voiceGender);bindVoicePicker();localize();$(`[data-voice-gender="${draft.voiceGender}"]`).focus({preventScroll:true})});
  $$("[data-voice-select]").forEach(x=>x.onclick=()=>{draft.voice=x.dataset.voiceSelect;$("#voicePicker").innerHTML=voicePicker(draft.voice,draft.voiceGender);bindVoicePicker();refreshConfigSummaries();localize();$(`[data-voice-select="${draft.voice}"]`).focus({preventScroll:true});previewVoice(draft.voice,$(`[data-voice-preview="${draft.voice}"]`))});
  $$("[data-voice-preview]").forEach(x=>x.onclick=()=>previewVoice(x.dataset.voicePreview,x))
 };
 bindVoicePicker();
 if(focusVoice)requestAnimationFrame(()=>{const section=$('[data-config-section="voice"]');section?.classList.add("voice-picker-focus");section?.scrollIntoView({behavior:"auto",block:"center"});section?.querySelector("summary")?.focus({preventScroll:true})});
 const renderPreview=()=>{const preview={...draft,name:$("#avName")?.value.trim()||"Second Me",role:$("#avRole")?.value.trim()||"个人数字分身",bio:$("#avBio")?.value.trim()||draft.bio,image:pendingImage||draft.image||"reference/post-image.jpg",spark:$("#avSpark")?.value.trim()||moodById(draft.mood).hint,energy:+($("#avEnergy")?.value||draft.energy)},mood=moodById(preview.mood),style=styleById(preview.visualStyle),en=state.settings.locale==="en-US",tr=value=>translate(value,state.settings.locale);$("#alivePreview").innerHTML=`<div class="identity-result-card ${moodClass(preview.mood)} style-${esc(preview.visualStyle)}" style="--mood:${esc(mood.color)}"><div class="identity-orb"><img src="${esc(preview.image)}" alt="${esc(preview.name)}"><i></i></div><div class="identity-result-copy"><span>${esc(tr("生成预览"))}</span><h3>${esc(preview.name)}</h3><p>${esc(preview.spark)}</p><div class="identity-pills"><b>${esc(en?`${tr(mood.name)} Persona`:`${mood.name}人格`)}</b><b>${esc(tr(style.name))}</b><b>${esc(en?`Energy ${preview.energy}%`:`能量 ${preview.energy}%`)}</b></div></div><div class="identity-outcomes"><small>${esc(tr("会影响视觉状态"))}</small><small>${esc(tr("会影响回复语气"))}</small><small>${esc(tr("会进入对话人格"))}</small></div></div>`;$("#moodHint").textContent=tr(mood.hint)};
 avatarPreviewRefresh=()=>{renderPreview();builderDraft?.capture()};
 $("#photoDrop").onclick=()=>$("#fileInput").click();
 $$("[data-mood-choice]").forEach(x=>x.onclick=()=>{draft.mood=x.dataset.moodChoice;$$("[data-mood-choice]").forEach(y=>y.classList.toggle("active",y===x));refreshConfigSummaries();renderPreview()});
 $$("[data-style-choice]").forEach(x=>x.onclick=()=>{draft.visualStyle=x.dataset.styleChoice;$$("[data-style-choice]").forEach(y=>y.classList.toggle("active",y===x));refreshConfigSummaries();renderPreview()});
 ["avName","avRole","avBio","avSpark","avEnergy"].forEach(id=>$("#"+id).addEventListener("input",()=>{refreshConfigSummaries();renderPreview()}));
 const draftStatus=document.createElement("p");
 draftStatus.id="avatarDraftStatus";draftStatus.setAttribute("role","status");draftStatus.hidden=true;savebar.append(draftStatus);
 builderDraft=bindAvatarDraft({
  scope:workspaceScope,id:a?.id,
  read:()=>JSON.parse(beforeEdit()),
  write:values=>{
   for(const [name,field] of Object.entries({name:"avName",role:"avRole",bio:"avBio",spark:"avSpark",energy:"avEnergy"}))$("#"+field).value=values[name];
   draft.voice=normalizeVoice(values.voice);draft.mood=aliveMoods.some(m=>m.id===values.mood)?values.mood:draft.mood;
   draft.visualStyle=aliveStyles.some(s=>s.id===values.visualStyle)?values.visualStyle:draft.visualStyle;
   pendingImage=values.image;
   const photo=$("#photoDrop");photo.querySelector("img")?.remove();
   if(pendingImage){photo.classList.add("has-image");photo.insertAdjacentHTML("afterbegin",`<img src="${esc(pendingImage)}" alt="">`)}
   $$("[data-mood-choice]").forEach(button=>button.classList.toggle("active",button.dataset.moodChoice===draft.mood));
   $$("[data-style-choice]").forEach(button=>button.classList.toggle("active",button.dataset.styleChoice===draft.visualStyle));
   $("#voicePicker").innerHTML=voicePicker(draft.voice,draft.voiceGender);bindVoicePicker();
  },
  onStatus:kind=>{
   draftStatus.hidden=kind==="clean";
   draftStatus.textContent=kind==="restored"?(en?"Local draft restored · save to apply":"已恢复本地草稿 · 保存后生效"):
    kind==="local"?(en?"Draft kept in this browser · not saved to server":"草稿已保留在此浏览器 · 尚未保存到服务器"):
    kind==="unavailable"?(en?"Browser cannot retain this draft. Save before leaving.":"浏览器无法保留草稿，请保存后再离开。"):
    kind==="stale"?(en?"Server settings changed. Older draft was not applied.":"服务器配置已变化，未套用旧草稿。"):"";
  },
 });
 refreshConfigSummaries(false);
 renderPreview();
 const previewLabel=()=>{const label=$("#alivePreview .identity-result-copy>span");if(label)label.textContent=en?"Photo style preview":"照片风格预览"};
 previewLabel();
 const previewObserver=new MutationObserver(previewLabel);
 previewObserver.observe($("#alivePreview"),{childList:true});
 form.onsubmit=async e=>{
  e.preventDefault();if(avatarIsSaving)return;
  if(avatarPhotoReading){feedback.hidden=false;feedback.textContent=en?"Please wait for the photo to finish loading.":"照片正在读取，请完成后再保存。";return}
  if(!pendingImage){feedback.hidden=false;feedback.textContent=translate("请先选择一张照片",state.settings.locale);return}
  const submit=e.submitter||form.querySelector('button[type="submit"]');
  const item=normalizeAvatar({id:a?.id||`a${Date.now()}`,name:$("#avName").value.trim(),role:$("#avRole").value.trim(),bio:$("#avBio").value.trim()||seed.avatars[0].bio,image:pendingImage,status:"在线",voice:draft.voice,created:a?.created||"刚刚",visualStyle:draft.visualStyle,mood:draft.mood,energy:+$("#avEnergy").value,spark:$("#avSpark").value.trim()||moodById(draft.mood).hint},0),previous=structuredClone(state);
  upsertIdentity(state,item);if(!a)state.generations++;
  const controls=[...form.querySelectorAll("input,textarea,select,button"),$("#fileInput"),$("#modalClose")];
  const disabled=controls.map(control=>control.disabled);
  avatarIsSaving=true;controls.forEach(control=>control.disabled=true);form.setAttribute("aria-busy","true");
  stopSpeech();submit.textContent=translate("正在保存…",state.settings.locale);
  feedback.hidden=false;feedback.textContent=en?"Saving this configuration to the server…":"正在将本次配置保存到服务器…";
  const saved=await persistState();
  avatarIsSaving=false;controls.forEach((control,index)=>control.disabled=disabled[index]);form.removeAttribute("aria-busy");
  if(!saved){
   state=previous;counts();submit.textContent=translate("重试保存",state.settings.locale);
   feedback.textContent=workspaceSaveFeedback();submit.focus({preventScroll:true});return;
  }
  closeModal(true);go("avatars");route();toast(translate("分身配置已保存并同步",state.settings.locale));
 };
}
function bind(r){
 if(r==="avatars"){
  const en=state.settings.locale==="en-US",card=$(".new-card");
  if(card){card.querySelector("b").textContent=en?"Create another self":"创建新分身";card.querySelector("small").textContent=en?"Photo preview · personality · voice":"照片预览 · 人格 · 声音"}
 }
 $$("[data-go]").forEach(x=>x.onclick=()=>go(x.dataset.go));$$("[data-new-avatar]").forEach(x=>x.onclick=()=>avatarModal());$$("[data-edit]").forEach(x=>x.onclick=()=>avatarModal(x.dataset.edit));$$("[data-voice-settings]").forEach(x=>x.onclick=()=>avatarModal(x.dataset.voiceSettings,true));
 $$("[data-delete-avatar]").forEach(button=>button.onclick=async()=>{
  if(button.disabled)return;
  const id=button.dataset.deleteAvatar,avatar=state.avatars.find(a=>a.id===id),en=state.settings.locale==="en-US";
  if(!avatar||state.avatars.length<=1)return;
  if(!confirm(en?`Delete “${avatar.name}”? Its persona, memory selections and conversation will be removed. Shared memories and saved content drafts remain. Export your workspace first if needed.`:`删除「${avatar.name}」？其人格配置、引用选择和对话记录将移除。共享记忆库与已保存创作草稿保留；需要备份可先在设置中导出工作区。`))return;
  const previous=structuredClone(state),controls=$$(".avatar-card button,.new-card,[data-new-avatar]");
  controls.forEach(control=>control.disabled=true);
  let status=button.closest(".avatar-info").querySelector(".avatar-delete-status");
  if(!status){status=document.createElement("p");status.className="avatar-delete-status";status.setAttribute("role","status");button.closest(".avatar-info").append(status)}
  status.textContent=en?"Saving deletion…":"正在保存删除操作…";
  stopSpeech();removeIdentity(state,id);
  if(!await persistState()){
   state=previous;counts();controls.forEach(control=>control.disabled=false);
   status.textContent=en?"Not deleted. The self is retained; retry when connected.":"未删除，分身仍保留；请检查网络后重试。";button.textContent=en?"Retry deletion":"重试删除";return
  }
  route();toast(en?"Self deleted. Shared memories and saved drafts were retained.":"分身已删除，共享记忆与已保存草稿仍保留。")
 });
 if(r==="studio")bindStudio();if(r==="memory")bindMemory();if(r==="content")bindContent();if(r==="settings")bindSettings()
 $$(".avatar-card").forEach((card,index)=>{const button=card.querySelector('[data-go="studio"]');if(button)button.onclick=()=>{selectIdentity(state,state.avatars[index].id);stopSpeech();save();go("studio")}});
}
function bindStudio(){
 const a=activeIdentity(state),history=identityHistory(state,a.id),panel=$("#studioPanel"),form=$("#chatForm"),input=$("#chatInput"),send=form.querySelector("button"),selector=$("#studioAvatar");
 if(matchMedia("(max-width:1050px)").matches)$(".studio-identity-voice").append($("#clearChat"));
 chatDraft?.dispose();
 chatDraft=bindChatDraft({input,scope:workspaceScope||"legacy",id:a.id});
 selector.onchange=()=>{stopSpeech();selectIdentity(state,selector.value);save();route()};
 const en=state.settings.locale==="en-US";
 const bubble=m=>`<div class="bubble ${m.role==="user"?"user":""}"><span>${m.role==="user"?(en?"You":"你"):esc(a.name).toUpperCase()}</span><p>${esc(m.text)}</p>${m.role==="avatar"?`<div class="reply-actions"><button type="button" data-copy-reply="${history.indexOf(m)}">${en?"Copy reply":"复制回复"}</button><small role="status"></small></div>`:""}</div>`;
 panel.addEventListener("click",async event=>{
  const button=event.target.closest("[data-copy-reply]");if(!button||button.disabled)return;
  const message=history[Number(button.dataset.copyReply)];if(message?.role!=="avatar")return;
  const status=button.nextElementSibling;button.disabled=true;
  try{await navigator.clipboard.writeText(message.text);status.textContent=en?"Copied":"已复制"}
  catch{status.textContent=en?"Copy failed. Select the reply text to copy manually.":"复制失败，请选中回复文字手动复制。"}
  finally{button.disabled=false}
 });
 const stopButton=document.createElement("button");
 stopButton.type="button";stopButton.className="stop-reading";stopButton.textContent=en?"Stop reading":"停止朗读";
 stopButton.hidden=!speechPlayback.active;
 stopButton.onclick=()=>{stopSpeech();toast(en?"Reading stopped":"朗读已停止")};
 form.before(stopButton);
 const latestButton=document.createElement("button");
 latestButton.type="button";latestButton.className="latest-message";latestButton.hidden=true;
 latestButton.textContent=en?"View latest message":"查看最新消息";
 form.before(latestButton);
 const nearBottom=()=>panel.scrollHeight-panel.scrollTop-panel.clientHeight<64;
 const syncLatest=()=>{latestButton.hidden=form.classList.contains("hidden")||nearBottom()};
 const showLatest=()=>{
  const message=panel.querySelector(".bubble:last-of-type");
  if(message){
   const top=message.getBoundingClientRect().top-panel.getBoundingClientRect().top+panel.scrollTop-18;
   panel.scrollTop=message.offsetHeight>panel.clientHeight-36?top:panel.scrollHeight;
  }else panel.scrollTop=panel.scrollHeight;
  syncLatest();
 };
 latestButton.onclick=showLatest;
 panel.addEventListener("scroll",syncLatest,{passive:true});
 function renderRecovery(){
  panel.querySelector(".chat-error")?.remove();
  const message=history.at(-1);if(message?.role!=="user")return;
  const en=state.settings.locale==="en-US",busy=["model_busy","rate_limit_exceeded"].includes(message.error);
  const text=en?(busy?"The model is busy. Your question is still here.":"No reply was received. Your question is still here."):(busy?"模型当前繁忙，你的问题仍保留在这里。":"暂未收到回复，你的问题仍保留在这里。");
  panel.insertAdjacentHTML("beforeend",`<div class="chat-error chat-recovery"><p role="status">${text}</p><button type="button" class="secondary" data-retry-chat>${en?"Retry this question":"重试这个问题"}</button></div>`);
  panel.querySelector("[data-retry-chat]").onclick=()=>sendMessage(message);
  panel.scrollTop=panel.scrollHeight;
 }
 const setLiveState=name=>{const stage=$("#liveStage");if(!stage)return;stage.classList.remove("is-idle","is-thinking","is-speaking","is-listening");stage.classList.add(`is-${name}`)};
 const studioTabs=$$("[data-studio-tab]");
 const tablist=studioTabs[0].parentElement;
 tablist.setAttribute("role","tablist");tablist.setAttribute("aria-label",en?"Studio panels":"工作室面板");
 studioTabs.forEach(tab=>{
  tab.id=`studio-tab-${tab.dataset.studioTab}`;tab.setAttribute("role","tab");
  tab.setAttribute("aria-controls","studioPanel");
 });
 panel.setAttribute("role","tabpanel");
 panel.tabIndex=0;
 const setTab=(name,{focusInput=false}={})=>{
  personaDraft?.dispose();personaDraft=null;
  memoryDraft?.dispose();memoryDraft=null;
  studioTabs.forEach(tab=>{
   const selected=tab.dataset.studioTab===name;
   tab.classList.toggle("active",selected);tab.setAttribute("aria-selected",String(selected));tab.tabIndex=selected?0:-1;
  });
  panel.setAttribute("aria-labelledby",`studio-tab-${name}`);
  form.classList.toggle("hidden",name!=="chat");
  if(name==="chat"){
   panel.className="studio-panel chat";panel.id="studioPanel";panel.innerHTML=history.map(bubble).join("");
   renderRecovery();showLatest();if(focusInput&&matchMedia("(min-width:761px)").matches)input.focus()
  }else if(name==="persona"){
   panel.className="studio-panel studio-settings";panel.id="studioPanel";panel.innerHTML=`<div class="studio-settings-head"><p class="eyebrow">PERSONA PROFILE</p><h3>${esc(a.name)} 如何思考与表达</h3><p>参数会作为系统上下文传给模型，并在下一条回复生效。</p></div>
   <form id="personaForm">
    <div class="persona-fields">
    <label>人格标签<input id="personaTraits" value="${esc(state.persona.traits.join("、"))}" placeholder="冷静、敏锐、真诚"></label>
    <label>额外人格指令<textarea id="personaInstructions" maxlength="2000" aria-describedby="personaInstructionHint">${esc(state.persona.instructions)}</textarea></label>
    <p id="personaInstructionHint" class="persona-hint">${state.settings.locale==="en-US"?"Describe how you want replies to sound. Changes apply after saving.":"直接写下你希望它如何回应，保存后用于下一条回复。"}</p>
    <details class="persona-advanced"><summary><span>${state.settings.locale==="en-US"?"Advanced settings":"高级配置"}</span><small>${state.settings.locale==="en-US"?"Warmth · directness · creativity":"亲和度 · 直接程度 · 创造力"}</small></summary><div class="persona-advanced-fields">
    ${personaRange("亲和度","warmth",state.persona.warmth,"克制","温暖")}
    ${personaRange("直接程度","directness",state.persona.directness,"委婉","直接")}
    ${personaRange("创造力","creativity",state.persona.creativity,"稳妥","发散")}
    </div></details></div>
    <div class="persona-savebar"><p id="personaSaveStatus" role="status">${state.settings.locale==="en-US"?"Current saved settings":"当前已保存的配置"}</p><button class="primary" type="submit">保存人格参数</button></div>
   </form>`;
   $$("[data-persona-range]").forEach(x=>x.oninput=()=>x.closest(".persona-range").querySelector("output").value=x.value);
   const personaForm=$("#personaForm"),status=$("#personaSaveStatus"),en=state.settings.locale==="en-US";
   personaDraft=bindPersonaDraft({
    fields:Object.fromEntries(["personaTraits","personaInstructions","personaWarmth","personaDirectness","personaCreativity"].map(id=>[id,$("#"+id)])),
    scope:workspaceScope,id:a.id,
    onStatus:kind=>{
     status.classList.toggle("is-error",kind==="unavailable");
     status.textContent=kind==="restored"?(en?"Local draft restored · not saved to server":"已恢复本地草稿 · 尚未保存到服务器"):
      kind==="local"?(en?"Draft kept in this browser · save to apply":"草稿已保留在此浏览器 · 保存后生效"):
      kind==="unavailable"?(en?"Browser draft storage unavailable. Save before leaving.":"浏览器无法保留草稿，请保存后再离开。"):
      (en?"Current saved settings":"当前已保存的配置");
    }
   });
   $$("[data-persona-range]").forEach(x=>x.closest(".persona-range").querySelector("output").value=x.value);
   const editingDraft=personaDraft;
   personaForm.onsubmit=async e=>{
    e.preventDefault();const button=personaForm.querySelector('button[type="submit"]');if(button.disabled)return;
    const previous=structuredClone(state.persona);
    state.persona={...state.persona,warmth:+$("#personaWarmth").value,directness:+$("#personaDirectness").value,creativity:+$("#personaCreativity").value,traits:$("#personaTraits").value.split(/[、,，]/).map(x=>x.trim()).filter(Boolean).slice(0,8),instructions:$("#personaInstructions").value.trim()};
    const controls=[...personaForm.querySelectorAll("input,textarea,button"),selector,...$$("[data-studio-tab],[data-stage-mood]")];
    controls.forEach(control=>control.disabled=true);
    status.classList.remove("is-error");status.textContent=en?"Saving to server…":"正在保存到服务器…";button.textContent=translate("正在保存…",state.settings.locale);
    if(!await persistState()){
     setIdentityPersona(state,a.id,previous);controls.forEach(control=>control.disabled=false);button.textContent=translate("重试保存",state.settings.locale);
     status.classList.add("is-error");status.textContent=en?"Not saved. Your input is retained; retry when connected.":"未保存，输入仍保留；请检查网络后重试。";return
    }
    controls.forEach(control=>control.disabled=false);button.textContent=translate("保存人格参数",state.settings.locale);
    editingDraft.saved();
    status.textContent=en?"Saved to server · applies to the next reply":"已保存到服务器 · 下一条回复生效";
    toast(translate("人格参数已保存，将用于下一条回复",state.settings.locale))
   }
  }else{
   panel.className="studio-panel memory-picker";panel.id="studioPanel";panel.innerHTML=`<div class="studio-settings-head"><p class="eyebrow">MEMORY CONTEXT</p><h3>选择本轮允许引用的记忆</h3><p>只有勾选的记忆会发送给模型；未勾选内容不会进入对话上下文。</p></div>
   <div class="memory-context-search"><label for="memoryContextSearch">${state.settings.locale==="en-US"?"Search memories":"搜索记忆"}</label><input type="search" id="memoryContextSearch" autocomplete="off"><span id="memoryContextResults" role="status"></span></div>
   <div class="memory-options">${state.memories.map(m=>`<label class="memory-option"><input type="checkbox" value="${esc(m.id)}" ${state.selectedMemories.map(String).includes(String(m.id))?"checked":""}><span><b>${esc(m.title)}</b><small>${esc(m.content)}</small></span></label>`).join("")}<p id="memoryContextEmpty" hidden></p></div>
   <div class="persona-savebar"><p id="memoryContextStatus" role="status"></p><button class="primary" id="saveMemoryContext">应用记忆选择</button></div>`;
   const en=state.settings.locale==="en-US",status=$("#memoryContextStatus"),items=$$(".memory-option"),search=$("#memoryContextSearch"),empty=$("#memoryContextEmpty");
   const selectionCount=()=>items.filter(item=>item.querySelector("input").checked).length;
   const showSelection=dirty=>{status.classList.remove("is-error");status.textContent=en?`${selectionCount()} selected${dirty?" · not applied yet":" · current saved selection"}`:`已选 ${selectionCount()} 条${dirty?" · 尚未应用":" · 当前已保存的选择"}`};
   const filter=()=>{const query=search.value.trim().toLocaleLowerCase();let visible=0;items.forEach(item=>{item.hidden=!item.textContent.toLocaleLowerCase().includes(query);if(!item.hidden)visible++});$("#memoryContextResults").textContent=en?`${visible} of ${items.length} memories`:`显示 ${visible} / ${items.length} 条记忆`;empty.hidden=visible>0;empty.textContent=items.length?(en?"No matching memories. Try another search.":"没有匹配的记忆，请换个关键词。"):(en?"No memories yet. Add one in the memory library.":"还没有记忆，可先到记忆库添加。")};
   search.oninput=filter;showSelection(false);
   memoryDraft=bindMemoryDraft({inputs:items.map(item=>item.querySelector("input")),scope:workspaceScope,id:a.id,onStatus:kind=>{
    status.classList.toggle("is-error",kind==="unavailable");
    status.textContent=kind==="restored"?(en?`${selectionCount()} selected · local draft restored; apply to use`:`已选 ${selectionCount()} 条 · 已恢复本地草稿，应用后生效`):
     kind==="local"?(en?`${selectionCount()} selected · draft kept in this browser; apply to use`:`已选 ${selectionCount()} 条 · 草稿已保留在此浏览器，应用后生效`):
     kind==="unavailable"?(en?"Browser cannot retain this draft. Apply before leaving.":"浏览器无法保留勾选草稿，请应用后再离开。"):
     kind==="stale"?(en?"Saved selection changed. Showing server settings, not the older local draft.":"已保存的选择发生变化，当前显示服务器配置，未套用旧草稿。"):
     (en?`${selectionCount()} selected · current saved selection`:`已选 ${selectionCount()} 条 · 当前已保存的选择`);
   }});
   const editingMemoryDraft=memoryDraft;
   filter();
   $("#saveMemoryContext").onclick=async e=>{
    const button=e.currentTarget;if(button.disabled)return;const previous=[...state.selectedMemories];
    state.selectedMemories=items.filter(item=>item.querySelector("input").checked).map(item=>{const value=item.querySelector("input").value;return state.memories.find(m=>String(m.id)===value)?.id??value});
    const controls=[button,selector,search,...items.map(item=>item.querySelector("input")),...$$("[data-studio-tab],[data-stage-mood]")];
    controls.forEach(control=>control.disabled=true);status.classList.remove("is-error");status.textContent=en?"Saving selection…":"正在保存选择…";button.textContent=translate("正在保存…",state.settings.locale);
    if(!await persistState()){
     setIdentityMemories(state,a.id,previous);controls.forEach(control=>control.disabled=false);button.textContent=translate("重试保存",state.settings.locale);
     status.classList.add("is-error");status.textContent=en?"Not applied. Selection retained; retry when connected.":"未应用，勾选仍保留；请检查网络后重试。";return
    }
    controls.forEach(control=>control.disabled=false);button.textContent=translate("应用记忆选择",state.settings.locale);
    editingMemoryDraft.saved();
    const count=selectionCount();$('[data-studio-tab="memory"] b').textContent=count;showSelection(false);toast(translate(`已选择 ${count} 条引用记忆`,state.settings.locale))
   }
  }
  syncLatest();applyI18n(panel,state.settings.locale)
 };
 studioTabs.forEach((tab,index)=>{
  const activate=()=>{if(tab.disabled)return;disposeVoiceInput?.();setTab(tab.dataset.studioTab);setupVoiceInput()};
  tab.onclick=activate;
  tab.onkeydown=event=>{
   if(tab.disabled||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
   event.preventDefault();
   const next=event.key==="Home"?0:event.key==="End"?studioTabs.length-1:(index+(event.key==="ArrowRight"?1:-1)+studioTabs.length)%studioTabs.length;
   const target=studioTabs[next];if(target.disabled)return;
   target.click();target.focus({preventScroll:true});
  };
 });
 $$("[data-stage-mood]").forEach(x=>x.onclick=async()=>{const buttons=$$("[data-stage-mood]"),previous={mood:a.mood,spark:a.spark},mood=x.dataset.stageMood;buttons.forEach(button=>button.disabled=true);a.mood=mood;a.spark=moodById(mood).hint;if(!await persistState()){Object.assign(a,previous);buttons.forEach(button=>button.disabled=false);return}route();toast(`已切换为「${moodById(mood).name}」情绪`)});
 setTab("chat",{focusInput:true});
 fetch("./api/model-status").then(async r=>{if(!r.ok)throw 0;const data=await r.json();if(!panel.isConnected)return;$("#modelState").textContent=`● ${data.model} ${translate("已连接",state.settings.locale)}`;$("#modelState").classList.add("online")}).catch(()=>{if(!panel.isConnected)return;$("#modelState").textContent=`● ${translate("模型暂不可用",state.settings.locale)}`;$("#modelState").classList.add("error")});
 async function sendMessage(retryMessage=null){
  const text=retryMessage?.text||input.value.trim();if(!text||input.readOnly||send.disabled||!panel.isConnected)return;if(retryMessage&&history.at(-1)!==retryMessage)return;stopSpeech();
  const userMessage=retryMessage||{role:"user",text};if(!retryMessage){history.push(userMessage);chatDraft.clear();panel.insertAdjacentHTML("beforeend",bubble(userMessage))}
  userMessage.delivery="pending";delete userMessage.error;save();panel.querySelector(".chat-error")?.remove();panel.insertAdjacentHTML("beforeend",`<div class="bubble thinking" id="thinkingBubble"><span>${esc(a.name).toUpperCase()}</span><p><i></i><i></i><i></i> ${translate("正在思考",state.settings.locale)}</p></div>`);panel.scrollTop=panel.scrollHeight;send.disabled=true;input.disabled=true;selector.disabled=true;$("#clearChat").disabled=true;$$("[data-stage-mood],[data-studio-tab]").forEach(button=>button.disabled=true);setLiveState("thinking");$("#stageStatus").textContent=translate("正在生成回复",state.settings.locale);
  try{
   const memories=state.memories.filter(m=>state.selectedMemories.map(String).includes(String(m.id)));
   const chatAvatar={id:a.id,name:a.name,role:a.role,bio:a.bio,mood:a.mood,energy:a.energy,visualStyle:a.visualStyle,spark:a.spark,voice:normalizeVoice(a.voice)};
   const response=await fetch("./api/chat",{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(90000),body:JSON.stringify({avatar:chatAvatar,persona:{...state.persona,mood:a.mood},memories,messages:history.map(({role,text})=>({role,text})),locale:state.settings.locale})});
   const data=await response.json();if(response.status===402&&data.error==="trial_exhausted"){userMessage.delivery="failed";userMessage.error=data.error;save();if(!panel.isConnected)return;$("#thinkingBubble")?.remove();renderRecovery();access={...access,trialRemaining:0,authenticated:data.authenticated};renderAccess();accessModal();return}if(!response.ok||!data.reply)throw new Error(data.error||"model_error");
   userMessage.delivery="sent";const reply={role:"avatar",text:data.reply};history.push(reply);save();if(!panel.isConnected)return;
   const follow=nearBottom(),readingPosition=panel.scrollTop;
   $("#thinkingBubble")?.remove();panel.insertAdjacentHTML("beforeend",bubble(reply));
   if(follow)showLatest();else{panel.scrollTop=readingPosition;syncLatest()}
   setLiveState("speaking");setTimeout(()=>{if(panel.isConnected)setLiveState("idle")},1800);$("#modelState").textContent=`● ${data.model} ${translate("已连接",state.settings.locale)}`;$("#modelState").className="model-state online";
   if(Number.isFinite(data.trialRemaining)){access.trialRemaining=data.trialRemaining;renderAccess();if(data.trialRemaining===0)setTimeout(accessModal,450)}
   if(state.settings.autoSpeak)speakReply(data.speech,data.reply)
  }catch(error){userMessage.delivery="failed";userMessage.error=error.message;save();if(!panel.isConnected)return;$("#thinkingBubble")?.remove();renderRecovery();$("#modelState").textContent=`● ${translate("模型调用失败",state.settings.locale)}`;$("#modelState").className="model-state error"
  }finally{if(panel.isConnected){send.disabled=false;input.disabled=false;selector.disabled=false;$("#clearChat").disabled=false;$$("[data-stage-mood],[data-studio-tab]").forEach(button=>button.disabled=false);setLiveState("idle");if(matchMedia("(min-width:761px)").matches)input.focus();$("#stageStatus").textContent=translate("等待你的输入",state.settings.locale)}}
 }
 form.onsubmit=e=>{e.preventDefault();sendMessage()};
 bindChatKeyboard(input,()=>form.requestSubmit());
 const clearButton=$("#clearChat"),clearStatus=document.createElement("p");
 clearStatus.className="chat-clear-status";clearStatus.setAttribute("role","status");clearStatus.hidden=true;
 form.before(clearStatus);
 clearButton.onclick=async()=>{
  if(clearButton.disabled||!confirm(translate("只清空当前分身的对话？",state.settings.locale)))return;
  stopSpeech();disposeVoiceInput?.();
  const owner=state,snapshot=structuredClone(state),returnFocus=document.activeElement;
  const navigation=$$(".sidebar,.topbar,.mobile-nav,.studio-identity-bar"),wasInert=navigation.map(element=>element.inert);
  navigation.forEach(element=>element.inert=true);
  const cleared=[{role:"avatar",text:en?"The conversation is cleared. Let's start again.":"对话已经清空。我们重新开始吧。"}];
  snapshot.conversationsByAvatar[a.id]=cleared;
  if(snapshot.activeAvatarId===a.id)snapshot.conversations=cleared;
  const controls=[clearButton,send,input,selector,...$$("[data-stage-mood],[data-studio-tab],[data-voice-settings],[data-edit],#voiceBtn,[data-retry-chat]")];
  const disabled=controls.map(control=>control.disabled);
  controls.forEach(control=>control.disabled=true);
  clearButton.textContent=en?"Clearing…":"正在清空…";
  clearStatus.hidden=false;clearStatus.classList.remove("is-error");
  clearStatus.textContent=en?"Saving to server. Your conversation is retained until confirmed.":"正在保存到服务器，确认前保留原对话。";
  try{
   await queueRemoteSave(snapshot);
   if(state===owner){history.splice(0,history.length,...cleared);saveLocal(state);counts()}
   if(panel.isConnected){
    if(!form.classList.contains("hidden"))setTab("chat");
    clearStatus.textContent=en?"Conversation cleared and saved. Your unsent draft is retained.":"对话已清空并保存，未发送的输入仍保留。";
   }
  }catch{
   if(panel.isConnected){
    clearStatus.classList.add("is-error");
    clearStatus.textContent=en?"Not cleared. Your conversation is retained; use Clear Chat to retry.":"未清空，原对话仍保留；请检查网络后点击清空对话重试。";
   }
  }finally{
   navigation.forEach((element,index)=>element.inert=wasInert[index]);
   controls.forEach((control,index)=>control.disabled=disabled[index]);
   clearButton.textContent=translate("清空对话",state.settings.locale);
   if(panel.isConnected){setupVoiceInput();returnFocus?.focus({preventScroll:true})}
  }
 };
 function setupVoiceInput(){disposeVoiceInput=bindVoiceInput({button:$("#voiceBtn"),input,status:$("#voiceInputStatus"),locale:state.settings.locale,onListening:listening=>{if(listening)stopSpeech();setLiveState(listening?"listening":"idle")}})}
 setupVoiceInput();
}
function personaRange(label,key,value,left,right){const id=`persona${key[0].toUpperCase()}${key.slice(1)}`;return `<label class="persona-range"><span><b>${label}</b><output>${value}</output></span><input id="${id}" data-persona-range type="range" min="0" max="100" value="${value}"><small><i>${left}</i><i>${right}</i></small></label>`}
function memoryModal(id){
 const existing=state.memories.find(m=>String(m.id)===String(id));
 openModal(`<div class="memory-editor"><p class="eyebrow">MEMORY NOTE</p><h2>${translate(existing?"编辑记忆":"添加记忆",state.settings.locale)}</h2><p>保存后，可在工作室的“引用记忆”中选择使用。</p><form id="memoryForm" class="form"><label>记忆类型<select id="memoryType">${["偏好","背景","表达","知识"].map(type=>`<option value="${type}" ${type===(existing?.type||"偏好")?"selected":""}>${translate(type,state.settings.locale)}</option>`).join("")}</select></label><label>一句话标题<input id="memoryTitle" required maxlength="120" value="${esc(existing?.title||"")}" placeholder="例如：我喜欢在夜晚工作"></label><label>补充细节<textarea id="memoryContent" required maxlength="4000" placeholder="这条信息会如何影响分身的判断与表达？">${esc(existing?.content||"")}</textarea></label><p id="memorySaveFeedback" role="status" hidden></p><button type="submit" class="primary">保存记忆</button></form></div>`);
 const form=$("#memoryForm"),title=$("#memoryTitle"),content=$("#memoryContent"),type=$("#memoryType"),feedback=$("#memorySaveFeedback");
 const draftValue=()=>JSON.stringify([title.value,content.value,type.value]),initial=draftValue();
 avatarIsDirty=()=>initial!==draftValue();
 form.onsubmit=async event=>{
  event.preventDefault();if(avatarIsSaving)return;
  if(!title.value.trim()||!content.value.trim()){feedback.hidden=false;feedback.textContent=translate("请填写标题和内容",state.settings.locale);return}
  const previous=structuredClone(state),button=form.querySelector('button[type="submit"]'),item={...existing,id:existing?.id||Date.now(),type:type.value,title:title.value.trim(),content:content.value.trim(),date:existing?.date||new Date().toLocaleDateString(state.settings.locale)};
  state.memories=existing?state.memories.map(m=>String(m.id)===String(item.id)?item:m):[item,...state.memories];
  avatarIsSaving=true;button.disabled=true;button.textContent=translate("正在保存…",state.settings.locale);feedback.hidden=true;
  const saved=await persistState();avatarIsSaving=false;button.disabled=false;
  if(!saved){state=previous;counts();feedback.hidden=false;feedback.textContent=translate("未同步到服务器，请检查网络后重试",state.settings.locale);button.textContent=translate("重试保存",state.settings.locale);return}
  closeModal(true);route();toast(translate("记忆已保存",state.settings.locale));
 };
 title.focus();
}
function bindMemory(){
 const search=$("#memorySearch"),filter=$("#memoryFilter"),library=$("#memoryLibrary"),results=$("#memoryResults");
 filter.setAttribute("aria-label",translate("分类",state.settings.locale));
 const render=()=>{
  const query=search.value.trim().toLocaleLowerCase(),items=state.memories.filter(m=>(!filter.value||m.type===filter.value)&&`${m.title} ${m.content}`.toLocaleLowerCase().includes(query));
  results.textContent=state.settings.locale==="en-US"?`${items.length} of ${state.memories.length} memories`:`显示 ${items.length} / ${state.memories.length} 条记忆`;
  library.innerHTML=items.map(m=>`<article class="memory-note"><div class="memory-note-heading"><span>${translate(m.type,state.settings.locale)}</span><h3>${esc(m.title)}</h3></div><p>${esc(m.content)}</p><div class="memory-note-actions"><button class="secondary" data-edit-memory="${esc(m.id)}">${translate("编辑记忆",state.settings.locale)}</button><button class="text-btn" data-delete-memory="${esc(m.id)}">${translate("删除",state.settings.locale)}</button><span role="status" data-memory-status="${esc(m.id)}"></span></div></article>`).join("")||`<section class="memory-empty"><h3>${translate(state.memories.length?"没有匹配的记忆":"还没有记忆",state.settings.locale)}</h3><p>${translate(state.memories.length?"试试其他关键词，或清除筛选。":"添加一条经历或偏好，让对话更贴近你。",state.settings.locale)}</p><button class="secondary" id="memoryEmptyAction">${translate(state.memories.length?"清除筛选":"添加记忆",state.settings.locale)}</button></section>`;
  $("#memoryEmptyAction")?.addEventListener("click",()=>{if(!state.memories.length)return memoryModal();search.value="";filter.value="";render()});
  $$("[data-edit-memory]").forEach(button=>button.onclick=()=>memoryModal(button.dataset.editMemory));
  $$("[data-delete-memory]").forEach(button=>button.onclick=async()=>{
   if(!confirm(translate("删除这条记忆？删除后不会再被引用。",state.settings.locale)))return;
   const previous=structuredClone(state),id=button.dataset.deleteMemory;
   state.memories=state.memories.filter(m=>String(m.id)!==id);state.selectedMemories=state.selectedMemories.filter(value=>String(value)!==id);
   for(const avatar of state.avatars){setIdentityMemories(state,avatar.id,(state.memorySelectionsByAvatar[avatar.id]||[]).filter(value=>String(value)!==id))}
   const buttons=$$(".memory-note-actions button");buttons.forEach(control=>control.disabled=true);button.textContent=translate("正在保存…",state.settings.locale);
   if(!await persistState()){state=previous;counts();buttons.forEach(control=>control.disabled=false);button.textContent=translate("删除",state.settings.locale);const status=button.parentElement.querySelector("[data-memory-status]");status.textContent=translate("未同步到服务器，请检查网络后重试",state.settings.locale);return}
   render();toast(translate("记忆已删除",state.settings.locale));
  });
 };
 search.oninput=render;filter.onchange=render;
 $("#addMemory").onclick=()=>memoryModal();
 $("#exportMemory").onclick=()=>download("second-me-memories.json",state.memories);
 render();
}
function bindContent(){bindContentStudio({state:()=>state,save,persist:persistState,onAccess:update=>{access={...access,...update};renderAccess()},showPaywall:accessModal})}
function bindSettings(){
 const feedback=$("#settingsFeedback"),controls=$$(".setting button,.setting select");
 $("#manageAccess")?.addEventListener("click",accessModal);
 if(!access.authenticated){const text="当前工作区按此浏览器的匿名身份保存；换设备前请先登录。";$$(".setting-row small").filter(el=>el.textContent===translate(text,state.settings.locale)).forEach(el=>el.textContent=translate("游客工作区仅绑定此浏览器；登录前建议导出备份，账号空间可能不同。",state.settings.locale))}
 const update=async mutate=>{
  const previous=structuredClone(state),oldLocale=state.settings.locale;
  controls.forEach(control=>control.disabled=true);
  feedback.textContent=translate("正在保存…",oldLocale);feedback.classList.remove("is-error");
  mutate();
  const saved=await persistState();
  if(!saved){state=initializeIdentityState(previous);counts();controls.forEach(control=>control.disabled=false);$("#settingsLocale").value=state.settings.locale;$$("[data-setting]").forEach(control=>{control.classList.toggle("on",Boolean(state.settings[control.dataset.setting]));control.setAttribute("aria-checked",String(Boolean(state.settings[control.dataset.setting])))});feedback.textContent=translate("未保存，请检查网络后重新操作。",oldLocale);feedback.classList.add("is-error");return false}
  controls.forEach(control=>control.disabled=false);feedback.textContent=translate("设置已保存",state.settings.locale);return true;
 };
 $$("[data-setting]").forEach(control=>control.onclick=async()=>{
  const key=control.dataset.setting;
  if(await update(()=>{state.settings[key]=!state.settings[key]})){
   control.classList.toggle("on",Boolean(state.settings[key]));control.setAttribute("aria-checked",String(Boolean(state.settings[key])));
   if(key==="autoSpeak"&&!state.settings.autoSpeak)stopSpeech();
  }
 });
 $("#settingsLocale").value=state.settings.locale;
 $("#settingsLocale").onchange=async event=>{const locale=event.target.value;if(await update(()=>{state.settings.locale=locale}))location.reload()};
 $("#exportAll").onclick=()=>download("second-me-workspace.json",state);
 $("#resetAll").onclick=async()=>{
  if(!confirm(translate("确认重置工作区？自定义配置和对话将被清除，账号与权益不受影响。",state.settings.locale)))return;
  if(await update(()=>{const locale=state.settings.locale;state=initializeIdentityState(structuredClone(seed));state.settings.locale=locale})){go("overview");route()}
 };
}
function download(name,data){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download=name;a.click();URL.revokeObjectURL(a.href);toast("文件已导出")}
function compressAvatar(file,maxEdge=1280,quality=.84){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("image_read_failed"));reader.onload=()=>{const image=new Image();image.onerror=()=>reject(new Error("image_decode_failed"));image.onload=()=>{const scale=Math.min(1,maxEdge/Math.max(image.naturalWidth,image.naturalHeight)),width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale)),canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const context=canvas.getContext("2d");context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";context.drawImage(image,0,0,width,height);resolve(canvas.toDataURL("image/jpeg",quality))};image.src=reader.result};reader.readAsDataURL(file)})}
function openSearch(){openModal(`<div class="search-modal"><p class="eyebrow">GLOBAL SEARCH</p><h2>搜索工作区</h2><input id="globalSearch" placeholder="输入分身、记忆或功能…"><div class="search-results" id="results"></div></div>`);const input=$("#globalSearch"),render=()=>{const q=input.value.toLowerCase(),items=[...state.avatars.map(a=>({t:a.name,s:"分身",r:"avatars"})),...state.memories.map(m=>({t:m.title,s:"记忆",r:"memory"})),{t:"实时对话",s:"功能",r:"studio"},{t:"内容创作",s:"功能",r:"content"}].filter(x=>x.t.toLowerCase().includes(q));$("#results").innerHTML=items.map(x=>`<button data-result="${x.r}"><span>${esc(x.t)}</span><span>${x.s} →</span></button>`).join("")||"<p>没有找到匹配内容</p>";$$("[data-result]").forEach(x=>x.onclick=()=>{closeModal();go(x.dataset.result)})};input.oninput=render;render();input.focus()}
window.addEventListener("hashchange",route);$("#menuBtn").onclick=()=>$(".sidebar").classList.toggle("open");$("#modalClose").onclick=()=>closeModal();$("#backdrop").onclick=e=>{if(e.target===e.currentTarget)closeModal()};$("#searchBtn").onclick=openSearch;$("#noticeBtn").onclick=()=>toast("没有新的通知");$$("[data-new-avatar]").forEach(x=>x.onclick=()=>avatarModal());$(".profile").onclick=()=>access.subscriptionActive?toast(translate("当前使用权有效，到期后可手动续费",state.settings.locale)):accessModal();
function localize(){document.documentElement.lang=state.settings.locale;document.title=state.settings.locale==="en-US"?"Second Me — Your Digital Self":"Second Me — 数字分身操作系统";applyI18n(document,state.settings.locale);$("#localeBtn").textContent=state.settings.locale==="zh-CN"?"EN":"中"}
$("#localeBtn").onclick=async()=>{if(!workspaceReady)return;const button=$("#localeBtn"),previous=state.settings.locale;button.disabled=true;state.settings.locale=previous==="zh-CN"?"en-US":"zh-CN";if(await persistState())location.reload();else{state.settings.locale=previous;button.disabled=false}};
window.addEventListener("beforeunload",event=>{if(pendingWorkspaceSaves||avatarIsSaving||avatarIsDirty?.()){event.preventDefault();event.returnValue=""}});
window.addEventListener("pagehide",()=>{disposeVoiceInput?.();chatDraft?.dispose()});
$("#fileInput").onchange=async e=>{
 const f=e.target.files[0];e.target.value="";
 if(!f||avatarIsSaving)return;if(f.size>12*1024*1024)return toast("图片不能超过 12 MB");
 const owner=$("#avatarForm"),refresh=avatarPreviewRefresh;
 if(!owner||!refresh||$("#backdrop").classList.contains("hidden"))return;
 const submit=owner.querySelector('button[type="submit"]'),photo=owner.querySelector("#photoDrop"),disabled=[submit.disabled,photo.disabled];
 avatarPhotoReading=true;submit.disabled=true;photo.disabled=true;
 try{
  const image=await compressAvatar(f);
  if($("#avatarForm")!==owner||avatarPreviewRefresh!==refresh||$("#backdrop").classList.contains("hidden"))return;
  pendingImage=image;photo.classList.add("has-image");photo.querySelector("img")?.remove();
  photo.insertAdjacentHTML("afterbegin",`<img src="${pendingImage}" alt="预览">`);refresh();toast("照片已优化，保存后会同步");
 }catch{if(avatarPreviewRefresh===refresh)toast("图片读取失败，请换一张重试")}
 finally{
  if(avatarPreviewRefresh===refresh){avatarPhotoReading=false;submit.disabled=disabled[0];photo.disabled=disabled[1]}
 }
};
document.addEventListener("keydown",e=>{const modalOpen=!$("#backdrop").classList.contains("hidden");if(modalOpen&&e.key==="Tab"){const controls=$$(".modal button,.modal input,.modal textarea,.modal select,.modal summary").filter(x=>!x.disabled&&!x.closest("[inert]")&&x.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}return}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"&&!modalOpen){e.preventDefault();openSearch()}if(e.key==="Escape"){if(discardPrompt)hideDiscardPrompt();else closeModal()}});
async function boot(){await refreshAccess();await restoreWorkspace();counts();const query=location.hash.split("?")[1]||"",order=new URLSearchParams(query).get("payment_return");if(order){history.replaceState(null,"","#studio");setTimeout(async()=>{try{await fetch(`./api/payment/status?out_trade_no=${encodeURIComponent(order)}`)}catch{}await refreshAccess();access.subscriptionActive?toast(translate("支付成功，7 天使用权已生效",state.settings.locale)):accessModal()},350)}route()}
boot();
