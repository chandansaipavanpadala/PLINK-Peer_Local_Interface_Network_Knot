/**
 * Aura — Bluetooth Discovery Module
 * Uses the Web Bluetooth API to discover nearby Aura devices.
 * 
 * Discovery Flow:
 * 1. Device A broadcasts as a Bluetooth peripheral with Aura service UUID
 * 2. Device B scans for Aura peripherals
 * 3. Once paired via Bluetooth, connection details are exchanged
 * 4. High-speed transfer proceeds over WiFi/LAN WebRTC
 * 5. Falls back to Bluetooth for small files if no WiFi is available
 * 
 * NOTE: Web Bluetooth API has limited browser support (Chrome, Edge, Opera).
 * This module gracefully degrades when not available.
 */

const AURA_BT_SERVICE_UUID = '0000aaaa-0000-1000-8000-00805f9b34fb';
const AURA_BT_CHARACTERISTIC_UUID = '0000aaab-0000-1000-8000-00805f9b34fb';
const BT_MAX_CHUNK_SIZE = 512; // Bluetooth LE max transfer size

class BluetoothDiscovery {

    constructor() {
        this._isSupported = ('bluetooth' in navigator);
        this._isScanning = false;
        this._discoveredDevices = new Map();

        if (!this._isSupported) {
            console.log('Aura BT: Web Bluetooth not supported in this browser');
            return;
        }

        console.log('Aura BT: Bluetooth discovery module initialized');
    }

    get isSupported() {
        return this._isSupported;
    }

    get isScanning() {
        return this._isScanning;
    }

    /**
     * Scan for nearby Aura devices via Bluetooth
     * @returns {Promise<Array>} List of discovered devices
     */
    async scan() {
        if (!this._isSupported) {
            Events.fire('notify-user', 'Bluetooth not available in this browser');
            return [];
        }

        this._isScanning = true;
        Events.fire('bt-scan-started');

        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{
                    services: [AURA_BT_SERVICE_UUID]
                }],
                optionalServices: [AURA_BT_SERVICE_UUID]
            });

            if (device) {
                this._discoveredDevices.set(device.id, {
                    id: device.id,
                    name: device.name || 'Aura Device',
                    device: device,
                    method: 'bluetooth'
                });

                Events.fire('bt-device-found', {
                    id: device.id,
                    name: device.name || 'Aura Device'
                });

                // Attempt to connect and exchange signaling info
                await this._connectAndExchange(device);
            }

            return Array.from(this._discoveredDevices.values());
        } catch (error) {
            if (error.name === 'NotFoundError') {
                console.log('Aura BT: No devices found or user cancelled');
            } else {
                console.error('Aura BT: Scan error:', error);
            }
            return [];
        } finally {
            this._isScanning = false;
            Events.fire('bt-scan-ended');
        }
    }

    /**
     * Connect to a Bluetooth device and exchange WebRTC signaling data
     */
    async _connectAndExchange(device) {
        try {
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(AURA_BT_SERVICE_UUID);
            const characteristic = await service.getCharacteristic(AURA_BT_CHARACTERISTIC_UUID);

            // Read the peer's connection info
            const value = await characteristic.readValue();
            const decoder = new TextDecoder();
            const peerInfo = JSON.parse(decoder.decode(value));

            Events.fire('bt-peer-info', {
                deviceId: device.id,
                peerInfo: peerInfo
            });

            console.log('Aura BT: Exchanged signaling data with', device.name);
            Events.fire('p2p-connected', { peerId: device.id, method: 'bluetooth' });

        } catch (error) {
            console.error('Aura BT: Connection exchange failed:', error);
        }
    }

    /**
     * Send a small file over Bluetooth (fallback when no WiFi)
     * @param {Blob} file - File to send
     * @param {string} deviceId - Target device ID
     */
    async sendFileViaBluetooth(file, deviceId) {
        const deviceInfo = this._discoveredDevices.get(deviceId);
        if (!deviceInfo) {
            Events.fire('notify-user', 'Device not found');
            return false;
        }

        // Check file size — Bluetooth is slow, limit to 5MB
        if (file.size > 5 * 1024 * 1024) {
            Events.fire('notify-user', 'File too large for Bluetooth transfer (max 5MB)');
            return false;
        }

        try {
            const server = await deviceInfo.device.gatt.connect();
            const service = await server.getPrimaryService(AURA_BT_SERVICE_UUID);
            const characteristic = await service.getCharacteristic(AURA_BT_CHARACTERISTIC_UUID);

            // Send file metadata
            const meta = JSON.stringify({
                type: 'file-header',
                name: file.name,
                mime: file.type,
                size: file.size
            });
            await characteristic.writeValue(new TextEncoder().encode(meta));

            // Send file in chunks
            const buffer = await file.arrayBuffer();
            let offset = 0;
            while (offset < buffer.byteLength) {
                const chunk = buffer.slice(offset, offset + BT_MAX_CHUNK_SIZE);
                await characteristic.writeValue(new Uint8Array(chunk));
                offset += chunk.byteLength;

                const progress = offset / buffer.byteLength;
                Events.fire('file-progress', { sender: deviceId, progress: progress });
            }

            Events.fire('notify-user', 'Bluetooth transfer completed');
            return true;
        } catch (error) {
            console.error('Aura BT: File transfer failed:', error);
            Events.fire('notify-user', 'Bluetooth transfer failed');
            return false;
        }
    }

    /**
     * Get discovered devices
     */
    getDiscoveredDevices() {
        return Array.from(this._discoveredDevices.values());
    }

    /**
     * Clear discovered devices
     */
    clearDevices() {
        this._discoveredDevices.clear();
    }
}

window.BluetoothDiscovery = BluetoothDiscovery;
