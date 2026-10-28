const people = {
 A:{name:'知远',role:'问题分析员',skill:'问题分类 · 风险识别',score:86,color:'',source:'小林 · 客服知识库复盘',task:'分类清单 + 风险列表'},
 B:{name:'晓禾',role:'知识写作员',skill:'FAQ 编写 · 证据写作',score:91,color:'blue',source:'小林 · FAQ 方法说明',task:'FAQ 改进草稿'},
 C:{name:'明澈',role:'独立评审员',skill:'质量核对 · 边界检查',score:'—',color:'orange',source:'任务标准与授权证据',task:'独立评审 · 不参与执行分成'},
 D:{name:'青岚',role:'资料整理员',skill:'问题分类 · 信息归纳',score:89,color:'green',source:'小林 · 问题分类方法包',task:'独立整理高频问题'}
};
const tasks = {
 team:{title:'客服知识库改进方案',desc:'分析 20 个客服案例，产出分类清单、FAQ 草稿与风险列表。',reward:100,mode:'自主组队',members:['A','B'],steps:['发现任务，提出职责','校验资格与知识权限','邀请互补成员，确认团队','协作执行，提交 3 项产物','独立评审与真人验收'],match:'知远擅长分类与风险，晓禾擅长 FAQ。两者互补，分别拥有所需知识包。',outcome:'3 项产物等待验收 · 积分预分配 67 / 33'},
 solo:{title:'高频问题分类与摘要',desc:'整理 8 个新问题，交付分类与简明摘要。能力覆盖时，无需额外组队。',reward:40,mode:'独立完成',members:['D'],steps:['发现可独立完成的任务','检查技能、授权与负载','单人认领，进入独立工位','整理案例，提交分类与摘要','独立评审与真人验收'],match:'青岚的问题分类资格覆盖全部工作要求，可用授权知识包，当前没有其他任务。',outcome:'2 项产物等待验收 · 40 积分待结算'}
};
const places = {library:['知识馆','真人经验成为有来源的知识','贡献资料 → 确认事实 → 建立知识包。原始全文不默认开放给所有员工。'],academy:['学习与考核站','理解方法，再验证能力','授权检索、练习与未见案例考试。≥80 分且无硬失败，经真人核分后资格生效。'],board:['任务公告栏','目标在这里被员工发现','员工根据技能、授权与负载判断能否独立完成，或邀请互补的队友。'],team:['组队工坊','互补能力，组成一个团队','邀请是提案。资格、权限与负载均满足后，引擎才确认成员与任务归属。'],solo:['独立工作室','能独立做好的，不强行组队','单个员工覆盖所有工作项时，独立认领。仍需要独立评审与真人验收。'],delivery:['交付中心','成果被检查，贡献才被认可','查看产物和证据，独立 Critic 评审。真人最终接受后才能结算积分。']};
let current='team',step=0,selected=null,view='plaza',timer=null,playing=false,accepted=false,opener=null;
let feed=['知远正在任务公告栏寻找匹配目标','晓禾完成 FAQ 方法学习，等待任务','青岚可独立覆盖问题分类任务'];
const $=s=>document.querySelector(s);
function bodyPerson(p){return `<span class="person ${p.color}"><i class="head"></i><i class="body"></i><i class="arm left"></i><i class="arm right"></i><i class="leg left"></i><i class="leg right"></i></span>`}
function renderPeople(){
 const positions={A:[41,47],B:[65,49],C:[72,57],D:[65,66]};
 const messages={A:'寻找适合的任务',B:'FAQ 资格已通过',C:'等待成果评审',D:'可独立认领'};
 if(current==='team'){
   if(step===1){messages.A='分析能力匹配';messages.B='写作能力匹配'}
   if(step===2){positions.A=[41,49];positions.B=[62,49];messages.A='邀请晓禾协作';messages.B='接受邀请提案'}
   if(step===3){positions.A=[37,68];positions.B=[46,74];messages.A='分类 + 风险分析';messages.B='编写 FAQ 草稿'}
   if(step===4){positions.A=[75,51];positions.B=[83,60];positions.C=[68,61];messages.A=accepted?'验收通过':'已提交成果';messages.B='等待真人验收';messages.C='独立评审完成'}
 }else{
   if(step===1)messages.D='资格与权限满足';
   if(step===2){positions.D=[68,67];messages.D='独立认领 8 个案例'}
   if(step===3){positions.D=[69,72];messages.D='专注整理与分类'}
   if(step===4){positions.D=[80,59];messages.D=accepted?'验收通过':'独立成果已提交';messages.C='检查分类与引用'}
 }
 $('#agents').innerHTML=Object.entries(people).map(([id,p])=>`<button class="agent ${selected===id?'selected':''}" data-agent="${id}" aria-label="${p.name}，${p.role}，${messages[id]}" style="--x:${positions[id][0]}%;--y:${positions[id][1]}%"><span class="bubble ${tasks[current].members.includes(id)?'active':''}">${messages[id]}</span>${bodyPerson(p)}<span class="agent-name">${p.name} · ${p.role}</span></button>`).join('');
 $('#connection').classList.toggle('visible',current==='team'&&step===2);
 $('#team-caption').textContent=current==='team'&&step>=3?'知远 + 晓禾 · 协作中':'能力互补 · 自主协作';
 $('#solo-caption').textContent=current==='solo'&&step>=2?'青岚 · 独立执行':'单人认领 · 专注交付';
}
function taskPanel(){
 const t=tasks[current];
 return `<p class="overline">OBSERVE / ${current==='team'?'TEAMWORK':'SOLO WORK'}</p><span class="mode-label">${t.mode} · ${accepted?'已模拟验收':'步骤 '+(step+1)+' / 5'}</span><h2>${t.title}</h2><p class="inspector-desc">${t.desc}</p><div class="detail"><span>任务奖励</span><strong>${t.reward} 积分</strong></div><div class="detail"><span>执行成员</span><strong>${t.members.map(id=>people[id].name).join(' + ')}</strong></div><div class="detail"><span>验收方式</span><strong>独立评审 + 真人</strong></div><div class="match"><strong>${current==='solo'?'为什么可以独立完成？':'为什么选择这个团队？'}</strong><p>${t.match}</p></div><div class="member-pills">${t.members.map(id=>`<span>${people[id].name} · ${people[id].score} 分资格</span>`).join('')}</div><div class="steps">${t.steps.map((s,i)=>`<div class="step ${i===step?'current':i<step?'done':''}"><b>${i<step?'✓':i+1}</b><span>${s}</span></div>`).join('')}</div><div class="inspector-actions"><button class="primary" data-action="${step===4?'accept':'next'}">${step===4?(accepted?'查看验收结果':'查看成果并验收'):'观察下一步 →'}</button><button class="secondary" data-action="play">${playing?'暂停演示':step===4?'从头演示':'自动播放过程'}</button></div><p class="inspector-note">可逐步观察或暂停。当前为交互原型，不执行真实任务。</p>`;
}
function personPanel(id){
 const p=people[id];
 return `<p class="overline">EMPLOYEE / CAPABILITY</p><div class="member-pills"><span>${p.role}</span><span>${id==='C'?'独立评审':'L1 已认证'}</span></div><h2>${p.name}</h2><p class="inspector-desc">${p.skill}</p><div class="detail"><span>知识背景</span><strong>${p.source}</strong></div><div class="detail"><span>能力考核</span><strong>${p.score==='—'?'独立评审配置':p.score+' / 100'}</strong></div><div class="detail"><span>当前职责</span><strong>${p.task}</strong></div><div class="match"><strong>知识、资格与奖励分开</strong><p>关联的真人经历提供知识背景，不自动成为数字员工的能力。积分在验收后结算。</p></div><div class="inspector-actions"><button class="primary" data-action="knowledge">查看知识与资格</button><button class="secondary" data-action="back-task">返回任务观察</button></div>`;
}
function ancillaryPanel(){
 if(view==='talent')return `<p class="overline">PEOPLE / TALENT</p><h2>真人知识，成为数字员工的背景。</h2><p class="inspector-desc">小林贡献了三份工作资料。4 位员工各有职责，不复制真人的职级与绩效。</p>${Object.entries(people).map(([id,p])=>`<button class="space-row" data-employee="${id}" style="width:100%;margin-bottom:10px"><strong>${p.name} · ${p.role}</strong><small>${p.skill}</small></button>`).join('')}<div class="inspector-actions"><button class="secondary" data-action="back-task">返回广场任务</button></div>`;
 if(view==='knowledge')return `<p class="overline">KNOWLEDGE / LEARNING</p><h2>知识如何迁移到员工？</h2><p class="inspector-desc">贡献经历与方法，确认来源和用途，员工通过授权检索学习，再参加未见案例考试。</p><div class="steps">${['小林贡献简历、项目复盘与方法','本人核对事实，建立知识包','员工按职责获得授权知识','练习、考试与独立真人核分','通过资格，再认领对应任务'].map((s,i)=>`<div class="step ${i===2?'current':''}"><b>${i+1}</b><span>${s}</span></div>`).join('')}</div><div class="match"><strong>禁止自动承诺退款</strong><p>方法说明第 4 段 → FAQ 红线 → 任务评审检查。引用必须可以回到原文。</p></div><div class="inspector-actions"><button class="primary" data-action="knowledge">查看来源与考核</button><button class="secondary" data-action="back-task">返回任务观察</button></div>`;
 return `<p class="overline">DELIVERY / GROWTH</p><h2>交付完成，奖励才到账。</h2><p class="inspector-desc">独立评审检查引用与约束，真人最终接受指定产物版本。执行员工不能自行批准。</p><div class="detail"><span>团队任务预算</span><strong>100 积分</strong></div><div class="detail"><span>知远 / 分类与风险</span><strong>67 积分</strong></div><div class="detail"><span>晓禾 / FAQ 草稿</span><strong>33 积分</strong></div><div class="detail"><span>独立任务 / 青岚</span><strong>40 积分</strong></div><div class="match"><strong>积分不等于能力</strong><p>L1 来自有效考试，L2 来自多次验收，知识条件变化则需复核。积分不可兑现金，不计入真人 HR。</p></div><div class="inspector-actions"><button class="primary" data-action="delivery">查看交付中心</button><button class="secondary" data-action="back-task">返回任务观察</button></div>`;
}
function render(){
 renderPeople();$('#inspector').innerHTML=selected?personPanel(selected):view==='plaza'?taskPanel():ancillaryPanel();
 $('#task-cards').innerHTML=Object.entries(tasks).map(([id,t])=>`<article class="task-card ${id===current?'selected':''}"><div class="task-top"><span>${id==='team'?'AWL-001 / 团队任务':'AWL-002 / 单人任务'}</span><span class="reward">＋${t.reward} 积分</span></div><h3>${t.title}</h3><p>${t.desc}</p><div class="task-tags"><span>${t.mode}</span><span>${id==='team'?'分析 + 写作':'问题分类'}</span><span>真人验收</span></div><button data-task="${id}">${id===current?'正在观察':'观察员工如何认领'} →</button></article>`).join('');
 $('#activity-feed').innerHTML=feed.slice(0,3).map((text,i)=>`<div class="feed-item"><span class="initial">${['A','B','D'][i]}</span><div>${text}<p>${i===0?'刚刚':'此前'} · 观察记录</p></div></div>`).join('');
 $('#space-list').innerHTML=Object.entries(places).map(([id,[title,sub,desc]])=>`<button class="space-row" data-place="${id}"><strong>${title} · ${sub}</strong><small>${desc}</small></button>`).join('')+Object.entries(people).map(([id,p])=>`<button class="space-row" data-employee="${id}"><strong>${p.name} · ${p.role}</strong><small>${p.skill} / ${p.source}</small></button>`).join('');
 document.querySelectorAll('nav a').forEach(a=>{a.classList.toggle('active',a.dataset.view===view);a.setAttribute('aria-current',a.dataset.view===view?'page':'false')});
}
function stop(){clearInterval(timer);timer=null;playing=false}
function next(){
 if(step>=4){stop();render();return}
 step++;selected=null;view='plaza';
 feed.unshift(current==='team'?['','知远与晓禾分别通过资格和权限校验','知远邀请晓禾，共同覆盖分类与写作职责','知远与晓禾进入组队工坊，分工协作','团队提交分类、FAQ 与风险产物，等待真人验收'][step]:['','青岚的知识与资格覆盖全部要求','青岚独立认领，无需添加多余成员','青岚进入独立工作室，整理 8 个案例','青岚提交分类与摘要，等待独立评审和验收'][step]);
 if(step===4)stop();render();announce(tasks[current].steps[step]);
}
function announce(text){$('#status').textContent=text;$('#status').classList.add('show');setTimeout(()=>$('#status').classList.remove('show'),3500)}
function open(title,content){opener=document.activeElement;$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;$('#modal').showModal()}
$('#close').onclick=()=>$('#modal').close();
$('#modal').addEventListener('close',()=>{if(opener?.isConnected)opener.focus()});
function showKnowledge(){open('小林的知识 → 员工的能力',`<ul class="modal-list"><li>客服知识库项目复盘<span>来源第 3 段：问题分类与风险升级方法；本人确认，不代表外部效果验证。</span></li><li>FAQ 方法说明<span>第 4 段：涉及退款或价格承诺时，交由真人核对，不能由员工自行承诺。</span></li><li>条件化技能考核<span>知远 86 分、晓禾 91 分、青岚 89 分；本页为设计样例，不是真实模型评测。</span></li></ul><p class="modal-copy">知识限定用途与受众，考试与模型条件绑定。授权撤回后资格需复核，管理员没有默认私密资料读取权。</p>`)}
document.addEventListener('click',e=>{
 const task=e.target.closest('[data-task]')?.dataset.task;
 if(task){stop();current=task;step=0;accepted=false;selected=null;view='plaza';render();announce('正在观察：'+tasks[current].mode);return}
 const employee=e.target.closest('[data-agent],[data-employee]');if(employee){selected=employee.dataset.agent||employee.dataset.employee;render();return}
 const place=e.target.closest('[data-place]')?.dataset.place;
 if(place){if(place==='team'||place==='solo'){stop();current=place;step=2;accepted=false;selected=null;view='plaza';render();announce('正在观察：'+tasks[current].mode)}else if(place==='library'||place==='academy'){view='knowledge';selected=null;render();showKnowledge()}else if(place==='board'){open('任务公告栏',`<p class="modal-copy">两个目标需要不同的能力组合：客服改进需要分析与写作合作，高频分类可由青岚独立完成。</p><div class="modal-actions"><button class="secondary" data-task="solo" data-action="close">观察单人任务</button><button class="primary" data-task="team" data-action="close">观察自动组队</button></div>`)}else{open('交付中心',`<ul class="modal-list"><li>分类清单与风险列表<span>知远负责，关联问题分类方法。</span></li><li>FAQ 改进草稿 v2<span>晓禾负责，修订未经授权退款承诺。</span></li><li>独立任务分类与摘要<span>青岚独立执行，仍需 Critic 和真人验收。</span></li></ul><p class="modal-copy">奖励只在最终验收后结算。本原型不执行真实验收或发奖。</p>`)}return}
 const a=e.target.closest('[data-action]')?.dataset.action;if(!a)return;
 if(a==='next')next();
 if(a==='play'){if(playing)stop();else{if(step===4){step=0;accepted=false}playing=true;timer=setInterval(()=>{if(document.hidden||$('#modal').open)return;next()},2200)}render()}
 if(a==='back-task'){view='plaza';selected=null;render()}
 if(a==='knowledge')showKnowledge();
 if(a==='delivery'){$('[data-place=delivery]').click()}
 if(a==='accept')open('真人验收 · '+tasks[current].title,`<p class="modal-copy">${tasks[current].outcome}。需检查产物、引用、独立评审和当前授权。</p><label><input type="checkbox" id="confirm-read"> 我已核查成果、引用和评审依据</label><p class="error" id="accept-error" role="alert"></p><div class="modal-actions"><button class="secondary" data-action="close">返回检查</button><button class="primary" data-action="confirm">确认验收</button></div><p class="modal-copy">设计原型：仅改变观察状态，无数据库结算。</p>`);
 if(a==='confirm'){if(!$('#confirm-read').checked){$('#accept-error').textContent='请先核查成果与评审依据。';return}accepted=true;$('#modal').close();feed.unshift(tasks[current].title+'已模拟验收，奖励 '+tasks[current].reward+' 积分');render();announce('验收流程已演示；没有真实积分入账。')}
 if(a==='close')$('#modal').close();
});
document.addEventListener('click',e=>{if(e.target.closest('[data-task]')&&$('#modal').open)$('#modal').close()});
$('#map-view').onclick=()=>{$('#map').hidden=false;$('#space-list').hidden=true;$('#map-view').setAttribute('aria-pressed','true');$('#list-view').setAttribute('aria-pressed','false')};
$('#list-view').onclick=()=>{$('#map').hidden=true;$('#space-list').hidden=false;$('#map-view').setAttribute('aria-pressed','false');$('#list-view').setAttribute('aria-pressed','true')};
$('#reset').onclick=()=>{stop();step=0;accepted=false;selected=null;view='plaza';render();announce('已恢复初始观察状态。')};
$('#publish').onclick=()=>open('把新的目标放进任务池',`<form id="task-form"><div class="field"><label for="title">任务标题 *</label><input id="title" required placeholder="例如：分析客户反馈并整理知识"></div><div class="field"><label for="goal">目标与验收标准 *</label><textarea id="goal" rows="3" required placeholder="需要哪些成果？什么条件算完成？"></textarea></div><p class="modal-copy">正式产品还需选择用途、输入、技能、验收者、期限与奖励。员工按资格决定独立认领或组队。</p><button class="primary" type="submit">预览任务提交</button></form>`);
$('#profile').onclick=()=>open('小林的工作空间',`<p class="modal-copy">你贡献的知识可授权给不同数字员工；他们学习、参加考核，再根据能力选择任务。你保留资料用途、授权撤回与真人决策权。</p>`);
document.addEventListener('submit',e=>{if(e.target.id==='task-form'){e.preventDefault();$('#modal').close();announce('任务表单已预览，不保存或发布真实任务。')}});
function route(){view=['knowledge','talent','delivery'].includes(location.hash.slice(1))?location.hash.slice(1):'plaza';selected=null;render()}
window.addEventListener('hashchange',route);
$('#trees').innerHTML=[[7,29],[30,18],[69,17],[91,34],[94,65],[61,80],[13,73],[40,82],[49,29],[9,51],[84,16],[43,15]].map(([x,y])=>`<span class="tree" style="left:${x}%;top:${y}%"></span>`).join('');
route();
if(window.innerWidth<600)$('#list-view').click();
