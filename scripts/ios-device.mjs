#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { selectPhysicalIphone } from './ios-device-selection.mjs'
import { isExpectedCapacitorSyncChange } from './ios-device-safety.mjs'
import { resolveAppProductPath } from './ios-device-build.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Explicit opt-in for the Phase 2 physical-device development build. Ordinary npm run ios is unchanged.
const phase2VmgTest = process.argv.slice(2).length === 1 && process.argv[2] === '--phase2-vmg-test'
if (process.argv.slice(2).length > 0 && !phase2VmgTest) {
  console.error('Okänt argument. Använd npm run ios eller npm run ios:vmg-test.')
  process.exit(2)
}
const project = path.join(root, 'ios/App/App.xcodeproj')
const plist = path.join(root, 'ios/App/App/Info.plist')
const generatedPaths = [
  'ios/App/App/public',
  'ios/App/App/capacitor.config.json',
  'ios/App/App/cordova.js',
  'ios/App/App/cordova_plugins.js',
  'ios/App/App/package.json',
  'ios/App/CapApp-SPM/Package.swift',
  'ios/App/CapApp-SPM/symlinks',
  'ios/App/CordovaPlugins',
]
const nativeFiles = [
  'ios/App/App.xcodeproj/project.pbxproj',
  'ios/App/App/App.entitlements',
  'ios/App/App/AppDelegate.swift',
  'ios/App/App/Assets.xcassets/Contents.json',
  'ios/App/App/Base.lproj/LaunchScreen.storyboard',
  'ios/App/App/Base.lproj/Main.storyboard',
  'ios/App/App/Info.plist',
  'ios/App/App/TackWiseAuthPlugin.swift',
  'ios/App/CapApp-SPM/Package.swift',
]

