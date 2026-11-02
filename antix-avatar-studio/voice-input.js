// Speech recognition is browser-managed, not the MaaS speech synthesis service.
export function bindVoiceInput({button, input, status, locale, onListening, host=window}) {
  const en=locale==="en-US",Recognition=host.SpeechRecognition||host.webkitSpeechRecognition;
  const policy=host.document?.permissionsPolicy||host.document?.featurePolicy;
  const blocked=policy?.allowsFeature && !policy.allowsFeature("microphone");
  const unavailable=blocked
    ? (en?"Microphone access is disabled for this site. Please type your message.":"本站暂未开放麦克风权限，请使用文字输入。")
    : (!Recognition||!host.isSecureContext)
      ? (en?"Voice input is not supported in this browser. Please type your message.":"当前浏览器不支持语音输入，请使用文字输入。") : "";
  let recognition=null,base="",finalText="",active=false,error=false,disposed=false,timer;
  const say=text=>{if(!disposed)status.textContent=text};
  const reset=()=>{active=false;clearTimeout(timer);button.classList.remove("live");button.setAttribute("aria-pressed","false");button.setAttribute("aria-label",en?"Voice input":"语音输入");button.disabled=Boolean(unavailable);input.readOnly=false;onListening(false)};
  button.disabled=Boolean(unavailable);
  button.setAttribute("aria-pressed","false");
  button.setAttribute("aria-label",en?"Voice input":"语音输入");
  status.textContent=unavailable||(en?"Voice is transcribed by your browser; review before sending.":"语音由浏览器转成文字，确认后再发送。");
  button.onclick=()=>{
    if(disposed||unavailable||input.disabled)return;
    if(active){button.disabled=true;recognition.stop();return}
    if(!host.confirm(en
      ?"Your browser may send audio to its speech service for transcription. Second Me receives only text when you press Send. Continue?"
      :"浏览器可能将语音发送给其语音识别服务进行转写。Second Me 只会在你点击发送后接收文字。是否继续？"))return;
    base=input.value.trim();finalText="";error=false;active=true;input.readOnly=true;
    button.classList.add("live");button.setAttribute("aria-pressed","true");button.setAttribute("aria-label",en?"Finish voice input":"结束语音输入");say(en?"Connecting to microphone…":"正在连接麦克风…");
    recognition=new Recognition();recognition.lang=locale;recognition.interimResults=true;recognition.continuous=false;
    const session=recognition;
    const current=()=>!disposed&&recognition===session;
    recognition.onstart=()=>{if(current()){onListening(true);say(en?"Listening. Tap the microphone to finish.":"正在聆听，点击麦克风结束。")}};
    recognition.onresult=event=>{
      if(!current())return;
      let interim="";
      for(let i=event.resultIndex;i<event.results.length;i++){
        const text=event.results[i][0]?.transcript||"";
        if(event.results[i].isFinal)finalText+=text;else interim+=text;
      }
      input.value=[base,finalText+interim].filter(Boolean).join(" ");
      input.dispatchEvent?.(new Event("input",{bubbles:true}));
    };
    recognition.onerror=event=>{
      if(!current())return;error=true;
      const messages={
        "not-allowed":en?"Microphone permission denied. Allow it in browser settings or type instead.":"麦克风权限被拒绝，可在浏览器设置中允许，或直接输入文字。",
        "audio-capture":en?"No microphone was found. Connect one or type instead.":"未找到可用麦克风，请连接麦克风或输入文字。",
        "network":en?"The speech service could not connect. Your text is kept; try again.":"语音识别服务连接失败，已有文字保留，请重试。",
        "no-speech":en?"No speech detected. Tap the microphone to try again.":"没有识别到语音，点击麦克风可重试。",
      };
      say(messages[event.error]||(en?"Voice input stopped. Your text is kept.":"语音输入已停止，已有文字保留。"));reset();
    };
    recognition.onend=()=>{if(!current())return;reset();if(!error)say(input.value!==base?(en?"Transcribed. Review your text, then press Send.":"已转写，请确认文字后点击发送。"):(en?"No speech detected. Try again or type instead.":"没有识别到语音，可以重试或输入文字。"))};
    timer=setTimeout(()=>{if(current()){error=true;session.abort();reset();say(en?"Voice input timed out. Your text is kept.":"语音输入已超时，已有文字保留。")}},60000);
    try{recognition.start()}catch{error=true;reset();say(en?"Could not start voice input. Please try again or type instead.":"语音输入启动失败，请重试或输入文字。")}
  };
  return ()=>{disposed=true;clearTimeout(timer);recognition?.abort();reset();button.onclick=null};
}
