const descriptions={
  cabinet:["A 收藏卡展柜","把参考图当成收藏品展示，以蓝灰展台衬出镭射卡片。左边看风格，右边完成制作，不做长营销页。适合强调成品质感；移动端预览会放在制作区上方。"],
  photo:["B 拍立得相馆","用相纸叠放与中文宋体营造个人相馆的亲切感。照片是视觉中心，设置安静地放在旁边。更轻松，也更偏生活方式而非效率工具。"],
  desk:["C 短流程工作台","制作区在左，单张大预览在右；风格按钮直接切换预览。信息最集中、路径最短，牺牲部分展柜式氛围。"]
};
function choose(mode){
  document.body.dataset.concept=mode;
  document.querySelectorAll("[data-mode]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.mode===mode)));
  const footer=document.querySelector("[data-rationale]");
  footer.replaceChildren();
  const title=document.createElement("strong");title.textContent=descriptions[mode][0];
  const copy=document.createElement("span");copy.textContent=descriptions[mode][1];
  footer.append(title,copy);
}
document.querySelectorAll("[data-mode]").forEach(button=>button.addEventListener("click",()=>choose(button.dataset.mode)));
document.querySelectorAll(".style").forEach(button=>button.addEventListener("click",()=>{
  const selected=button.classList.toggle("selected");button.setAttribute("aria-pressed",String(selected));
  if(document.body.dataset.concept==="desk"){
    document.querySelector(".main-picture img").src=button.querySelector("img").src;
    document.querySelector(".main-picture img").alt=button.querySelector("span").textContent+"风格参考";
  }
}));
let uploaded=false;
document.querySelector("#reference").addEventListener("change",event=>{
  uploaded=Boolean(event.target.files.length);
  document.querySelector("[data-upload-label]").textContent=uploaded?"照片已选择，可以预览流程":"上传你的照片";
  document.querySelector("[data-status]").textContent="这是设计原型，照片不会发送给模型";
});
document.querySelector("[data-generate]").addEventListener("click",()=>{
  if(!uploaded){document.querySelector("[data-status]").textContent="请先上传照片。设计原型不会真实生成图片。";return;}
  document.querySelector("dialog").showModal();
});
document.querySelectorAll(".close,.close-result").forEach(button=>button.addEventListener("click",()=>document.querySelector("dialog").close()));
choose("cabinet");
