// Isolated design review state. No API calls, model execution or persistent data.
const $=s=>document.querySelector(s);
const people=[
 ['晓禾','禾','问题梳理与交付整合','整理原始现象、判断边界及排查建议。'],
 ['言川','川','服务指标分析','比对异常时段的指标，说明相关性与证据缺口。'],
 ['若宁','宁','回归验证设计','补充验证范围、判定标准与风险约束。']
];
const tasks=[{
 id:'sample',title:'整理长稳压测异常排查建议',goal:$('#goal').textContent,
 output:'排查建议与回归检查清单',count:1,status:'working',custom:false,
 logs:['晓禾认领任务：已有压测排查样例资格，先独立梳理资料。'],
 revisions:[],draft:'',feedback:'',openedVersion:null
}];
let selected='sample';
const task=()=>tasks.find(t=>t.id===selected);
function text(tag,value,className){
 const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;
}
function state(t){
 return t.status==='accepted'?'已验收':t.status==='review'?'待验收':t.status==='rework'?'需修订':
 t.custom?'待接单':t.count===3?'任务组协作':t.count===2?'双人协作':'独立执行';
}
function show(id){$(id).showModal()}
document.querySelectorAll('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach((dialog,i)=>{
 const heading=dialog.querySelector('h2');heading.id=heading.id||'dialog-title-'+i;
 dialog.setAttribute('aria-labelledby',heading.id);
});

