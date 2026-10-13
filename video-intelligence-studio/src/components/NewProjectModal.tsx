import { FolderPlus, Upload, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type NewProjectModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, file?: File) => void;
};

export function NewProjectModal({ open, onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File>();

  useEffect(() => {
    if (!open) return;
    setName("");
    setFile(undefined);
  }, [open]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const projectName = name.trim() || file?.name.replace(/\.[^.]+$/, "") || "未命名视频项目";
    onCreate(projectName, file);
  };

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-scrim" onClick={onClose} aria-label="关闭新建项目窗口" />
      <form className="project-modal" onSubmit={submit}>
        <header>
          <span className="modal-icon"><FolderPlus size={20} /></span>
          <div>
            <span className="eyebrow">NEW VIDEO PROJECT</span>
            <h2>新建视频项目</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <label className="project-field">
          <span>项目名称</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：雨夜来信增长实验"
          />
        </label>

        <label className="project-upload">
          <Upload size={20} />
          <span>
            <b>{file ? file.name : "选择首条视频"}</b>
            <small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "可稍后在工作台继续上传"}</small>
          </span>
          <input
            type="file"
            accept="video/*"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </label>

        <div className="project-settings">
          <label>
            <span>主要画幅</span>
            <select defaultValue="9:16">
              <option>9:16</option>
              <option>16:9</option>
              <option>1:1</option>
            </select>
          </label>
          <label>
            <span>内容类型</span>
            <select defaultValue="短剧">
              <option>短剧</option>
              <option>口播</option>
              <option>广告</option>
              <option>纪录片</option>
            </select>
          </label>
        </div>

        <footer>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">
            <FolderPlus size={16} />
            创建项目
          </button>
        </footer>
      </form>
    </div>
  );
}
