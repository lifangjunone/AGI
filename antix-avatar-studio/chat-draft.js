// Unsent text stays on this browser; it is never part of workspace/model saves.
export function bindChatDraft({input,scope,id,storage=localStorage}) {
  const key=`second-me-chat-draft:${scope}:${id}`;
  let last="";
  try{last=storage.getItem(key)||""}catch{}
  input.value=last;
  const capture=()=>{
    if(input.value===last)return;
    last=input.value;
    try{if(last)storage.setItem(key,last);else storage.removeItem(key)}catch{}
  };
  input.addEventListener("input",capture);
  input.addEventListener("change",capture);
  return {
    clear(){input.value="";capture()},
    dispose(){capture();input.removeEventListener("input",capture);input.removeEventListener("change",capture)},
  };
}
