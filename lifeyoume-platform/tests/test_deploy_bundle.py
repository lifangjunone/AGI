import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DeployBundleTests(unittest.TestCase):
    def test_push_and_install_include_showroom_dependency(self):
        push = (ROOT / "deploy/push-server.sh").read_text()
        install = (ROOT / "deploy/install-server.sh").read_text()
        self.assertIn('scp "$ROOT/platform/showroom.py"', push)
        self.assertIn('"$SOURCE/platform/showroom.py" "$APP/platform/showroom.py"', install)
        self.assertIn('"$SOURCE/platform/assets/showroom.css"', install)
        self.assertIn("showroom.catalog(app, products)", install)
        self.assertIn("showroom.detail(app, product, products)", install)
        self.assertIn("Production catalog and product detail smoke checks passed", install)

    def test_missing_module_aborts_before_server_mutations(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            (source / "platform").mkdir()
            (source / "config").mkdir()
            for name in ("app.py", "auth_store.py"):
                (source / "platform" / name).write_text("")
            (source / "config/products.json").write_text('{"products":[]}')
            result = subprocess.run(
                ["bash", str(ROOT / "deploy/install-server.sh"), str(source)],
                capture_output=True, text=True,
            )
        self.assertNotEqual(0, result.returncode)
        self.assertIn("Release bundle is incomplete", result.stderr)


if __name__ == "__main__":
    unittest.main()
