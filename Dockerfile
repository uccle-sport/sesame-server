FROM node:16 as builder

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY *.json ./
COPY yarn.lock ./

# Bundle app source
COPY src/ ./src/

RUN yarn install && yarn run build && rm -rf node_modules && yarn install --production=true

FROM node:16-alpine3.14
COPY --from=builder /usr/src/app /usr/src/app

WORKDIR /usr/src/app
EXPOSE 8084
CMD [ "yarn", "run", "listen" ]
