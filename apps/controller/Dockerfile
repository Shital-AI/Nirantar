FROM golang:1.24-alpine as builder

WORKDIR /app
COPY . .
RUN go mod download
# If go mod fails due to missing files in skeleton, we might skip this line or ensure mocks exist.
# Assuming standard flow.
RUN CGO_ENABLED=0 go build -o controller .

FROM alpine:3.18
WORKDIR /app
COPY --from=builder /app/controller .
CMD ["./controller"]
