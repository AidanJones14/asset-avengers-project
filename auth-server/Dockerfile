# Stage 1: compile TypeScript to dist/ (needs devDependencies: Nest CLI, TypeScript).
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime image with only production dependencies and the compiled code.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
# Exec form: node gets docker's stop signal directly, so shutdown hooks (closing the DB pool) run.
CMD ["node", "dist/main.js"]
