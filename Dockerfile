FROM node:20-slim

WORKDIR /app

# install production packages first
COPY .npmrc package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

ARG GCLOUD_PROJECT
ENV GCLOUD_PROJECT=${GCLOUD_PROJECT}
ARG GIT_HASH
ENV GIT_HASH=${GIT_HASH}

# copy source files second (after dependencies are installed so rebuilds are
# super fast whenever only the source code changes)
COPY src ./src/
RUN rm ./src/placeholder.js
ENTRYPOINT [ "node", "src/main.js" ]
