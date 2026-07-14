PLUGIN_ID     := com.narlei.gpucputemperature.ulanziPlugin
INSTALL_BASE  := $(HOME)/Library/Application Support/Ulanzi/UlanziDeck/Plugins
INSTALL_DIR   := $(INSTALL_BASE)/$(PLUGIN_ID)
DIST_DIR      := dist
ZIP           := $(DIST_DIR)/$(PLUGIN_ID).zip
APP_NAME      := Ulanzi Studio
# The running process is named "UlanziDeck" (the app binary), not "Ulanzi
# Studio" (the app bundle's display name) — killall/pgrep must match the
# former or they silently find nothing and the app never actually restarts.
APP_PROC      := UlanziDeck

HELPER_DIR         := $(PLUGIN_ID)/helper
HELPER_BIN         := $(HELPER_DIR)/thermal
HELPER_SRC         := $(HELPER_DIR)/thermal.swift
HELPER_WIN_DIR     := $(PLUGIN_ID)/helper-windows
HELPER_WIN_PROJECT := $(HELPER_WIN_DIR)/ThermalHelper.csproj

.PHONY: help package install restart clean helper helper-windows deps bump_major bump_minor bump_patch

help:
	@echo "Available targets:"
	@echo "  make helper          - Compile the native macOS temperature helper (universal + ad-hoc sign)"
	@echo "  make helper-windows  - Cross-compile the native Windows temperature helper (win-x64, requires dotnet)"
	@echo "  make deps            - Install the plugin's runtime node_modules (ws)"
	@echo "  make package         - Build a distributable ZIP at $(ZIP) (both platforms' helpers)"
	@echo "  make install         - Sync plugin + restart $(APP_NAME) (macOS dev loop)"
	@echo "  make restart         - Restart $(APP_NAME) only"
	@echo "  make clean           - Remove $(DIST_DIR)/"
	@echo "  make bump_patch      - Bump patch version"

helper: $(HELPER_SRC)
	@echo "→ Building native macOS thermal helper (arm64 + x86_64)..."
	@swiftc -O -target arm64-apple-macos11  -framework IOKit -framework CoreFoundation -o "$(HELPER_DIR)/thermal.arm64"  "$(HELPER_SRC)"
	@swiftc -O -target x86_64-apple-macos11 -framework IOKit -framework CoreFoundation -o "$(HELPER_DIR)/thermal.x86_64" "$(HELPER_SRC)"
	@lipo -create -output "$(HELPER_BIN)" "$(HELPER_DIR)/thermal.arm64" "$(HELPER_DIR)/thermal.x86_64"
	@rm -f "$(HELPER_DIR)/thermal.arm64" "$(HELPER_DIR)/thermal.x86_64"
	@codesign -s - --force "$(HELPER_BIN)"
	@chmod +x "$(HELPER_BIN)"
	@echo "✅ $(HELPER_BIN) built."

helper-windows: $(HELPER_WIN_PROJECT)
	@echo "→ Cross-compiling native Windows thermal helper (win-x64)..."
	@cd "$(HELPER_WIN_DIR)" && dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -v quiet
	@cp "$(HELPER_WIN_DIR)/bin/Release/net8.0/win-x64/publish/thermal.exe" "$(HELPER_WIN_DIR)/thermal.exe"
	@echo "✅ $(HELPER_WIN_DIR)/thermal.exe built."

deps:
	@echo "→ Installing runtime dependencies in $(PLUGIN_ID)..."
	@cd "$(PLUGIN_ID)" && npm install --omit=dev --silent

package: clean helper helper-windows deps
	@mkdir -p $(DIST_DIR)
	@zip -r "$(ZIP)" "$(PLUGIN_ID)" -x "*.DS_Store" -x "*/thermal.swift" -x "*/helper-windows/bin/*" -x "*/helper-windows/obj/*" -x "*/helper-windows/*.csproj" -x "*/helper-windows/*.cs"
	@echo "✅ $(ZIP) created."

install: helper deps
	@echo "→ Installing $(PLUGIN_ID) to $(INSTALL_DIR)..."
	@mkdir -p "$(INSTALL_BASE)"
	@rm -rf "$(INSTALL_DIR)"
	@ln -s "$(CURDIR)/$(PLUGIN_ID)" "$(INSTALL_DIR)"
	@$(MAKE) restart

restart:
	@echo "→ Restarting $(APP_NAME)..."
	@killall "$(APP_PROC)" 2>/dev/null || true
	@while pgrep -q "$(APP_PROC)"; do sleep 0.2; done
	@sleep 1
	@open -a "$(APP_NAME)" || echo "⚠️ Could not open $(APP_NAME). Please start it manually."

clean:
	@rm -rf $(DIST_DIR)

bump_major bump_minor bump_patch:
	@TYPE=$$(echo $@ | sed s/bump_//); \
	(cd $(PLUGIN_ID) && npm version $$TYPE --no-git-tag-version --silent) 2>/dev/null || echo "No package.json found inside plugin folder."; \
	node -e "\
		const fs = require('fs'); \
		const path = '$(PLUGIN_ID)/manifest.json'; \
		const m = JSON.parse(fs.readFileSync(path)); \
		const parts = m.Version.split('.'); \
		if ('$$TYPE' === 'major') { parts[0] = parseInt(parts[0]) + 1; parts[1] = 0; parts[2] = 0; } \
		else if ('$$TYPE' === 'minor') { parts[1] = parseInt(parts[1]) + 1; parts[2] = 0; } \
		else { parts[2] = parseInt(parts[2]) + 1; } \
		m.Version = parts.join('.'); \
		fs.writeFileSync(path, JSON.stringify(m, null, 2) + '\n'); \
		console.log('Bumped manifest.json to ' + m.Version); \
	"
