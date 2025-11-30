# metno-proxy

A lightweight [Nginx](https://hub.docker.com/_/nginx) reverse proxy and cache in Docker for [api.met.no](https://api.met.no/), primarily targeting the **Locationforecast 2.0** API but usable for other `/weatherapi/...` endpoints as well.

This proxy:

- Adds a proper `User-Agent` (required by MET Norway)
- Proxies `/weatherapi/...` paths to `https://api.met.no/...`
- Implements basic response caching with Nginx
- Provides health checks
- Runs as a self-contained Docker container

---

## Features

- **Transparent proxy**  
  Your clients call this service instead of `https://api.met.no`, using the same path structure (e.g. `/weatherapi/locationforecast/2.0/compact?...`).

- **User-Agent enforcement**  
  MET Norway requires a non-generic, identifying User-Agent string with contact info. The proxy sets this centrally so clients don’t have to.

- **Response caching**  
  Nginx `proxy_cache` caches responses for a short time, reducing load towards MET and improving performance.

- **Rate limiting (optional but recommended)**  
  Nginx `limit_req` can be used to protect both api.met.no and your own infrastructure from overload.

- **Health check**  
  `/healthz` endpoint returns `200 OK` when the proxy is running.

---

## Requirements

* Docker
* `curl` (for quick testing)
* Internet access from the host running the container

---

## Configuration

### Nginx base config (`nginx/nginx.conf`)

Key points:

* Uses `user nginx;` and `worker_processes auto;`
* Defines `proxy_cache_path` for MET responses
* Defines an optional rate limit zone:

  ```nginx
  limit_req_zone $binary_remote_addr zone=metno_limit:10m rate=5r/s;
  ```
* Includes `conf.d/*.conf` for server blocks:

  ```nginx
  include /etc/nginx/conf.d/*.conf;
  ```

### Proxy server config (`nginx/conf.d/metno.conf`)

The main server block:

* Listens on port `80` inside the container
* Exposes:

  * `GET /healthz` – returns a simple `ok`
  * `GET /weatherapi/...` – proxied to `https://api.met.no/...`

Important directives in `location /weatherapi/` (conceptually):

* Proxying:

  ```nginx
  proxy_pass https://api.met.no;
  proxy_set_header Host api.met.no;
  proxy_ssl_server_name on;
  ```

* **User-Agent placeholder** (filled at Docker build time):

  ```nginx
  proxy_set_header User-Agent "@METNO_USER_AGENT@";
  ```

* Caching:

  ```nginx
  proxy_cache            metno_cache;
  proxy_cache_key        $scheme$proxy_host$request_uri;
  proxy_cache_revalidate on;

  proxy_cache_valid 200 203 301 302 304 10m;
  proxy_cache_valid 429 503 1m;

  proxy_cache_lock              on;
  proxy_cache_use_stale         error timeout http_500 http_502 http_503 http_504 updating;
  proxy_cache_background_update on;
  ```

* Cache debug header:

  ```nginx
  add_header X-Proxy-Cache $upstream_cache_status always;
  ```

  Values include `MISS`, `HIT`, `BYPASS`, `EXPIRED`, etc.

* (Optional) Method restriction:

  ```nginx
  if ($request_method !~ ^(GET|HEAD)$) {
      return 405;
  }
  ```

* (Optional) Rate limiting per client:

  ```nginx
  limit_req zone=metno_limit burst=10 nodelay;
  ```

---

## User-Agent configuration (build-time)

To keep the config generic and developer-friendly, the User-Agent is injected at **image build time**.

### 1. Placeholder in `metno.conf`

In `nginx/conf.d/metno.conf`:

```nginx
proxy_set_header User-Agent "@METNO_USER_AGENT@";
```

### 2. Build-arg substitution in `Dockerfile`

In `nginx/Dockerfile` (simplified):

```dockerfile
FROM nginx:1.29.3-alpine-slim

ARG METNO_USER_AGENT="bitjungle-weather-service/1.0 devel@bitjungle.com"

COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/

RUN sed -i "s|@METNO_USER_AGENT@|${METNO_USER_AGENT}|g" /etc/nginx/conf.d/metno.conf && \
    rm -f /etc/nginx/conf.d/default.conf && \
    mkdir -p /var/cache/nginx/metno && \
    chown -R nginx:nginx /var/cache/nginx
```

### 3. Makefile variable → build arg

In the `Makefile`, a `USER_AGENT` variable is passed into the build:

```makefile
USER_AGENT ?= bitjungle-weather-service/1.0 devel@bitjungle.com

build:
	docker build \
		--build-arg METNO_USER_AGENT="$(USER_AGENT)" \
		-t $(IMAGE) ./nginx
```

You can override this per user/environment:

```bash
make build USER_AGENT="bitjungle-weather-service/1.0 your-email@example.com"
```

---

## User-Agent and MET guidelines

You **must** configure a compliant `User-Agent` string:

* Descriptive service name
* Version string
* Contact email or URL

Avoid:

* Generic CLI/binary strings (`curl/7.81.0`, `Wget/1.21`, etc.)
* Browser-like UAs for programmatic usage

The baked-in User-Agent value is what api.met.no will see for all requests coming from this proxy.

---

## Building and running

You can either use the `Makefile` or raw Docker commands.

### Using the Makefile (recommended)

Build the image:

```bash
make build
```

Build with a custom User-Agent:

```bash
make build USER_AGENT="bitjungle-weather-service/1.0 alice@bitjungle.com"
```

Run the container (default port 8080):

```bash
make run
```

Check logs:

```bash
make logs
```

Restart (stop, rebuild, run):

```bash
make restart
```

Stop and remove:

```bash
make clean
```

Override defaults (examples):

```bash
make run PORT=8081
make build IMAGE_TAG=dev
```

### Using raw Docker commands

If you prefer, you can do it directly:

```bash
docker build \
  -t metno-proxy:latest \
  --build-arg METNO_USER_AGENT="bitjungle-weather-service/1.0 devel@bitjungle.com" \
  ./nginx

docker run -d \
  --name metno-proxy \
  -p 8080:80 \
  -e TZ=Europe/Oslo \
  metno-proxy:latest
```

---

## Endpoints

### Health check

```bash
curl -i http://localhost:8080/healthz
```

Expect:

```text
HTTP/1.1 200 OK
...
ok
```

### Locationforecast (example)

A typical request to Locationforecast/2.0 through this proxy:

```bash
curl -i \
  "http://localhost:8080/weatherapi/locationforecast/2.0/compact?lat=59.91&lon=10.75"
```

This is forwarded by Nginx to:

```text
https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=59.91&lon=10.75
```

What to look for:

* `HTTP/1.1 200 OK`
* `Content-Type: application/json` (or similar)
* `X-Proxy-Cache: MISS` on the first request
* `X-Proxy-Cache: HIT` on subsequent requests with the same URL (until cache expiry)

---

## Rate limiting

This proxy can use Nginx `limit_req` to avoid overloading api.met.no or your own infrastructure.

In `nginx.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=metno_limit:10m rate=5r/s;
```

In `nginx/conf.d/metno.conf` inside `location /weatherapi/`:

```nginx
limit_req zone=metno_limit burst=10 nodelay;
```

This effective configuration:

* Allows ~5 requests/second per client IP
* Permits short bursts up to 10 requests immediately
* Starts returning `503` responses if a client exceeds the limit

Adjust `rate` and `burst` to your needs.

---

## CORS (optional)

If you plan to call this proxy directly from browser-based frontends (JavaScript), you may want to enable CORS.

Inside `location /weatherapi/ { ... }` in `metno.conf` you can add:

```nginx
add_header Access-Control-Allow-Origin "*" always;
add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;
add_header Access-Control-Allow-Headers "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range" always;

if ($request_method = OPTIONS) {
    return 204;
}
```

For production, you probably want to **restrict** `Access-Control-Allow-Origin` to your known frontends instead of `*`.

---

## Troubleshooting

### 404 on `/healthz`

* Ensure `nginx/nginx.conf` includes:

  ```nginx
  include /etc/nginx/conf.d/*.conf;
  ```
* Ensure the default Nginx site is removed (done in `Dockerfile`):

  ```dockerfile
  RUN rm -f /etc/nginx/conf.d/default.conf
  ```

### 403 from api.met.no

* Check that your User-Agent is set correctly at build time.
* Confirm that MET has not blocked or throttled your User-Agent.

### 502 / 504 errors

* Check DNS/Internet from the host running the container.
* Inspect Nginx error logs inside the container:

  ```bash
  docker exec -it metno-proxy sh
  cat /var/log/nginx/error.log
  ```

---

## Extending

You can easily:

* Add more MET endpoints under `/weatherapi/...`
* Add authentication in front of this proxy (API keys, IP filtering, etc.)
* Put it behind another ingress/proxy (Kubernetes Ingress, Traefik, etc.)
* Enable TLS termination using a separate reverse proxy or by extending this container with SSL certificates.
* Adjust caching and rate limiting per endpoint, if needed.

---

## License

TODO
