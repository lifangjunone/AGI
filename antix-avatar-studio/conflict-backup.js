// Explicit product forms only. Never collect login fields, cookies or credentials.
export function conflictBackup(workspace, root, photo="") {
  const forms={};
  for(const id of ["avatarForm","personaForm","memoryForm","generateForm","chatForm"]){
    const form=root.querySelector(`#${id}`);
    if(!form)continue;
    const fields={};
    for(const field of form.querySelectorAll("input[id],textarea[id],select[id]")){
      if(field.type==="password"||field.type==="file")continue;
      fields[field.id]=field.type==="checkbox"?field.checked:field.value;
    }
    forms[id]=fields;
  }
  const text=root.querySelector("#draftText");
  if(text)forms.contentEditor={draftText:text.value};
  const choices={};
  for(const [name,attribute] of [["mood","data-mood-choice"],["style","data-style-choice"],["voice","data-voice-select"]]){
    const selected=root.querySelector(`[${attribute}].active,[${attribute}][aria-pressed="true"]`);
    if(selected)choices[name]=selected.getAttribute(attribute);
  }
  return {format:"second-me-conflict-backup",version:1,createdAt:new Date().toISOString(),
    workspace:structuredClone(workspace),editedForms:forms,avatarChoices:choices,
    ...(forms.avatarForm&&photo?{avatarPhoto:photo}:{})};
}
