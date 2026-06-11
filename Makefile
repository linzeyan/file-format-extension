PNPM      ?= pnpm
RSVG      ?= rsvg-convert
ICON_PNGS  = public/icon-16.png public/icon-32.png public/icon-48.png public/icon-128.png

.PHONY: all dev dev-firefox build build-firefox zip zip-firefox \
        test test-watch typecheck verify icons clean clean-all

all: verify

# ── Development ───────────────────────────────────────────────────────────────
dev:
	$(PNPM) dev

dev-firefox:
	$(PNPM) dev:firefox

# ── Production builds ─────────────────────────────────────────────────────────
build: icons
	$(PNPM) build

build-firefox: icons
	$(PNPM) build:firefox

# ── Distribution zips ─────────────────────────────────────────────────────────
zip: icons
	$(PNPM) zip

zip-firefox: icons
	$(PNPM) zip:firefox

# ── Testing ───────────────────────────────────────────────────────────────────
test:
	$(PNPM) test

test-watch:
	$(PNPM) test:watch

typecheck:
	$(PNPM) typecheck

# ── Full CI gate: typecheck → test → both builds ──────────────────────────────
verify: icons
	$(PNPM) verify

# ── Icons ─────────────────────────────────────────────────────────────────────
# PNGs are generated from public/icon.svg and excluded from version control.
# Rebuild automatically when the SVG source changes.
icons: $(ICON_PNGS)

public/icon-%.png: public/icon.svg
	$(RSVG) -w $* -h $* $< -o $@

# ── Cleanup ───────────────────────────────────────────────────────────────────
clean:
	rm -rf .output .wxt

clean-all: clean
	rm -f $(ICON_PNGS)
