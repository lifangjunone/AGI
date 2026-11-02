export function bindChatKeyboard(input, submit) {
  let composing=false,endedAt=-Infinity;
  input.addEventListener("compositionstart",()=>{composing=true});
  input.addEventListener("compositionend",()=>{composing=false;endedAt=performance.now()});
  input.onkeydown=event=>{
    if(event.key!=="Enter"||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey)return;
    // Safari can emit the commit Enter after compositionend without isComposing.
    if(composing||event.isComposing||event.keyCode===229||performance.now()-endedAt<80)return;
    if(event.repeat)return;
    event.preventDefault();
    submit();
  };
}
