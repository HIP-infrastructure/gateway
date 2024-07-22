/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-use-before-define */

const net = require('net')

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

export const uniq = (type: 'server' | 'app' = 'server'): string => {
	const characters = 'abcdefghijklmnopqrstuvwxyz0123456789'
	const randomId = Array.from({ length: 5 }, () => {
		const randomIndex = Math.floor(Math.random() * characters.length)
		return characters[randomIndex]
	}).join('')

	return `${type === 'server' ? 'server' : 'app'}-${randomId}`
}
