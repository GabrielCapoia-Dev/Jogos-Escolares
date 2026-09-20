FROM golang:1.23-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /out/jogos-api ./cmd/api

FROM alpine:3.20
RUN apk add --no-cache curl
COPY --from=build /out/jogos-api /jogos-api
EXPOSE 8080
ENTRYPOINT ["/jogos-api"]
