const $=s=>document.querySelector(s);
const state={space:'teach',employee:null,lesson:'',method:'',condition:'',confirmed:false,exam:false,trial:false,goal:'',output:'',deadline:'',task:null,step:0,revision:0,accepted:false,feedback:'',experience:false,files:[]};
let opener,toastTimer;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(s,a,c='secondary',disabled=false)=>`<button class="${c}" data-action="${a}" ${disabled?'disabled':''}>${s}</button>`;
const pill=(s,c='')=>`<span class="pill ${c}">${s}</span>`;
function person(id){const colors={A:['#8c7e9f','#554338'],B:['#71969c','#443c36'],C:['#b88b57','#6f4b32']},[shirt,hair]=colors[id];return `<svg viewBox="0 0 60 88" aria-hidden="true"><ellipse cx="30" cy="83" rx="21" ry="5" fill="#5f72552a"/><path d="M20 60 18 80m21-20 3 20" stroke="${shirt}" stroke-width="8" stroke-linecap="round"/><path d="m17 39-8 22m33-22 8 22" stroke="#dab18d" stroke-width="6" stroke-linecap="round"/><rect x="16" y="31" width="29" height="34" rx="11" fill="${shirt}"/><rect x="18" y="7" width="25" height="28" rx="11" fill="#dab18d"/><path d="M18 17V11q12-17 25 0v8" fill="${hair}"/><path d="m27 26 5 2 4-3" stroke="#75533c" stroke-width="1.8" fill="none" stroke-linecap="round"/>${id==='A'?'<path d="m36 47 12-3v20l-12 3Z" fill="#fbf5e4"/><path d="m40 51 5-1m-5 5 5-1" stroke="#b6a886" stroke-width="1"/>':id==='B'?'<path d="m9 47 18 3 12-7 14 6-11 11-28-4Z" fill="#f9f5e5"/><path d="m27 50 1 9" stroke="#b6b7a8"/>':'<path d="M17 20h10m7 0h10m-17 0h7" stroke="#48594a" stroke-width="2"/><path d="m38 39 9 6-8 15-9-6Z" fill="#faf1d8"/>'}</svg>`}
function campus(){
 const e=state.employee;
 const names={A:e?.name||'晓禾',B:'知远',C:'青岚'};
 let pos={A:[36,54],B:[54,58],C:[63,71]},actions={A:state.trial?'可接知识任务':state.exam?'正在试岗':state.confirmed?'准备验证能力':'向你请教',B:'问题分析',C:'例外核对'};
 if(state.task){pos.A=[47,51];actions.A='独立执行';if(state.step>=1){pos.A=[44,56];pos.B=[56,57];actions.A='FAQ 写作';actions.B='分类与风险分析'}if(state.step>=2){pos.A=[33,65];pos.B=[45,65];pos.C=[54,71];actions.C='加入任务组'}if(state.step>=3){pos={A:[62,67],B:[70,71],C:[57,77]};actions.A=state.accepted?'成果已接受':'等待验收'}}
 $('#employees').innerHTML=e?Object.keys(pos).filter(id=>id==='A'||(state.task&&state.step>=(id==='B'?1:2))).map(id=>`<button class="employee" data-person="${id}" style="--x:${pos[id][0]}%;--y:${pos[id][1]}%" aria-label="${names[id]}，${actions[id]}"><span class="bubble">${actions[id]}</span>${person(id)}<strong>${names[id]}</strong></button>`).join(''):'';
 $('#project-room').innerHTML=state.task?state.step>=2?`<button class="project-room" data-action="group"><svg viewBox="0 0 300 120" aria-hidden="true"><path d="m10 58 140-50 140 50-140 52Z" fill="#ddd5e6" stroke="#b7a6c4" stroke-width="2"/><path d="m10 58v14l140 46 140-46V58l-140 52Z" fill="#c7b7d3"/><path d="m50 58 100-36 100 36-100 35Z" fill="#fffaf0"/><path d="m95 55 55-20 55 20-55 22Z" fill="#9a8aab"/></svg><strong>项目室 · 客服知识改进组</strong><small>TG-001 · 原任务 ${state.task.id}</small></button>`:`<div class="workstation"><span>${state.step===0?'独立工位':'双人工位'}</span><small>${state.step===0?'晓禾先开始':'写作 + 问题分类'}</small></div>`:'';
 $('#campus-status').textContent=e?`${e.name} · ${state.trial?'可接对应任务':state.exam?'试岗中':state.confirmed?'准备考试':'学习中'}`:'等待第一位数字员工';
 $('#teaching-status').textContent=e?(state.confirmed?'知识已确认':'有问题向你学习'):'从一位员工开始';
 $('#publishing-status').textContent=state.task?'已发布 1 项任务':'等待一个新目标';
 $('#delivery-status').textContent=state.task?(state.accepted?'验收已完成':state.step>=3?'有成果待验收':'任务进行中'):'还没有任务';
 document.querySelectorAll('[data-space]').forEach(b=>{b.classList.toggle('active',b.dataset.space===state.space);b.setAttribute('aria-pressed',b.dataset.space===state.space)});
 document.body.dataset.stage=state.task?'working':e?'learning':'welcome';
 $('#campus-caption').textContent=state.task?['独立认领 → 在执行中找到帮手','第二位员工加入 → 双人分工继续原任务','第三位执行成员加入 → 创建任务组','交付物等待真人验收'][state.step]:'知识从教学室出发，工作在交付大厅完成。';
}
function teach(){
 const e=state.employee;
 if(!e)return `<div class="panel-top"><p class="eyebrow">01 / TEACH YOUR EMPLOYEE</p>${pill('从你开始')}</div><h2>先教出一位数字员工。</h2><p class="lead">给它一个名字，告诉它你的工作。简历、资料、每天的一段经验，都可以慢慢教。</p><div class="empty"><div class="portrait"></div><h3>你的第一位工作伙伴</h3><p>先学习你，再尝试工作。<br>不懂的地方，它会主动问。</p></div><form id="create"><div class="field"><label for="name">数字员工姓名</label><input id="name" name="name" value="晓禾" required maxlength="20"></div><div class="field"><label for="role">你想教它什么工作？</label><input id="role" name="role" placeholder="例如：客服经验与 FAQ 写作" required></div><button class="primary" type="submit">创建我的数字员工 →</button></form>`;
 let body=`<div class="panel-top"><p class="eyebrow">01 / TEACH YOUR EMPLOYEE</p>${pill(state.trial?'可接任务':state.exam?'试岗中':'持续学习','amber')}</div><h2>把你知道的，教给${escape(e.name)}。</h2><div class="teacher-row"><div class="portrait"></div><div><h3>${escape(e.name)} · ${escape(e.role)}</h3><p>教学者：小林 · 知识与资格分别记录</p></div></div>`;
 if(!state.lesson)body+=`<div class="question"><strong>${escape(e.name)}向你请教</strong>遇到资料没写的例外情况，我应该怎样处理？什么时候需要找真人？<small>还不懂：判断依据与升级边界</small></div><form id="teaching"><div class="field"><label for="lesson">教它一段经验，或示范你的工作</label><textarea id="lesson" name="lesson" required placeholder="说说你会怎样做，为什么这样判断……"></textarea></div><div class="actions">${btn('＋ 提供资料','attach')}<button class="primary" type="submit">教给${escape(e.name)} →</button></div></form>`;
 else if(!state.confirmed)body+=`<div class="receipt">你刚刚教的经验<small>${escape(state.lesson)}</small></div><div class="question"><strong>${escape(e.name)}的理解反馈</strong>我会按你的讲解整理方法，但需要你检查：方法适用于什么情况？哪些行动必须留给真人？</div><form id="confirm"><div class="knowledge-draft"><strong>待确认的方法记录</strong><div class="field"><label for="method">方法与判断</label><textarea id="method" name="method" required>${escape(state.method)}</textarea></div><div class="field"><label for="condition">适用条件与红线</label><input id="condition" name="condition" value="${escape(state.condition)}" required placeholder="例如：信息不足时交给真人，不自动承诺退款"></div><p class="mini-label">来源：小林本次教学 · 保存后才进入样例知识</p></div><button class="primary" type="submit">确认理解，进入练习 →</button></form>`;
 else body+=`<div class="question"><strong>本次确认的知识</strong>${escape(state.method)}<small>条件：${escape(state.condition)} · 来源：小林教学</small></div><div class="lesson-list"><div class="lesson"><strong>理解已确认</strong><span>不是资格证书</span></div><div class="lesson"><strong>场景考试</strong><span>${state.exam?'样例检查通过':'还未验证'}</span></div><div class="lesson"><strong>简单任务试岗</strong><span>${state.trial?'成果已检查':'等待试做'}</span></div></div><div class="actions">${btn(state.exam?'查看考试记录':'开始场景考试','exam','primary')}${btn('教一段新知识','new-lesson')}</div>${state.exam?`<div class="actions">${btn(state.trial?'查看试岗成果':'完成一个试岗小任务','trial',state.trial?'secondary':'primary')}</div>`:''}${state.trial?`<div class="receipt">现在可以接对应的知识任务<small>仍然会向你学习，也可以在执行中寻找其他员工帮助。</small></div><div class="actions">${btn('发布一项任务','go-publish','primary')}</div>`:''}`;
 return body+`<div class="stages">${['教学','理解确认','考试','试岗','接任务'].map((s,i)=>`<span class="${i===(state.trial?4:state.exam?3:state.confirmed?2:state.lesson?1:0)?'current':''}">${i+1} ${s}${i<4?' →':''}</span>`).join('')}</div>`;
}
function publish(){
 return `<div class="panel-top"><p class="eyebrow">02 / PUBLISH A GOAL</p>${pill('员工自主评估')}</div><h2>说清目标，其他交给员工。</h2><p class="lead">能独立做就独立认领；遇到能力缺口，可以找伙伴，不必现在选好全部成员。</p><form id="publish"><div class="field"><label for="goal">希望完成什么？</label><textarea id="goal" name="goal" required placeholder="例如：整理客服反馈，提出 FAQ 改进建议">${escape(state.goal)}</textarea></div><div class="field"><label for="output">希望拿到什么成果？</label><input id="output" name="output" required value="${escape(state.output)}" placeholder="分类清单、FAQ 草稿、风险列表"></div><div class="field"><label for="deadline">期望完成时间</label><input id="deadline" name="deadline" type="datetime-local" value="${escape(state.deadline||'2026-10-26T18:00')}" required></div><div class="actions">${btn('＋ 附加资料','attach')}<button class="primary" type="submit">检查并发布任务 →</button></div></form>${!state.trial?'<p class="mini-label">员工还在学习时也能发布任务；没有合格成员则等待，不假装已认领。</p>':''}<div class="lesson-list"><div class="lesson"><span>资料使用</span><strong>只用于本项任务</strong></div><div class="lesson"><span>最终完成</span><strong>由你检查与验收</strong></div></div>`;
}
function delivery(){
 const t=state.task;if(!t)return `<div class="panel-top"><p class="eyebrow">03 / PROGRESS & RESULTS</p>${pill('尚无任务')}</div><h2>进度与成果，都在这里。</h2><p class="lead">发布目标后，看见员工的判断、执行中的求助与已交付成果。</p><div class="empty"><h3>还没有发布任务</h3><p>不用先组好团队。员工会根据自己的能力决定怎样完成。</p></div><div class="actions">${btn('发布一个任务','go-publish','primary')}</div>`;
 const labels=['独立开始','双人协作','任务组执行','成果待验收'];
 const names=[state.employee?.name||'员工','知远','青岚'];
 const eventTexts=[`${names[0]}具备知识任务资格，先独立整理输入；分类与例外核对尚需帮助。`,'发现问题分类能力缺口，邀请知远负责分类与风险分析。','需要核对专业例外，邀请青岚加入。第 3 名执行成员加入，创建 TG-001，保留原任务。',`提交与你发布目标关联的三项工作成果${state.revision?' · 修订 v'+(state.revision+1):''}，等待真人验收。`];
 return `<div class="panel-top"><p class="eyebrow">03 / PROGRESS & RESULTS</p>${pill(state.accepted?'已验收':!state.trial?'等待合格员工':labels[state.step],state.step>=2?'purple':'')}</div><h2>${escape(t.goal)}</h2><p class="lead">${escape(t.output)} · 原任务 ${t.id}</p>${!state.trial?`<div class="question"><strong>任务已发布，但不能假装开工</strong>你的员工尚未完成考试与试岗。先验证对应能力，再判断能否认领。</div><div class="actions">${btn('回教学室继续成长','go-teach','primary')}</div>`:`<div class="members">${names.slice(0,Math.min(3,state.step+1)).map((n,i)=>`<button data-person="${['A','B','C'][i]}">${escape(n)} · ${['写作','分类','例外核对'][i]}</button>`).join('')}</div>${state.step>=2?`<div class="receipt">客服知识改进组 · TG-001<small>关联原任务 ${t.id} · 3 名执行成员 · 加入不自动扩大知识权限</small></div>`:''}<div class="task-summary"><strong>当前正在做什么？</strong><p>${eventTexts[state.step]}</p></div><div class="timeline">${eventTexts.slice(0,state.step+1).map((s,i)=>`<div class="event"><b>0${i+1}</b><div>${s}</div></div>`).join('')}</div>${state.step<3?`<div class="actions">${btn(['观察执行中的求助','观察第 3 人加入','检查并提交成果'][state.step],'next','primary')}</div><p class="mini-label">逐步观察样例；可立即跳至交付，不必等待人物动画。</p><div class="actions">${btn('跳到交付','skip')}</div>`:`${['analysis','draft','risk'].map(id=>`<div class="result"><div><strong>${artifactName(id)}</strong><small>与原任务目标关联 · 版本 v${state.revision+1}</small></div><button data-artifact="${id}">打开 →</button></div>`).join('')}<div class="actions">${btn(state.accepted?'查看验收记录':'验收成果','accept','primary')}${btn('退回修订','return','secondary',state.accepted)}</div>${state.accepted?`<div class="receipt">已接受本次成果<small>演示奖励：100 积分 · 不是实际支付或真实结算</small></div><div class="actions">${btn(state.experience?'已整理复用经验':'将反馈带回教学室','experience')}</div>`:''}`}`}`;
}
function artifactName(id){return {analysis:'目标与分类分析.md',draft:'工作方案草稿.md',risk:'风险与待确认事项.md'}[id]}
function artifactText(id){const t=state.task;return {analysis:`# 目标与分类分析\n\n原任务：${t.id}\n目标：${t.goal}\n期望成果：${t.output}\n\n已知依据：${state.method||'尚无已确认教学'}\n适用条件：${state.condition||'待补充'}\n\n分类建议：区分已有材料支持的问题、需要补充事实的问题，以及必须由真人决定的例外。\n负责人：知远。`,draft:`# 工作方案草稿 · v${state.revision+1}\n\n目标：${t.goal}\n\n1. 按提供的目标与资料整理信息。\n2. 应用教学者确认的方法：${state.method}\n3. 对未知内容保留问题，不替真人作承诺。\n\n交付要求：${t.output}\n${state.feedback?'修订反馈：'+state.feedback:''}\n负责人：${state.employee?.name}。`,risk:`# 风险与待确认事项\n\n任务：${t.goal}\n\n- 红线：${state.condition||'需教学者补充'}\n- 原始输入不足时须向任务发布者澄清。\n- 新成员不能获取未经授权的资料。\n- 以上为原型样例，不是经过真实业务评审的结论。\n负责人：青岚。`}[id]}
function render(){campus();$('#main').innerHTML=state.space==='teach'?teach():state.space==='publish'?publish():delivery();$('#main .portrait')?.insertAdjacentHTML('beforeend',person('A'));$('#task-strip').innerHTML=state.task?`<div class="task-tile"><div><strong>${escape(state.task.goal)}</strong><p>${state.task.id} · ${state.accepted?'已验收':!state.trial?'等待员工完成成长':'当前里程碑 '+(state.step+1)+' / 4'} · ${state.step>=2?'任务组 TG-001':'原任务保持连续'}</p></div>${btn('看进度与成果 →','go-delivery')}</div>`:'';location.hash=state.space;}
function notify(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500)}
function open(title,body){opener=document.activeElement;$('#modal-title').textContent=title;$('#modal-body').innerHTML=body;$('#modal').showModal()}
function close(){$('#modal').close()}
const openBase=open;open=function(title,body){
 openBase(title,body);
 if(title.startsWith('场景考试')){
  $('#modal-body .question').outerHTML=`<fieldset class="exam-options"><legend>对照教学边界，哪一种处理可以通过？</legend><label><input name="exam-choice" type="radio" value="wrong"> 直接承诺退款，事后再补依据</label><label><input name="exam-choice" type="radio" value="correct"> 整理已知信息，缺少依据先向真人澄清</label></fieldset><div class="receipt">评分依据：方法应用 / 事实依据 / 不越权<small>每项都须通过，失败可以重新练习。</small></div>`;
 }
 if(title.startsWith('试岗小任务'))$('#modal-body .question').insertAdjacentHTML('afterend','<div class="lesson-list"><div class="lesson"><strong>产物检查</strong><span>建议、依据、待确认事项</span></div><div class="lesson"><strong>岗位资格</strong><span>内部客服知识写作 · 样例</span></div></div>');
};
document.addEventListener('click',e=>{
 if(e.target.closest('[data-action="exam-pass"]')&&!state.exam&&document.querySelector('[name="exam-choice"]:checked')?.value!=='correct'){
  e.stopImmediatePropagation();$('#exam-error').textContent='未通过：不能承诺未经确认的结果。请回看教学边界，再选择。';
 }
},true);
$('#modal').addEventListener('close',()=>{if(opener?.isConnected)opener.focus()});
function collect(){if($('#goal')){state.goal=$('#goal').value;state.output=$('#output').value;state.deadline=$('#deadline').value}if($('#method')){state.method=$('#method').value;state.condition=$('#condition').value}if($('#lesson'))state.lessonDraft=$('#lesson').value}
function teachingFeedback(){
 if($('#lesson')){$('#lesson').value=state.lessonDraft||'';$('#lesson').insertAdjacentHTML('afterend','<small>讲清：你怎么做 → 为什么 → 何时找真人。可以先写一点，切换空间不会丢失。</small>')}
 if(state.space==='teach'&&state.employee&&!state.lesson){$('.question strong').textContent=state.employee.name+' · 还有一个问题想请教你';$('.question').insertAdjacentHTML('afterend','<div class="teaching-loop"><span>你示范方法</span><b>→</b><span>它复述理解</span><b>→</b><span>你检查确认</span></div>')}
 if($('#confirm')){
  $('#main').classList.add('confirming');
  $('.knowledge-draft strong').textContent='方法卡 K-001 · 由你编辑与确认';
  $('.knowledge-draft .mini-label').innerHTML='来源 <b>小林 · 本次讲解</b> · 状态 <b>待真人确认</b><br>原型仅回填你的输入，不声称模型已经理解。';
  $('.receipt').outerHTML=`<details class="source-note"><summary>回看教学原文 · ${state.lesson.length} 字</summary><p>${escape(state.lesson)}</p></details>`;
 }else $('#main').classList.remove('confirming');
}
const renderBase=render;render=function(){renderBase();teachingFeedback()};
const renderTeaching=render;render=function(){
 renderTeaching();
 if(state.space==='publish'){
  $('#publish').insertAdjacentHTML('afterend',`<div class="assessment-preview"><strong>发布后，员工会说明接单理由</strong><p>${state.employee?escape(state.employee.name):'你的员工'}：${state.trial?'已验证知识写作，可先整理材料':'尚无已验证资格，不能直接开工'}；问题分类与专业例外需要判断是否找帮手。</p><small>这是固定示例判断，不是模型对任意任务的真实匹配。</small></div>`);
  $('#deadline').insertAdjacentHTML('afterend','<p id="deadline-error" class="error" role="alert"></p>');
  $('#deadline').setAttribute('aria-describedby','deadline-error');
 }
 if(state.space==='delivery'&&state.task&&state.step===0&&state.trial){
  $('.task-summary').insertAdjacentHTML('beforebegin',`<div class="assessment-preview"><strong>${escape(state.employee.name)}的接单判断 · 样例</strong><p>能先做：应用方法卡 K-001 整理资料与草稿。<br>还缺：分类判断、专业例外核对。<br>决定：先独立开始，在需要时邀请合格帮手。</p></div>`);
 }
 if(state.space==='delivery'&&state.task&&state.trial){
  $('.members').insertAdjacentHTML('beforebegin',`<div class="team-evolution">${['1 人 · 独立','2 人 · 分工','3 人 · 建组'].map((s,i)=>`<span class="${Math.min(state.step,2)===i?'selected':''}">${s}</span>`).join('<b>→</b>')}</div>`);
 }
};
const renderTask=render;render=function(){
 renderTask();
 if(state.space==='delivery'&&state.task&&state.step>=3){
  $('#main').classList.add('results-mode');
  const timeline=$('.timeline');timeline.outerHTML=`<details class="work-record"><summary>完整工作记录 · 原任务与成员变化</summary>${timeline.outerHTML}</details>`;
  $('.task-summary').insertAdjacentHTML('beforebegin',`<div class="review-banner"><strong>${state.revising?'正在修订':state.reviewed?'独立评审已检查':'先看成果，再检查与验收'}</strong><p>${state.revising?'你的反馈：'+escape(state.feedback):'三份成果分别打开；方法来源与待确认事项可回查。'}</p>${btn(state.revising?'完成样例修订':state.reviewed?'查看评审记录':'进行独立评审',state.revising?'finish-revision':'review')}</div>`);
  $('[data-action="accept"]').disabled=!!state.revising||!state.reviewed;
 }else $('#main').classList.remove('results-mode');
 if(state.space==='teach'&&state.experience){
  $('#main').insertAdjacentHTML('afterbegin',`<div class="experience-note"><strong>来自交付的经验候选</strong><p>${escape(state.feedback||'遇到能力缺口时邀请合格帮手，并保留未知事项。')}</p><small>来源：任务 ${state.task.id} · ${state.experienceConfirmed?'真人已确认，可用于后续教学':'待教学者确认，未自动成为知识'}</small>${!state.experienceConfirmed?btn('确认这条经验','confirm-experience'):''}</div>`);
 }
};
document.addEventListener('submit',e=>{
 if(e.target.id==='feedback-form'){
  e.preventDefault();e.stopImmediatePropagation();state.feedback=$('#feedback').value.trim();if(!state.feedback)return;
  state.revising=true;state.reviewed=false;close();render();notify('反馈已保留，原任务进入修订；尚未生成新版本。');
 }
},true);
document.addEventListener('click',e=>{
 const a=e.target.closest('[data-action]')?.dataset.action;
 if(a==='review')open('独立评审 · 非执行角色检查',`<div class="modal-copy"><p>评审角色：评审员（不计入执行成员人数）。本原型由演示者逐项模拟检查，不是真实 Agent 评审。</p><p>依据：原任务目标、方法卡 K-001、成果中的未知与风险。</p><label><input id="review-check" type="checkbox"> 已检查目标一致、来源可回查、无越权承诺</label><p class="error" id="review-error" role="alert"></p></div><div class="actions">${btn('退回检查','close')}${btn('记录评审通过','review-pass','primary')}</div>`);
 if(a==='review-pass'){if(!$('#review-check').checked){$('#review-error').textContent='请先逐项检查，不自动通过。';return}state.reviewed=true;close();render()}
 if(a==='finish-revision'){state.revising=false;state.revision++;render();notify('样例修订已完成，保留反馈并更新版本；需要重新评审。')}
 if(a==='confirm-experience'){state.experienceConfirmed=true;render();notify('经验候选已由教学者确认，不自动升级岗位资格。')}
 if(a==='accept-confirm'&&(state.revising||!state.reviewed)){e.stopImmediatePropagation();notify('请先完成修订与独立评审。')}
},true);
document.addEventListener('click',e=>{
 const a=e.target.closest('[data-action]')?.dataset.action;
 if(a==='publish-confirm'&&$('#consent')?.checked){
  if(state.task){e.stopImmediatePropagation();close();notify('已有一项任务，请先完成当前演示或重新开始。');return}
  state.reviewed=false;state.revising=false;state.feedback='';state.revision=0;state.experience=false;state.experienceConfirmed=false;
 }
 if(a==='accept-confirm'&&state.accepted){e.stopImmediatePropagation();close();notify('这次验收已经记录，不重复奖励。')}
 if(a==='new-lesson'){
  state.previousKnowledge={method:state.method,condition:state.condition,qualified:state.trial};state.lessonDraft='';
 }
 if(e.target.closest('[data-space]')||a?.startsWith('go-')){
  requestAnimationFrame(()=>{$('#main').focus({preventScroll:true});if(innerWidth<=850)$('#main').scrollIntoView({behavior:'instant',block:'start'})});
 }
},true);
const renderReview=render;render=function(){
 renderReview();
 if(state.space==='delivery'&&state.step>=3)document.querySelectorAll('.result small').forEach((el,i)=>{el.textContent=['知远 · 分类分析','晓禾 · 写作方案','青岚 · 例外核对'][i]+' · 来源 K-001 · v'+(state.revision+1)});
 if(state.previousKnowledge&&state.space==='teach')$('#main').insertAdjacentHTML('beforeend',`<details class="source-note"><summary>上一条已确认知识 · 保留记录</summary><p>${escape(state.previousKnowledge.method)}</p><p>${escape(state.previousKnowledge.condition)}</p><small>新增知识重新验证；原有记录不会被删除。</small></details>`);
 if(state.accepted&&state.space==='delivery')$('.receipt:last-of-type')?.setAttribute('aria-live','polite');
};
document.addEventListener('submit',e=>{
 if(e.target.id==='publish'&&new Date($('#deadline').value)<=new Date()){
  e.preventDefault();e.stopImmediatePropagation();$('#deadline-error').textContent='请选择未来的期望完成时间。';$('#deadline').focus();
 }
},true);
document.addEventListener('submit',e=>{
 e.preventDefault();const form=e.target;
 if(form.id==='create'){state.employee={name:$('#name').value.trim(),role:$('#role').value.trim()};render();notify('员工已创建，开始向你学习。')}
 if(form.id==='teaching'){state.lesson=$('#lesson').value.trim();if(!state.lesson)return;state.method=state.lesson;render();notify('你的讲解成为教学来源；请检查它的理解。')}
 if(form.id==='confirm'){state.method=$('#method').value.trim();state.condition=$('#condition').value.trim();if(!state.method||!state.condition)return;state.confirmed=true;render();notify('理解已确认，下一步验证实际应用。')}
 if(form.id==='publish'){collect();if(!state.goal.trim()||!state.output.trim())return;open('发布前，确认目标与成果',`<div class="modal-copy"><h3>${escape(state.goal)}</h3><p>成果：${escape(state.output)}</p><p>期望时间：${escape(state.deadline.replace('T',' '))}</p><p>员工会判断能否接单；未知部分可以求助，不默认获得全部能力。</p><label><input id="consent" type="checkbox"> 我确认资料有权处理，成果由真人检查</label><p id="consent-error" class="error" role="alert"></p></div><div class="actions">${btn('返回修改','close')}${btn('确认发布','publish-confirm','primary')}</div>`)}
 if(form.id==='feedback-form'){state.feedback=$('#feedback').value.trim();if(!state.feedback)return;state.revision++;close();render();notify('修订反馈已保留，成果版本已更新。')}
});
document.addEventListener('input',e=>{if(['goal','output','deadline','method','condition','lesson'].includes(e.target.id))collect()});
document.addEventListener('click',e=>{
 const space=e.target.closest('[data-space]')?.dataset.space;
 if(space){collect();state.space=space;render();return}
 const personId=e.target.closest('[data-person]')?.dataset.person;
 if(personId){open('员工档案 · '+({A:state.employee?.name||'晓禾',B:'知远',C:'青岚'}[personId]),`<div class="modal-copy"><p>职责：${{A:state.employee?.role,B:'问题分类与风险分析',C:'专业例外核对'}[personId]}</p><p>知识背景：${personId==='A'?'小林持续教学，保留来源与适用条件':'其他教学者授权的对应专业知识（样例）'}</p><p>资格：${personId==='A'?(state.trial?'样例考试与试岗已检查':'尚未完成成长验证'):'样例已验证资格'}</p><p>当前行动：${state.task?'根据职责参与原任务 '+state.task.id:'等待合适任务'}</p></div>`);return}
 const artifact=e.target.closest('[data-artifact]')?.dataset.artifact;
 if(artifact){open(artifactName(artifact),`<div class="modal-copy artifact-content">${escape(artifactText(artifact)).replace(/\n/g,'<br>')}</div>`);return}
 const a=e.target.closest('[data-action]')?.dataset.action;if(!a)return;
 if(a==='close')close();
 if(a.startsWith('go-')){collect();state.space=a.slice(3);render()}
 if(a==='attach')open('提供资料或示范工作',`<div class="modal-copy"><p>讲一段经验、提供简历或工作文档，或描述今天做过的工作。不会自动监控电脑。</p><div class="field"><label for="files">资料文件（只读取文件名，不上传）</label><input id="files" type="file" multiple accept=".txt,.md,.pdf,.docx"></div><div id="file-list"></div><p>资料仍需确认来源与使用授权。原型没有解析或上传能力。</p></div>`);
 if(a==='new-lesson'){state.lesson='';state.confirmed=false;state.method='';state.condition='';state.exam=false;state.trial=false;render()}
 if(a==='exam')open('场景考试 · 应用你刚教的方法',`<div class="modal-copy"><p>新案例：客户要求承诺一个资料未说明的处理结果。</p><p>请检查样例答法是否应用了方法：<strong>${escape(state.method)}</strong></p><p>条件：${escape(state.condition)}</p><div class="question">先依据已确认的方法整理信息，对缺失依据保持未知，再向真人请求澄清。</div><p>这里只演示考试核查，不是模型实际考试或自动资格认证。</p><label><input id="exam-check" type="checkbox"> 已检查答法与边界，没有越权承诺</label><p class="error" id="exam-error" role="alert"></p></div><div class="actions">${btn('继续补学','close')}${btn('确认样例考试','exam-pass','primary')}</div>`);
 if(a==='exam-pass'){if(!$('#exam-check').checked){$('#exam-error').textContent='请先检查答法与边界。';return}state.exam=true;close();render();notify('样例考试已检查；还需要试岗成果。')}
 if(a==='trial')open('试岗小任务 · 不是正式接单',`<div class="modal-copy"><p>用一个新案例整理建议，应用你确认的方法，不替真人决定未知事项。</p><div class="question"><strong>试岗成果</strong>已知：${escape(state.method)}<br>限制：${escape(state.condition)}<br>处理：依据不足时保留问题，请真人核对。</div><label><input id="trial-check" type="checkbox"> 已检查成果能应用知识，可尝试对应任务</label><p class="error" id="trial-error" role="alert"></p></div><div class="actions">${btn('返回补练','close')}${btn('确认试岗成果','trial-pass','primary')}</div>`);
 if(a==='trial-pass'){if(!$('#trial-check').checked){$('#trial-error').textContent='请先检查试岗成果。';return}state.trial=true;close();render();notify('样例成长链已完成；可以评估对应任务。')}
 if(a==='publish-confirm'){if(!$('#consent').checked){$('#consent-error').textContent='请确认资料处理权与真人检查。';return}state.task={id:'AWL-'+String(Date.now()).slice(-6),goal:state.goal,output:state.output,deadline:state.deadline};state.step=0;state.accepted=false;state.space='delivery';close();render();notify('保留你填写的目标，进入任务观察。')}
 if(a==='next'){state.step=Math.min(3,state.step+1);render();notify(['','知远加入，继续原任务。','第 3 名执行成员加入，创建 TG-001。','已提交三项不同成果。'][state.step])}
 if(a==='skip'){state.step=3;render();notify('已跳至交付，保留完整成员与事件记录。')}
 if(a==='group')open('客服知识改进组 · TG-001',`<div class="modal-copy"><p>原任务：${escape(state.task.id)}</p><p>${escape(state.employee.name)}：工作方案与写作<br>知远：分类与风险分析<br>青岚：例外核对</p><p>第 3 名执行成员加入后创建；成员只接收职责所需的授权上下文，原任务与成果不被重建。</p></div>`);
 if(a==='accept')open(state.accepted?'验收记录':'检查本次成果',`<div class="modal-copy"><p>任务：${escape(state.task.goal)}</p><p>检查三项成果及引用，独立评审通过后由真人接受。</p>${state.accepted?'<p>本次样例已接受；重复操作不再次奖励。</p>':'<label><input id="accept-check" type="checkbox"> 我已检查目标、成果、依据与评审</label><p id="accept-error" class="error" role="alert"></p>'}</div><div class="actions">${btn('返回','close')}${!state.accepted?btn('接受成果','accept-confirm','primary'):''}</div>`);
 if(a==='accept-confirm'){if(!$('#accept-check').checked){$('#accept-error').textContent='请先检查成果与依据。';return}state.accepted=true;close();render();notify('已演示验收；没有真实积分结算。')}
 if(a==='return')open('退回修订 · 保留原任务',`<form id="feedback-form"><div class="field"><label for="feedback">指出需要改进的成果或条件</label><textarea id="feedback" required>${escape(state.feedback)}</textarea></div><button class="primary">保留反馈并演示修订</button></form>`);
 if(a==='experience'){state.experience=true;state.space='teach';render();open('反馈回流 · 先确认，不冒充事实',`<div class="modal-copy"><p>任务：${escape(state.task.goal)}</p><p>反馈：${escape(state.feedback||'信息不足时保留未知，并在执行中邀请适合的帮手。')}</p><p>经验候选需要教学者核对来源和适用范围，不自动改写真人简历。</p></div>`)}
 if(a==='pause'){document.body.classList.toggle('motion-paused');$('#motion-button').textContent=document.body.classList.contains('motion-paused')?'恢复动效':'暂停动效';$('#motion-button').setAttribute('aria-pressed',document.body.classList.contains('motion-paused'))}
 if(a==='help')open('可操作的数字校园',`<div class="modal-copy"><p>教学室：创建、教学、确认理解、考试与试岗。</p><p>任务发布台：保留你的目标和期望成果，员工自主评估。</p><p>交付大厅：独立执行 → 双人协作 → 第三人建立任务组 → 成果、修订与验收。</p><p>这是设计原型，当前状态只在页面内存中。刷新会恢复初始状态，未接入真实模型、SDK、文件解析或业务权限。</p></div>`);
 if(a==='reset'){open('重新开始演示？',`<p class="modal-copy">当前原型中的教学和任务会清空；不会删除项目文件或真实资料。</p><div class="actions">${btn('取消','close')}${btn('确认重置','reset-confirm','primary')}</div>`)}
 if(a==='reset-confirm')location.reload();
});
document.addEventListener('change',e=>{if(e.target.id==='files'){state.files=[...e.target.files].map(f=>f.name);$('#file-list').textContent=state.files.join('、');notify('只展示文件名，未上传或解析。')}});
window.addEventListener('hashchange',()=>{const s=location.hash.slice(1);if(['teach','publish','delivery'].includes(s)&&s!==state.space){collect();state.space=s;render()}});
state.space=['teach','publish','delivery'].includes(location.hash.slice(1))?location.hash.slice(1):'teach';render();
