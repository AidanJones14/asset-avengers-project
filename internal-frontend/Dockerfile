# Compile the small staff console, then serve static files and proxy API/auth
# through Nginx. No Node process or service credentials are needed in the browser.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src src
RUN npm run build

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
