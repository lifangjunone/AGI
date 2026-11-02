export function visionRequest(model, text, addresses, detail = "auto") {
  const urls = addresses.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if (!urls.length || urls.length > 4) throw new Error("请填写 1–4 个图片地址，每行一个。");
  for (const value of urls) {
    let url;
    try { url = new URL(value); } catch { throw new Error("图片地址必须是完整的 HTTPS URL。"); }
    if (url.protocol !== "https:" || url.username || url.password || value.length > 8192) {
      throw new Error("图片地址必须使用 HTTPS，不能含用户名或密码。");
    }
  }
  return { model, stream: false, messages: [{ role: "user", content: [
    { type: "text", text },
    ...urls.map(url => ({ type: "image_url", image_url: { url, detail } }))
  ] }] };
}
