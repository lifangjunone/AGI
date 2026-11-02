// Per-record interaction state only; refresh resets this isolated prototype.
const learningState=lessons.map((l,i)=>({
 status:i===1?'confirmed':'pending',answer:'',understanding:'',reviewing:false,
}));
const responseTemplate=$('#response').innerHTML;
function updateLearning(){
 const s=learningState[selected],l=lessons[selected];
 $('#lesson-title').textContent=l[0];
 $('#lesson-status').textContent=s.status==='confirmed'?(selected===1?'方法已确认':'待运营考核'):l[1];
 $('#lesson-meta').textContent='来自'+l[2]+' · 仅本分身学习';
 $('#excerpt').textContent=l[3];$('#question-label').textContent=l[4];$('#question').textContent=l[5];
 $('#answer').value=s.answer;
 $('#answer-form').classList.toggle('hidden',s.status==='confirmed');
 $('#response').classList.toggle('hidden',s.status!=='confirmed'&&!s.reviewing);
 $('#error').classList.add('hidden');$('#answer').removeAttribute('aria-invalid');
 $('#response').replaceChildren();
 if(s.status==='confirmed'){
  const heading=document.createElement('h3');heading.textContent=selected===1?'方法已确认':'理解已确认，待运营考核';
  const content=document.createElement('p');content.textContent=s.understanding||l[5];
  const note=document.createElement('small');note.textContent='记录在本页保持；刷新重置。理解确认不等于考试通过或获得接单资格。';
  $('#response').append(heading,content,note);
 }else if(s.reviewing){
  $('#response').innerHTML=responseTemplate;
  $('#understanding').textContent=s.understanding;
  $('#confirm').onclick=()=>{
   s.status='confirmed';s.reviewing=false;
   $('#new-event').lastElementChild.textContent='你确认了“'+l[0]+'”，等待运营考核';
   updateLearning();
  };
  $('#revise').onclick=()=>{s.reviewing=false;updateLearning();$('#answer').focus()};
 }
 document.querySelectorAll('[data-lesson]').forEach(b=>{
  const i=Number(b.dataset.lesson);b.classList.toggle('selected',i===selected);
  b.setAttribute('aria-pressed',String(i===selected));
  b.querySelector('.tag').textContent=learningState[i].status==='confirmed'?(i===1?'方法已确认':'待运营考核'):lessons[i][1];
 });
 $('#record-select').value=String(selected);
 const pending=learningState.filter(s=>s.status!=='confirmed').length;
 $('#count').textContent=String(pending);
 $('#subtitle').textContent=pending?'有 '+pending+' 条学习记录待处理；已确认内容不会重复要求回答。':'学习理解已确认，等待运营安排考核。';
 $('#twin-status').textContent=pending?'有待处理学习':'等待运营考核';
 $('#map-state').textContent=learningState[0].status==='confirmed'?'方法已确认，待运营考核':'补充一个判断边界';
 $('.question').classList.toggle('hidden',s.status==='confirmed');
 const skill=document.querySelectorAll('.skill')[1];
 if(skill){
  skill.querySelector('small').textContent=learningState[0].status==='confirmed'?'理解已确认 · 等待运营考核，尚不可接单':'理解草稿未确认 · 尚不可接单';
  skill.querySelector('.tag').textContent=learningState[0].status==='confirmed'?'待考核':'学习中';
 }
}
document.querySelectorAll('[data-lesson]').forEach(b=>{
 b.onclick=()=>{
  learningState[selected].answer=$('#answer').value;
  selected=Number(b.dataset.lesson);updateLearning();
 };
});
$('#answer').oninput=()=>{learningState[selected].answer=$('#answer').value};
$('#answer').setAttribute('aria-describedby','error');
$('#answer-form').onsubmit=e=>{
 e.preventDefault();const s=learningState[selected];s.answer=$('#answer').value;
 if(s.answer.trim().length<10){
  $('#error').textContent='请补充至少 10 个字的判断，说明适用条件。';
  $('#error').classList.remove('hidden');$('#answer').setAttribute('aria-invalid','true');$('#answer').focus();return;
 }
 s.understanding=s.answer.trim();s.reviewing=true;updateLearning();
 $('#response').scrollIntoView({block:'nearest'});
};
document.querySelectorAll('dialog').forEach((dialog,i)=>{
 const heading=dialog.querySelector('h2');heading.id=heading.id||'learning-dialog-'+i;
 dialog.setAttribute('aria-labelledby',heading.id);
});
updateLearning();
