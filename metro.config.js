const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add wasm to assetExts
config.resolver.assetExts.push('wasm');

module.exports = config;
