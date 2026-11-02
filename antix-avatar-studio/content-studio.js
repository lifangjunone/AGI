import {identityPersona,identityMemories} from "./workspace.js";
const types=["小红书帖子","短视频口播稿","X / Twitter 帖子","邮件回复","个人介绍"];
const tones=["真诚、有洞察","轻松、有感染力","专业、克制","大胆、有争议"];
const english={"小红书帖子":"Lifestyle post","短视频口播稿":"Video script","邮件回复":"Email reply","个人介绍":"Personal introduction","真诚、有洞察":"Sincere and insightful","轻松、有感染力":"Friendly and engaging","专业、克制":"Professional and concise","大胆、有争议":"Bold and thought-provoking"};
const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

export function contentView(state){
 const en=state.settings.locale==="en-US",t=(zh,eng)=>en?eng:zh;
 return `<div class="page-head"><div><p class="eyebrow">CREATION STUDIO</p><h1>${t("内容创作","Content studio")}</h1><p>${t("把你的想法，写成带有自己风格的初稿。","Turn your ideas into a first draft in your own style.")}</p></div></div>
 <div class="content-workbench"><form class="generator" id="generateForm">
 <label for="contentAvatar">${t("创作分身","Writing identity")}<select id="contentAvatar">${state.avatars.map(a=>`<option value="${escape(a.id)}">${escape(a.name)}</option>`).join("")}</select></label>
 <label for="contentTopic">${t("主题","Topic")}<input id="contentTopic" required maxlength="500" placeholder="${t("你想表达什么？","What would you like to say?")}"></label>
 <label for="contentType">${t("内容类型","Format")}<select id="contentType">${types.map(type=>`<option value="${type}">${en?(english[type]||type):type}</option>`).join("")}</select></label>
 <details class="content-options"><summary>${t("更多配置 · 语气、观点与记忆","More options · tone, key points and memories")}</summary>
 <label for="contentTone">${t("表达语气","Tone")}<select id="contentTone">${tones.map(tone=>`<option value="${tone}">${en?english[tone]:tone}</option>`).join("")}</select></label>
 <label for="contentPoint">${t("核心观点（可选）","Key points (optional)")}<textarea id="contentPoint" maxlength="2000" placeholder="${t("想强调的观点、素材或读者背景","Key ideas, source material or audience") }"></textarea></label>
 <label class="content-memory-choice"><input id="contentUseMemories" type="checkbox">${t("引用工作室中已选择的记忆","Use memories selected in the chat studio")}</label>
 </details><p class="content-quota">${t("每次成功生成使用 1 次免费体验；与对话共用 3 次额度。订阅有效期内可使用。","Each successful generation uses one free trial turn, shared with chat (3 total). Available with an active subscription.")}</p>
 <button class="primary" type="submit" id="generateContent">${t("生成初稿","Generate draft")}</button><p id="contentFeedback" role="status" aria-live="polite"></p>
 </form><section class="content-writing" aria-label="${t("草稿编辑器","Draft editor")}">
 <div class="content-draft-toolbar"><label for="savedDrafts">${t("已保存草稿","Saved drafts")}<select id="savedDrafts"></select></label><button class="secondary" type="button" id="newContentDraft">${t("新草稿","New draft")}</button></div>
 <label for="draftText">${t("初稿 · 可以直接编辑","Draft · edit directly")}</label><textarea id="draftText" maxlength="30000" placeholder="${t("生成结果会出现在这里，也可以直接写下你的内容。","Generated text appears here. You can also write your own.")}"></textarea>
 <div class="content-draft-actions"><button class="primary" id="saveContentDraft" type="button">${t("保存草稿","Save draft")}</button><button class="secondary" id="copyContentDraft" type="button">${t("复制全文","Copy text")}</button><span id="draftSaveStatus" role="status"></span></div>
 </section></div>`;
}

