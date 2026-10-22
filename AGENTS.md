# Workspace deployment safety

## Shared Nginx configuration is append-only

- `/data/app/lifeyoume-platform/deploy/nginx-platform.conf` is shared by multiple independent products.
- Never replace, regenerate, truncate, or deploy the whole shared Nginx file from one product.
- A product deployment may only add or update its own explicitly scoped `location` block.
- Preserve every unrelated `server`, `location`, upstream, certificate, header, and include directive byte-for-byte whenever possible.
- Before changing shared Nginx, back up the current file and inventory all existing product routes.
- After changing it, verify that every pre-existing unrelated route still exists; if any route is missing, abort and restore the backup.
- Run `nginx -t` before reload/restart.
- Preserve the bind-mounted config file inode and use `nginx -s reload`; never
  restart or recreate the shared `opportunity_factory_proxy` container for a
  single product deployment.
- After deployment, probe the deployed product and a representative set of the other existing product URLs. A successful target deployment is not sufficient if another product becomes 404.
- Do not use an install script that copies a project-owned full Nginx config over the shared platform config.
- If the shared config was changed concurrently by another deployment, stop and merge against the latest version instead of overwriting it with a stale copy.

This is a permanent workspace rule prompted by actual incidents where `/image/`
and `/flowframe/` disappeared after another product rewrote the shared Nginx
configuration.
