export class Logger {
  private static bytesSent = 0;
  private static bytesReceived = 0;
  private static messagesSent = 0;
  private static messagesReceived = 0;
  
  private static lastLogTime = Date.now();

  static logNetworkIn(bytes: number) {
    this.bytesReceived += bytes;
    this.messagesReceived++;
    this.checkLog();
  }

  static logNetworkOut(bytes: number) {
    this.bytesSent += bytes;
    this.messagesSent++;
    this.checkLog();
  }

  private static checkLog() {
    const now = Date.now();
    if (now - this.lastLogTime >= 5000) { // Log every 5 seconds
      console.log(`[NETWORK] IN: ${this.messagesReceived} msgs / ${this.bytesReceived} bytes | OUT: ${this.messagesSent} msgs / ${this.bytesSent} bytes`);
      this.bytesSent = 0;
      this.bytesReceived = 0;
      this.messagesSent = 0;
      this.messagesReceived = 0;
      this.lastLogTime = now;
    }
  }

  static info(msg: string, ...args: any[]) {
    console.log(`[INFO] ${msg}`, ...args);
  }

  static error(msg: string, ...args: any[]) {
    console.error(`[ERROR] ${msg}`, ...args);
  }
}
