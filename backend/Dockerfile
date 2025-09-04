# Build stage
FROM golang:1.21-alpine AS builder
WORKDIR /app

# Enable Go modules and cache deps
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN go build -o server ./cmd

# Run stage
FROM alpine:3.19
WORKDIR /app

# Non-root user (optional)
RUN adduser -D -g '' appuser
USER appuser

COPY --from=builder /app/server /app/server

EXPOSE 8080
CMD ["/app/server"]
