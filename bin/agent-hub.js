#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const distStandalone = path.join(__dirname, '..', 'dist', 'standalone.js');
if (fs.existsSync(distStandalone)) {
  require(distStandalone);
} else {
  // En desarrollo con ts-node o esbuild si no está compilado
  console.log('Compilando AgentHub Standalone Server...');
  const { execSync } = require('child_process');
  execSync('npm run build:standalone', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  require(distStandalone);
}
