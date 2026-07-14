// thermal.swift — reads Apple Silicon / Intel Mac thermal sensors via the
// private IOKit HID event-system API (no sudo required). Prints one line per
// sensor as: <name>\t<celsius>. Used by the Ulanzi "GPU & CPU Temperature"
// plugin. Same technique used by macmon / mactop.
//
// Build (universal, ad-hoc signed):
//   swiftc -O -target arm64-apple-macos11  -o thermal.arm64 thermal.swift
//   swiftc -O -target x86_64-apple-macos11 -o thermal.x86_64 thermal.swift
//   lipo -create -output thermal thermal.arm64 thermal.x86_64
//   codesign -s - thermal

import Foundation

@_silgen_name("IOHIDEventSystemClientCreate")
func IOHIDEventSystemClientCreate(_ allocator: CFAllocator?) -> CFTypeRef?

@_silgen_name("IOHIDEventSystemClientSetMatching")
func IOHIDEventSystemClientSetMatching(_ client: CFTypeRef?, _ matching: CFDictionary?) -> Int32

@_silgen_name("IOHIDEventSystemClientCopyServices")
func IOHIDEventSystemClientCopyServices(_ client: CFTypeRef?) -> CFArray?

@_silgen_name("IOHIDServiceClientCopyProperty")
func IOHIDServiceClientCopyProperty(_ service: CFTypeRef?, _ key: CFString?) -> CFTypeRef?

@_silgen_name("IOHIDServiceClientCopyEvent")
func IOHIDServiceClientCopyEvent(_ service: CFTypeRef?, _ eventType: Int64, _ options: Int32, _ timestamp: Int64) -> CFTypeRef?

@_silgen_name("IOHIDEventGetFloatValue")
func IOHIDEventGetFloatValue(_ event: CFTypeRef?, _ field: Int32) -> Double

let kIOHIDEventTypeTemperature: Int64 = 15
let tempField = Int32(kIOHIDEventTypeTemperature << 16)

// AppleVendor HID page + temperature-sensor usage.
let matching: CFDictionary = ["PrimaryUsagePage": 0xff00, "PrimaryUsage": 0x0005] as CFDictionary

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write("thermal: \(msg)\n".data(using: .utf8)!)
    exit(1)
}

guard let client = IOHIDEventSystemClientCreate(kCFAllocatorDefault) else {
    fail("cannot create IOHIDEventSystemClient")
}
_ = IOHIDEventSystemClientSetMatching(client, matching)

guard let services = IOHIDEventSystemClientCopyServices(client) as? [CFTypeRef] else {
    fail("no thermal services available")
}

var out = ""
for service in services {
    guard let name = IOHIDServiceClientCopyProperty(service, "Product" as CFString) as? String else { continue }
    guard let event = IOHIDServiceClientCopyEvent(service, kIOHIDEventTypeTemperature, 0, 0) else { continue }
    let temp = IOHIDEventGetFloatValue(event, tempField)
    // Sanity window: ignore obviously bad/undefined readings.
    if temp > 0, temp < 130 {
        out += "\(name)\t\(String(format: "%.2f", temp))\n"
    }
}

if out.isEmpty { fail("no valid sensor readings") }
FileHandle.standardOutput.write(out.data(using: .utf8)!)
