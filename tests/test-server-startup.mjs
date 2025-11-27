/**
 * Quick test to verify server starts without places.db
 */

import { spawn } from 'child_process';

const server = spawn('node', ['dist/index.js'], {
  env: {
    ...process.env,
    METNO_PROXY_BASE_URL: 'http://localhost:8080',
  },
});

let output = '';

server.stdout.on('data', (data) => {
  output += data.toString();
});

server.stderr.on('data', (data) => {
  output += data.toString();
});

setTimeout(() => {
  console.log(output);
  server.kill();

  if (output.includes('MCP server connected via stdio transport')) {
    console.log('\n✓ Server started successfully');
    process.exit(0);
  } else if (output.includes('PlacesDB not available')) {
    console.log('\n✓ Server started with graceful degradation (PlacesDB not available)');
    process.exit(0);
  } else {
    console.log('\n✗ Server startup unclear');
    process.exit(1);
  }
}, 1000);
