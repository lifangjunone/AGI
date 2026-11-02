// Explicitly local: includes the compressed photo, never submitted automatically.
const volatileDrafts=new Map();
export function bindAvatarDraft({scope,id,read,write,storage=localStorage,onStatus=()=>{}}){
 const key=`second-me-avatar-draft:${JSON.stringify([scope,id||"new"])}`;
 const base=JSON.stringify(read());
 let cached=volatileDrafts.get(key);
 try{cached=JSON.parse(storage.getItem(key)||"null")||cached}catch{}
 if(cached){
  const valid=cached.values&&Object.keys(read()).every(name=>typeof cached.values[name]==="string");
  if(cached.base===base&&valid){write(cached.values);onStatus("restored")}
  else onStatus("stale");
 }
 return {
  capture(){
   const values=read();
   if(JSON.stringify(values)===base){this.clear();onStatus("clean");return}
   const draft={base,values};volatileDrafts.set(key,draft);
   try{storage.setItem(key,JSON.stringify(draft));onStatus("local")}
   catch{onStatus("unavailable")}
  },
  clear(){volatileDrafts.delete(key);try{storage.removeItem(key)}catch{}},
 };
}