const selector=document.createElement('div');
selector.className='task-selector';
selector.append(text('label','当前任务'));
const select=document.createElement('select');select.id='task-select';
selector.firstElementChild.htmlFor='task-select';selector.append(select);
$('.viewbar').after(selector);
select.onchange=()=>{selected=select.value;render()};
const style=document.createElement('style');
style.textContent='.task-selector{display:flex;gap:12px;align-items:center;margin-bottom:18px}.task-selector select{font:inherit;min-height:44px;border:1px solid #b0bfd4;background:white;border-radius:7px;padding:8px;max-width:100%}.task-selector label{font-size:13px}.task[aria-pressed=false]{background:white;border-color:transparent}.task{margin:6px 0}.version-select{display:block;min-height:44px;font:inherit;max-width:100%;margin:12px 0}.version-content{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:#f7f9fd;padding:14px;border-radius:7px}.revision-editor{margin-top:14px}.revision-editor label{display:block;margin-bottom:8px}.revision-editor textarea{width:100%;min-height:130px;border:1px solid #b0bfd4;border-radius:7px;padding:12px;font:inherit}.revision-editor p{margin:10px 0}@media(max-width:560px){.task-selector{display:block}.task-selector label{display:block;margin-bottom:6px}.task-selector select{width:100%;font-size:16px}}';
document.head.append(style);
const editor=document.createElement('section');editor.className='revision-editor hidden';
const editorLabel=text('label','修订内容');editorLabel.htmlFor='revision';
const revision=document.createElement('textarea');revision.id='revision';
const editorError=text('p','','error');editorError.setAttribute('role','alert');
const save=text('button','保存修订草稿','primary');
editor.append(text('h3','根据验收意见修订'),editorLabel,revision,editorError,save);
$('.result').append(editor);
revision.oninput=()=>{task().draft=revision.value};
save.onclick=()=>{
 const t=task();if(t.draft.trim().length<10){editorError.textContent='请补充至少 10 个字的实际修订内容。';return}
 t.status='working';t.logs.push('修订草稿已保存，尚未提交新版本。');render();
};
function render(){
 const t=task();
 $('#task-title').textContent=t.title;$('#goal').textContent=t.goal;$('#state').textContent=state(t);
 const sidebar=$('.tasks');sidebar.replaceChildren(text('h2','任务列表'));
 tasks.forEach(x=>{
  const b=document.createElement('button');b.className='task';b.setAttribute('aria-pressed',String(x.id===selected));
  if(x.id===selected)b.id='task-open';
  const s=text('span',state(x),'tag');if(x.id===selected)s.id='list-state';
  const title=text('b',x.title);if(x.id===selected)title.id='list-title';
  b.append(s,title,text('small',x.count?people.slice(0,x.count).map(p=>p[0]).join('、')+' · '+x.count+' 位执行成员':'等待员工评估'));
  b.onclick=()=>{selected=x.id;render()};sidebar.append(b);
 });
 select.replaceChildren();tasks.forEach(x=>{const o=text('option',x.title+' · '+state(x));o.value=x.id;select.append(o)});select.value=selected;
 $('#members').replaceChildren();
 people.slice(0,t.count).forEach(p=>{
  const a=document.createElement('article');a.className='member';
  const h=document.createElement('header');h.append(text('span',p[1],'avatar'),text('b',p[0]));
  a.append(h,text('p',p[2]),text('small',p[3]));$('#members').append(a);
 });
 $('#member-count').textContent=t.count+' 位成员';
 $('#org-name').textContent=t.count===3?'压测排查任务组':t.count===2?'晓禾与言川的协作工位':t.count===1?'晓禾的独立工位':'等待接单判断';
 $('#org-hint').textContent=t.custom?'保留发布目标，等待资格评估，不自动套用样例员工。':t.count===3?'第三名执行者已加入，原任务与已有成果保持连续。':t.count===2?'言川补充指标分析，晓禾继续负责原任务。':'已有压测排查样例资格，先独立梳理资料。';
 $('#logs').replaceChildren();t.logs.slice().reverse().forEach((l,i)=>{
  const d=document.createElement('div');d.className='log';d.append(text('time','工作记录 '+(t.logs.length-i)),text('span',l));$('#logs').append(d);
 });
 $('#help').classList.toggle('hidden',t.custom||t.count===3||t.status!=='working');
 $('#help-title').textContent=t.count===1?'晓禾发现一个能力缺口':'言川建议邀请验证同事';
 $('#help-reason').textContent=t.count===1?'缺少指标对照，需补充服务指标分析，避免把相关性当作根因。':'回归清单缺少判定标准，建议若宁加入补充验证设计。第三人加入后成立任务组。';
 $('#invite').textContent=t.count===1?'查看指标分析帮手':'查看回归验证帮手';
 $('#submit').disabled=t.custom||t.count<3||['review','accepted','rework'].includes(t.status);
 $('#decide').classList.toggle('hidden',t.status!=='review');
 $('#review-step').classList.toggle('current',['review','accepted','rework'].includes(t.status));
 $('#working-step').classList.toggle('current',t.status==='working');
 const n=t.revisions.length;
 $('#result-title').textContent=n?'成果 v'+n+(t.status==='rework'?' · 已退回':''):'当前草稿 · 尚未正式提交';
 $('#result-summary').textContent=t.custom?'暂无候选评估与执行成果。':t.status==='accepted'?'成果已验收；贡献和依据保留。':t.status==='rework'?'验收意见：'+t.feedback:t.status==='review'?'已提交当前版本，等待运营查看与验收。':t.draft?'修订草稿已保存；提交后才生成下一正式版本。':t.count===3?'三位成员已形成样例整理内容，可查看后提交。':'已整理原始现象与资料范围，尚不可验收。';
 editor.classList.toggle('hidden',t.status!=='rework');revision.value=t.draft;editorError.textContent='';
}
$('#invite').onclick=()=>{
 const t=task(),p=people[t.count];if(!p||t.custom||t.status!=='working')return;
 $('#candidate').textContent=p[0]+' · '+p[2];$('#candidate-reason').textContent=p[3];$('#join').textContent='确认邀请'+p[0];show('#invite-dialog');
};
$('#join').onclick=()=>{
 const t=task();if(t.count>=3||t.custom||t.status!=='working')return;
 t.logs.push(people[t.count][0]+' 加入：'+people[t.count][2]+'。'+(t.count===2?'第三人加入，建立任务组，保留原任务记录。':'原负责人和成果保持不变。'));
 t.count++;$('#invite-dialog').close();render();
};
$('#publish').onclick=()=>show('#publish-dialog');
$('#publish-form').onsubmit=e=>{
 e.preventDefault();const id='task-'+tasks.length;
 tasks.push({id,title:$('#new-title').value,goal:$('#new-goal').value,output:$('#new-output').value,
 count:0,custom:true,status:'waiting',logs:['已发布至本页面任务池，等待真实资格评估。'],revisions:[],draft:'',feedback:'',openedVersion:null});
 selected=id;$('#publish-dialog').close();$('#publish-form').reset();render();
};
function content(t){
 return '任务目标：'+t.goal+'\n期望交付：'+t.output+'\n\n'+people.slice(0,t.count).map(p=>p[0]+'的贡献：'+p[3]).join('\n\n')+
 '\n\n依据：虚构问题记录、指标对照和回归清单样例。未实际发起压测，不代表真实问题定位。\n'+(t.draft?'\n修订补充：'+t.draft:'');
}
$('#artifact').onclick=()=>{
 const t=task();$('#content-title').textContent=t.title;$('#content').replaceChildren();
 if(t.custom){$('#content').append(text('p','期望交付：'+t.output),text('p','尚无成果，不能伪造完成。'))}
 else{
  const v=document.createElement('select');v.className='version-select';v.setAttribute('aria-label','成果版本');
  if(t.status==='working'||!t.revisions.length){const o=text('option','当前草稿（未提交）');o.value='draft';v.append(o)}
  t.revisions.slice().reverse().forEach(r=>{const o=text('option','v'+r.number+' · '+r.status);o.value=String(r.number);v.append(o)});
  const body=text('pre','','version-content');
  const draw=()=>{const r=t.revisions.find(x=>String(x.number)===v.value);body.textContent=r?r.content:content(t);t.openedVersion=r?r.number:null};
  v.onchange=draw;$('#content').append(v,body);draw();
 }
 show('#content-dialog');
};
$('#submit').onclick=()=>{
 const t=task();if(t.custom||t.count<3||t.status!=='working')return;
 const number=t.revisions.length+1;
 t.revisions.push({number,content:content(t),status:'待验收',feedback:''});t.status='review';t.openedVersion=null;
 t.logs.push('成果 v'+number+' 提交，等待运营验收。');render();
};
function openReview(){
 const t=task();if(t.status!=='review')return;
 $('#feedback').value='';$('#review-error').textContent='';show('#review-dialog');
}
$('#decide').onclick=openReview;
$('#review-link').onclick=()=>{
 if(task().status==='review')openReview();
 else{$('#content-title').textContent='暂无可验收成果';$('#content').replaceChildren(text('p','先正式提交当前版本再验收。'));show('#content-dialog')}
};
function decide(accepted){
 const t=task(),r=t.revisions.at(-1);if(t.status!=='review'||!r)return;
 if(t.openedVersion!==r.number||!$('#feedback').value.trim()){
  $('#review-error').textContent='请先打开当前已提交版本，再填写验收意见。';return;
 }
 t.feedback=$('#feedback').value.trim();r.feedback=t.feedback;r.status=accepted?'已验收':'已退回';
 t.status=accepted?'accepted':'rework';
 t.logs.push('成果 v'+r.number+(accepted?' 验收通过：':' 退回修订：')+t.feedback);
 $('#review-dialog').close();render();
}
$('#accept').onclick=()=>decide(true);$('#rework').onclick=()=>decide(false);
$('#qualification').onclick=()=>{
 $('#content-title').textContent='考核准入';$('#content').replaceChildren(text('p','三位员工的资格是虚构样例。正式产品需要来源、考试结果、适用范围与有效授权，不以资料数量证明能力。'));show('#content-dialog');
};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
 $('.main').className='main '+b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
});
render();