export function bindContentStudio({state:current,save,persist,onAccess,showPaywall}){
 const $=s=>document.querySelector(s),state=current(),en=state.settings.locale==="en-US",t=(zh,eng)=>en?eng:zh;
 const form=$("#generateForm"),editor=$("#draftText"),feedback=$("#contentFeedback"),saveStatus=$("#draftSaveStatus"),saved=$("#savedDrafts");
 let busy=false,saving=false;
 const fields={avatarId:$("#contentAvatar"),topic:$("#contentTopic"),type:$("#contentType"),tone:$("#contentTone"),point:$("#contentPoint"),useMemories:$("#contentUseMemories")};
 state.contentSession=state.contentSession&&typeof state.contentSession==="object"?state.contentSession:{};
 state.contentDrafts=Array.isArray(state.contentDrafts)?state.contentDrafts:[];
 const session=()=>current().contentSession;
 const capture=()=>{const s=session();for(const [key,el]of Object.entries(fields))s[key]=el.type==="checkbox"?el.checked:el.value;s.text=editor.value};
 const remember=()=>{capture();save();saveStatus.textContent=t("编辑中 · 点击保存加入草稿列表","Editing · save to add to your draft list")};
 const populate=()=>{
  const s=session();for(const[key,el]of Object.entries(fields)){if(el.type==="checkbox")el.checked=Boolean(s[key]);else el.value=s[key]??(key==="avatarId"?current().activeAvatarId:el.options?.[0]?.value||"")}
  if(!fields.avatarId.value)fields.avatarId.value=current().avatars[0]?.id||"";
  editor.value=s.text||"";
 };
 const renderSaved=()=>{saved.innerHTML=`<option value="">${t("选择已保存的草稿","Choose a saved draft")}</option>`+current().contentDrafts.map(d=>`<option value="${escape(d.id)}">${escape(d.topic||t("未命名草稿","Untitled draft"))}</option>`).join("");saved.value=session().draftId||""};
 for(const el of [...Object.values(fields),editor])el.addEventListener("change",remember);
 let editTimer;editor.addEventListener("input",()=>{capture();clearTimeout(editTimer);editTimer=setTimeout(()=>{if(editor.isConnected)remember()},500)});
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||saving)return;capture();if(!session().topic?.trim())return;
  const task=structuredClone(session()),s=current(),avatar=s.avatars.find(a=>a.id===task.avatarId)||s.avatars[0];
  if(editor.value.trim()&&!confirm(t("生成新初稿会替换当前编辑内容。是否继续？","A new draft will replace the current editor text. Continue?")))return;
  save();busy=true;form.querySelectorAll("input,select,textarea,button").forEach(el=>el.disabled=true);editor.readOnly=true;$("#newContentDraft").disabled=true;saved.disabled=true;
  feedback.textContent=t("正在调用真实模型，已有内容不会在失败时清空。","Generating with the model. Existing text stays if generation fails.");
  feedback.classList.remove("is-error");
  try{
   const prompt=en?`Write a complete ${english[task.type]||task.type} in English. Topic: ${task.topic}\nTone: ${english[task.tone]||task.tone}\nKey points: ${task.point||"None supplied"}\nReturn only the draft. Do not invent personal experiences or factual claims. Follow the format and audience; do not discuss your instructions.`
    :`请写一份完整的${task.type}，主题：${task.topic}\n语气：${task.tone}\n核心观点和素材：${task.point||"未提供"}\n只输出可直接使用的初稿。遵循内容类型的篇幅和格式，不要编造用户经历或事实，不要解释你的写作过程。`;
   const memories=task.useMemories?s.memories.filter(m=>identityMemories(s,avatar.id).map(String).includes(String(m.id))):[];
   const response=await fetch("./api/chat",{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(125000),body:JSON.stringify({purpose:"content",avatar:{id:avatar.id,name:avatar.name,role:avatar.role,bio:avatar.bio,mood:avatar.mood},persona:{...identityPersona(s,avatar.id),mood:avatar.mood},memories,messages:[{role:"user",text:prompt}],locale:s.settings.locale})});
   const data=await response.json();if(response.status===402){onAccess({trialRemaining:0});if(form.isConnected)showPaywall();throw Error("trial_exhausted")}
   if(!response.ok||!data.reply)throw Error(data.error||"model_error");
   if(Number.isFinite(data.trialRemaining))onAccess({trialRemaining:data.trialRemaining});
   Object.assign(session(),task,{text:data.reply,draftId:null,model:data.model});save();
   if(!form.isConnected)return;editor.value=data.reply;renderSaved();feedback.textContent=t("初稿已生成。请核对事实、编辑后保存。","Draft generated. Check facts, edit, then save.");saveStatus.textContent=t("待保存到草稿列表","Not yet in saved drafts");
  }catch(error){if(form.isConnected){feedback.classList.add("is-error");feedback.textContent=error.message==="trial_exhausted"?t("体验次数已用完；输入和已有初稿保留。","Trial complete. Your inputs and existing draft are kept."):t("生成失败，输入和已有初稿保留。点击生成初稿可重试。","Generation failed. Inputs and existing draft are kept. Click Generate draft to retry.")}}
  finally{busy=false;if(form.isConnected){form.querySelectorAll("input,select,textarea,button").forEach(el=>el.disabled=false);editor.readOnly=false;$("#newContentDraft").disabled=false;saved.disabled=false}}
 };
 $("#saveContentDraft").onclick=async()=>{
  if(busy||saving)return;clearTimeout(editTimer);capture();if(!editor.value.trim()){saveStatus.textContent=t("请先生成或输入内容。","Generate or write some text first.");return}
  const previous=structuredClone(current().contentDrafts),oldId=session().draftId,id=oldId||crypto.randomUUID();
  if(!oldId&&previous.length>=100){saveStatus.textContent=t("最多保存 100 份草稿，请先导出工作区备份。","Up to 100 drafts supported. Export your workspace for backup.");return}
  const draft={...structuredClone(session()),id,updatedAt:new Date().toISOString()};session().draftId=id;
  current().contentDrafts=[draft,...previous.filter(d=>d.id!==id)];saving=true;editor.readOnly=true;$("#saveContentDraft").disabled=true;saveStatus.textContent=t("正在保存到服务器…","Saving to server…");
  if(!await persist()){current().contentDrafts=previous;session().draftId=oldId;saveStatus.textContent=t("未保存，文字保留，请重试。","Not saved. Text is kept; try again.")}
  else{renderSaved();saveStatus.textContent=t("草稿已保存到服务器","Draft saved to server")}
  saving=false;if(editor.isConnected){editor.readOnly=false;$("#saveContentDraft").disabled=false}
 };
 $("#copyContentDraft").onclick=async()=>{try{await navigator.clipboard.writeText(editor.value);saveStatus.textContent=t("已复制","Copied")}catch{saveStatus.textContent=t("复制失败，请手动选择文字复制。","Copy failed. Select and copy the text manually.")}};
 saved.onchange=()=>{if(busy||saving)return;const d=current().contentDrafts.find(d=>d.id===saved.value);if(!d)return;if(editor.value.trim()&&!confirm(t("打开已保存草稿将替换编辑区。是否继续？","Opening a saved draft replaces the editor. Continue?"))){saved.value=session().draftId||"";return}current().contentSession={...structuredClone(d),draftId:d.id};populate();save();saveStatus.textContent=t("已打开保存的草稿","Saved draft opened")};
 $("#newContentDraft").onclick=()=>{if(busy||saving)return;if(editor.value.trim()&&!confirm(t("打开空白草稿？请先保存需要保留的内容。","Open a blank draft? Save anything you want to keep first.")))return;current().contentSession={avatarId:current().activeAvatarId};populate();renderSaved();save();saveStatus.textContent=""};
 populate();renderSaved();
}
