.PHONY: dev install test

install:
	cd backend && uv sync
	cd frontend && npm install

# Runs API (8400) and UI (3400); Ctrl+C stops both.
# `make dev NETWORK=1` also serves the LAN and prints a QR code for your phone.
HOST := 127.0.0.1
ifdef NETWORK
HOST := 0.0.0.0
LAN_IP := $(shell ipconfig getifaddr en0 || ipconfig getifaddr en1)
export PDF_ASSIST_NETWORK := 1
export NEXT_ALLOWED_DEV_ORIGIN := $(LAN_IP)
export NEXT_PUBLIC_API_URL :=
endif

dev:
ifdef NETWORK
	@echo "Phone URL: http://$(LAN_IP):3400"
	@cd backend && uv run --with qrcode python -c "import qrcode,sys; q=qrcode.QRCode(); q.add_data(sys.argv[1]); q.print_ascii(invert=True)" http://$(LAN_IP):3400
endif
	@trap 'kill 0' INT TERM EXIT; \
	(cd backend && uv run uvicorn app.main:app --host $(HOST) --port 8400 --reload --reload-dir app) & \
	(cd frontend && npm run dev -- -H $(HOST)) & \
	wait

test:
	cd backend && uv run pytest -q && uv run ruff check .
	cd frontend && npm test && npm run e2e
