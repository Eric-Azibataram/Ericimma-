'use strict';
const readline = require('readline');
const { hashPassword } = require('../lib/security');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Choose an admin password (12+ characters): ', (pw) => {
  rl.close();
  if (pw.length < 12) { console.error('Too short. Use at least 12 characters.'); process.exit(1); }
  console.log('\nAdd this to your environment variables:\n');
  console.log('ADMIN_PASSWORD_HASH=' + hashPassword(pw) + '\n');
});
