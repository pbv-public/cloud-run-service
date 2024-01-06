FROM node:20-slim

WORKDIR /app

# install production packages first
COPY .npmrc package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

ARG PROJECT
ENV PROJECT=${PROJECT}

# copy source files second (after dependencies are installed so rebuilds are
# super fast whenever only the source code changes)
COPY src ./src/
ENTRYPOINT [ "node", "src/main.js" ]
