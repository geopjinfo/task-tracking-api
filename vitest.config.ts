import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', hookTimeout: 30000, testTimeout: 30000, coverage: { provider: 'v8', reporter: ['text', 'html'],thresholds:{statements:80,branches:70,functions:80,lines:80} } } });
