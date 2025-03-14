FROM node:22
COPY dist /jonbot
WORKDIR /jonbot
COPY entrypoint.sh .
RUN date "+%Y-%m-%dT%H:%M:%S%Z Dockerfile" > date.txt
ENTRYPOINT ["/bin/bash", "entrypoint.sh"]
