FROM node:17-buster AS base

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

WORKDIR /base
RUN npm i -g @nestjs/cli
COPY package*.json ./
RUN npm install

COPY . .

FROM base AS build
ENV NODE_ENV=production

WORKDIR /build
COPY --from=base /base ./
RUN npm run build

FROM node:17-buster AS production
ENV NODE_ENV=production
WORKDIR /build
COPY --from=build /build ./

EXPOSE 4000
CMD npm run start:prod