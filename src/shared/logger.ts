export class PrefixLogger {
  constructor(private readonly prefix: string = "mn-aggregate") {}

  info(message: string): void {
    console.log(`[${this.prefix}] ${message}`);
  }

  warn(message: string): void {
    console.log(`::warning::[${this.prefix}] ${message}`);
  }

  error(message: string): void {
    console.log(`::error::[${this.prefix}] ${message}`);
  }

  scoped(suffix: string): PrefixLogger {
    return new PrefixLogger(`${this.prefix}/${suffix}`);
  }
}

export const logger = new PrefixLogger();
