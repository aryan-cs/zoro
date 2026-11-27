#!/bin/sh
# Builds NativeLab and runs it in the booted simulator. Then, to measure something:
#   D=$(xcrun simctl get_app_container booted dev.zoro.nativelab data)
#   echo "show Alert" > "$D/Documents/cmd"; echo "dump alert" > "$D/Documents/cmd"
# and read $D/Documents/dump-alert.json. Other commands: dismiss, stripes (a test pattern
# behind everything, for measuring blur), class <Names…>, classes <Prefix>.
set -e
cd "$(dirname "$0")"
rm -rf build/NativeLab.app && mkdir -p build/NativeLab.app && cp Info.plist build/NativeLab.app/
xcrun -sdk iphonesimulator swiftc -parse-as-library -target arm64-apple-ios27.0-simulator -O main.swift -o build/NativeLab.app/NativeLab
codesign -s - -f build/NativeLab.app
xcrun simctl install booted build/NativeLab.app
xcrun simctl launch booted dev.zoro.nativelab
