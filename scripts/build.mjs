// Stage the publishable tree: the host half is plain ESM and the browser half is a
// hand-written factory bundle, so the "build" is a clean copy of src/ into dist/ —
// no bundler, no transform, no new dependency. Only dist/ is published, and dist/
// is git-ignored, so this script is what turns source into the npm artifact.
import fs from 'node:fs'

const required = ['index.js', 'host-core.js', 'remote.js', 'client/bundle.js']

fs.rmSync('dist', { recursive: true, force: true })
fs.cpSync('src', 'dist', { recursive: true })

const missing = required.filter((entry) => !fs.existsSync(`dist/${entry}`))
if (missing.length > 0) {
  throw new Error(`build: missing after copy: ${missing.join(', ')}`)
}

console.log(`build: dist/ staged from src/ (${required.length} entry points verified)`)
