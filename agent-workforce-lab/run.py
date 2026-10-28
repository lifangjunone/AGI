"""Start the built local application without touching any shared deployment."""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PYTHON = ROOT / ".venv" / "bin" / "python"
if not PYTHON.exists():
    sys.exit("先创建 .venv 并安装 backend/requirements.txt，参见 README.md")
if not (ROOT / "frontend" / "dist" / "index.html").exists():
    sys.exit("请先在 frontend 运行 npm install && npm run build")
env = dict(os.environ)
# Only this project's optional server configuration, never other project secrets.
env_path = ROOT / "backend" / ".env"
if env_path.exists():
    from importlib.util import find_spec
    # Load via the isolated interpreter's installed python-dotenv in child process.
    command = [
        str(PYTHON), "-c",
        "from dotenv import load_dotenv;load_dotenv('.env');"
        "import uvicorn;uvicorn.run('main:app',host='127.0.0.1',port=43222)",
    ]
else:
    command = [str(PYTHON), "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "43222"]
try:
    subprocess.run(command, cwd=ROOT / "backend", env=env, check=True)
except KeyboardInterrupt:
    pass
