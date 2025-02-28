FROM node:22
COPY dist /jonbot
WORKDIR /jonbot
ENTRYPOINT ["node", "/jonbot/index.js"]
