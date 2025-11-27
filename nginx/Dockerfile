FROM nginx:1.29.3-alpine-slim

# Install curl for health checks
RUN apk add --no-cache curl

# Build-time argument with a sensible default
ARG METNO_USER_AGENT="bitjungle-weather-service/1.0 devel@bitjungle.com"

# Copy configs
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/

# Replace placeholder in metno.conf with build-time User-Agent
RUN sed -i "s|@METNO_USER_AGENT@|${METNO_USER_AGENT}|g" /etc/nginx/conf.d/metno.conf && \
    rm -f /etc/nginx/conf.d/default.conf && \
    mkdir -p /var/cache/nginx/metno && \
    chown -R nginx:nginx /var/cache/nginx
