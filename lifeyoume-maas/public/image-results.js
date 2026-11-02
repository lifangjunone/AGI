export function renderImageResults(root, result) {
  root.replaceChildren();
  const urls = [];
  for (const [index, item] of (result.data || []).entries()) {
    const card = document.createElement("div");
    const image = document.createElement("img");
    image.alt = `生成图片 ${index + 1}`;
    image.referrerPolicy = "no-referrer";
    image.hidden = true;
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    let retryButton;
    image.onload = () => { status.textContent = `图片 ${index + 1} 已加载`; };
    image.onerror = () => {
      image.hidden = true;
      status.textContent = "图片加载失败；可重试加载，链接过期时请重新生成。";
      if (retryButton) {
        retryButton.disabled = false;
        retryButton.textContent = `重试图片 ${index + 1}`;
      }
    };
    card.append(image, status);
    if (item.url) {
      const url = new URL(item.url);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("图片链接不安全");
      status.textContent = "远程图片尚未加载；加载时浏览器会访问供应商地址。";
      const button = document.createElement("button");
      retryButton = button;
      button.type = "button";
      button.className = "secondary-button";
      button.textContent = `加载图片 ${index + 1}`;
      button.onclick = () => {
        image.removeAttribute("src");
        image.src = url.href;
        image.hidden = false;
        status.textContent = "正在加载远程图片…";
        button.disabled = true;
      };
      card.append(button);
    } else if (item.b64_json) {
      const raw = atob(item.b64_json);
      const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
      const mime = bytes[0] === 137 ? "image/png" : bytes[0] === 255 ? "image/jpeg" : "image/webp";
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      urls.push(url);
      image.src = url;
      image.hidden = false;
      const download = document.createElement("a");
      download.href = url;
      download.download = `maas-image-${index + 1}.${mime.split("/")[1]}`;
      download.textContent = `下载图片 ${index + 1}`;
      card.append(download);
    }
    root.append(card);
  }
  return () => {
    root.querySelectorAll("img").forEach(image => {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
    });
    root.replaceChildren();
    urls.forEach(url => URL.revokeObjectURL(url));
  };
}
