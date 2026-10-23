import type { Race } from '../../types'
/** Fixed fictional positions; never reads GPS, local race storage or account. */
export const syntheticRace:Race={id:'70000000-0000-4000-8000-000000000071',dayId:'2026-01-01',name:'Synthetic sync demo',
  createdAt:'2026-01-01T12:00:00.000Z',startGunTime:'2026-01-01T12:00:05.000Z',endTime:'2026-01-01T12:01:00.000Z',
  samples:[{timestamp:'2026-01-01T12:00:00.000Z',latitude:0,longitude:0,speedKnots:2},
    {timestamp:'2026-01-01T12:00:30.000Z',latitude:0.001,longitude:0.001,speedKnots:4},
    {timestamp:'2026-01-01T12:01:00.000Z',latitude:0.002,longitude:0.001,speedKnots:4.5}],events:[]}
