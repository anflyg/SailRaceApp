import path from 'node:path'

export function resolveAppProductPath(buildSettingsOutput, targetName) {
  let activeTarget = null
  let targetBuildDir = null
  let fullProductName = null

  for (const line of buildSettingsOutput.split(/\r?\n/)) {
    const targetHeader = /^Build settings for action .+ and target (.+):\s*$/.exec(line)
    if (targetHeader) {
      activeTarget = targetHeader[1]
      continue
    }
    if (activeTarget !== targetName) continue

    const setting = /^\s*(TARGET_BUILD_DIR|FULL_PRODUCT_NAME)\s*=\s*(.*?)\s*$/.exec(line)
    if (!setting) continue
    const value = setting[2].replace(/^"(.*)"$/, '$1')
    if (setting[1] === 'TARGET_BUILD_DIR') targetBuildDir = value
    if (setting[1] === 'FULL_PRODUCT_NAME') fullProductName = value
  }

  if (!targetBuildDir || !fullProductName || !fullProductName.endsWith('.app') || path.basename(fullProductName) !== fullProductName) {
    throw new Error('Xcode build settings did not provide an iOS app product for target ' + targetName + '.')
  }

  return path.resolve(targetBuildDir, fullProductName)
}