function run(command, args, { capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.error) throw new Error(`${command} saknas eller kunde inte startas: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(`${command} misslyckades (kod ${result.status ?? 'okänd'}).${detail ? `\n${detail}` : ''}`)
  }
  return capture ? result.stdout : ''
}

function git(args) { return run('git', args, { capture: true }).trim() }
function gitStatus() { return git(['status', '--short', '--untracked-files=all']) }
function exists(relative) { return existsSync(path.join(root, relative)) }
function snapshot(relative) {
  const full = path.join(root, relative)
  if (!existsSync(full)) return 'absent'
  const stat = statSync(full)
  if (stat.isFile()) return readFileSync(full)
  if (stat.isDirectory()) {
    const entries = readdirSync(full).sort().map((name) => `${name}\0${snapshot(path.join(relative, name))}`)
    return Buffer.from(entries.join('\0'))
  }
  return `other:${stat.mode}:${stat.size}:${stat.mtimeMs}`
}
function equalSnapshot(a, b) {
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) return a.equals(b)
  return a === b
}
function statusTouches(relative, status) {
  if (!status) return false
  return status.split('\n').some((line) => {
    const file = line.slice(3).replace(/^"(.*)"$/, '$1')
    return file === relative || file.startsWith(`${relative}/`)
  })
}
function xcodebuild(args) {
  try { return run('xcodebuild', args, { capture: true }) }
  catch (error) {
    const message = error.message
    if (/provision|signing|development team|certificate|profile|device.*not registered/i.test(message)) {
      throw new Error(`Signering misslyckades. Kontrollera utvecklingsteam, automatisk signering, certifikat och att iPhone är registrerad.\n${message}`)
    }
    throw error
  }
}

try {
  const branch = git(['branch', '--show-current']) || '(detached HEAD)'
  const commit = git(['rev-parse', 'HEAD'])
  const beforeStatus = gitStatus()
  console.log(`Repository: ${root}\nBranch: ${branch}\nCommit: ${commit}\nGit-status:\n${beforeStatus || '(ren)'}`)

  if (process.platform !== 'darwin') throw new Error('iPhone-testbygget kräver macOS med Xcode och lokal utvecklingssignering.')
  if (phase2VmgTest && (!exists('src/domain/raceVmgWind.ts') || !readFileSync(path.join(root, 'src/app/AppShell.tsx'), 'utf8').includes('localRaceVmgEnabled(import.meta.env.DEV)'))) {
    throw new Error('Phase 2 VMG-kod saknas i denna checkout. Bygg från PR #86:s branch (med Fas 1 inbakad).')
  }
  if (!existsSync(project)) throw new Error(`Xcode-projektet saknas: ${project}`)
  if (!existsSync(plist)) throw new Error(`iOS Info.plist saknas: ${plist}`)
  run('xcodebuild', ['-version'])
  if (!existsSync(path.join(root, 'node_modules/.bin/cap'))) {
    throw new Error('Node-beroenden saknas. Kör npm ci i denna worktree och försök igen.')
  }

  const deviceList = run('xcrun', ['xcdevice', 'list', '--timeout', '10'], { capture: true })
  const requestedId = process.env.TACKWISE_IOS_DEVICE_ID
  const selected = selectPhysicalIphone(deviceList, requestedId)
  const deviceId = selected.identifier
  console.log(`iPhone: ${selected.name} (${deviceId})`)

  const initialStatus = gitStatus()
  const dirtyGenerated = generatedPaths.filter((relative) => statusTouches(relative, initialStatus))
  if (dirtyGenerated.length) {
    throw new Error(`Capacitor sync avbröts före byggstart: följande sync-genererade sökvägar har lokala ändringar och måste granskas/bevaras först:\n  ${dirtyGenerated.join('\n  ')}`)
  }

  const protectedFiles = [...new Set([...nativeFiles, ...generatedPaths])]
  const before = new Map(protectedFiles.map((relative) => [relative, snapshot(relative)]))
  if (phase2VmgTest) {
    console.log('FAS 1 + 2: LOKALT DEV-TEST. VMG i Fas 2 aktiveras genom NODE_ENV=development i webbbygget. Ingen release/archive/TestFlight.')
    console.log('OBS: samma Bundle ID som befintliga TackWise Race. En installation kan ersätta en befintlig app; säkerställ lokal racedatabackup innan du fortsätter.')
    if (process.env.TACKWISE_NATIVE_TEST_BUILD) throw new Error('Isolerade native-test assets får inte kombineras med Phase 2-testbygget.')
  }
  console.log(`Kontroller klara. Kör ${phase2VmgTest ? 'Phase 2 DEV-webbbygge' : 'produktionsbygge'} och Capacitor sync…`)
  run('npm', ['run', 'build'], { env: phase2VmgTest ? { ...process.env, NODE_ENV: 'development' } : process.env })
  run('npx', ['cap', 'sync', 'ios'])

  const changedBySync = protectedFiles.filter((relative) =>
    !equalSnapshot(before.get(relative), snapshot(relative)) && !isExpectedCapacitorSyncChange(relative))
  if (changedBySync.length) {
    throw new Error(`Capacitor sync ändrade skyddade lokala/native-filer. Installationen stoppades; kontrollera ändringarna innan du fortsätter:\n  ${changedBySync.join('\n  ')}`)
  }
  const statusAfterSync = gitStatus()
  const unexpected = statusAfterSync.split('\n').filter(Boolean).filter((line) => {
    const relative = line.slice(3).replace(/^"(.*)"$/, '$1')
    return !beforeStatus.split('\n').some((prior) => prior.slice(3).replace(/^"(.*)"$/, '$1') === relative) &&
      !generatedPaths.some((generated) => relative === generated || relative.startsWith(`${generated}/`))
  })
  if (unexpected.length) throw new Error(`Sync skapade nya, oväntade filer; installation stoppades:\n${unexpected.join('\n')}`)

  const destination = `platform=iOS,id=${deviceId}`
  const derivedData = path.join(root, '.codex-ios-derived-data')
  const buildArguments = [
    '-project', project,
    '-scheme', 'App',
    '-configuration', 'Debug',
    '-destination', destination,
    '-derivedDataPath', derivedData,
  ]
  const buildSettings = xcodebuild([...buildArguments, '-showBuildSettings'])
  const appPath = resolveAppProductPath(buildSettings, 'App')
  const buildLog = xcodebuild([
    ...buildArguments,
    // The DEV test must not silently create/update profiles in the Apple account.
    ...(phase2VmgTest ? [] : ['-allowProvisioningUpdates']),
    'build',
  ])
  if (!existsSync(appPath)) throw new Error(`Xcode build ilmoitti onnistumisesta, mutta sovelluspakettia ei löytynyt: ${appPath}`)
  try {
    run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', deviceId, appPath])
    const bundleId = /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/.exec(buildLog)?.[1]?.trim() ?? 'com.anflyg.sailraceapp'
    run('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', deviceId, bundleId])
  } catch (error) {
    if (/install app|install/i.test(error.message)) throw new Error(`Appen byggdes men kunde inte installeras på ${selected.name}. Kontrollera enhetslås, kabel och utvecklingssignering.\n${error.message}`)
    throw new Error(`Appen installerades inte eller kunde inte startas på ${selected.name}.\n${error.message}`)
  }
  console.log(`TackWise Race ${phase2VmgTest ? 'Phase 1+2 DEV-test' : 'Debug'} installerades och startades på ${selected.name}. Ingen arkivering eller uppladdning utfördes.`)
} catch (error) {
  console.error(`${phase2VmgTest ? 'npm run ios:vmg-test' : 'npm run ios'}: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
