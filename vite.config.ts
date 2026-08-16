import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

function readBuildSetting(name: string): string | null {
  try {
    const project = fs.readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')
    return project.match(new RegExp(`${name}\\s*=\\s*([^;]+);`))?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

const appVersion = process.env.VITE_APP_VERSION ?? readBuildSetting('MARKETING_VERSION')
const buildNumber = process.env.VITE_BUILD_NUMBER ?? readBuildSetting('CURRENT_PROJECT_VERSION')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_BUILD_NUMBER': JSON.stringify(buildNumber),
  },
})
