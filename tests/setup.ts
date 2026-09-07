import {afterEach}from 'vitest';
import {setImmediate as yieldToRunner}from 'node:timers/promises';

// Synchronous simulation/save sweeps can keep a worker busy across many tests.
// Let pending runner reports settle without weakening any assertion or timeout.
afterEach(async()=>{await yieldToRunner();});
