use std::{
    collections::HashMap,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

struct RuntimeProcess {
    child: Child,
    port: u16,
}

pub struct DeliveryRuntimeManager {
    processes: Mutex<HashMap<PathBuf, RuntimeProcess>>,
}

impl DeliveryRuntimeManager {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }

    pub fn ensure_started(&self, workspace: &Path) -> Result<String, String> {
        let workspace = workspace
            .canonicalize()
            .map_err(|error| format!("工作目录不可用: {error}"))?;
        let mut processes = self
            .processes
            .lock()
            .map_err(|_| "本机运行服务状态锁异常".to_string())?;
        if let Some(process) = processes.get_mut(&workspace) {
            if process
                .child
                .try_wait()
                .map_err(|error| format!("无法检查本机运行服务: {error}"))?
                .is_none()
                && wait_for_health(process.port, 1)
            {
                return Ok(runtime_url(process.port));
            }
        }
        if let Some(mut previous) = processes.remove(&workspace) {
            let _ = previous.child.kill();
            let _ = previous.child.wait();
        }

        let server = workspace.join("server.mjs");
        let package = workspace.join("package.json");
        let dist = workspace.join("dist/index.html");
        if !server.is_file() || !package.is_file() || !dist.is_file() {
            return Err(
                "项目没有可启动的 HTTP 服务，缺少 server.mjs、package.json 或 dist/index.html"
                    .into(),
            );
        }
        let port = available_port()?;
        let node =
            node_binary().ok_or_else(|| "没有找到 Node.js，无法启动交付系统服务".to_string())?;
        let child = Command::new(node)
            .arg("server.mjs")
            .current_dir(&workspace)
            .env("HOST", "127.0.0.1")
            .env("PORT", port.to_string())
            .env("STATIC_ROOT", "./dist")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("无法启动项目 HTTP 服务: {error}"))?;
        processes.insert(workspace, RuntimeProcess { child, port });
        drop(processes);
        if wait_for_health(port, 30) {
            Ok(runtime_url(port))
        } else {
            self.stop_by_port(port);
            Err("项目 HTTP 服务启动后未通过 /health 健康检查".into())
        }
    }

    fn stop_by_port(&self, port: u16) {
        if let Ok(mut processes) = self.processes.lock() {
            if let Some(path) = processes
                .iter()
                .find_map(|(path, process)| (process.port == port).then(|| path.clone()))
            {
                if let Some(mut process) = processes.remove(&path) {
                    let _ = process.child.kill();
                    let _ = process.child.wait();
                }
            }
        }
    }

    pub fn stop_all(&self) {
        if let Ok(mut processes) = self.processes.lock() {
            for (_, mut process) in processes.drain() {
                let _ = process.child.kill();
                let _ = process.child.wait();
            }
        }
    }
}

impl Drop for DeliveryRuntimeManager {
    fn drop(&mut self) {
        self.stop_all();
    }
}

fn available_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| format!("无法分配本机服务端口: {error}"))
}

fn node_binary() -> Option<PathBuf> {
    let fixed = [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ]
    .into_iter()
    .map(PathBuf::from)
    .find(|path| path.is_file());
    if fixed.is_some() {
        return fixed;
    }
    Command::new("/bin/zsh")
        .args(["-lc", "command -v node"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| PathBuf::from(String::from_utf8_lossy(&output.stdout).trim()))
        .filter(|path| path.is_file())
}

fn wait_for_health(port: u16, attempts: usize) -> bool {
    let url = format!("http://127.0.0.1:{port}/health");
    for _ in 0..attempts {
        if Command::new("/usr/bin/curl")
            .args([
                "--silent",
                "--fail",
                "--max-time",
                "1",
                "--output",
                "/dev/null",
                &url,
            ])
            .status()
            .is_ok_and(|status| status.success())
        {
            return true;
        }
        thread::sleep(Duration::from_millis(100));
    }
    false
}

fn runtime_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allocates_loopback_port() {
        let port = available_port().expect("allocate port");
        assert!(port > 0);
        assert_eq!(runtime_url(port), format!("http://127.0.0.1:{port}/"));
    }
}
