const expectedCapacitorSyncPaths = [
  'ios/App/App/public',
  'ios/App/App/capacitor.config.json',
]

export function isExpectedCapacitorSyncChange(relative) {
  return expectedCapacitorSyncPaths.some((generated) =>
    relative === generated || (generated.endsWith('/public') && relative.startsWith(`${generated}/`)))
}
