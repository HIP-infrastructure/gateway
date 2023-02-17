/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-use-before-define */

import { LogLevel } from '@nestjs/common'

export const LOG_LEVELS = [
  ['warn', 'error'],
  ['warn', 'error', 'log'],
  ['warn', 'error', 'log', 'verbose'],
  ['warn', 'error', 'log', 'verbose', 'debug']
]

export const getLogLevels = (level: number): LogLevel[] => {
  let internLevel = level - 1
  if (internLevel > LOG_LEVELS.length || internLevel < 0) internLevel = 0
  
  return LOG_LEVELS[internLevel] as LogLevel[]
}

export const uniq = (type = 'session'): string => {
	const uniqueId = `${type === 'session' ? 'session' : 'app'}-${Date.now()
		.toString()
		.slice(-3)}`

	return uniqueId
}
