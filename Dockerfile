FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE=/app/data/arena.sqlite
WORKDIR /app
COPY --chown=node:node package.json index.html app.mjs style.css sw.js manifest.webmanifest icon.svg ./
COPY --chown=node:node shared ./shared
COPY --chown=node:node server ./server
COPY --chown=node:node legacy ./legacy
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 3000
CMD ["node", "server/main.mjs"]
