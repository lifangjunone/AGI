// A shrunken VisualViewport is not necessarily a keyboard (pinch zoom also
// shrinks it). Only adapt an unzoomed viewport while an editor has focus.
export function keyboardInset({layoutHeight,height,offsetTop=0,scale=1,editing=false}){
 if(!editing||Math.abs(scale-1)>.05)return 0;
 const inset=Math.max(0,layoutHeight-height-offsetTop);
 return inset>120?Math.round(inset):0;
}
export function bindKeyboardViewport({view=window,doc=document}={}){
 const viewport=view.visualViewport;
 if(!viewport)return ()=>{};
 let frame=0;
 const update=()=>{
  frame=0;
  const editing=Boolean(doc.activeElement?.matches("textarea,input:not([type=checkbox]):not([type=radio]):not([type=range]),[contenteditable=true]"));
  const inset=keyboardInset({layoutHeight:view.innerHeight,height:viewport.height,offsetTop:viewport.offsetTop,scale:viewport.scale,editing});
  doc.documentElement.style.setProperty("--keyboard-inset",`${inset}px`);
  doc.documentElement.classList.toggle("keyboard-open",inset>0);
 };
 const schedule=()=>{if(!frame)frame=view.requestAnimationFrame(update)};
 viewport.addEventListener("resize",schedule);
 viewport.addEventListener("scroll",schedule);
 view.addEventListener("resize",schedule);
 doc.addEventListener("focusin",schedule);
 doc.addEventListener("focusout",schedule);
 view.addEventListener("pageshow",schedule);
 schedule();
 return ()=>{
  if(frame)view.cancelAnimationFrame(frame);
  viewport.removeEventListener("resize",schedule);
  viewport.removeEventListener("scroll",schedule);
  view.removeEventListener("resize",schedule);
  doc.removeEventListener("focusin",schedule);
  doc.removeEventListener("focusout",schedule);
  view.removeEventListener("pageshow",schedule);
  doc.documentElement.style.removeProperty("--keyboard-inset");
  doc.documentElement.classList.remove("keyboard-open");
 };
}
