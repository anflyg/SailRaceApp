const IOS_DEVICE_PLATFORM = 'com.apple.platform.iphoneos'

function sanitizeReason(value) {
  if (typeof value !== 'string') return null
  const safe = value
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[redacted]')
    .replace(/\b[0-9A-F]{8,}\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  return safe || null
}

export function parseXcdeviceList(jsonText) {
  let records
  try { records = JSON.parse(jsonText) }
  catch { throw new Error('Kunde inte tolka JSON från xcrun xcdevice list.') }
  if (!Array.isArray(records)) throw new Error('xcrun xcdevice list returnerade inte en enhetslista.')

  const iphones = records.filter((device) => device?.platform === IOS_DEVICE_PLATFORM && device.simulator !== true)
  const available = iphones.filter((device) => device.available === true && typeof device.identifier === 'string' && device.identifier.length > 0)
  const unavailable = iphones.filter((device) => device.available !== true)
  return { available, unavailable }
}

export function describeUnavailableIphones(devices) {
  return devices.map((device) => {
    const name = typeof device.name === 'string' && device.name.trim() ? device.name.trim() : 'iPhone'
    const reason = sanitizeReason(device.error?.description) ?? sanitizeReason(device.error?.recoverySuggestion) ?? 'Enheten är inte tillgänglig.'
    return `${name}: ${reason}`
  })
}

export function selectPhysicalIphone(deviceList, requestedIdentifier = undefined) {
  const { available, unavailable } = parseXcdeviceList(deviceList)
  if (requestedIdentifier) {
    const selected = available.find((device) => device.identifier === requestedIdentifier)
    if (selected) return selected
    const unavailableSelected = unavailable.find((device) => device.identifier === requestedIdentifier)
    const reason = unavailableSelected ? describeUnavailableIphones([unavailableSelected]).join('; ') : 'ID hittades inte bland tillgängliga iPhones.'
    throw new Error(`Vald iPhone är inte tillgänglig. ${reason}`)
  }
  if (available.length === 1) return available[0]
  if (available.length > 1) {
    const choices = available.map((device) => `${device.name ?? 'iPhone'} (${device.identifier})`).join('\n  ')
    throw new Error(`Flera iPhones är anslutna. Välj en med TACKWISE_IOS_DEVICE_ID=<UDID>:\n  ${choices}`)
  }
  const reasons = describeUnavailableIphones(unavailable)
  throw new Error(reasons.length
    ? `Ingen tillgänglig fysisk iPhone hittades. Otillgängliga enheter:\n  ${reasons.join('\n  ')}\nAnslut och lås upp enheten, tryck på Trust och försök igen.`
    : 'Ingen tillgänglig fysisk iPhone hittades. Anslut och lås upp iPhone, tryck på Trust och försök igen.')
}
