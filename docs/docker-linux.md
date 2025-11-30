# Docker Installation Guide for Linux Servers

This guide covers Docker installation on Linux servers (Ubuntu/Debian). **macOS and Windows users should install [Docker Desktop](https://www.docker.com/products/docker-desktop/) instead** — it includes everything you need.

---

## The Problem

Ubuntu's default `docker.io` package is minimal and lacks:
- **Docker Compose v2** (`docker compose` command)
- **Buildx plugin** (modern multi-platform builds)
- The plugin architecture that modern Docker uses

Installing `apt install docker.io` followed by `apt install docker-compose` gives you the legacy Python-based Compose v1, which is incompatible with this project.

---

## Recommended: Docker's Official Repository

Install Docker CE (Community Edition) from Docker's official apt repository. This gives you a complete, modern installation with all plugins.

### Step 1: Remove old packages (if any)

```bash
sudo apt remove docker.io docker-compose containerd runc 2>/dev/null
sudo apt autoremove -y
```

### Step 2: Install prerequisites

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
```

### Step 3: Add Docker's GPG key

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

### Step 4: Add Docker's apt repository

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### Step 5: Install Docker CE + plugins

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Step 6: Add your user to the docker group

This allows running Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
```

**Important**: Log out and back in for group changes to take effect, or run:

```bash
newgrp docker
```

### Step 7: Verify installation

```bash
docker --version          # Docker version 28.x.x
docker compose version    # Docker Compose version v2.x.x
docker buildx version     # github.com/docker/buildx v0.x.x
```

---

## Quick Reference: One-liner

For a fresh Ubuntu 24.04 server, run this complete installation:

```bash
# Remove old packages, add Docker repo, install Docker CE
sudo apt remove -y docker.io docker-compose containerd runc 2>/dev/null && \
sudo apt update && \
sudo apt install -y ca-certificates curl gnupg && \
sudo install -m 0755 -d /etc/apt/keyrings && \
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
sudo chmod a+r /etc/apt/keyrings/docker.gpg && \
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null && \
sudo apt update && \
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && \
sudo usermod -aG docker $USER && \
echo "Done! Log out and back in, then run: docker compose version"
```

---

## Alternative: Standalone Compose Binary

If you must keep Ubuntu's `docker.io` package, you can install Compose v2 as a standalone binary:

```bash
# Install Docker Compose v2 standalone
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create plugin symlink so 'docker compose' works
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo ln -sf /usr/local/bin/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose

# Verify
docker compose version
```

**Note**: This approach still lacks `docker buildx` and may show warnings. The official repository method above is strongly recommended.

---

## Troubleshooting

### Permission denied error

```
permission denied while trying to connect to the Docker daemon socket
```

**Fix**: Add your user to the docker group and re-login:

```bash
sudo usermod -aG docker $USER
# Log out and back in
```

### "Unable to locate package docker-compose-plugin"

This happens when using Ubuntu's repos instead of Docker's. The `docker-compose-plugin` package only exists in Docker's official repository. Follow the recommended installation above.

### Buildx warning

```
WARN Docker Compose is configured to build using Bake, but buildx isn't installed
```

This is non-blocking but indicates you're missing `docker-buildx-plugin`. Install from Docker's official repo for full functionality.

---

## Debian / Other Distros

For Debian, replace `ubuntu` with `debian` in the repository URL:

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

For other distributions, see Docker's official documentation:
https://docs.docker.com/engine/install/

---

## See Also

- [Docker Official Install Docs](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Getting Started](getting-started.md) — Production deployment guide
