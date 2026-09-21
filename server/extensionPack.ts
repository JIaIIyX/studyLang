import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const EXTENSION_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.js',
  'popup.css',
  'explain.html',
  'explain.js',
  'app-bridge.js',
] as const

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i += 1) {
  let crc = i
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  CRC_TABLE[i] = crc >>> 0
}

function crc32(data: Buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date) {
  const packed =
    ((date.getFullYear() - 1980) << 25) |
    ((date.getMonth() + 1) << 21) |
    (date.getDate() << 16) |
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2)
  return { time: packed & 0xffff, date: (packed >>> 16) & 0xffff }
}

function extensionSourceDir() {
  const fromEnv = process.env.EXTENSION_DIR?.trim()
  if (fromEnv && existsSync(join(fromEnv, 'manifest.json'))) return fromEnv
  const sibling = resolve(process.cwd(), '../ExtensionStudyLang')
  if (existsSync(join(sibling, 'manifest.json'))) return sibling
  const bundled = resolve(process.cwd(), 'public/extension')
  if (existsSync(join(bundled, 'manifest.json'))) return bundled
  return sibling
}

export function extensionInstallDir() {
  const local = process.env.LOCALAPPDATA?.trim()
  return join(local || join(homedir(), 'AppData', 'Local'), 'StudyLang', 'clipper')
}

function readExtensionFiles(dir: string) {
  return EXTENSION_FILES.flatMap((name) => {
    const path = join(dir, name)
    if (!existsSync(path)) return []
    return [{ name, data: readFileSync(path), mtime: statSync(path).mtime }]
  })
}

export function extensionInfo() {
  const sourceDir = extensionSourceDir()
  const files = readExtensionFiles(sourceDir)
  const manifest = files.find((file) => file.name === 'manifest.json')
  let version = ''
  let name = 'StudyLang clipper'
  if (manifest) {
    try {
      const parsed = JSON.parse(manifest.data.toString('utf8')) as { version?: string; name?: string }
      version = String(parsed.version || '')
      name = String(parsed.name || name)
    } catch {
      /* ignore */
    }
  }
  return { sourceDir, files, version, name, ready: files.some((file) => file.name === 'manifest.json') }
}

export function buildExtensionZip() {
  const { files, ready, sourceDir } = extensionInfo()
  if (!ready) throw new Error(`extension-missing:${sourceDir}`)
  const installHint = Buffer.from(
    [
      'StudyLang clipper',
      '',
      '1. Откройте chrome://extensions',
      '2. Включите «Режим разработчика» справа вверху',
      '3. Нажмите «Загрузить распакованное расширение»',
      '4. Выберите папку, где лежит manifest.json',
      '',
    ].join('\n'),
    'utf8',
  )
  const entries = [...files, { name: 'УСТАНОВКА.txt', data: installHint, mtime: new Date() }]

  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const { time, date } = dosDateTime(entry.mtime)
    const crc = crc32(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(entry.data.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, entry.data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 18)
    central.writeUInt32LE(entry.data.length, 22)
    central.writeUInt32LE(entry.data.length, 26)
    central.writeUInt16LE(name.length, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt16LE(0, 38)
    central.writeUInt32LE(0, 40)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += local.length + name.length + entry.data.length
  }

  const centralSize = centrals.reduce((sum, chunk) => sum + chunk.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, ...centrals, eocd])
}

export function installExtensionLocally() {
  const info = extensionInfo()
  if (!info.ready) throw new Error(`extension-missing:${info.sourceDir}`)

  const destDir = extensionInstallDir()
  mkdirSync(destDir, { recursive: true })
  for (const file of info.files) writeFileSync(join(destDir, file.name), file.data)
  writeFileSync(
    join(destDir, 'УСТАНОВКА.txt'),
    [
      'StudyLang clipper',
      '',
      '1. Откройте chrome://extensions',
      '2. Включите «Режим разработчика»',
      '3. «Загрузить распакованное расширение»',
      `4. Выберите папку:\n   ${destDir}`,
      '',
    ].join('\n'),
    'utf8',
  )

  spawn('explorer.exe', [destDir], { detached: true, stdio: 'ignore' }).unref()

  return {
    path: destDir,
    version: info.version,
    name: info.name,
  }
}
