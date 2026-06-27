#!/usr/bin/env node

const args = process.argv.slice(2);

const helpText = `Docksync CLI

Usage:
  docsync <command> [options]

Commands:
  init                 Create a local .docsync configuration.
  push <file.html>     Publish a single HTML file for review.
  pull                 Sync review comments into .docsync/comments.json.
  context              Generate .docsync/context.md for open comments.

Options:
  -h, --help           Show this help message.
  -v, --version        Show the CLI version.

Current status:
  The CLI scaffold is ready. Command implementations come next.`;

if (args.includes('--version') || args.includes('-v')) {
  console.log('0.1.0');
  process.exit(0);
}

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(helpText);
  process.exit(0);
}

console.error(`Unknown command: ${args[0]}`);
console.error('Run `docsync --help` for usage.');
process.exit(1);
