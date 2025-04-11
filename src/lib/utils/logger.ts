import { isDev } from '../env'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogOptions {
  level?: LogLevel
  context?: string
  data?: Record<string, unknown>
}

class Logger {
  private static instance: Logger
  private isDev: boolean

  private constructor() {
    this.isDev = isDev()
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  private shouldLog(level: LogLevel): boolean {
    // In production, only log errors
    if (!this.isDev) {
      return level === 'error'
    }
    return true
  }

  private formatMessage(message: string, options?: LogOptions): string {
    const level = options?.level ? `[${options.level.toUpperCase()}]` : '[INFO]'
    const context = options?.context ? `[${options.context}]` : ''
    const data = options?.data ? `\n${JSON.stringify(options.data, null, 2)}` : ''
    return `${level}${context} ${message}${data}`
  }

  public log(message: string, options?: LogOptions): void {
    if (!this.shouldLog(options?.level || 'info')) return

    const formattedMessage = this.formatMessage(message, options)
    console.log(formattedMessage)
  }

  public error(message: string, error?: Error, options?: LogOptions): void {
    if (!this.shouldLog('error')) return

    const formattedMessage = this.formatMessage(message, { ...options, level: 'error' })
    console.log(formattedMessage, error || '')
  }

  public warn(message: string, options?: LogOptions): void {
    if (!this.shouldLog('warn')) return

    const formattedMessage = this.formatMessage(message, { ...options, level: 'warn' })
    console.log(formattedMessage)
  }

  public debug(message: string, options?: LogOptions): void {
    if (!this.shouldLog('debug')) return

    const formattedMessage = this.formatMessage(message, { ...options, level: 'debug' })
    console.log(formattedMessage)
  }
}

export const logger = Logger.getInstance() 